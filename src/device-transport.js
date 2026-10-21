import { toArrayBuffer } from './buffer.js'

// Platform wire format between the watch and the phone (fixed by Zepp OS):
//
//   offset  size  field
//   0       1     flag     (1 = application message)
//   1       1     version  (1)
//   2       2     type     (1 = shake, 2 = close, 4 = data, 5 = data from system tool)
//   4       2     port1    (watch-side port)
//   6       2     port2    (side-service port, assigned by the phone in the shake reply)
//   8       4     appId
//   12      4     extra    (0)
//   16      n     payload
const HEADER_SIZE = 16
const FLAG_APP = 1
const VERSION = 1
const TYPE_SHAKE = 1
const TYPE_CLOSE = 2
const TYPE_DATA = 4
const TYPE_DATA_SYSTEM = 5

const noop = () => {}

// Transport on the watch, on top of the `@zos/ble` module
export function createDeviceTransport({ ble, appId, devicePort = 20, shakeRetryMs = 1000, statusPollMs = 2000 }) {
  let sidePort = 0
  let started = false
  let shakeTimer = null
  let statusTimer = null
  let waiters = []
  let dataCb = noop
  let disconnectCb = noop

  function frame(type, payload) {
    const msg = Buffer.alloc(HEADER_SIZE + payload.length)
    msg.writeUInt8(FLAG_APP, 0)
    msg.writeUInt8(VERSION, 1)
    msg.writeUInt16LE(type, 2)
    msg.writeUInt16LE(devicePort, 4)
    msg.writeUInt16LE(sidePort, 6)
    msg.writeUInt32LE(appId >>> 0, 8)
    msg.writeUInt32LE(0, 12)
    payload.copy(msg, HEADER_SIZE)
    return msg
  }

  function sendRaw(msg) {
    return ble.send(toArrayBuffer(msg), msg.length)
  }

  // The phone answers a shake with the port of the side service, starting it if needed.
  // The reply can be lost (side service not up yet), so shakes repeat until answered.
  function shakeUntilAnswered() {
    if (shakeTimer !== null || sidePort) return
    const tick = () => {
      if (sidePort || !started) {
        shakeTimer = null
        return
      }
      try {
        sendRaw(frame(TYPE_SHAKE, Buffer.from([appId & 0xff])))
      } catch (err) {
        // Link down: the next tick or the status listener will retry
      }
      shakeTimer = setTimeout(tick, shakeRetryMs)
    }
    tick()
  }

  function stopShaking() {
    if (shakeTimer !== null) clearTimeout(shakeTimer)
    shakeTimer = null
  }

  function onMessage(arrayBuf) {
    const msg = Buffer.from(arrayBuf)
    if (msg.length < HEADER_SIZE || msg.readUInt8(0) !== FLAG_APP) return
    const type = msg.readUInt16LE(2)
    const port2 = msg.readUInt16LE(6)

    if (type === TYPE_SHAKE) {
      sidePort = port2
      stopShaking()
      const ready = waiters
      waiters = []
      ready.forEach((resolve) => resolve())
    } else if ((type === TYPE_DATA || type === TYPE_DATA_SYSTEM) && sidePort && port2 === sidePort) {
      dataCb(msg.subarray(HEADER_SIZE))
    }
  }

  return {
    connect() {
      if (started) return
      started = true
      ble.createConnect((index, data) => onMessage(data))
      // `@zos/ble` has no status event on 2.x: watch connectStatus() instead
      let wasConnected = ble.connectStatus()
      statusTimer = setInterval(() => {
        const connected = ble.connectStatus()
        if (connected === wasConnected) return
        wasConnected = connected
        if (connected) {
          shakeUntilAnswered()
        } else {
          // The side service may have a new port after reconnecting
          sidePort = 0
          stopShaking()
          disconnectCb()
        }
      }, statusPollMs)
      shakeUntilAnswered()
    },

    disconnect() {
      if (!started) return
      stopShaking()
      clearInterval(statusTimer)
      if (sidePort) {
        try {
          sendRaw(frame(TYPE_CLOSE, Buffer.from([appId & 0xff])))
        } catch (err) {}
      }
      sidePort = 0
      started = false
      ble.disConnect()
    },

    // Resolves once the side service has answered the shake
    ready() {
      if (sidePort) return Promise.resolve()
      return new Promise((resolve) => {
        waiters.push(resolve)
        shakeUntilAnswered()
      })
    },

    send(payload) {
      if (!sidePort) throw new Error('side service not ready')
      if (!sendRaw(frame(TYPE_DATA, payload))) throw new Error('ble send failed')
    },

    isConnected: () => ble.connectStatus(),
    onData: (cb) => (dataCb = cb),
    onDisconnect: (cb) => (disconnectCb = cb)
  }
}
