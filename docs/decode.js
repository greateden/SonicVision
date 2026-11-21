import init, { WasmDecoder } from './modem/sonance_wasm.js';
import { Resampler, unpack } from './protocol.js';
import { isStream, unpackStream } from './stream.js';

let decoder;
let resampler;
let settings;
let inputOrigin;
const modem = init();

function reset() {
  decoder?.free();
  decoder = new WasmDecoder(settings.profile, settings.rung);
  resampler = new Resampler(settings.inputRate, settings.modemRate);
  inputOrigin = undefined;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'start') {
      await modem;
      settings = data;
      reset();
      self.postMessage({ ready: true });
      return;
    }
    if (data.gap) reset();
    if (inputOrigin === undefined && data.captureSample !== undefined) {
      inputOrigin = data.captureSample - data.samples.length;
    }
    const frames = [];
    const packets = [];
    let rejected = 0;
    const samples = resampler.push(data.samples);
    for (let offset = 0; offset < samples.length; offset += 2048) {
      decoder.push(samples.subarray(offset, offset + 2048));
      let bytes;
      while ((bytes = decoder.take_message())) {
        const stream = isStream(bytes);
        const frame = stream ? unpackStream(bytes) : unpack(bytes);
        if (!frame) rejected++;
        else if (stream) {
          const modemEndSample = decoder.message_end_sample();
          packets.push({ ...frame, modemEndSample, captureEndSample: inputOrigin === undefined ? undefined :
            inputOrigin + modemEndSample * settings.inputRate / settings.modemRate });
        }
        else frames.push(frame);
      }
    }
    const failures = {};
    let failure;
    while ((failure = decoder.take_failure())) failures[failure] = (failures[failure] || 0) + 1;
    self.postMessage({ frames, packets, rejected, failures, captureSample: data.captureSample });
  } catch (error) {
    self.postMessage({ error: error.message ?? String(error) });
  }
};
