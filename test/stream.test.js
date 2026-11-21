import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import init, { encode, WasmDecoder } from '../docs/modem/sonance_wasm.js';
import { crc, Resampler } from '../docs/protocol.js';
import { BenchmarkReceiver, makeBenchmark, PCM_RATE, PROFILES, unpackStream, verifyBenchmark } from '../docs/stream.js';
import { MAX_UNIT, packetize, VideoAssembler } from '../docs/video.js';
import { compareTrial } from '../modem/compare-trial.mjs';

await init({ module_or_path: await readFile(new URL('../docs/modem/sonance_wasm_bg.wasm', import.meta.url)) });

function videoFrame(id, length, key = false) {
  return { id, key, captureTenthsMs: 67 * id, data: Uint8Array.from({ length }, (_, i) => (id + i * 37) & 255) };
}

const framing = { session: 7, sequence: 0, size: 1, codec: 'vp8', marker: true, payloadLimit: 128 };

test('keyframes and deltas reconstruct byte-exactly across fragment and packet boundaries', () => {
  const source = [videoFrame(0, MAX_UNIT, true), videoFrame(1, 32), videoFrame(2, 300)];
  const packets = packetize(source, framing).map(unpackStream);
  assert.ok(packets.length > 3);
  const assembler = new VideoAssembler();
  assert.deepEqual(packets.flatMap(packet => assembler.push(packet)),
    source.map(frame => ({ ...frame, checksum: crc(frame.data) })));
  assert.equal(assembler.rejected, 0);
  assert.equal(assembler.missingPackets, 0);
});

test('CRC rejection, missing fragment and duplicate preserve the next complete keyframe', () => {
  const lost = videoFrame(0, 315, true);
  const key = videoFrame(1, 163, true);
  const encoded = packetize([lost, key], framing);
  encoded[1][20] ^= 1;
  assert.equal(unpackStream(encoded[1]), undefined);
  const assembler = new VideoAssembler();
  const output = [encoded[0], encoded[0], ...encoded.slice(2)].flatMap(bytes => assembler.push(unpackStream(bytes)));
  assert.deepEqual(output, [{ ...key, checksum: crc(key.data) }]);
  assert.equal(assembler.missingPackets, 1);
  assert.equal(assembler.duplicates, 1);
  assert.equal(assembler.partial, null);
});

test('paired trial counts leading, trailing and total loss using the completed sender log', () => {
  const phy = PROFILES.fastwide;
  const defaults = { schema: 1, direction: 'Mac to iPhone', distanceCm: 30, phy };
  const plan = makeBenchmark(37, 256, 4, phy.gap, bytes => encode(phy.profile, bytes));
  const packets = Array.from({ length: plan.expectedPackets }, (_, sequence) => unpackStream(plan.makePacket(sequence)));
  const tx = { ...defaults, mode: 'bench', complete: true, session: 37, audio: { sampleRate: PCM_RATE, underruns: 0 },
    byteTx: { ...plan, plannedSeconds: 60, packets } };
  const info = verifyBenchmark(packets[1]);
  const receiver = new BenchmarkReceiver(37, info);
  receiver.add(packets[1], info, { arrivalMs: 500, captureEndSample: 22500, decoderReleaseMs: 10 });
  const rx = { ...defaults, mode: 'receive', microphone: { contextRate: PCM_RATE }, captureSeconds: 62 };
  const partial = compareTrial(tx, { ...rx, byteRx: receiver.report() });
  assert.equal(partial.verifiedPackets, 1);
  assert.equal(partial.verifiedRecords, 4);
  assert.equal(partial.rxDecoderReleaseMs.p95, 10);
  assert.deepEqual(partial.missingPacketIds, packets.map(({ sequence }) => sequence).filter(n => n !== 1));
  assert.equal(compareTrial(tx, rx).packetLoss, 1);
  assert.throws(() => compareTrial(tx, { ...rx, captureSeconds: 30 }), /entire trial/);
  assert.throws(() => compareTrial(tx, { ...rx, distanceCm: 100 }), /different trial settings/);
});

