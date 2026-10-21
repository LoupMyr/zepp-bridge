import { Peer } from './src/peer.js'
import { createDeviceTransport } from './src/device-transport.js'

export { BridgeError, ErrorCode } from './src/errors.js'

// Bridge for the watch app (app.js)
//   import * as ble from '@zos/ble'
//   import { getPackageInfo } from '@zos/app'
//   const bridge = createBridge({ ble, appId: getPackageInfo().appId }).connect()
export function createBridge({ ble, appId, devicePort, shakeRetryMs, statusPollMs, ...options }) {
  const transport = createDeviceTransport({ ble, appId, devicePort, shakeRetryMs, statusPollMs })
  return new Peer(transport, options)
}
