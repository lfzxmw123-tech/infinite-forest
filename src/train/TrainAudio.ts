export class TrainAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private engine: GainNode | null = null;
  private whistleUntil = 0;
  enabled = true;
  start() {
    if (!this.enabled) return;
    if (!this.context) {
      const c = (this.context = new AudioContext());
      this.gain = c.createGain();
      this.gain.gain.value = 0.5;
      this.gain.connect(c.destination);
      this.engine = c.createGain();
      this.engine.gain.value = 0;
      this.engine.connect(this.gain);
      const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++)
        data[i] = (Math.random() - 0.5) * 0.5;
      const source = c.createBufferSource(),
        filter = c.createBiquadFilter();
      source.buffer = buffer;
      source.loop = true;
      filter.type = "lowpass";
      filter.frequency.value = 350;
      source.connect(filter);
      filter.connect(this.engine);
      source.start();
    }
    void this.context.resume().catch(() => {});
  }
  update(speed: number, distance: number, active: boolean) {
    if (!this.context || !this.gain || !this.engine) return;
    this.gain.gain.setTargetAtTime(
      this.enabled ? 0.5 : 0,
      this.context.currentTime,
      0.12,
    );
    const pulse = 0.25 + 0.75 * Math.max(0, Math.sin(distance * 5));
    this.engine.gain.setTargetAtTime(
      active ? (0.015 + speed * 0.006) * pulse : 0,
      this.context.currentTime,
      0.035,
    );
  }
  horn() {
    if (!this.enabled) return;
    this.start();
    const c = this.context!,
      now = c.currentTime;
    if (now < this.whistleUntil) return;
    this.whistleUntil = now + 1;
    for (const frequency of [220, 330, 440]) {
      const osc = c.createOscillator(),
        envelope = c.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(0.055, now + 0.12);
      envelope.gain.setTargetAtTime(0.0001, now + 0.65, 0.16);
      osc.connect(envelope);
      envelope.connect(this.gain!);
      osc.start(now);
      osc.stop(now + 1.5);
    }
  }
  dispose() {
    void this.context?.close();
    this.context = null;
  }
}
