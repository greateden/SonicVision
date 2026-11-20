import { PCM_RATE } from './stream.js';

// Web Audio schedules every block on the same integer 48 kHz timeline.
// A different device context rate is handled by AudioBufferSourceNode.
export class Playout {
  cursor = 0;
  sources = new Set();
  underruns = 0;
  missedSamples = 0;
  peakAheadSamples = 0;
  waveformSamples = 0;
  guardSamples = 0;

  constructor(context, destination) {
    this.context = context;
    this.destination = destination;
    this.origin = context.currentTime + .15;
  }

  get now() { return Math.floor((this.context.currentTime - this.origin) * PCM_RATE); }
  get ahead() { return Math.max(0, this.cursor - this.now); }

  play(pcm, gap, fixed = false) {
    if (this.sources.size >= 8) return;
    const earliest = this.now + Math.ceil(.025 * PCM_RATE);
    if (this.cursor < earliest) {
      const missing = earliest - this.cursor;
      this.underruns++;
      this.missedSamples += missing;
      if (fixed) return;
      this.cursor = earliest;
    }
    const start = this.cursor;
    const buffer = this.context.createBuffer(1, pcm.length, PCM_RATE);
    buffer.copyToChannel(pcm, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
    };
    source.start(this.origin + start / PCM_RATE);
    this.cursor += pcm.length + gap;
    this.waveformSamples += pcm.length;
    this.guardSamples += gap;
    this.peakAheadSamples = Math.max(this.peakAheadSamples, this.ahead);
    return start;
  }

  close() {
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
  }

  report() {
    return { sampleRate: PCM_RATE, contextRate: this.context.sampleRate, cursorSamples: this.cursor,
      waveformSamples: this.waveformSamples, guardSamples: this.guardSamples, underruns: this.underruns,
      missedSamples: this.missedSamples, peakAheadSamples: this.peakAheadSamples };
  }
}
