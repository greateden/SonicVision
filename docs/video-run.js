import { sizes } from './protocol.js';
import { distribution, unpackStream, TRIAL_SECONDS, PCM_RATE } from './stream.js';
import {
  FPS, FRAME_COUNT, MAX_UNIT, packetize, videoFormat, ColourEncoder, ColourDecoder, VideoAssembler, drawTestFrame,
} from './video.js';

const MAX_AIR_MS = 450;
const BURST_WAIT_MS = 125;

function drawId(canvas) {
  const { width, height } = canvas;
  const context = canvas.getContext('2d');
  const bitWidth = Math.floor(width / 10);
  const { data } = context.getImageData(0, Math.floor(height * .875), width, 1);
  let id = 0;
  for (let i = 0; i < 10; i++) {
    const p = (i * bitWidth + Math.floor(bitWidth / 2)) * 4;
    if (data[p] + data[p + 1] + data[p + 2] > 384) id |= 1 << i;
  }
  return id;
}

export class VideoView {
  queue = [];
  decoded = 0;
  displayed = [];
  decodedLog = [];
  displayedCount = 0;
  verifiedMarkers = 0;
  renderDrops = 0;
  displayPeak = 0;
  receivedWireBytes = 0;
  units = 0;
  damaged = 0;

  constructor(canvas, { local = false, marker = false } = {}) {
    this.canvas = canvas;
    this.local = local;
    this.marker = marker;
  }

  push(packet, timing = {}) {
    const format = videoFormat(packet.kind);
    if (!format || (this.session !== undefined && (this.session !== packet.session || this.kind !== packet.kind))) return;
    if (!this.assembler) {
      this.session = packet.session;
      this.kind = packet.kind;
      this.format = format;
      this.marker ||= format.marker;
      this.assembler = new VideoAssembler();
      this.decoder = new ColourDecoder(format.codec, format.size, (frame, item) => this.onDecode(frame, item));
    }
    if (packet.sequence >= this.assembler.nextPacket) this.receivedWireBytes += packet.wireBytes;
    for (const unit of this.assembler.push(packet)) {
      this.units++;
      this.decoder.push(unit, timing);
    }
  }

  onDecode(frame, item) {
    this.decoded++;
    const decodedAt = performance.now();
    if (this.decodedLog.length < FRAME_COUNT) this.decodedLog.push({ ...item, decodedAt });
    if (this.queue.length >= 8) {
      this.queue.shift().frame.close();
      this.renderDrops++;
    }
    this.queue.push({ ...item, frame, decodedAt });
    this.displayPeak = Math.max(this.displayPeak, this.queue.length);
    if (!this.animation) this.animation = requestAnimationFrame(() => this.draw());
  }

  draw() {
    this.animation = null;
    const { frame, ...item } = this.queue.shift();
    try {
      const { canvas } = this;
      if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
      if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
      canvas.getContext('2d').drawImage(frame, 0, 0);
      const drawnAt = performance.now();
      if (this.windowStart === undefined) this.windowStart = drawnAt;
      if (drawnAt < this.windowStart + TRIAL_SECONDS * 1000 && document.visibilityState === 'visible') {
        const imageId = this.marker ? drawId(canvas) : null;
        if (imageId === item.id) this.verifiedMarkers++;
        if (this.marker && imageId !== item.id) this.damaged++;
        else {
          this.displayedCount++;
          if (this.displayed.length < FRAME_COUNT) this.displayed.push({
            ...item, drawnAt, imageId, ...(this.local ? {
              latencyMs: ((performance.timeOrigin + drawnAt - item.captureMs) | 0),
            } : {}),
          });
        }
      } else this.renderDrops++;
    } finally {
      frame.close();
      if (this.queue.length) this.animation = requestAnimationFrame(() => this.draw());
    }
  }

