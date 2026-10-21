import test from 'node:test'
import assert from 'node:assert/strict'
import { createPeers } from './helpers.js'
import { BridgeError, ErrorCode } from '../index.js'

test('resolves with the handler result', async () => {
  const { a, b } = createPeers()
  b.handle('sum', ({ x, y }) => x + y)
  assert.equal(await a.request('sum', { x: 2, y: 3 }), 5)
})

test('works in both directions with async handlers', async () => {
  const { a, b } = createPeers()
  a.handle('ping', async () => 'pong-a')
  b.handle('ping', async () => 'pong-b')
  assert.equal(await a.request('ping'), 'pong-b')
  assert.equal(await b.request('ping'), 'pong-a')
})

test('undefined result becomes null', async () => {
  const { a, b } = createPeers()
  b.handle('noop', () => {})
  assert.equal(await a.request('noop'), null)
})

test('unknown type is reported', async () => {
  const { a } = createPeers()
  await assert.rejects(a.request('nope'), (e) => e instanceof BridgeError && e.code === ErrorCode.UNKNOWN_TYPE)
})

test('handler error code is propagated', async () => {
  const { a, b } = createPeers()
  b.handle('auth', () => {
    throw Object.assign(new Error('bad token'), { code: 'AUTH' })
  })
  b.handle('boom', () => {
    throw new Error('oops')
  })
  await assert.rejects(a.request('auth'), (e) => e.code === 'AUTH' && e.message === 'bad token')
  await assert.rejects(a.request('boom'), (e) => e.code === ErrorCode.INTERNAL)
})

test('large payloads are chunked and reassembled', async () => {
  const { a, b, link } = createPeers({ maxChunk: 100 })
  const big = { text: 'é'.repeat(5000) }
  b.handle('echo', (p) => p)
  assert.deepEqual(await a.request('echo', big), big)
  assert.ok(link.state.sent.length > 10)
})

test('chunks arriving out of order are reassembled', async () => {
  const { a, b, link } = createPeers({ maxChunk: 50 })
  const big = { text: 'x'.repeat(600) }
  b.handle('echo', (p) => p)
  const original = link.a.send
  const held = []
  link.a.send = (frame) => held.push(frame)
  const p = a.request('echo', big)
  await new Promise((r) => setTimeout(r, 5))
  link.a.send = original
  held.reverse().forEach((f) => link.b.deliver(f))
  assert.deepEqual(await p, big)
})

test('times out when nobody answers', async () => {
  const { a, link } = createPeers()
  link.state.dropNext = 1
  await assert.rejects(a.request('x', null, { timeout: 20 }), (e) => e.code === ErrorCode.TIMEOUT)
})

test('late responses are ignored', async () => {
  const { a, b } = createPeers()
  b.handle('slow', () => new Promise((r) => setTimeout(() => r(1), 40)))
  await assert.rejects(a.request('slow', null, { timeout: 10 }), (e) => e.code === ErrorCode.TIMEOUT)
  await new Promise((r) => setTimeout(r, 60))
})

test('rejects OFFLINE when the link is down', async () => {
  const { a } = createPeers({}, { connected: false })
  await assert.rejects(a.request('x'), (e) => e.code === ErrorCode.OFFLINE)
})

test('pending requests fail with OFFLINE on disconnect', async () => {
  const { a, b, link } = createPeers()
  b.handle('slow', () => new Promise(() => {}))
  const p = a.request('slow')
  await new Promise((r) => setTimeout(r, 5))
  link.a.drop()
  await assert.rejects(p, (e) => e.code === ErrorCode.OFFLINE)
})

test('concurrent requests are matched to their responses', async () => {
  const { a, b } = createPeers()
  b.handle('delay', ({ ms, v }) => new Promise((r) => setTimeout(() => r(v), ms)))
  const results = await Promise.all([
    a.request('delay', { ms: 30, v: 'slow' }),
    a.request('delay', { ms: 1, v: 'fast' })
  ])
  assert.deepEqual(results, ['slow', 'fast'])
})

test('oversized messages are rejected', async () => {
  const { a, b } = createPeers({ maxMessageSize: 100 })
  b.handle('x', () => 1)
  await assert.rejects(a.request('x', 'y'.repeat(500)), (e) => e.code === ErrorCode.TOO_LARGE)
})

test('malformed frames are ignored', async () => {
  const { a, b, link } = createPeers()
  b.handle('x', () => 1)
  link.b.deliver(Buffer.from([1, 2, 3]))
  link.b.deliver(Buffer.alloc(20, 0xff))
  assert.equal(await a.request('x'), 1)
})