function pcmReceiver(t, phy, onPacket, resample = false) {
  const decoder = new WasmDecoder(phy.profile, phy.rung);
  t.after(() => decoder.free());
  const down = new Resampler(PCM_RATE, 44100);
  const up = new Resampler(44100, PCM_RATE);
  let supplied = 0;
  return pcm => {
    const wave = resample ? up.push(down.push(pcm)) : pcm;
    for (let offset = 0; offset < wave.length; offset += 2047) {
      const chunk = wave.subarray(offset, offset + 2047);
      decoder.push(chunk);
      supplied += chunk.length;
      let data;
      while ((data = decoder.take_message())) {
        const end = decoder.message_end_sample();
        assert.ok(end > 0 && end <= supplied);
        const packet = unpackStream(data);
        assert.ok(packet);
        const info = verifyBenchmark(packet);
        assert.ok(info);
        onPacket(packet, info, end, supplied);
      }
      while (decoder.take_failure()) { /* Drain modem diagnostics. */ }
    }
  };
}

for (const key of ['fast', 'fastwide', 'auto-16', 'auto-64', 'auto-256']) {
  test(`sample-clock reacquisition after a missing and a truncated shared-preamble packet (${key})`, t => {
    const phy = PROFILES[key];
    const toPCM = bytes => encode(phy.profile, bytes, phy.rung);
    const plan = makeBenchmark(42, 128, 4, phy.gap, toPCM);
    let cursor = 1373;
    const ends = new Map();
    const received = [];
    const push = pcmReceiver(t, phy, (packet, info, end) => {
      received.push(packet.sequence);
      assert.equal(info.ids.length, 4);
      assert.equal(end, ends.get(packet.sequence));
    });
    push(new Float32Array(cursor));
    for (let seq = 0; seq < 8; seq++) {
      const pcm = toPCM(plan.makePacket(seq));
      const wave = seq === 2 ? pcm.subarray(0, pcm.length >> 1) : seq === 5 ? new Float32Array(pcm.length) : pcm;
      if (seq !== 2 && seq !== 5) ends.set(seq, cursor + pcm.length);
      push(wave);
      push(new Float32Array(phy.gap));
      cursor += wave.length + phy.gap;
    }
    push(new Float32Array(8192));
    assert.deepEqual(received, [0, 1, 3, 4, 6, 7]);
  });
}

for (const [key, batch, resample] of [
  ['balanced', 1, false], ['fastwide', 4, true], ['auto-64', 8, true], ['auto-256', 1, false], ['auto-256', 8, false],
]) {
  test(`60 scheduled seconds of benchmark PCM (${key}, batch ${batch}, ${resample ? '44.1 kHz capture' : '48 kHz capture'})`, t => {
    const phy = PROFILES[key];
    const toPCM = bytes => encode(phy.profile, bytes, phy.rung);
    const plan = makeBenchmark(37, 256, batch, phy.gap, toPCM);
    let receiver;
    const push = pcmReceiver(t, phy, (packet, info, end, supplied) => {
      receiver ??= new BenchmarkReceiver(packet.session, info);
      assert.ok(receiver.add(packet, info, { arrivalMs: supplied / 48, captureEndSample: end,
        decoderReleaseMs: (supplied - end) / 48 }));
      assert.ok(Math.abs(end - (packet.sequence * plan.slotSamples + plan.packetSamples)) <= (resample ? 3 : 0));
    }, resample);
    const waveform = new Float32Array(plan.slotSamples);
    for (let i = 0; i < plan.expectedPackets; i++) {
      const pcm = toPCM(plan.makePacket(i));
      assert.equal(pcm.length, plan.packetSamples);
      waveform.set(pcm);
      push(waveform);
    }
    push(new Float32Array(60 * PCM_RATE - plan.expectedPackets * plan.slotSamples));
    const result = receiver?.report();
    assert.equal(result?.packets.length, plan.expectedPackets);
    assert.deepEqual(result.missingPackets, []);
    t.diagnostic(`${result.records} records; ${result.usefulBps.toFixed(1)} useful bit/s; ${(plan.packetSamples / 48).toFixed(1)} ms on air per packet`);
  });
}
