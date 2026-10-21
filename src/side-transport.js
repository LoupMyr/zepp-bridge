import { toArrayBuffer } from './buffer.js'

const noop = () => {}

// The side runtime exposes `messaging` as a free global, not always on globalThis,
// and not necessarily at module load: resolve it lazily
function globalMessaging() {
  if (typeof messaging !== 'undefined') return messaging
  return typeof globalThis !== 'undefined' ? globalThis.messaging : undefined
}

// Transport in the side service, on top of the global `messaging.peerSocket`.
// The phone runtime adds and strips the platform header itself.
export function createSideTransport({ messaging: injected } = {}) {
  let dataCb = noop
  let started = false
  let socket = null

  function peerSocket() {
    if (!socket) {
      const m = injected || globalMessaging()
      if (!m || !m.peerSocket) throw new Error('messaging.peerSocket is not available')
      socket = m.peerSocket
    }
    return socket
  }

  return {
    // To call from onInit: the socket is not guaranteed to exist at module load
    connect() {
      if (started) return
      peerSocket().addListener('message', (arrayBuf) => dataCb(Buffer.from(arrayBuf)))
      started = true
    },
    ready: () => Promise.resolve(),
    isConnected: () => true,
    send: (frame) => peerSocket().send(toArrayBuffer(frame)),
    onData: (cb) => (dataCb = cb),
    onDisconnect: noop
  }
}
