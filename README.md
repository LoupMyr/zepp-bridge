# zepp-bridge

Request/response messaging between a **Zepp OS 2.x** watch app and its **side service** (phone).

Zepp OS 2.x has no official promise-based messaging layer (`@zeppos/zml` needs API 3.0). This library fills that gap with no dependency.

## Usage

Watch (`app.js`):

```js
import * as ble from '@zos/ble'
import { getPackageInfo } from '@zos/app'
import { createBridge } from 'zepp-bridge/device'

App({
  globalData: { bridge: null },
  onCreate() {
    this.globalData.bridge = createBridge({ ble, appId: getPackageInfo().appId }).connect()
  },
  onDestroy() {
    this.globalData.bridge.disconnect()
  }
})
```

```js
const status = await bridge.request('status.get', { env: 'prod' }, { timeout: 5000 })
```

Side service (`app-side/index.js`):

```js
import { createBridge } from 'zepp-bridge/side'

const bridge = createBridge()
bridge.handle('status.get', async ({ env }) => fetchStatus(env))

AppSideService({
  onInit() {
    bridge.connect()
  },
  onRun() {},
  onDestroy() {}
})
```

Both ends are symmetric: either can `request` and `handle`.

## Errors

`request` rejects with a `BridgeError` whose `code` is one of:

| code | meaning |
| --- | --- |
| `OFFLINE` | link between watch and phone is down |
| `TIMEOUT` | no response in time (default 10 s) |
| `UNKNOWN_TYPE` | the other side has no handler for this type |
| `TOO_LARGE` | message exceeds `maxMessageSize` (default 256 KiB) |
| `INTERNAL` | the handler threw without a `code` |

A handler may throw an error with its own `code` (e.g. `AUTH`); it reaches the requester unchanged.

## Protocol

- Watch ↔ phone transport: the platform's 16-byte framed BLE messages, with the shake handshake (repeated until the side service answers).
- On top: 9-byte frame header (kind, request id, chunk index, chunk count) so messages larger than one BLE packet are chunked and reassembled, in any order.
- Body: JSON.

## Development

```
npm test
```

The core is transport-agnostic and tested in Node with an in-memory link. The BLE transport is tested against a fake `@zos/ble`; behaviour on a real watch still has to be validated on device.

## License

MIT