  report(now = performance.now()) {
    const gaps = this.displayed.slice(1).map((item, i) => item.drawnAt - this.displayed[i].drawnAt);
    const elapsed = Math.min(TRIAL_SECONDS, Math.max(.001, (now - (this.windowStart ?? now)) / 1000));
    if (this.displayed.length) {
      gaps.push(Math.min(now, this.windowStart + 60000) - this.displayed.at(-1).drawnAt);
    }
    const freeze = gaps.filter(ms => ms > 2 * 1000 / FPS);
    const shown = new Set(this.displayed.map(item => item.id));
    return {
      session: this.session, ...this.format, secondsObserved: this.windowStart === undefined ? 0 : elapsed,
      decoded: this.decoded, decodedLog: this.decodedLog, displayed: this.displayedCount,
      displayedFps: this.displayedCount / elapsed,
      drawSpanFps: this.displayed.length < 2 ? 0 : (this.displayed.length - 1) * 1000 /
        (this.displayed.at(-1).drawnAt - this.displayed[0].drawnAt),
      markerVerified: this.marker ? this.verifiedMarkers : null, markerMismatches: this.damaged,
      missingSourceIds: Array.from({ length: FRAME_COUNT }, (_, id) => id).filter(id => !shown.has(id)),
      missingPacketsLowerBound: this.assembler?.missingPackets ?? 0, duplicates: this.assembler?.duplicates ?? 0,
      rejectedFragments: this.assembler?.rejected ?? 0, renderDrops: this.renderDrops, receivedUnits: this.units,
      decoderErrors: this.decoder?.errors ?? 0, dependencyDrops: this.decoder?.dropped ?? 0,
      recoveries: this.decoder?.recoveries ?? 0, receiverWireBytes: this.receivedWireBytes,
      modemPayloadBps: this.local ? null : this.receivedWireBytes * 8 / elapsed,
      displayedPayloadBps: this.displayed.reduce((sum, item) => sum + item.encodedBytes, 0) * 8 / elapsed,
      decoderPendingPeak: this.decoder?.peak ?? 0, renderQueuePeak: this.displayPeak,
      freezeCount: freeze.length, freezeTotalMs: freeze.reduce((sum, ms) => sum + ms, 0),
      freezeMs: distribution(freeze), displayIntervalsMs: distribution(gaps),
      latencyBasis: this.local ? 'same-device capture to canvas draw' : 'uncalibrated clocks; use external optical measurement',
      latencyMs: this.local ? distribution(this.displayed.map(item => item.latencyMs)) : null,
      frames: this.displayed,
    };
  }

  close() {
    this.decoder?.close();
    if (this.animation) cancelAnimationFrame(this.animation);
    for (const { frame } of this.queue) frame.close();
    this.queue = [];
  }
}

export class VideoTrial {
  batch = [];
  source = [];
  sequence = 0;
  lastSent = -2;
  keyRequestedAt = -15;
  sendDrops = 0;
  peakBatchFrames = 0;
  peakBatchBytes = 0;
  wireBytes = 0;
  tx = [];

  constructor({ codec, size, bitrate, session, canvas, camera, view, air, alive, complete, error, inject }) {
    Object.assign(this, { codec, size, bitrate, session, canvas, camera, view, air, alive, complete, error, inject });
    [canvas.width, canvas.height] = sizes[size];
    this.encoder = new ColourEncoder(codec, size, bitrate, item => this.onEncode(item), error);
    this.started = performance.now();
  }

  capture(id) {
    if (!this.alive()) return;
    const now = performance.now();
    try {
      const context = this.canvas.getContext('2d');
      const time = this.camera?.currentTime;
      if (now - this.started - id * 1000 / FPS < 1000 / FPS && (!this.camera || (this.camera.readyState >= 2 && time !== this.cameraTime))) {
        if (this.camera) {
          context.drawImage(this.camera, 0, 0, this.canvas.width, this.canvas.height);
          this.cameraTime = time;
        } else drawTestFrame(this.canvas, id);
        const row = { id, capturedAt: now, captureMs: (performance.timeOrigin + now) >>> 0 };
        this.source.push(row);
        // Periodic recovery operates without feedback. Limit extra key requests
        // under congestion so a large keyframe cannot trigger a flood of keys.
        const key = id % 30 === 0 || (this.air && this.lastSent < id - 4 && id - this.keyRequestedAt >= 15);
        if (this.encoder.encode(this.canvas, row, key) && key) this.keyRequestedAt = id;
      }
      if (id + 1 < FRAME_COUNT) {
        this.timer = setTimeout(() => this.capture(id + 1), Math.max(0, this.started + (id + 1) * 1000 / FPS - performance.now()));
      } else {
        this.timer = setTimeout(() => this.finish().catch(this.error), Math.max(0, this.started + 60000 - performance.now()));
      }
    } catch (error) { this.error(error); }
  }

  onEncode(item) {
    if (!this.alive()) return;
    const { data } = item;
    const original = this.source.find(source => source.id === item.id);
    Object.assign(original, { encodedAt: item.encodedAt, encodedBytes: data.length, key: item.key });
    if (data.length > MAX_UNIT) { this.sendDrops++; return; }
    if (!this.air) {
      try { this.send([item]); }
      catch (error) { this.error(error); }
      return;
    }
    if (!this.batch.length) this.burstTimer = setTimeout(() => this.flushBatch(), BURST_WAIT_MS);
    this.batch.push(item);
    this.peakBatchFrames = Math.max(this.peakBatchFrames, this.batch.length);
    this.peakBatchBytes = Math.max(this.peakBatchBytes, this.batch.reduce((sum, part) => sum + part.data.length, 0));
    if (this.batch.length === 4) this.flushBatch();
  }

