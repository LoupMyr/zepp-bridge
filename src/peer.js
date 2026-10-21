import { BridgeError, ErrorCode } from './errors.js'
import { Kind, encodeFrames, decodeFrame, Reassembler } from './frame.js'

const DEFAULTS = {
  // Default request timeout (ms)
  timeout: 10000,
  // Max body bytes per chunk. Must leave room for the platform header (16 B)
  // and ours (9 B) within the ~3600 B platform message limit.
  maxChunk: 3000,
  // Max size of a single message (bytes, JSON-encoded)
  maxMessageSize: 256 * 1024
}

// One end of the link. Symmetric: either side can `request` and `handle`.
//
// `transport` provides:
//   send(frame: Buffer): void            throws if the frame cannot be sent
//   ready(): Promise<void>               resolves once the link can carry data
//   isConnected(): boolean
//   onData(cb: (frame: Buffer) => void)
//   onDisconnect(cb: () => void)
//   connect?() / disconnect?()
export class Peer {
  constructor(transport, options = {}) {
    this.transport = transport
    this.options = { ...DEFAULTS, ...options }
    this.handlers = new Map()
    this.pending = new Map()
    this.reassembler = new Reassembler()
    this.nextId = 1

    transport.onData((frame) => this._onData(frame))
    transport.onDisconnect(() => this._onDisconnect())
  }

  connect() {
    if (this.transport.connect) this.transport.connect()
    return this
  }

  disconnect() {
    this._onDisconnect()
    if (this.transport.disconnect) this.transport.disconnect()
    return this
  }

  // Registers the function answering requests of this `type`.
  // It receives the payload and returns a result (or a Promise). Throwing an
  // error with a `code` property sends that code back to the requester.
  handle(type, fn) {
    this.handlers.set(type, fn)
    return this
  }

  request(type, payload = null, { timeout = this.options.timeout } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.transport.isConnected()) {
        return reject(new BridgeError(ErrorCode.OFFLINE, 'Link is down'))
      }

      const id = this._newId()
      const timer = setTimeout(() => {
        this._settle(id, new BridgeError(ErrorCode.TIMEOUT, `No response to "${type}" after ${timeout} ms`))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })

      this.transport
        .ready()
        .then(() => {
          // The request may have timed out while waiting for the link
          if (this.pending.has(id)) this._send(Kind.REQUEST, id, { q: type, p: payload })
        })
        .catch((err) => this._settle(id, toBridgeError(err)))
    })
  }

  _newId() {
    let id = this.nextId
    while (this.pending.has(id)) id = (id % 0xffffffff) + 1
    this.nextId = (id % 0xffffffff) + 1
    return id
  }

  // Rejects a pending request; no-op if it has already been settled
  _settle(id, error) {
    const entry = this.pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(id)
    entry.reject(error)
  }

  _send(kind, id, envelope) {
    const body = Buffer.from(JSON.stringify(envelope), 'utf-8')
    if (body.length > this.options.maxMessageSize) {
      throw new BridgeError(ErrorCode.TOO_LARGE, `Message is ${body.length} bytes`)
    }
    const frames = encodeFrames(kind, id, body, this.options.maxChunk)
    try {
      frames.forEach((frame) => this.transport.send(frame))
    } catch (err) {
      throw new BridgeError(ErrorCode.OFFLINE, (err && err.message) || 'Send failed')
    }
  }

  _onData(rawFrame) {
    let message
    try {
      message = this.reassembler.push(decodeFrame(rawFrame))
    } catch (err) {
      return // malformed frame: ignore
    }
    if (!message) return

    let envelope
    try {
      envelope = JSON.parse(message.body.toString('utf-8'))
    } catch (err) {
      return
    }
    if (message.kind === Kind.REQUEST) this._onRequest(message.id, envelope)
    else this._onResponse(message.id, envelope)
  }

  _onRequest(id, envelope) {
    const reply = (body) => {
      try {
        this._send(Kind.RESPONSE, id, body)
      } catch (err) {
        // Cannot answer: the requester will time out
      }
    }
    const handler = this.handlers.get(envelope.q)
    if (!handler) {
      return reply({
        ok: false,
        e: { code: ErrorCode.UNKNOWN_TYPE, message: `No handler for "${envelope.q}"` }
      })
    }

    Promise.resolve()
      .then(() => handler(envelope.p))
      .then(
        (result) => reply({ ok: true, v: result === undefined ? null : result }),
        (err) =>
          reply({
            ok: false,
            e: {
              code: (err && err.code) || ErrorCode.INTERNAL,
              message: (err && err.message) || String(err)
            }
          })
      )
  }

  _onResponse(id, envelope) {
    const entry = this.pending.get(id)
    if (!entry) return // late response to a request that already timed out
    clearTimeout(entry.timer)
    this.pending.delete(id)

    if (envelope.ok) return entry.resolve(envelope.v)
    const e = envelope.e || {}
    entry.reject(new BridgeError(e.code || ErrorCode.INTERNAL, e.message))
  }

  _onDisconnect() {
    this.reassembler.clear()
    for (const id of Array.from(this.pending.keys())) {
      this._settle(id, new BridgeError(ErrorCode.OFFLINE, 'Link went down'))
    }
  }
}

function toBridgeError(err) {
  if (err instanceof BridgeError) return err
  return new BridgeError(ErrorCode.OFFLINE, (err && err.message) || 'Link unavailable')
}
