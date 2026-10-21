export type ErrorCodeName = 'OFFLINE' | 'TIMEOUT' | 'UNKNOWN_TYPE' | 'TOO_LARGE' | 'INTERNAL'
export const ErrorCode: Record<ErrorCodeName, ErrorCodeName>

export class BridgeError extends Error {
  code: string
}

export interface RequestOptions {
  timeout?: number
}

export interface PeerOptions {
  timeout?: number
  maxChunk?: number
  maxMessageSize?: number
}

export class Peer {
  connect(): this
  disconnect(): this
  handle(type: string, fn: (payload: any) => any | Promise<any>): this
  request<T = any>(type: string, payload?: any, options?: RequestOptions): Promise<T>
}