  flushBatch() {
    clearTimeout(this.burstTimer);
    const frames = this.batch.splice(0);
    if (!frames.length || !this.alive()) return;
    try {
      let tail = this.lastSent;
      const valid = frames.filter(frame => {
        if (!frame.key && frame.id !== tail + 1) return false;
        tail = frame.id;
        return true;
      });
      this.sendDrops += frames.length - valid.length;
      if (valid.length) this.send(valid);
    } catch (error) { this.error(error); }
  }

  send(frames) {
    const packets = packetize(frames, { session: this.session, sequence: this.sequence, size: this.size, codec: this.codec,
      marker: !this.camera, payloadLimit: this.air ? 320 : 128 });
    const now = performance.now();
    if (this.air) {
      const { encode, playout, gap } = this.air;
      // Limit work and queue memory before allocating PCM for a keyframe.
      if (packets.length > 3) { this.sendDrops += frames.length; return; }
      const waveforms = packets.map(encode);
      const samples = waveforms.reduce((sum, pcm) => sum + pcm.length + gap, 0);
      const wait = Math.max(25, playout.ahead * 1000 / PCM_RATE);
      if (performance.now() - frames[0].capturedAt + wait + samples * 1000 / PCM_RATE > MAX_AIR_MS ||
          playout.sources.size + waveforms.length > 8) {
        this.sendDrops += frames.length;
        return;
      }
      for (const pcm of waveforms) {
        const startSample = playout.play(pcm, gap);
        this.tx.push({ sequence: this.sequence++, startSample, waveformSamples: pcm.length,
          firstSourceId: frames[0].id, lastSourceId: frames.at(-1).id });
      }
    } else {
      for (const bytes of packets) {
        const sequence = this.sequence++;
        const delivered = this.inject ? this.inject(bytes, sequence, frames[0].id) : bytes;
        const packet = delivered && unpackStream(delivered);
        if (packet) this.view.push(packet, { receivedAt: performance.now() });
      }
    }
    this.wireBytes += packets.reduce((sum, bytes) => sum + bytes.length, 0);
    this.lastSent = frames.at(-1).id;
    for (const frame of frames) {
      const original = this.source.find(source => source.id === frame.id);
      original.packetizedAt = now;
    }
  }

  async finish() {
    await this.encoder.flush();
    if (!this.alive()) return;
    if (this.air) {
      this.flushBatch();
      this.timer = setTimeout(() => this.complete(), this.air.playout.ahead * 1000 / PCM_RATE + 30);
    } else {
      await this.view.decoder?.flush();
      if (!this.alive()) return;
      const end = (this.view.windowStart ?? this.started) + TRIAL_SECONDS * 1000;
      // Include the full presentation window, including silence after the last draw.
      this.timer = setTimeout(() => this.complete(), Math.max(0, end - performance.now()));
    }
  }

  report(now = performance.now()) {
    const seconds = Math.min(TRIAL_SECONDS, Math.max(.001, (now - this.started) / 1000));
    const encoded = this.source.filter(frame => frame.encodedBytes);
    const keys = encoded.filter(frame => frame.key);
    const codecBytes = encoded.reduce((sum, frame) => sum + frame.encodedBytes, 0);
    return { codec: this.codec, ...Object.fromEntries(['width', 'height'].map((key, i) => [key, sizes[this.size][i]])),
      source: this.camera ? 'camera' : 'synthetic colour chart', targetFrames: FRAME_COUNT, targetFps: FPS,
      targetBitrate: this.bitrate, seconds, captured: this.source.length, capturedFps: this.source.length / seconds,
      encoded: encoded.length, encodedFps: encoded.length / seconds, codecBytes, codecBps: codecBytes * 8 / seconds,
      frameBytes: distribution(encoded.map(frame => frame.encodedBytes)), keyBytes: distribution(keys.map(frame => frame.encodedBytes)),
      encodeMs: distribution(encoded.map(frame => frame.encodedAt - frame.capturedAt)),
      wireBytes: this.wireBytes, sendDrops: this.sendDrops, encoderPendingPeak: this.encoder.peak,
      batchFramesPeak: this.peakBatchFrames, batchBytesPeak: this.peakBatchBytes, packets: this.tx, frames: this.source };
  }

  close() {
    clearTimeout(this.timer);
    clearTimeout(this.burstTimer);
    this.encoder.close();
    this.batch = [];
  }
}
