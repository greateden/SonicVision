import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { distribution, TRIAL_SECONDS } from '../docs/stream.js';

export function compareTrial(tx, rx) {
  const plan = tx.byteTx;
  if (tx.schema !== 1 || rx.schema !== 1 || tx.mode !== 'bench' || rx.mode !== 'receive' ||
      !tx.complete || tx.interrupted || rx.interrupted || !(rx.captureSeconds >= TRIAL_SECONDS) ||
      !rx.microphone || !plan || plan.plannedSeconds !== TRIAL_SECONDS ||
      !tx.audio || tx.audio.underruns || !plan.expectedPackets || plan.packets.length !== plan.expectedPackets) {
    throw new Error('Use a completed sender export and a receiver capture covering the entire trial.');
  }
  if (tx.direction !== rx.direction || tx.distanceCm !== rx.distanceCm ||
      tx.phy.profile !== rx.phy.profile || tx.phy.rung !== rx.phy.rung || tx.phy.gap !== rx.phy.gap) {
    throw new Error('The two exports describe different trial settings.');
  }
  const capture = rx.byteRx;
  if (capture && (tx.session !== capture.session || plan.size !== capture.size || plan.batch !== capture.batch ||
      plan.expectedPackets !== capture.expectedPackets || plan.slotSamples !== capture.slotSamples)) {
    throw new Error('The receiver decoded a different benchmark session or plan.');
  }
  const packets = new Map((capture?.packets ?? []).map(packet => [packet.sequence, packet]));
  const missing = [];
  const releaseMs = [];
  const sampleRate = tx.audio.sampleRate;
  let received = 0;
  let wireBytes = 0;
  for (const sent of plan.packets) {
    const packet = packets.get(sent.sequence);
    if (!packet || packet.checksum !== sent.checksum) {
      missing.push(sent.sequence);
      continue;
    }
    received++;
    wireBytes += packet.wireBytes;
    if (Number.isFinite(packet.decoderReleaseMs) && packet.decoderReleaseMs >= 0) releaseMs.push(packet.decoderReleaseMs);
  }
  const records = received * plan.batch;
  return { direction: tx.direction, distanceCm: tx.distanceCm, session: tx.session, matchedReceiverSession: Boolean(capture),
    phy: tx.phy, seconds: TRIAL_SECONDS, bytesPerRecord: plan.size, recordsPerPreamble: plan.batch,
    sentPackets: plan.expectedPackets, verifiedPackets: received, verifiedRecords: records,
    missingPacketIds: missing, packetLoss: missing.length / plan.expectedPackets, duplicates: capture?.duplicates ?? 0,
    usefulGoodputBps: 8 * records * plan.size / TRIAL_SECONDS, modemPayloadBps: 8 * wireBytes / TRIAL_SECONDS,
    waveformMs: 1000 * plan.packetSamples / sampleRate, guardMs: 1000 * plan.gapSamples / sampleRate,
    rxDecoderReleaseMs: distribution(releaseMs), missingReleaseMeasurements: received - releaseMs.length,
    captureGaps: rx.captureGaps, droppedCaptureSamples: rx.droppedCaptureSamples,
    rejectedPackets: rx.rejectedPackets, modemErrors: rx.modemErrors, speakerGain: tx.speakerGain, mic: rx.microphone,
    senderBrowser: tx.userAgent, receiverBrowser: rx.userAgent };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [, , sender, receiver] = process.argv;
    if (!sender || !receiver) throw new Error('Usage: node modem/compare-trial.mjs sender.json receiver.json');
    const [tx, rx] = await Promise.all([sender, receiver].map(async path => JSON.parse(await readFile(path, 'utf8'))));
    console.log(JSON.stringify(compareTrial(tx, rx), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
