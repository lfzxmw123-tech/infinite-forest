import { random } from "../forest/world";
export type State = "Idle" | "Walk" | "Eat" | "Alert" | "Run";
export class AnimalAI {
  state: State = "Idle";
  timer: number;
  heading: number;
  rng: () => number;
  constructor(seed: number) {
    this.rng = random(seed);
    this.timer = 1 + this.rng() * 5;
    this.heading = this.rng() * Math.PI * 2;
  }
  update(dt: number, distance: number, fear: number) {
    this.timer -= dt;
    if (distance < fear && this.state !== "Alert" && this.state !== "Run") {
      this.state = "Alert";
      this.timer = 0.35 + this.rng() * 0.6;
    }
    if (this.timer > 0) return;
    if (
      this.state === "Alert" ||
      (this.state === "Run" && distance < fear * 1.8)
    ) {
      this.state = "Run";
      this.timer = 2 + this.rng() * 2;
      return;
    }
    const r = this.rng();
    this.state = r < 0.45 ? "Walk" : r < 0.72 ? "Eat" : "Idle";
    this.timer = 3 + this.rng() * 7;
    this.heading += (this.rng() - 0.5) * 2;
  }
}
