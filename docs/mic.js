class Microphone extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSize = Math.round(sampleRate * 2048 / 48000);
    this.block = new Float32Array(this.blockSize);
    this.used = 0;
    this.credits = 8;
    this.dropped = 0;
    this.nextFrame = undefined;
    this.port.onmessage = () => this.credits++;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    if (this.nextFrame !== undefined && currentFrame !== this.nextFrame) {
      this.used = 0;
      this.dropped += Math.max(1, currentFrame - this.nextFrame);
    }
    this.nextFrame = currentFrame + input.length;
    for (let i = 0; i < input.length; i++) {
      this.block[this.used++] = input[i];
      if (this.used !== this.block.length) continue;
      this.used = 0;
      if (this.credits === 0) {
        this.dropped += this.block.length;
        continue;
      }
      this.credits--;
      this.port.postMessage({ samples: this.block, gap: this.dropped > 0, dropped: this.dropped,
        captureSample: currentFrame + i + 1 }, [this.block.buffer]);
      this.block = new Float32Array(this.blockSize);
      this.dropped = 0;
    }
    return true;
  }
}
registerProcessor('sonic-microphone', Microphone);
