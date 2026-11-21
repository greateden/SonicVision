import init, { encode, sample_rate } from './modem/sonance_wasm.js';
import { compress, packet, unpack, sizes, colourSize, guard, benchmarkCount, benchmarkPayload } from './protocol.js';
import { BENCHMARK, PCM_RATE, PROFILES, TRIAL_SECONDS, BenchmarkReceiver, makeBenchmark, unpackStream, verifyBenchmark } from './stream.js';
import { Playout } from './playout.js';
import { CODECS, FRAME_COUNT, drawTestFrame, probeVideo } from './video.js';
import { VideoView, VideoTrial } from './video-run.js';

const el = id => document.getElementById(id);
const modes = ['send', 'receive', 'legacy-receive', 'loop', 'bench', 'colour'];
const camera = el('camera');
const capture = document.createElement('canvas');
const captureContext = capture.getContext('2d', { willReadFrequently: true });
const profile = 'balanced';
const secure = window.isSecureContext;
let active;
let ready = false;
let modemRate;
let lastReport;
let offline = false;

function report(run) {
  return {
    schema: 1, mode: run.mode, medium: run.mode === 'colour' ? 'browser digital' :
      run.mode === 'loop' ? 'software PCM' : 'speaker/microphone path',
    complete: run.complete ?? false, userAgent: navigator.userAgent, offlineAssetsReady: offline,
    elapsedSeconds: (performance.now() - run.started) / 1000,
    session: run.session, phy: run.phy, microphone: run.settings, speakerGain: run.startGain,
    direction: run.direction, distanceCm: run.distanceCm,
    captureSeconds: run.listenStarted === undefined ? undefined : (performance.now() - run.listenStarted) / 1000,
    interrupted: run.interrupted ?? false, captureGaps: run.gaps ?? 0, droppedCaptureSamples: run.droppedCapture ?? 0,
    modemErrors: run.modemErrors, rejectedPackets: run.rejected ?? 0,
    byteRx: run.byteReceiver?.report(), byteTx: run.byteSender,
    audio: run.playout?.report(), videoTx: run.trial?.report(), videoRx: run.view?.report(), videoVerification: run.verification,
  };
}

