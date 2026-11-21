import { crc, sizes } from './protocol.js';
import { packStream } from './stream.js';

export const FPS = 15;
export const FRAME_COUNT = 900;
export const CODECS = ['vp8', 'avc1.42001f'];
export const MAX_UNIT = 16384;
const FRAGMENT_HEADER = 10;
const VIDEO_KIND = 16;
const frameTimestamp = id => Math.round(id * 1e6 / FPS);
const frameDuration = id => frameTimestamp(id + 1) - frameTimestamp(id);
// Media time conversions can round the returned timestamp by a microsecond.
function sourceId(timestamp) {
  const id = Math.round(timestamp * FPS / 1e6);
  if (Math.abs(timestamp - frameTimestamp(id)) <= 2) return id;
}

export function videoFormat(kind) {
  const i = kind - VIDEO_KIND;
  if (i < 0 || i > 15) return;
  const codec = CODECS[(i & 7) >> 2];
  const size = i & 3;
  if (i >= 0 && codec && sizes[size]) return { codec, size, marker: Boolean(i & 8) };
}

export function packetize(frames, { session, sequence, size, codec, marker = false, payloadLimit }) {
  const kind = VIDEO_KIND + CODECS.indexOf(codec) * 4 + size + (marker ? 8 : 0);
  if (!CODECS.includes(codec) || !videoFormat(kind) || payloadLimit <= FRAGMENT_HEADER || payloadLimit > 4096) throw new RangeError('Invalid video packet format.');
  const packets = [];
  let payload = new Uint8Array(payloadLimit);
  let view = new DataView(payload.buffer);
  let used = 0;
  function emit() {
    packets.push(packStream({ kind, session, sequence: sequence++, payload: payload.subarray(0, used) }));
    payload = new Uint8Array(payloadLimit);
    view = new DataView(payload.buffer);
    used = 0;
  }
  for (const frame of frames) {
    if (!frame.data.length || frame.data.length > MAX_UNIT || frame.id < 0 || frame.id > 65535) {
      throw new RangeError('Invalid encoded video frame.');
    }
    for (let offset = 0; offset < frame.data.length;) {
      if (payloadLimit - used <= FRAGMENT_HEADER) emit();
      const length = Math.min(frame.data.length - offset, payloadLimit - used - FRAGMENT_HEADER);
      const last = offset + length === frame.data.length;
      view.setUint16(used, frame.id);
      view.setUint32(used + 2, frame.captureTenthsMs);
      view.setUint16(used + 6, offset);
      view.setUint16(used + 8, length | (frame.key ? 0x8000 : 0) | (last ? 0x4000 : 0));
      payload.set(frame.data.subarray(offset, offset + length), used + FRAGMENT_HEADER);
      used += FRAGMENT_HEADER + length;
      offset += length;
    }
  }
  if (used) emit();
  return packets;
}

function fragments(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const result = [];
  for (let position = 0; position < payload.length;) {
    if (payload.length - position <= FRAGMENT_HEADER) return;
    const id = view.getUint16(position);
    const captureTenthsMs = view.getUint32(position + 2);
    const offset = view.getUint16(position + 6);
    const flags = view.getUint16(position + 8);
    const length = flags & 0x3fff;
    position += FRAGMENT_HEADER;
    if (!length || position + length > payload.length || offset + length > MAX_UNIT) return;
    result.push({ id, captureTenthsMs, offset, key: Boolean(flags & 0x8000), last: Boolean(flags & 0x4000),
      data: payload.subarray(position, position + length) });
    position += length;
  }
  return result.length ? result : undefined;
}

export class VideoAssembler {
  nextPacket = 0;
  lastId = -1;
  partial = null;
  duplicates = 0;
  missingPackets = 0;
  rejected = 0;

