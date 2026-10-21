export const ErrorCode = {
  // Watch ↔ phone link is down
  OFFLINE: 'OFFLINE',
  // No response within the timeout
  TIMEOUT: 'TIMEOUT',
  // The other side has no handler for this request type
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  // Message exceeds the maximum size
  TOO_LARGE: 'TOO_LARGE',
  // A handler threw without providing its own `code`
  INTERNAL: 'INTERNAL'
}

export class BridgeError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'BridgeError'
    this.code = code
  }
}
