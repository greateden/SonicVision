import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import init, { encode, sample_rate, WasmDecoder } from '../docs/modem/sonance_wasm.js';
import { compress, packet, unpack, sizes, colourSize, guard, Resampler, benchmarkPayload } from '../docs/protocol.js';

await init({ module_or_path: await readFile(new URL('../docs/modem/sonance_wasm_bg.wasm', import.meta.url)) });
const rate = sample_rate();
const profile = 'balanced';
const silence = () => new Float32Array(Math.round(rate * guard));

function makePacket(sequence, payload = benchmarkPayload) {
  return packet({ kind: 6, session: 1, sequence, timestamp: 1000, interval: 900, payload });
}

function receiver(t) {
  const decoder = new WasmDecoder(profile);
  t.after(() => decoder.free());
  const received = [];
  function push(pcm) {
    for (let offset = 0; offset < pcm.length; offset += 2048) {
      decoder.push(pcm.subarray(offset, offset + 2048));
      let bytes;
      while ((bytes = decoder.take_message())) received.push(bytes);
      while (decoder.take_failure()) { /* drain diagnostic queue */ }
    }
  }
  return { push, received };
}

test('packed and run-length frames preserve the thresholded image at each size', () => {
  for (const [size, [width, height]] of sizes.entries()) {
    for (const flat of [true, false]) {
      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i++) rgba.fill(flat || i % 3 === 0 ? 255 : 0, i * 4, i * 4 + 4);
      const compressed = compress(rgba, size);
      assert.equal(compressed.kind & 1, Number(flat));
      const frame = unpack(packet({ ...compressed, session: 1, sequence: 2, timestamp: 1000 }));
      for (let i = 0; i < width * height; i++) {
        assert.equal(Boolean(frame.pixels[i >> 3] & (128 >> (i & 7))), flat || i % 3 === 0);
      }
    }
  }
});

test('application CRC rejects one-bit corruption and truncated packets', () => {
  const original = makePacket(4);
  for (let i = 0; i < original.length; i++) {
    const damaged = original.slice();
    damaged[i] ^= 1;
    assert.equal(unpack(damaged), undefined);
  }
  assert.equal(unpack(original.subarray(0, -1)), undefined);
});

test('raw and run-length RGB332 preserve quantised colour through PCM', t => {
  const { push, received } = receiver(t);
  const [width, height] = sizes[colourSize];
  const colours = [[255, 0, 0, 224], [0, 255, 0, 28], [0, 0, 255, 3], [160, 96, 64, 173]];
  for (const [sequence, runLength] of [1, 64].entries()) {
    const rgba = new Uint8Array(width * height * 4);
    const expected = new Uint8Array(width * height);
    for (let i = 0; i < expected.length; i++) {
      const [red, green, blue, value] = colours[Math.floor(i / runLength) % colours.length];
      rgba.set([red, green, blue, 255], i * 4);
      expected[i] = value;
    }
    const frame = compress(rgba, colourSize, true);
    assert.equal(frame.kind, 7 + sequence);
    const fields = { ...frame, session: 1, sequence, timestamp: 1000 };
    assert.equal(unpack(packet({ ...fields, payload: frame.payload.subarray(0, -1) })), undefined);
    const bytes = packet(fields);
    const pcm = encode(profile, bytes);
    push(pcm);
    push(silence());
    assert.equal(received.length, sequence + 1);
    assert.deepEqual(received[sequence], bytes);
    const decoded = unpack(received[sequence]);
    assert.equal(decoded.colour, true);
    assert.deepEqual([decoded.width, decoded.height], [width, height]);
    assert.deepEqual(decoded.pixels, expected);
    t.diagnostic(`RGB332 ${frame.payload.length} bytes: ${(1 / (pcm.length / rate + guard)).toFixed(2)} fps airtime ceiling`);
  }
});

test('PCM goodput and byte accuracy at each worst-case frame size', t => {
  const { push, received } = receiver(t);
  for (const [kind, [width, height]] of sizes.entries()) {
    const payload = Uint8Array.from({ length: width * height / 8 }, (_, i) => (i * 137) & 255);
    const bytes = packet({ kind: kind * 2, session: 1, sequence: kind, timestamp: 1000, payload });
    const pcm = encode(profile, bytes);
    push(pcm);
    push(silence());
    assert.deepEqual(received.at(-1), bytes);
    const interval = pcm.length / rate + guard;
    t.diagnostic(`${width}x${height}: ${(pcm.length / rate).toFixed(3)} s PCM, ${(1 / interval).toFixed(2)} fps ceiling, ${Math.round(8 * payload.length / interval)} payload bit/s`);
  }
});

test('seeded Gaussian noise and arbitrary starting offset', t => {
  const { push, received } = receiver(t);
  const bytes = makePacket(0);
  const pcm = encode(profile, bytes);
  const rms = Math.sqrt(pcm.reduce((sum, x) => sum + x * x, 0) / pcm.length);
  const sigma = rms * 10 ** (-20 / 20);
  let seed = 45;
  function uniform() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 1) / 4294967297;
  }
  push(new Float32Array(7611));
  push(pcm.map(x => .15 * (x + sigma * Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform()))));
  push(silence());
  assert.deepEqual(received, [bytes]);
});

test('partial waveform, full packet loss and reacquisition without a decoder reset', t => {
  const { push, received } = receiver(t);
  const good = makePacket(0);
  push(encode(profile, good));
  push(silence());
  const partial = encode(profile, makePacket(1));
  push(partial.slice(0, partial.length / 3));
  push(new Float32Array(rate * 2));
  const recovered = makePacket(3);
  push(encode(profile, recovered));
  push(silence());
  assert.deepEqual(received, [good, recovered]);
});

test('sustained 100-packet stream survives 44.1 kHz capture and chunks', t => {
  const { push, received } = receiver(t);
  const down = new Resampler(rate, 44100);
  const up = new Resampler(44100, rate);
  function channel(pcm) {
    const samples = down.push(pcm);
    for (let i = 0; i < samples.length; i += 1021) push(up.push(samples.subarray(i, i + 1021)));
  }
  for (let i = 0; i < 100; i++) {
    channel(encode(profile, makePacket(i)));
    channel(silence());
  }
  assert.deepEqual(received, Array.from({ length: 100 }, (_, i) => makePacket(i)));
});
