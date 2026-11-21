import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCyrinx } from './cyrinx-probe.mjs';

const revision = 'cba849ed8eafdc06362b390dd9919c54ca99ce53';
const [checkout, compiler, buildOutput] = process.argv.slice(2);
if (!checkout || !compiler) throw new Error('Usage: node modem/run-cyrinx-probe.mjs CYRINX_CHECKOUT WASI_CLANG [WASM_OUTPUT]');
assert.equal(execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
const core = join(checkout, 'Sources/CCyrinx');
const golden = join(checkout, 'Tests/Fixtures/golden');
const manifest = JSON.parse(await readFile(join(golden, 'manifest.json')));
const name = 'qam16_r34';
const { artifacts } = manifest.cases.find(item => item.name === name);
async function fixture(stage) {
  const descriptor = artifacts.find(item => item.stage === stage);
  const data = await readFile(join(golden, name, descriptor.file));
  assert.equal(createHash('sha256').update(data).digest('hex'), descriptor.sha256);
  return data;
}
function float32(bytes) {
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
const [payload, wave, rxWave, decoded] = await Promise.all(['payload', 'wave', 'rx_wave', 'decoded_payload'].map(fixture));
const temporary = await mkdtemp(join(tmpdir(), 'cyrinx-probe-'));
try {
  const wasm = buildOutput ?? join(temporary, 'probe.wasm');
  const sources = ['cyrinx_bulk.c', 'cyrinx_fft.c', 'kissfft/kiss_fft.c', 'kissfft/kiss_fftr.c'];
  const exports = ['probe_pcm', 'probe_payload', 'probe_encode', 'probe_decode'];
  execFileSync(compiler, ['-O2', '-DNDEBUG', '-mexec-model=reactor', '-Dkiss_fft_scalar=double',
    '-I', join(core, 'include'), '-I', join(core, 'kissfft'),
    fileURLToPath(new URL('./cyrinx-probe.c', import.meta.url)), ...sources.map(file => join(core, file)),
    ...exports.map(symbol => `-Wl,--export=${symbol}`), '-Wl,--max-memory=16777216', '-lm', '-o', wasm], { stdio: 'inherit' });
  const result = await verifyCyrinx(await readFile(wasm), {
    payload, wave: float32(wave), rxWave: float32(rxWave), decoded, tolerance: manifest.float_abs_tol,
  });
  console.log(JSON.stringify({ revision, name, medium: 'golden PCM fixtures', ...result }, null, 2));
} finally {
  await rm(temporary, { recursive: true });
}
