import { Peer } from '../src/peer.js'

// Two in-memory transports wired back to back
export function createLink({ connected = true } = {}) {
  const state = { connected, dropNext: 0, sent: [] }

  function make(getOther) {
    let dataCb = () => {}
    let disconnectCb = () => {}
    return {
      deliver: (frame) => dataCb(frame),
      drop: () => disconnectCb(),
      ready: () => Promise.resolve(),
      isConnected: () => state.connected,
      send(frame) {
        if (!state.connected) throw new Error('down')
        state.sent.push(frame)
        if (state.dropNext > 0) {
          state.dropNext--
          return
        }
        const copy = Buffer.from(frame)
        queueMicrotask(() => getOther().deliver(copy))
      },
      onData: (cb) => (dataCb = cb),
      onDisconnect: (cb) => (disconnectCb = cb)
    }
  }

  let a, b
  a = make(() => b)
  b = make(() => a)
  return { a, b, state }
}

export function createPeers(options, linkOptions) {
  const link = createLink(linkOptions)
  return { link, a: new Peer(link.a, options), b: new Peer(link.b, options) }
}
