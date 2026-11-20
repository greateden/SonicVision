export const sizes = [[32, 24], [64, 48], [128, 96]];
export const guard = 0.14;
export const benchmarkCount = 20;
export const benchmarkPayload = Uint8Array.from({ length: 256 }, (_, i) => (i * 137) & 255);
const header = 19;
const magic = 0x5356;

function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

export function packet({ kind, session, sequence, timestamp, interval = 0, payload }) {
  const bytes = new Uint8Array(header + payload.length + 4);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, magic);
  view.setUint8(2, kind);
  view.setUint32(3, session);
  view.setUint16(7, sequence);
  view.setFloat64(9, timestamp);
  view.setUint16(17, interval);
  bytes.set(payload, header);
  view.setUint32(bytes.length - 4, crc(bytes.subarray(0, -4)));
  return bytes;
}

export function unpack(bytes) {
  if (bytes.length < header + 4 || bytes.length > header + 4 + 1536) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0) !== magic || view.getUint32(bytes.length - 4) !== crc(bytes.subarray(0, -4))) return;
  const kind = view.getUint8(2);
  const session = view.getUint32(3);
  const sequence = view.getUint16(7);
  const timestamp = view.getFloat64(9);
  const interval = view.getUint16(17);
  const payload = bytes.subarray(header, -4);
  if (!Number.isFinite(timestamp)) return;
  if (kind === 6) {
    if (sequence >= benchmarkCount || interval < 100 || interval > 10000 ||
        payload.length !== benchmarkPayload.length || !payload.every((b, i) => b === benchmarkPayload[i])) return;
    return { kind, session, sequence, timestamp, interval, bytes: payload.length };
  }
  const size = sizes[kind >> 1];
  if (!size) return;
  const [width, height] = size;
  const length = width * height / 8;
  const pixels = kind & 1 ? decodeRuns(payload, length) : payload;
  if (pixels?.length !== length) return;
  return { kind, session, sequence, timestamp, width, height, pixels, bytes: payload.length };
}

// Encode repeated bytes as count/value pairs, with the packed bitmap as fallback.
export function compress(rgba, size) {
  const [width, height] = sizes[size];
  const pixels = new Uint8Array(width * height / 8);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    if (77 * rgba[offset] + 150 * rgba[offset + 1] + 29 * rgba[offset + 2] >= 32768) {
      pixels[i >> 3] |= 128 >> (i & 7);
    }
  }
  const runs = [];
  for (let i = 0; i < pixels.length;) {
    let count = 1;
    while (count < 255 && i + count < pixels.length && pixels[i + count] === pixels[i]) count++;
    runs.push(count, pixels[i]);
    i += count;
  }
  return runs.length < pixels.length
    ? { kind: size * 2 + 1, payload: Uint8Array.from(runs) }
    : { kind: size * 2, payload: pixels };
}

function decodeRuns(payload, length) {
  if (payload.length % 2) return;
  const pixels = new Uint8Array(length);
  let offset = 0;
  for (let i = 0; i < payload.length; i += 2) {
    const count = payload[i];
    if (!count || offset + count > length) return;
    pixels.fill(payload[i + 1], offset, offset + count);
    offset += count;
  }
  if (offset === length) return pixels;
}

// Carry fractional position across microphone blocks.
export class Resampler {
  constructor(from, to) {
    this.step = from / to;
    this.position = this.step;
    this.previous = 0;
  }

  push(input) {
    if (this.step === 1) return input;
    const output = new Float32Array(Math.ceil(input.length / this.step) + 1);
    let count = 0;
    while (this.position <= input.length) {
      const index = Math.ceil(this.position) - 1;
      const fraction = this.position - index;
      const previous = index ? input[index - 1] : this.previous;
      output[count++] = previous + fraction * (input[index] - previous);
      this.position += this.step;
    }
    this.position -= input.length;
    this.previous = input[input.length - 1];
    return output.subarray(0, count);
  }
}
