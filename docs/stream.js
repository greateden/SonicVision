import { crc } from './protocol.js';

export const PCM_RATE = 48000;
export const TRIAL_SECONDS = 60;
const SONANCE_GAP_SAMPLES = 512;
export const PROFILES = {
  balanced: { profile: 'balanced', gap: 6720 },
  fast: { profile: 'fast', gap: SONANCE_GAP_SAMPLES },
  fastwide: { profile: 'fastwide', gap: SONANCE_GAP_SAMPLES },
  'auto-16': { profile: 'auto', rung: 3, gap: SONANCE_GAP_SAMPLES },
  'auto-64': { profile: 'auto', rung: 4, gap: SONANCE_GAP_SAMPLES },
  'auto-256': { profile: 'auto', rung: 6, gap: SONANCE_GAP_SAMPLES },
};

export const BENCHMARK = 1;
const MAGIC = 0x5357;
export const ENVELOPE = 15;
const MAX_PACKET = 4352;

export function packStream({ kind, session, sequence, payload }) {
  const bytes = new Uint8Array(ENVELOPE + payload.length);
  if (bytes.length > MAX_PACKET) throw new RangeError('Stream packet too large.');
  const view = new DataView(bytes.buffer);
  view.setUint16(0, MAGIC);
  view.setUint8(2, kind);
  view.setUint32(3, session);
  view.setUint32(7, sequence);
  bytes.set(payload, 11);
  view.setUint32(bytes.length - 4, crc(bytes.subarray(0, -4)));
  return bytes;
}

export function isStream(bytes) {
  return bytes[0] === (MAGIC >> 8) && bytes[1] === (MAGIC & 255);
}

export function unpackStream(bytes) {
  if (!isStream(bytes) || bytes.length < ENVELOPE || bytes.length > MAX_PACKET) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const checksum = view.getUint32(bytes.length - 4);
  if (checksum !== crc(bytes.subarray(0, -4))) return;
  return {
    kind: view.getUint8(2), session: view.getUint32(3), sequence: view.getUint32(7), checksum,
    payload: bytes.subarray(11, -4), wireBytes: bytes.length,
  };
}

const BENCH_HEADER = 9;
const validSize = size => Number.isInteger(size) && size >= 64 && size <= 512;
const validBatch = batch => [1, 4, 8].includes(batch);

function* pattern(session, id, size) {
  let state = (session ^ Math.imul(id + 1, 0x9e3779b1)) || 1;
  for (let i = 0; i < size; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    yield state & 255;
  }
}

function benchmarkPacket(plan, sequence) {
  const { session, size, batch, slotSamples } = plan;
  const payload = new Uint8Array(BENCH_HEADER + batch * (size + 2));
  const view = new DataView(payload.buffer);
  view.setUint16(0, size);
  view.setUint8(2, batch);
  view.setUint16(3, plan.expectedPackets);
  view.setUint32(5, slotSamples);
  for (let i = 0, offset = BENCH_HEADER; i < batch; i++) {
    const id = sequence * batch + i;
    view.setUint16(offset, id);
    offset += 2;
    for (const byte of pattern(session, id, size)) payload[offset++] = byte;
  }
  return packStream({ kind: BENCHMARK, session, sequence, payload });
}

export function makeBenchmark(session, size, batch, gap, encode) {
  if (!validSize(size) || !validBatch(batch)) throw new RangeError('Invalid benchmark payload or batch.');
  const plan = { session, size, batch, expectedPackets: 0, slotSamples: 0 };
  const packetSamples = encode(benchmarkPacket(plan, 0)).length;
  plan.slotSamples = packetSamples + gap;
  plan.expectedPackets = Math.floor(TRIAL_SECONDS * PCM_RATE / plan.slotSamples);
  return { ...plan, packetSamples, gapSamples: gap, makePacket: sequence => benchmarkPacket(plan, sequence) };
}

export function verifyBenchmark({ session, sequence, payload }) {
  if (payload.length < BENCH_HEADER) return;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const size = view.getUint16(0);
  const batch = view.getUint8(2);
  const expectedPackets = view.getUint16(3);
  const slotSamples = view.getUint32(5);
  if (!validSize(size) || !validBatch(batch) || slotSamples < 1024 ||
      expectedPackets !== Math.floor(TRIAL_SECONDS * PCM_RATE / slotSamples) ||
      sequence >= expectedPackets || payload.length !== BENCH_HEADER + batch * (2 + size)) return;
  const ids = [];
  for (let i = 0, offset = BENCH_HEADER; i < batch; i++) {
    const id = sequence * batch + i;
    if (view.getUint16(offset) !== id) return;
    offset += 2;
    for (const byte of pattern(session, id, size)) {
      if (payload[offset++] !== byte) return;
    }
    ids.push(id);
  }
  return { size, batch, expectedPackets, slotSamples, ids };
}

export function distribution(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted[Math.ceil(p * sorted.length) - 1];
  return { count: sorted.length, min: sorted[0], p50: percentile(.5), p95: percentile(.95),
    p99: percentile(.99), max: sorted.at(-1) };
}

export class BenchmarkReceiver {
  received = new Map();
  duplicates = 0;

  constructor(session, info) {
    this.session = session;
    const { ids, ...plan } = info;
    this.plan = plan;
  }

  add(packet, info, timing) {
    if (packet.session !== this.session || Object.keys(this.plan).some(key => this.plan[key] !== info[key])) return false;
    if (this.received.has(packet.sequence)) {
      this.duplicates++;
      return true;
    }
    this.received.set(packet.sequence, { sequence: packet.sequence, ids: info.ids, ...timing,
      checksum: packet.checksum, wireBytes: packet.wireBytes });
    return true;
  }

  report() {
    const packets = [...this.received.values()];
    const records = packets.length * this.plan.batch;
    const elapsed = packets.slice(1).map((item, i) => item.arrivalMs - packets[i].arrivalMs);
    const missingPackets = Array.from({ length: this.plan.expectedPackets }, (_, seq) => seq)
      .filter(seq => !this.received.has(seq));
    const release = packets.map(item => item.decoderReleaseMs)
      .filter(value => Number.isFinite(value) && value >= 0);
    return {
      session: this.session, ...this.plan, seconds: TRIAL_SECONDS, packets, records, missingPackets,
      duplicates: this.duplicates, usefulBps: records * this.plan.size * 8 / TRIAL_SECONDS,
      modemPayloadBps: packets.reduce((sum, item) => sum + item.wireBytes, 0) * 8 / TRIAL_SECONDS,
      arrivalIntervalMs: distribution(elapsed),
      decoderReleaseMs: distribution(release), invalidReleaseSamples: packets.length - release.length,
      decoderReleaseBasis: 'estimated last PHY sample on receiver audio timeline to main-thread packet receipt',
    };
  }
}
