export class AudioAmbience {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  enabled = true;
  private birds: ReturnType<typeof setInterval> | null = null;
  private initialize() {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
      const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 4,
        this.context.sampleRate,
      );
      const data = buffer.getChannelData(0);
      let b = 0;
      for (let i = 0; i < data.length; i++) {
        b = (b + Math.random() * 0.04 - 0.02) / 1.02;
        data[i] = b * 3;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 650;
      source.connect(filter);
      filter.connect(this.gain);
      source.start();
      this.birds = setInterval(() => this.chirp(), 3800);
    }
  }
  async start() {
    if (!this.enabled) return;
    this.initialize();
    this.gain!.gain.setTargetAtTime(0.25, this.context!.currentTime, 0.5);
    if (this.context!.state !== "running") await this.context!.resume();
  }
  async toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) await this.start();
    else this.gain?.gain.setTargetAtTime(0, this.context!.currentTime, 0.5);
    return this.enabled;
  }
  private chirp() {
    if (!this.enabled || !this.context || !this.gain) return;
    const now = this.context.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.context.createOscillator(),
        gain = this.context.createGain(),
        t = now + i * 0.13;
      osc.type = "sine";
      osc.frequency.setValueAtTime(2300 + Math.random() * 900, t);
      osc.frequency.exponentialRampToValueAtTime(3500, t + 0.06);
      osc.frequency.exponentialRampToValueAtTime(1900, t + 0.12);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.035, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(gain);
      gain.connect(this.gain);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  }
}