function saveReport(run) {
  if (run) lastReport = report(run);
  if (!lastReport) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sonicvision-' + lastReport.mode + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function status(text) { el('status').textContent = text; }

function buttons() {
  for (const mode of modes) el(mode).disabled = !ready || Boolean(active);
  if (!secure) for (const mode of ['receive', 'legacy-receive']) el(mode).disabled = true;
  el('stop').disabled = !active;
  for (const id of ['source', 'size', 'fps', 'codec', 'colour-size', 'bitrate-target', 'phy', 'record-size', 'batch', 'direction', 'distance']) {
    el(id).disabled = Boolean(active);
  }
  el('gain').disabled = active?.mode === 'bench';
  el('export').disabled = !active && !lastReport;
}

function stop(run, message = 'Stopped.') {
  if (!run || active !== run) return;
  lastReport = report(run);
  active = undefined;
  clearTimeout(run.timer);
  run.trial?.close();
  run.view?.close();
  run.playout?.close();
  clearInterval(run.statsTimer);
  if (run.node) run.node.port.onmessage = null;
  run.stream?.getTracks().forEach(track => track.stop());
  camera.srcObject = null;
  run.context?.close().catch(() => {});
  run.worker?.terminate();
  run.cancelDecoder?.();
  buttons();
  status(message);
}

function display(id, { width, height, pixels, colour }) {
  const canvas = el(id);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    if (colour) {
      const value = pixels[i];
      image.data[offset] = (value >> 5) * 255 / 7;
      image.data[offset + 1] = ((value >> 2) & 7) * 255 / 7;
      image.data[offset + 2] = (value & 3) * 85;
    } else {
      const value = pixels[i >> 3] & (128 >> (i & 7)) ? 255 : 0;
      image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = value;
    }
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function captureFrame(size, sequence, useCamera, colour) {
  const [width, height] = sizes[size];
  capture.width = width;
  capture.height = height;
  if (useCamera) {
    captureContext.drawImage(camera, 0, 0, width, height);
  } else {
    captureContext.fillStyle = 'black';
    captureContext.fillRect(0, 0, width, height);
    captureContext.fillStyle = colour ? '#f00' : 'white';
    captureContext.fillRect(sequence * 5 % (width * 3 / 4), height / 4, width / 4, height / 2);
    if (colour) captureContext.fillStyle = '#0af';
    captureContext.fillRect(0, height - 2, sequence * 3 % width, 2);
  }
  return compress(captureContext.getImageData(0, 0, width, height).data, size, colour);
}

function updateStats(run) {
  if (run.byteReceiver) {
    const result = run.byteReceiver.report();
    el('benchmark').hidden = false;
    el('benchmark').textContent = `${result.records}/${result.expectedPackets * result.batch} verified records · ${Math.round(result.usefulBps)} bit/s over 60 s · ${result.missingPackets.length} missing packets so far`;
    el('bitrate').textContent = `${Math.round(result.usefulBps)} bit/s useful`;
    el('loss').textContent = `${(100 * result.missingPackets.length / result.expectedPackets).toFixed(1)}% so far`;
    if (result.decoderReleaseMs) el('latency').textContent = `${result.decoderReleaseMs.p95.toFixed(1)} ms p95 after PHY end`;
    return;
  }
  if (run.trial || run.view?.assembler) {
    const tx = run.trial?.report();
    const rx = run.view?.report();
    el('rate').textContent = rx ? `${rx.displayedFps.toFixed(2)} fps drawn · ${rx.decoded} decoded` : '—';
    el('bitrate').textContent = tx ? `${Math.round(tx.codecBps)} bit/s encoded` : '—';
    el('loss').textContent = rx ? `${rx.missingPacketsLowerBound} observed packet gaps · ${rx.freezeCount} freezes` : `${tx.sendDrops} admission drops`;
    el('latency').textContent = rx?.latencyMs ? `${rx.latencyMs.p95.toFixed(1)} ms p95 to canvas` : '—';
    el('progress').textContent = [
      tx ? `${tx.captured}/${FRAME_COUNT} captured · ${tx.encoded} encoded · peak keyframe ${tx.keyBytes?.max ?? '—'} B` : '',
      rx ? `${rx.displayed} distinct frames drawn${rx.markerVerified === null ? '' : ` · ${rx.markerVerified} visual IDs verified`}` : '',
    ].filter(Boolean).join(' · ');
    return;
  }
  if (run.mode === 'receive') return;
  const now = performance.now();
  const seconds = Math.min(5, (now - run.started) / 1000);
  run.recent = run.recent.filter(item => item.time > now - 5000);
  const bytes = run.recent.reduce((sum, item) => sum + item.bytes, 0);
  const frames = run.recent.filter(item => item.pixels).length;
  el('bitrate').textContent = `${Math.round(8 * bytes / Math.max(seconds, .001))} bit/s`;
  el('rate').textContent = `${(frames / Math.max(seconds, .001)).toFixed(2)} fps`;
  if (run.received) el('loss').textContent = `${(100 * run.missing / (run.received + run.missing)).toFixed(1)}%`;
  if (run.benchmark) {
    const { count, interval, deadline } = run.benchmark;
    const done = count === benchmarkCount || now > deadline;
    const bitrate = Math.round(8000 * count * benchmarkPayload.length / (benchmarkCount * interval));
    el('benchmark').hidden = false;
    el('benchmark').textContent = done
      ? `Benchmark: ${count}/${benchmarkCount} packets · ${bitrate} bit/s over scheduled burst · ${benchmarkCount - count} lost`
      : `Benchmark: ${count}/${benchmarkCount} packets so far`;
  }
}

function receiveFrame(run, frame) {
  const now = performance.now();
  if (run.remote !== frame.session) {
    run.remote = frame.session;
    run.lastSequence = undefined;
    run.missing = 0;
    run.received = 0;
    run.recent = [];
    run.benchmark = undefined;
    el('benchmark').hidden = true;
    el('latency').textContent = '—';
  }
  if (run.lastSequence !== undefined) {
    const advance = (frame.sequence - run.lastSequence) & 65535;
    if (!advance || advance > 32768) return;
    run.missing += advance - 1;
  }
  run.lastSequence = frame.sequence;
  run.received++;
  run.recent.push({ time: now, bytes: frame.bytes, pixels: Boolean(frame.pixels) });
  if (frame.pixels) {
    display('in', frame);
    const age = Date.now() - frame.timestamp;
    el('latency').textContent = age < 0 ? 'Check clocks' : `${age} ms`;
  } else {
    run.benchmark = {
      count: run.received, interval: frame.interval,
      deadline: now + (benchmarkCount - 1 - frame.sequence) * frame.interval + 2500,
    };
  }
  updateStats(run);
}

function startDecoder(run, inputRate) {
  const worker = run.worker = new Worker(new URL('./decode.js', import.meta.url), { type: 'module' });
  const phy = run.mode === 'loop' ? PROFILES.balanced : run.phy;
  run.decoderSettings = { profile: phy.profile, rung: phy.rung, inputRate, modemRate };
  run.statsTimer = setInterval(() => {
    updateStats(run);
    if (run.node) {
      status(`Listening · ${run.byteReceiver?.received.size ?? run.received ?? 0} packets received · ${run.failures} modem errors · ${run.gaps || 0} capture gaps`);
    }
  }, 250);
  return new Promise(resolve => {
    run.cancelDecoder = resolve;
    worker.onerror = () => stop(run, 'Decoder worker failed to load.');
    worker.onmessage = ({ data }) => {
      if (active !== run) return;
      if (data.error) {
        stop(run, data.error);
        return;
      }
      if (data.ready) {
        resolve();
        return;
      }
      for (const [error, count] of Object.entries(data.failures)) {
        run.modemErrors[error] = (run.modemErrors[error] ?? 0) + count;
        run.failures += count;
      }
      run.rejected += data.rejected;
      if (run.mode !== 'receive') for (const frame of data.frames) receiveFrame(run, frame);
      for (const packet of data.packets) {
        if (run.mode === 'receive' && packet.kind === BENCHMARK) {
          const info = verifyBenchmark(packet);
          if (!info) { run.rejected++; continue; }
          run.byteReceiver ??= new BenchmarkReceiver(packet.session, info);
          const releaseSample = run.context.currentTime * run.context.sampleRate;
          if (!run.byteReceiver.add(packet, info, {
            arrivalMs: performance.now(), captureEndSample: packet.captureEndSample, blockEndSample: data.captureSample,
            decoderReleaseMs: (releaseSample - packet.captureEndSample) * 1000 / run.context.sampleRate,
          })) run.rejected++;
        }
      }
      if (run.node) run.node.port.postMessage(null);
      else {
        const done = run.afterDecode;
        run.afterDecode = undefined;
        done?.();
      }
    };
    worker.postMessage({ type: 'start', ...run.decoderSettings });
  });
}

function decode(run, samples, gap = false, captureSample) {
  run.worker.postMessage({ samples, gap, captureSample }, [samples.buffer]);
}

async function getStream(run, constraints) {
  if (!navigator.mediaDevices) throw new Error('Camera and microphone access require HTTPS or localhost.');
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  if (active !== run) {
    stream.getTracks().forEach(track => track.stop());
    return;
  }
  run.stream = stream;
  for (const track of stream.getTracks()) {
    track.addEventListener('ended', () => stop(run, `${track.kind} disconnected.`));
  }
  return stream;
}

async function listen(run) {
  const stream = await getStream(run, {
    audio: { channelCount: 1, echoCancellation: false, autoGainControl: false, noiseSuppression: false },
  });
  if (!stream || active !== run) return;
  const { context } = run;
  await context.audioWorklet.addModule(new URL('./mic.js', import.meta.url));
  if (active !== run) return;
  await startDecoder(run, context.sampleRate);
  if (active !== run) return;
  const node = run.node = new AudioWorkletNode(context, 'sonic-microphone', {
    channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1],
  });
  node.port.onmessage = ({ data }) => {
    if (active !== run) return;
    if (data.gap) run.gaps = (run.gaps || 0) + 1;
    run.droppedCapture += data.dropped;
    decode(run, data.samples, data.gap, data.captureSample);
  };
  // The processor emits silence, keeping the mic graph running without monitor feedback.
  context.createMediaStreamSource(stream).connect(node).connect(context.destination);
  run.listenStarted = performance.now();
  const settings = stream.getAudioTracks()[0].getSettings();
  // Export signal-path settings without stable device identifiers.
  run.settings = { contextRate: context.sampleRate, sampleRate: settings.sampleRate, channelCount: settings.channelCount,
    echoCancellation: settings.echoCancellation, autoGainControl: settings.autoGainControl,
    noiseSuppression: settings.noiseSuppression, supported: Object.fromEntries(
      ['sampleRate', 'channelCount', 'echoCancellation', 'autoGainControl', 'noiseSuppression'].map(key =>
        [key, Boolean(navigator.mediaDevices.getSupportedConstraints()[key])])) };
  el('mic').textContent = [
    `Audio context ${context.sampleRate} Hz`,
    ...['echoCancellation', 'autoGainControl', 'noiseSuppression'].map(key =>
      `${key} ${settings[key] === undefined ? 'unreported' : settings[key] ? 'on' : 'off'}`),
  ].join(' · ');
  status('Listening…');
}

function play(run, pcm, finished) {
  const { context } = run;
  const buffer = context.createBuffer(1, pcm.length, modemRate);
  buffer.copyToChannel(pcm, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(run.gain);
  source.onended = () => {
    source.disconnect();
    if (active === run) finished();
  };
  source.start();
}

function sendNext(run) {
  if (active !== run) return;
  try {
    const isLoop = run.mode === 'loop';
    const colour = el('size').value === 'colour';
    const size = colour ? colourSize : Number(el('size').value);
    const timestamp = Date.now();
    const sequence = run.sequence++ & 65535;
    const frame = captureFrame(size, sequence, run.useCamera, colour);
    const bytes = packet({ ...frame, timestamp, sequence, session: run.session });
    const pcm = encode(profile, bytes);
    display('out', unpack(bytes));
    const duration = pcm.length / modemRate;
    const interval = Math.max(duration + guard, 1 / Number(el('fps').value));
    const next = () => sendNext(run);
    if (isLoop) {
      const start = performance.now();
      run.afterDecode = () => {
        run.timer = setTimeout(next, Math.max(0, interval * 1000 - (performance.now() - start)));
      };
      run.timer = setTimeout(() => {
        const samples = new Float32Array(Math.ceil(modemRate * interval));
        samples.set(pcm);
        decode(run, samples);
      }, duration * 1000);
    } else {
      play(run, pcm, () => {
        run.timer = setTimeout(next, 1000 * Math.max(0, interval - duration));
      });
    }
    status(`${isLoop ? 'Fallback PCM loopback' : 'Transmitting fallback'} · up to ${(1 / interval).toFixed(2)} fps for this frame`);
  } catch (error) {
    stop(run, error.message);
  }
}

function startBenchmark(run) {
  const toPCM = bytes => encode(run.phy.profile, bytes, run.phy.rung);
  const batch = Number(el('batch').value);
  const plan = makeBenchmark(run.session, Number(el('record-size').value), batch, run.phy.gap, toPCM);
  run.playout = new Playout(run.context, run.gain);
  const { makePacket, ...fields } = plan;
  run.byteSender = { ...fields, plannedSeconds: TRIAL_SECONDS, packets: [] };
  const schedule = () => {
    if (active !== run) return;
    try {
      while (run.sequence < plan.expectedPackets && run.playout.ahead < .5 * PCM_RATE) {
        const packet = makePacket(run.sequence);
        const pcm = toPCM(packet);
        if (pcm.length !== plan.packetSamples) throw new Error('Variable benchmark waveform length.');
        const startSample = run.playout.play(pcm, run.phy.gap, true);
        if (startSample === undefined) throw new Error('Playback missed a scheduled slot. Retry the trial.');
        run.byteSender.packets.push({ sequence: run.sequence++, startSample, waveformSamples: pcm.length,
          checksum: unpackStream(packet).checksum });
      }
      if (run.playout.now >= TRIAL_SECONDS * PCM_RATE) {
        run.complete = true;
        stop(run, '60-second byte trial finished. Export the results from both devices.');
        return;
      }
      status(`Byte trial · ${Math.max(0, Math.floor(run.playout.now / PCM_RATE))}/60 s · ${run.sequence}/${plan.expectedPackets} packets scheduled`);
      run.timer = setTimeout(schedule, 35);
    } catch (error) { stop(run, error.message); }
  };
  schedule();
}

function finishColour(run) {
  updateStats(run);
  run.complete = true;
  const result = run.view.report();
  const checksums = new Map(run.trial.source.map(frame => [frame.id, frame.checksum]));
  const exact = result.frames.filter(frame => checksums.get(frame.id) === frame.checksum).length;
  run.verification = { displayedWithMatchingEncodedCRC: exact,
    syntheticPass: !run.useCamera && exact === FRAME_COUNT && result.markerVerified === FRAME_COUNT &&
      result.colourVerified === FRAME_COUNT && result.outOfOrder === 0 };
  stop(run, `Trial ended · ${result.displayed}/${FRAME_COUNT} distinct frames drawn.`);
}

async function startColour(run) {
  let size = Number(el('colour-size').value);
  const selection = el('codec').value;
  const bitrate = Number(el('bitrate-target').value);
  const canvas = el('out');
  let codec;
  for (const candidateSize of selection === 'auto' && size === 1 ? [1, 0] : [size]) {
    [canvas.width, canvas.height] = sizes[candidateSize];
    drawTestFrame(canvas, 0);
    for (const candidate of selection === 'auto' ? CODECS : [selection]) {
      if (await probeVideo(candidate, candidateSize, bitrate, canvas)) { codec = candidate; break; }
      if (active !== run) return;
    }
    if (codec) { size = candidateSize; break; }
  }
  if (!codec) {
    stop(run, 'This codec configuration failed its encode/decode check. Try the other codec, 32 × 24 or the bitmap fallback.');
    return;
  }
  if (active !== run) return;
  run.view = new VideoView(el('in'), { marker: !run.useCamera });
  run.statsTimer = setInterval(() => updateStats(run), 250);
  status(`Digital colour trial · ${sizes[size].join(' × ')} · ${codec === 'vp8' ? 'VP8' : 'H.264'} · 60 seconds`);
  // Start outside the constructor so a synchronous capture error can clean it up.
  run.trial = new VideoTrial({ codec, size, bitrate, session: run.session, canvas, camera: run.useCamera ? camera : null,
    view: run.view, alive: () => active === run, complete: () => finishColour(run),
    error: error => stop(run, error.message) });
  run.trial.capture(0);
}

async function start(mode) {
  if (active || !ready) return;
  const run = active = {
    mode, session: crypto.getRandomValues(new Uint32Array(1))[0], sequence: 0,
    recent: [], failures: 0, modemErrors: {}, rejected: 0, droppedCapture: 0, started: performance.now(),
    phy: mode === 'colour' ? undefined : ['send', 'loop', 'legacy-receive'].includes(mode) ?
      PROFILES.balanced : PROFILES[el('phy').value],
    direction: ['bench', 'receive'].includes(mode) ? el('direction').value : undefined,
    distanceCm: ['bench', 'receive'].includes(mode) ? el('distance').valueAsNumber : undefined,
    useCamera: ['send', 'loop', 'colour'].includes(mode) && el('source').value === 'camera',
  };
  buttons();
  el('mic').textContent = 'Microphone idle.';
  el('benchmark').hidden = true;
  el('progress').textContent = '';
  for (const key of ['bitrate', 'rate', 'loss', 'latency']) el(key).textContent = '—';
  for (const id of ['out', 'in']) {
    const canvas = el(id);
    canvas.getContext('2d', { willReadFrequently: id === 'in' }).clearRect(0, 0, canvas.width, canvas.height);
  }
  status('Starting…');
  try {
    if (run.distanceCm !== undefined && !(run.distanceCm > 0)) throw new Error('Enter the measured separation in centimetres.');
    if (mode !== 'loop' && mode !== 'colour') {
      try { run.context = new AudioContext({ sampleRate: PCM_RATE }); }
      catch { run.context = new AudioContext(); }
      await run.context.resume();
      if (active !== run) return;
    }
    if (['receive', 'legacy-receive'].includes(mode)) {
      await listen(run);
      return;
    }
    if (run.useCamera) {
      const stream = await getStream(run, {
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      });
      if (!stream || active !== run) return;
      camera.srcObject = stream;
      await camera.play();
      if (active !== run) return;
    }
    if (mode === 'loop') {
      await startDecoder(run, modemRate);
      if (active !== run) return;
    } else if (run.context) {
      run.gain = run.context.createGain();
      run.gain.gain.value = Number(el('gain').value);
      run.startGain = run.gain.gain.value;
      run.gain.connect(run.context.destination);
    }
    if (mode === 'bench') startBenchmark(run);
    else if (mode === 'colour') await startColour(run);
    else sendNext(run);
  } catch (error) {
    stop(run, error.message);
  }
}

for (const mode of modes) el(mode).addEventListener('click', () => start(mode));
el('stop').addEventListener('click', () => stop(active));
el('export').addEventListener('click', () => saveReport(active));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && active && ['bench', 'colour', 'receive'].includes(active.mode)) {
    active.interrupted = true;
    stop(active, 'Trial interrupted when the tab lost visibility.');
  }
});
el('gain').addEventListener('input', () => {
  if (active?.gain) active.gain.gain.setTargetAtTime(Number(el('gain').value), active.context.currentTime, .015);
});