  push(packet) {
    const records = fragments(packet.payload);
    if (!records) { this.rejected++; return []; }
    if (packet.sequence < this.nextPacket) { this.duplicates++; return []; }
    if (packet.sequence !== this.nextPacket) {
      this.missingPackets += packet.sequence - this.nextPacket;
      this.partial = null;
    }
    this.nextPacket = packet.sequence + 1;
    const output = [];
    for (const item of records) {
      if (item.id <= this.lastId) { this.duplicates++; continue; }
      if (!item.offset) {
        const { id, key, captureTenthsMs } = item;
        this.partial = { id, key, captureTenthsMs, used: 0, data: new Uint8Array(item.last ? item.data.length : MAX_UNIT) };
      }
      const frame = this.partial;
      if (!frame || frame.id !== item.id || frame.key !== item.key ||
          frame.captureTenthsMs !== item.captureTenthsMs || frame.used !== item.offset) {
        this.partial = null;
        this.rejected++;
        continue;
      }
      frame.data.set(item.data, item.offset);
      frame.used += item.data.length;
      if (item.last) {
        const data = frame.data.subarray(0, frame.used);
        output.push({ id: frame.id, key: frame.key, captureTenthsMs: frame.captureTenthsMs, data, checksum: crc(data) });
        this.lastId = frame.id;
        this.partial = null;
      }
    }
    return output;
  }
}

function encoderConfig(codec, size, bitrate) {
  const [width, height] = sizes[size];
  return { codec, width, height, bitrate, framerate: FPS, latencyMode: 'realtime',
    ...(codec === CODECS[1] ? { avc: { format: 'annexb' } } : {}) };
}

function decoderConfig(codec, size) {
  const [codedWidth, codedHeight] = sizes[size];
  return { codec, codedWidth, codedHeight, optimizeForLatency: true };
}

export async function probeVideo(codec, size, bitrate, canvas) {
  if (!globalThis.VideoEncoder || !globalThis.VideoDecoder || !globalThis.VideoFrame) return false;
  const enc = encoderConfig(codec, size, bitrate);
  const dec = decoderConfig(codec, size);
  let encoder;
  let decoder;
  let timeout;
  try {
    const [tx, rx] = await Promise.all([VideoEncoder.isConfigSupported(enc), VideoDecoder.isConfigSupported(dec)]);
    if (!tx.supported || !rx.supported) return false;
    const probe = new Promise(resolve => {
      timeout = setTimeout(() => resolve(false), 1500);
      decoder = new VideoDecoder({
        output(frame) {
          const ok = frame.timestamp === 123 && frame.displayWidth === enc.width && frame.displayHeight === enc.height;
          frame.close();
          resolve(ok);
        },
        error: () => resolve(false),
      });
      encoder = new VideoEncoder({
        output(chunk) {
          try { decoder.decode(chunk); }
          catch { resolve(false); }
        },
        error: () => resolve(false),
      });
      decoder.configure(dec);
      encoder.configure(enc);
      const frame = new VideoFrame(canvas, { timestamp: 123, duration: frameDuration(0) });
      try { encoder.encode(frame, { keyFrame: true }); }
      finally { frame.close(); }
      encoder.flush().then(() => decoder.flush()).catch(() => resolve(false));
    });
    return await probe;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    if (encoder && encoder.state !== 'closed') encoder.close();
    if (decoder && decoder.state !== 'closed') decoder.close();
  }
}

export class ColourEncoder {
  pending = new Map();
  peak = 0;
  queuePeak = 0;

  constructor(codec, size, bitrate, output, error) {
    this.encoder = new VideoEncoder({
      output: chunk => {
        const id = sourceId(chunk.timestamp);
        const item = this.pending.get(id);
        if (!item) return;
        // A later output can overtake dropped input IDs in real-time mode.
        for (const pendingId of this.pending.keys()) {
          if (pendingId <= id) this.pending.delete(pendingId);
        }
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        output({ ...item, key: chunk.type === 'key', data, encodedAt: performance.now() });
      },
      error,
    });
    this.encoder.configure(encoderConfig(codec, size, bitrate));
  }

