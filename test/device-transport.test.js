import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeviceTransport } from '../src/device-transport.js'

function fakeBle() {
  const ble = {
    sent: [],
    status: true,
    createConnect: (cb) => (ble.onMsg = cb),
    connectStatus: () => ble.status,
    send: (buf, size) => (ble.sent.push(Buffer.from(buf, 0, size)), true),
    disConnect: () => (ble.closed = true)
  }
  return ble
}

function reply(type, port2, payload = Buffer.alloc(0)) {
  const m = Buffer.alloc(16 + payload.length)
  m.writeUInt8(1, 0)
  m.writeUInt8(1, 1)
  m.writeUInt16LE(type, 2)
  m.writeUInt16LE(port2, 6)
  payload.copy(m, 16)
  return m.buffer.slice(m.byteOffset, m.byteOffset + m.length)
}

test('shakes, becomes ready on reply, then frames data', async () => {
  const ble = fakeBle()
  const t = createDeviceTransport({ ble, appId: 20715, shakeRetryMs: 10 })
  t.connect()
  assert.equal(ble.sent[0].readUInt16LE(2), 1) // shake
  assert.equal(ble.sent[0].readUInt32LE(8), 20715)

  let ready = false
  t.ready().then(() => (ready = true))
  await new Promise((r) => setTimeout(r, 25))
  assert.ok(ble.sent.length >= 2, 'shake is repeated')
  assert.equal(ready, false)

  ble.onMsg(0, reply(1, 7))
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(ready, true)

  const count = ble.sent.length
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(ble.sent.length, count, 'shaking stopped')

  t.send(Buffer.from('hi'))
  const msg = ble.sent[ble.sent.length - 1]
  assert.equal(msg.readUInt16LE(2), 4)
  assert.equal(msg.readUInt16LE(6), 7)
  assert.equal(msg.subarray(16).toString(), 'hi')
  t.disconnect()
})

test('delivers data only from the side service port', () => {
  const ble = fakeBle()
  const t = createDeviceTransport({ ble, appId: 1 })
  const got = []
  t.onData((b) => got.push(b.toString()))
  t.connect()
  ble.onMsg(0, reply(1, 7))
  ble.onMsg(0, reply(4, 7, Buffer.from('ok')))
  ble.onMsg(0, reply(4, 9, Buffer.from('other')))
  assert.deepEqual(got, ['ok'])
  t.disconnect()
})

test('send throws before the shake completes', () => {
  const t = createDeviceTransport({ ble: fakeBle(), appId: 1 })
  assert.throws(() => t.send(Buffer.from('x')))
})

test('disconnect resets the port and notifies', async () => {
  const ble = fakeBle()
  const t = createDeviceTransport({ ble, appId: 1, statusPollMs: 5 })
  let dropped = 0
  t.onDisconnect(() => dropped++)
  t.connect()
  ble.onMsg(0, reply(1, 7))
  ble.status = false
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(dropped, 1)
  assert.throws(() => t.send(Buffer.from('x')))
  t.disconnect()
})
