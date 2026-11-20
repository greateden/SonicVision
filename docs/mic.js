class Microphone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSize = Math.round(sampleRate * 2048 / 48000);
    this.block = new Float32Array(this.blockSize);
    this.used = 0;
    this.credits = 8;
    this.dropped = false;
    this.port.onmessage = () => this.credits++;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      this.block[this.used++] = sample;
      if (this.used !== this.block.length) continue;
      this.used = 0;
      if (this.credits === 0) {
        this.dropped = true;
        continue;
      }
      this.credits--;
      this.port.postMessage({ samples: this.block, gap: this.dropped }, [this.block.buffer]);
      this.block = new Float32Array(this.blockSize);
      this.dropped = false;
    }
    return true;
  }
}
registerProcessor('sonic-microphone', Microphone);
