// ble.send / peerSocket.send want an ArrayBuffer holding exactly the message
export function toArrayBuffer(buf) {
  const offset = buf.byteOffset || 0
  if (offset === 0 && buf.buffer.byteLength === buf.length) return buf.buffer
  return buf.buffer.slice(offset, offset + buf.length)
}