async function probeCodecs() {
  const outcomes = await Promise.all([1, 0].map(async size => {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = sizes[size];
    drawTestFrame(canvas, 0);
    const enabled = await Promise.all(CODECS.map(async codec => await probeVideo(codec, size, 24000, canvas) ? codec : ''));
    return `${canvas.width} × ${canvas.height} ${enabled.filter(Boolean).join(', ') || 'no working WebCodecs configuration'}`;
  }));
  el('codecs').textContent = `Encode/decode self-test · ${outcomes.join(' · ')}`;
}

async function prepareOffline() {
  if (!navigator.serviceWorker) return;
  const reg = await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url));
  if (!reg.active || !navigator.serviceWorker.controller) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', listener);
        reject(new Error('Offline cache did not become ready.'));
      }, 5000);
      function listener() {
        clearTimeout(timeout);
        resolve();
      }
      navigator.serviceWorker.addEventListener('controllerchange', listener, { once: true });
    });
  }
  offline = Boolean(navigator.serviceWorker.controller);
  el('offline').textContent = offline ? 'Offline assets ready.' : 'Offline assets unavailable.';
}

if (!secure) {
  const cameraOption = el('source').querySelector('[value="camera"]');
  cameraOption.disabled = true;
  el('source').value = 'synthetic';
  el('connection').hidden = false;
}
probeCodecs();
prepareOffline().catch(() => { el('offline').textContent = 'Offline assets unavailable.'; });
init().then(() => {
  modemRate = sample_rate();
  ready = true;
  buttons();
  status('Ready.');
}).catch(error => status(`Modem could not load: ${error.message}`));
