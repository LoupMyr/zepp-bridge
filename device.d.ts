import { Peer, PeerOptions } from './index'
export { BridgeError, ErrorCode } from './index'

export function createBridge(
  options: PeerOptions & { ble: any; appId: number; devicePort?: number; shakeRetryMs?: number; statusPollMs?: number }
): Peer
