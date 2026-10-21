import { Peer, PeerOptions } from './index'
export { BridgeError, ErrorCode } from './index'

export function createBridge(options?: PeerOptions & { messaging?: any }): Peer
