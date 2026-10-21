import test from 'node:test'
import assert from 'node:assert/strict'
import { createSideTransport } from '../src/side-transport.js'

test('attaches to peerSocket on connect, not before', () => {
  const listeners = []
  const sent = []
  const messaging = {
    peerSocket: {
      addListener: (evt, cb) => listeners.push([evt, cb]),
      send: (buf) => sent.push(buf)
    }
  }
  const t = createSideTransport({ messaging })
  assert.equal(listeners.length, 0)
  t.connect()
  t.connect()
  assert.equal(listeners.length, 1)

  const got = []
  t.onData((b) => got.push(b.toString()))
  const ab = Uint8Array.from(Buffer.from('yo')).buffer
  listeners[0][1](ab)
  assert.deepEqual(got, ['yo'])

  t.send(Buffer.from('out'))
  assert.equal(Buffer.from(sent[0]).toString(), 'out')
})
