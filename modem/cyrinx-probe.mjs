export async function verifyCyrinx(wasm, fixture) {
  const module = await WebAssembly.compile(wasm);
  // libc's failure paths may import WASI I/O. A successful DSP run never
  // needs host capabilities and traps on any actual WASI call.
  const imports = { wasi_snapshot_preview1: {} };
  for (const item of WebAssembly.Module.imports(module)) {
    if (item.module !== 'wasi_snapshot_preview1' || item.kind !== 'function') throw new Error('Unexpected WASM import.');
    imports[item.module][item.name] = () => { throw new Error(`Unexpected syscall ${item.name}`); };
  }
  const core = (await WebAssembly.instantiate(module, imports)).exports;
  core._initialize();
  const { memory } = core;
  const viewPayload = () => new Uint8Array(memory.buffer, core.probe_payload(), 1024);
  const viewPCM = length => new Float32Array(memory.buffer, core.probe_pcm(), length);
  viewPayload().set(fixture.payload);
  const encodedSamples = core.probe_encode();
  if (encodedSamples !== fixture.wave.length) throw new Error('TX waveform length mismatch.');
  let maxWaveError = 0;
  const wave = viewPCM(encodedSamples);
  for (let i = 0; i < encodedSamples; i++) maxWaveError = Math.max(maxWaveError, Math.abs(wave[i] - fixture.wave[i]));
  if (!(maxWaveError <= fixture.tolerance)) throw new Error('TX waveform differs from upstream golden vector.');

  function timedDecode(samples) {
    const started = performance.now();
    const validBlocks = core.probe_decode(samples);
    const elapsedMs = performance.now() - started;
    if (validBlocks !== 4 || !viewPayload().every((byte, i) => byte === fixture.decoded[i])) {
      throw new Error('RX CRC block or payload mismatch.');
    }
    return elapsedMs;
  }

  viewPayload().fill(0);
  const cleanDecodeMs = timedDecode(encodedSamples);
  viewPCM(fixture.rxWave.length).set(fixture.rxWave);
  viewPayload().fill(0);
  const goldenDecodeMs = timedDecode(fixture.rxWave.length);
  if (core.probe_decode(32769) !== -1) throw new Error('Capture buffer limit was bypassed.');
  return { encodedSamples, maxWaveError, captureSamples: fixture.rxWave.length, validBlocks: 4,
    verifiedBytes: 1024, cleanDecodeMs, goldenDecodeMs, memoryBytes: memory.buffer.byteLength };
}
