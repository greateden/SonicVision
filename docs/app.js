import init, { encode, sample_rate } from './modem/sonance_wasm.js';
import { compress, packet, unpack, sizes, colourSize, guard, benchmarkCount, benchmarkPayload } from './protocol.js';

const el = id => document.getElementById(id);
const modes = ['send', 'receive', 'loop', 'bench'];
const camera = el('camera');
const capture = document.createElement('canvas');
const captureContext = capture.getContext('2d', { willReadFrequently: true });
const profile = 'balanced';
const secure = window.isSecureContext;
let active;
let ready = false;
let modemRate;

function status(text) { el('status').textContent = text; }

function buttons() {
  for (const mode of modes) el(mode).disabled = !ready || Boolean(active);
  if (!secure) el('receive').disabled = true;
  el('stop').disabled = !active;
  el('source').disabled = Boolean(active);
}

function stop(run, message = 'Stopped.') {
  if (active !== run) return;
  active = undefined;
  clearTimeout(run.timer);
  clearInterval(run.statsTimer);
  if (run.node) run.node.port.onmessage = null;
  run.stream?.getTracks().forEach(track => track.stop());
  camera.srcObject = null;
  run.context?.close().catch(() => {});
  run.worker?.terminate();
  run.cancelDecoder?.();
  el('mic').textContent = 'Microphone idle.';
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
  run.decoderSettings = { profile, inputRate, modemRate };
  run.statsTimer = setInterval(() => {
    updateStats(run);
    if (run.mode === 'receive') {
      status(`Listening · ${run.received || 0} packets received · ${run.failures} modem errors · ${run.gaps || 0} capture gaps`);
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
      run.failures += data.failures;
      for (const frame of data.frames) receiveFrame(run, frame);
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

function decode(run, samples, gap = false) {
  run.worker.postMessage({ samples, gap, ...run.decoderSettings }, [samples.buffer]);
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
    decode(run, data.samples, data.gap);
  };
  // The processor emits silence, keeping the mic graph running without monitor feedback.
  context.createMediaStreamSource(stream).connect(node).connect(context.destination);
  const settings = stream.getAudioTracks()[0].getSettings();
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
    const isBench = run.mode === 'bench';
    const isLoop = run.mode === 'loop';
    const colour = el('size').value === 'colour';
    const size = colour ? colourSize : Number(el('size').value);
    const timestamp = Date.now();
    const sequence = run.sequence & 65535;
    const frame = isBench ? { kind: 6, payload: benchmarkPayload } : captureFrame(size, sequence, run.useCamera, colour);
    const fields = { ...frame, timestamp, sequence, session: run.session };
    if (isBench && !run.interval) {
      const probe = encode(profile, packet(fields));
      run.interval = Math.ceil(1000 * (probe.length / modemRate + guard));
    }
    const bytes = packet({ ...fields, interval: run.interval });
    const pcm = encode(profile, bytes);
    if (!isBench) display('out', unpack(bytes));
    const duration = pcm.length / modemRate;
    const interval = isBench ? run.interval / 1000 : Math.max(duration + guard, 1 / Number(el('fps').value));
    run.sequence++;
    const next = () => {
      if (isBench && run.sequence === benchmarkCount) stop(run, 'Benchmark sent. Read the result on the listening device.');
      else sendNext(run);
    };
    if (isLoop) {
      // Start the next frame once both the simulated airtime and decode have elapsed.
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
    status(isBench ? `Benchmark packet ${run.sequence}/${benchmarkCount}`
      : `${isLoop ? 'Digital loopback' : 'Transmitting'} · up to ${(1 / interval).toFixed(2)} fps for this frame`);
  } catch (error) {
    stop(run, error.message);
  }
}

async function start(mode) {
  if (active || !ready) return;
  const run = active = {
    mode, session: crypto.getRandomValues(new Uint32Array(1))[0], sequence: 0,
    recent: [], failures: 0, started: performance.now(),
    useCamera: mode !== 'bench' && el('source').value === 'camera',
  };
  buttons();
  el('benchmark').hidden = true;
  for (const key of ['bitrate', 'rate', 'loss', 'latency']) el(key).textContent = '—';
  for (const id of ['out', 'in']) el(id).getContext('2d').clearRect(0, 0, el(id).width, el(id).height);
  status('Starting…');
  try {
    if (mode !== 'loop') {
      run.context = new AudioContext();
      await run.context.resume();
      if (active !== run) return;
    }
    if (mode === 'receive') {
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
    } else {
      run.gain = run.context.createGain();
      run.gain.gain.value = Number(el('gain').value);
      run.gain.connect(run.context.destination);
    }
    sendNext(run);
  } catch (error) {
    stop(run, error.message);
  }
}

for (const mode of modes) el(mode).addEventListener('click', () => start(mode));
el('stop').addEventListener('click', () => stop(active));
el('gain').addEventListener('input', () => {
  if (active?.gain) active.gain.gain.setTargetAtTime(Number(el('gain').value), active.context.currentTime, .015);
});

async function probeCodecs() {
  if (!globalThis.VideoEncoder || !globalThis.VideoDecoder) return 'WebCodecs video unavailable.';
  const codecs = await Promise.all(['vp8', 'avc1.42001f'].map(async codec => {
    try {
      const config = { codec, width: 128, height: 96, bitrate: 4000, framerate: 5 };
      const [tx, rx] = await Promise.all([
        VideoEncoder.isConfigSupported(config),
        VideoDecoder.isConfigSupported({ codec, codedWidth: 128, codedHeight: 96 }),
      ]);
      return tx.supported && rx.supported ? codec : '';
    } catch { return ''; }
  }));
  return `WebCodecs encode/decode probe: ${codecs.filter(Boolean).join(', ') || 'no matching configuration'}. SonicVision currently uses its own frame codec.`;
}

if (!secure) {
  const cameraOption = el('source').querySelector('[value="camera"]');
  cameraOption.disabled = true;
  el('source').value = 'synthetic';
  el('connection').hidden = false;
}
probeCodecs().then(result => { el('codecs').textContent = result; });
init().then(() => {
  modemRate = sample_rate();
  ready = true;
  buttons();
  status('Ready.');
}).catch(error => status(`Modem could not load: ${error.message}`));
