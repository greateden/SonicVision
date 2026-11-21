import { crc, sizes } from './protocol.js';
import { distribution, unpackStream, TRIAL_SECONDS } from './stream.js';
import {
  FPS, FRAME_COUNT, MAX_UNIT, packetize, videoFormat, ColourEncoder, ColourDecoder, VideoAssembler, drawTestFrame,
} from './video.js';

const WINDOW_MS = TRIAL_SECONDS * 1000;

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

function validColours(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, Math.floor(height * .625), width, 1);
  const patches = [0, 1, 2, 3].map(i => {
    const start = Math.floor((i + .5) * width / 4) * 4;
    return data.subarray(start, start + 3);
  });
  return patches.slice(0, 3).every((rgb, i) => rgb.every((value, channel) =>
    channel === i || rgb[i] - value >= 25)) &&
    Math.min(patches[3][0], patches[3][1]) - patches[3][2] >= 25;
}

export class VideoView {
  queue = [];
  decoded = 0;
  displayed = [];
  decodedLog = [];
  displayedCount = 0;
  verifiedMarkers = 0;
  verifiedColours = 0;
  colourMismatches = 0;
  renderDrops = 0;
  lastDrawnId = -1;
  outOfOrder = 0;
  displayPeak = 0;
  receivedWireBytes = 0;
  units = 0;
  damaged = 0;