  encode(canvas, item, key) {
    if (this.encoder.encodeQueueSize >= 4) return false;
    const [first] = this.pending.keys();
    // Bound metadata for inputs the encoder silently drops.
    if (this.pending.size >= 12) this.pending.delete(first);
    const timestamp = frameTimestamp(item.id);
    const frame = new VideoFrame(canvas, { timestamp, duration: frameDuration(item.id) });
    this.pending.set(item.id, item);
    this.peak = Math.max(this.peak, this.pending.size);
    try {
      this.encoder.encode(frame, { keyFrame: key });
      this.queuePeak = Math.max(this.queuePeak, this.encoder.encodeQueueSize);
    }
    finally { frame.close(); }
    return true;
  }

  flush() { return this.encoder.flush(); }
  close() {
    if (this.encoder.state !== 'closed') this.encoder.close();
    this.pending.clear();
  }
}

export class ColourDecoder {
  pending = new Map();
  peak = 0;
  queuePeak = 0;
  stateChanges = [];
  last = -1;
  synced = false;
  dropped = 0;
  errors = 0;
  recoveries = 0;

  constructor(codec, size, output) {
    this.config = decoderConfig(codec, size);
    this.output = output;
  }

  reset(reason) {
    if (this.decoder && this.stateChanges.length < FRAME_COUNT) {
      this.stateChanges.push({ id: this.last, state: 'waiting for key', reason });
    }
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.dropped += this.pending.size;
    this.pending.clear();
    this.decoder = undefined;
    this.synced = false;
  }

  push(unit, timing) {
    if (unit.id <= this.last) return;
    if (unit.id !== this.last + 1) this.reset('source ID gap');
    // H.264 implementations can retain decoded pictures internally even
    // with optimizeForLatency and an empty decodeQueueSize.
    else if (this.pending.size >= 24 || this.decoder?.decodeQueueSize >= 4) this.reset('decoder backlog');
    this.last = unit.id;
    if (!unit.key && !this.synced) { this.dropped++; return; }
    try {
      if (!this.decoder) {
        const decoder = this.decoder = new VideoDecoder({
          output: frame => {
            const id = sourceId(frame.timestamp);
            const item = this.pending.get(id);
            this.pending.delete(id);
            if (item && decoder === this.decoder) this.output(frame, item);
            else frame.close();
          },
          error: () => {
            if (decoder !== this.decoder) return;
            this.errors++;
            this.reset('decoder error');
          },
        });
        decoder.configure(this.config);
        if (this.stateChanges.length < FRAME_COUNT) this.stateChanges.push({ id: this.last, state: 'configured' });
        if (this.last > 0) this.recoveries++;
      }
      const { data, ...metadata } = unit;
      const timestamp = frameTimestamp(unit.id);
      this.pending.set(unit.id, { ...timing, ...metadata, encodedBytes: data.length });
      this.peak = Math.max(this.peak, this.pending.size);
      this.decoder.decode(new EncodedVideoChunk({ type: unit.key ? 'key' : 'delta', timestamp,
        duration: frameDuration(unit.id), data }));
      this.queuePeak = Math.max(this.queuePeak, this.decoder.decodeQueueSize);
      this.synced = true;
    } catch {
      this.errors++;
      this.reset('decode submission error');
    }
  }

  flush() { return this.decoder?.flush(); }
  close() { this.reset('closed'); }
}

// Fixed colour patches and a ten-bit luminance ID visible in the source and
// decoded images. The frame's full ID also travels in CRC-protected metadata.
export function drawTestFrame(canvas, id) {
  const { width, height } = canvas;
  const context = canvas.getContext('2d');
  context.fillStyle = '#143948';
  context.fillRect(0, 0, width, height);
  const square = width / 4;
  for (const [i, colour] of ['#d74637', '#22ba61', '#4365db', '#e3bd42'].entries()) {
    context.fillStyle = colour;
    context.fillRect(i * square, height / 2, square, height / 4);
  }
  context.fillStyle = '#c4659c';
  context.fillRect(id * 3 % (width - square), 0, square, height / 4);
  const bitWidth = Math.floor(width / 10);
  for (let i = 0; i < 10; i++) {
    context.fillStyle = id & (1 << i) ? 'white' : 'black';
    context.fillRect(i * bitWidth, height * .75, bitWidth, height / 4);
  }
}
