export type TrainState =
  "静止" | "启动" | "加速" | "匀速" | "减速" | "紧急制动";
export class TrainPhysics {
  speed = 0;
  throttle = 0;
  distance = 0;
  emergency = false;
  acceleration = 0;
  readonly maxSpeed = 14;
  update(dt: number) {
    dt = Math.max(0, Math.min(dt, 0.1));
    const target = this.emergency ? 0 : this.throttle * this.maxSpeed;
    const desired = this.emergency
      ? -2.8
      : Math.max(-0.9, Math.min(0.55, (target - this.speed) * 1.4));
    this.acceleration +=
      (desired - this.acceleration) *
      (1 - Math.exp(-dt * (this.emergency ? 8 : 2)));
    const old = this.speed;
    this.speed = Math.max(
      0,
      Math.min(this.maxSpeed, this.speed + this.acceleration * dt),
    );
    if (this.speed < 0.025 && target === 0) {
      this.speed = 0;
      this.acceleration = 0;
    }
    const travelled = (old + this.speed) * 0.5 * dt;
    this.distance += travelled;
    return travelled;
  }
  increase() {
    this.emergency = false;
    this.throttle = Math.min(1, this.throttle + 0.15);
  }
  decrease() {
    this.throttle = Math.max(0, this.throttle - 0.15);
  }
  brake() {
    this.throttle = 0;
    this.emergency = true;
  }
  restart() {
    this.emergency = false;
    this.throttle = 0.35;
  }
  get state(): TrainState {
    return this.emergency && this.speed > 0.01
      ? "紧急制动"
      : this.speed === 0
        ? this.throttle > 0
          ? "启动"
          : "静止"
        : this.acceleration > 0.05
          ? "加速"
          : this.acceleration < -0.05
            ? "减速"
            : "匀速";
  }
}