  constructor(canvas, { marker = false } = {}) {
    this.canvas = canvas;
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
    if (this.queue.length >= 24) {
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
      if (item.id <= this.lastDrawnId) {
        this.outOfOrder++;
        return;
      }
      this.lastDrawnId = item.id;
      const { canvas } = this;
      if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
      if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
      canvas.getContext('2d', { willReadFrequently: this.marker }).drawImage(frame, 0, 0);
      const drawnAt = performance.now();
      if (this.windowStart === undefined) this.windowStart = drawnAt;
      if (drawnAt < this.windowStart + WINDOW_MS && document.visibilityState === 'visible') {
        const imageId = this.marker ? drawId(canvas) : null;
        if (imageId === item.id) this.verifiedMarkers++;
        const colourValid = this.marker ? validColours(canvas) : null;
        if (colourValid) this.verifiedColours++;
        if (colourValid === false) this.colourMismatches++;
        if (this.marker && imageId !== item.id) this.damaged++;
        if (!this.marker || (imageId === item.id && colourValid)) {
          this.displayedCount++;
          if (this.displayed.length < FRAME_COUNT) this.displayed.push({
            ...item, drawnAt, imageId, colourValid,
            latencyMs: drawnAt - item.captureTenthsMs / 10,
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
      gaps.push(Math.min(now, this.windowStart + WINDOW_MS) - this.displayed.at(-1).drawnAt);
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
      colourVerified: this.marker ? this.verifiedColours : null, colourMismatches: this.colourMismatches,
      missingSourceIds: Array.from({ length: FRAME_COUNT }, (_, id) => id).filter(id => !shown.has(id)),
      missingPacketsLowerBound: this.assembler?.missingPackets ?? 0, duplicates: this.assembler?.duplicates ?? 0,
      rejectedFragments: this.assembler?.rejected ?? 0, renderDrops: this.renderDrops,
      outOfOrder: this.outOfOrder, receivedUnits: this.units,
      decoderErrors: this.decoder?.errors ?? 0, dependencyDrops: this.decoder?.dropped ?? 0,
      recoveries: this.decoder?.recoveries ?? 0, receiverWireBytes: this.receivedWireBytes,
      displayedPayloadBps: this.displayed.reduce((sum, item) => sum + item.encodedBytes, 0) * 8 / elapsed,
      decoderPendingPeak: this.decoder?.peak ?? 0, decoderQueuePeak: this.decoder?.queuePeak ?? 0,
      decoderState: this.decoder?.decoder?.state ?? 'unconfigured',
      decoderSynced: this.decoder?.synced ?? false, decoderStateChanges: this.decoder?.stateChanges.slice() ?? [],
      renderQueuePeak: this.displayPeak,
      freezeCount: freeze.length, freezeTotalMs: freeze.reduce((sum, ms) => sum + ms, 0),
      freezeMs: distribution(freeze), displayIntervalsMs: distribution(gaps),
      latencyBasis: 'same-device capture to canvas draw',
      latencyMs: distribution(this.displayed.map(item => item.latencyMs)),
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
  source = [];
  sequence = 0;
  sendDrops = 0;
  encoderAdmissionDrops = 0;
  wireBytes = 0;
  packetCount = 0;
  fragmentedFrames = 0;
  cameraFrame = 0;

  constructor({ codec, size, bitrate, session, canvas, camera, view, alive, complete, error, inject }) {
    Object.assign(this, { codec, size, bitrate, session, canvas, camera, view, alive, complete, error, inject });
    [canvas.width, canvas.height] = sizes[size];
    this.encoder = new ColourEncoder(codec, size, bitrate, item => this.onEncode(item), error);
    this.started = performance.now();
    if (camera?.requestVideoFrameCallback) {
      const observe = (_, { presentedFrames }) => {
        this.cameraFrame = presentedFrames;
        this.cameraCallback = camera.requestVideoFrameCallback(observe);
      };
      this.cameraCallback = camera.requestVideoFrameCallback(observe);
    }
  }

  capture(id) {
    if (!this.alive()) return;
    const now = performance.now();
    try {
      const context = this.canvas.getContext('2d');
      const time = this.cameraCallback === undefined ? this.camera?.currentTime : this.cameraFrame;
      const freshCameraFrame = this.camera?.readyState >= 2 && time !== this.cameraTime &&
        (this.cameraCallback === undefined || time > 0);
      if (now - this.started - id * 1000 / FPS < 1000 / FPS && (!this.camera || freshCameraFrame)) {
        if (this.camera) {
          context.drawImage(this.camera, 0, 0, this.canvas.width, this.canvas.height);
          this.cameraTime = time;
        } else drawTestFrame(this.canvas, id);
        const capturedAt = performance.now();
        const row = { id, capturedAt, captureTenthsMs: Math.round(capturedAt * 10) };
        this.source.push(row);
        // The first available frame and each two-second boundary can resynchronise.
        const key = this.source.length === 1 || id % (2 * FPS) === 0;
        if (!this.encoder.encode(this.canvas, row, key)) this.encoderAdmissionDrops++;
      }
      if (id + 1 < FRAME_COUNT) {
        this.timer = setTimeout(() => this.capture(id + 1), Math.max(0, this.started + (id + 1) * 1000 / FPS - performance.now()));
      } else {
        this.timer = setTimeout(() => this.finish().catch(this.error), Math.max(0, this.started + WINDOW_MS - performance.now()));
      }
    } catch (error) { this.error(error); }
  }

  onEncode(item) {
    if (!this.alive()) return;
    const { data } = item;
    const original = this.source.find(source => source.id === item.id);
    Object.assign(original, { encodedAt: item.encodedAt, encodedBytes: data.length, key: item.key, checksum: crc(data) });
    if (data.length > MAX_UNIT) { this.sendDrops++; return; }
    try {
      const packets = packetize([item], { session: this.session, sequence: this.sequence, size: this.size,
        codec: this.codec, marker: !this.camera, payloadLimit: 128 });
      this.packetCount += packets.length;
      if (packets.length > 1) this.fragmentedFrames++;
      original.packetizedAt = performance.now();
      for (const bytes of packets) {
        this.wireBytes += bytes.length;
        const sequence = this.sequence++;
        const delivered = this.inject ? this.inject(bytes, sequence, item.id) : bytes;
        const packet = delivered && unpackStream(delivered);
        if (packet) this.view.push(packet, { receivedAt: performance.now() });
      }
    } catch (error) { this.error(error); }
  }

  async finish() {
    await this.encoder.flush();
    if (!this.alive()) return;
    await this.view.decoder?.flush();
    if (!this.alive()) return;
    const end = (this.view.windowStart ?? this.started) + WINDOW_MS;
    this.timer = setTimeout(() => this.complete(), Math.max(0, end - performance.now()));
  }

  report(now = performance.now()) {
    const seconds = Math.min(TRIAL_SECONDS, Math.max(.001, (now - this.started) / 1000));
    const encoded = this.source.filter(frame => frame.encodedBytes);
    const keys = encoded.filter(frame => frame.key);
    const codecBytes = encoded.reduce((sum, frame) => sum + frame.encodedBytes, 0);
    const [width, height] = sizes[this.size];
    return { codec: this.codec, width, height,
      source: this.camera ? 'camera' : 'synthetic colour chart', targetFrames: FRAME_COUNT, targetFps: FPS,
      targetBitrate: this.bitrate, seconds, captured: this.source.length, capturedFps: this.source.length / seconds,
      encoded: encoded.length, encodedFps: encoded.length / seconds, codecBytes, codecBps: codecBytes * 8 / seconds,
      frameBytes: distribution(encoded.map(frame => frame.encodedBytes)), keyBytes: distribution(keys.map(frame => frame.encodedBytes)),
      deltaBytes: distribution(encoded.filter(frame => !frame.key).map(frame => frame.encodedBytes)),
      encodeMs: distribution(encoded.map(frame => frame.encodedAt - frame.capturedAt)),
      wireBytes: this.wireBytes, sendDrops: this.sendDrops, encoderPendingPeak: this.encoder.peak,
      encoderQueuePeak: this.encoder.queuePeak, encoderState: this.encoder.encoder.state,
      encoderAdmissionDrops: this.encoderAdmissionDrops, encoderMissingFrames: this.source.length - encoded.length,
      packets: this.packetCount, fragmentedFrames: this.fragmentedFrames, frames: this.source };
  }

  close() {
    clearTimeout(this.timer);
    if (this.cameraCallback !== undefined) this.camera.cancelVideoFrameCallback(this.cameraCallback);
    this.encoder.close();
  }
}
