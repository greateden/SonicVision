import init, { WasmDecoder } from './modem/sonance_wasm.js';
import { Resampler, unpack } from './protocol.js';

let decoder;
let resampler;
const modem = init();

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'start') {
      await modem;
      decoder = new WasmDecoder(data.profile);
      resampler = new Resampler(data.inputRate, data.modemRate);
      self.postMessage({ ready: true });
      return;
    }
    if (data.gap) {
      decoder.free();
      decoder = new WasmDecoder(data.profile);
      resampler = new Resampler(data.inputRate, data.modemRate);
    }
    const frames = [];
    const samples = resampler.push(data.samples);
    for (let offset = 0; offset < samples.length; offset += 2048) {
      decoder.push(samples.subarray(offset, offset + 2048));
      let bytes;
      while ((bytes = decoder.take_message())) {
        const frame = unpack(bytes);
        if (frame) frames.push(frame);
      }
    }
    let failures = 0;
    while (decoder.take_failure()) failures++;
    self.postMessage({ frames, failures });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
