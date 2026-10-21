import { Peer } from './src/peer.js'
import { createSideTransport } from './src/side-transport.js'

export { BridgeError, ErrorCode } from './src/errors.js'

// Bridge for the side service (app-side/index.js)
//   const bridge = createBridge()
//   AppSideService({ onInit() { bridge.connect() } })
// `messaging` defaults to the runtime's global, looked up on connect()
export function createBridge({ messaging, ...options } = {}) {
  return new Peer(createSideTransport({ messaging }), options)
}
