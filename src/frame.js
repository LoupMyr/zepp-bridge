// Application-level framing, carried inside the platform's own messages.
//
//   offset  size  field
//   0       1     kind   (0 = request, 1 = response)
//   1       4     id     (uint32 LE, chosen by the requester)
//   5       2     seq    (uint16 LE, index of this chunk)
//   7       2     count  (uint16 LE, total number of chunks)
//   9       n     chunk of the message body

export const FRAME_HEADER_SIZE = 9

export const Kind = {
  REQUEST: 0,
  RESPONSE: 1
}

export function encodeFrames(kind, id, body, maxPayload) {
  if (!(maxPayload > 0)) throw new RangeError('maxPayload must be positive')
  const count = Math.max(1, Math.ceil(body.length / maxPayload))
  if (count > 0xffff) throw new RangeError('message needs too many chunks')

  const frames = []
  for (let seq = 0; seq < count; seq++) {
    const start = seq * maxPayload
    const end = Math.min(body.length, start + maxPayload)
    const frame = Buffer.alloc(FRAME_HEADER_SIZE + (end - start))
    frame.writeUInt8(kind, 0)
    frame.writeUInt32LE(id >>> 0, 1)
    frame.writeUInt16LE(seq, 5)
    frame.writeUInt16LE(count, 7)
    body.copy(frame, FRAME_HEADER_SIZE, start, end)
    frames.push(frame)
  }
  return frames
}

export function decodeFrame(frame) {
  if (frame.length < FRAME_HEADER_SIZE) throw new Error('frame too short')
  const kind = frame.readUInt8(0)
  const id = frame.readUInt32LE(1)
  const seq = frame.readUInt16LE(5)
  const count = frame.readUInt16LE(7)
  if (kind !== Kind.REQUEST && kind !== Kind.RESPONSE) throw new Error('unknown frame kind')
  if (count === 0 || seq >= count) throw new Error('invalid chunk index')
  return { kind, id, seq, count, payload: frame.subarray(FRAME_HEADER_SIZE) }
}

// Rebuilds messages from chunks, which may arrive out of order and interleaved.
// Incomplete messages are bounded: the oldest is dropped past `maxPending`.
export class Reassembler {
  constructor(maxPending = 16) {
    this.maxPending = maxPending
    this.partial = new Map()
  }

  // Returns { kind, id, body } once the last chunk arrives, otherwise null
  push({ kind, id, seq, count, payload }) {
    if (count === 1) return { kind, id, body: payload }

    const key = `${kind}:${id}`
    let entry = this.partial.get(key)
    if (!entry || entry.count !== count) {
      entry = { count, parts: new Array(count), received: 0 }
      this.partial.set(key, entry)
      if (this.partial.size > this.maxPending) {
        this.partial.delete(this.partial.keys().next().value)
      }
    }

    if (entry.parts[seq] === undefined) {
      entry.parts[seq] = payload
      entry.received++
    }
    if (entry.received < count) return null

    this.partial.delete(key)
    return { kind, id, body: Buffer.concat(entry.parts) }
  }

  clear() {
    this.partial.clear()
  }
}
