/** Sustained frame-time feedback; ignore background tabs and avoid rapid oscillation. */
export class AdaptiveQuality {
  level = 0;
  private seconds = 0;
  private frames = 0;
  private goodWindows = 0;
  constructor(private baseline = 0) {
    this.level = baseline;
  }
  reset() {
    this.level = this.baseline;
    this.clear();
  }
  clear() {
    this.seconds = 0;
    this.frames = 0;
    this.goodWindows = 0;
  }
  sample(dt: number, visible = true): boolean {
    if (!visible) {
      this.clear();
      return false;
    }
    if (!Number.isFinite(dt) || dt <= 0) return false;
    this.seconds += Math.min(dt, 1);
    this.frames++;
    if (this.seconds < 4) return false;
    const average = this.seconds / this.frames;
    this.seconds = 0;
    this.frames = 0;
    if (average > 1 / 32 && this.level < 2) {
      this.level++;
      this.goodWindows = 0;
      return true;
    }
    this.goodWindows = average < 1 / 55 ? this.goodWindows + 1 : 0;
    if (this.goodWindows >= 6 && this.level > this.baseline) {
      this.level--;
      this.goodWindows = 0;
      return true;
    }
    return false;
  }
}
