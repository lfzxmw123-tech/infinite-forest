import { TrainPhysics } from "./TrainPhysics";
export class TrainController {
  active = false;
  private keys = new Set<string>();
  constructor(
    private physics: TrainPhysics,
    private actions: {
      horn: () => void;
      exit: () => void;
      enter: () => void;
      camera: () => void;
      restart: () => void;
    },
  ) {
    document.addEventListener("keydown", this.keyDown, { capture: true });
    document.addEventListener("keyup", this.keyUp, { capture: true });
    window.addEventListener("blur", this.blur);
  }
  private keyDown = (e: KeyboardEvent) => {
    if (
      e.target instanceof Element &&
      e.target.closest("input,select,textarea")
    )
      return;
    if (!this.active) {
      if (e.code === "KeyE" && !e.repeat) this.actions.enter();
      return;
    }
    if (
      ![
        "KeyW",
        "KeyS",
        "Space",
        "KeyH",
        "KeyE",
        "KeyR",
        "KeyV",
        "Escape",
      ].includes(e.code)
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "Escape") this.physics.brake();
    if (e.code === "KeyW") this.physics.emergency = false;
    if (e.code === "KeyH") this.actions.horn();
    if (e.code === "KeyE") this.actions.exit();
    if (e.code === "KeyR") this.actions.restart();
    if (e.code === "KeyV") this.actions.camera();
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (this.active && ["KeyW", "KeyS", "Space"].includes(e.code)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  private blur = () => {
    this.keys.clear();
  };
  update(dt: number) {
    if (!this.active) return;
    if (this.keys.has("KeyW"))
      this.physics.throttle = Math.min(1, this.physics.throttle + dt * 0.25);
    if (this.keys.has("KeyS"))
      this.physics.throttle = Math.max(0, this.physics.throttle - dt * 0.45);
  }
  reset() {
    this.keys.clear();
  }
  dispose() {
    document.removeEventListener("keydown", this.keyDown, { capture: true });
    document.removeEventListener("keyup", this.keyUp, { capture: true });
    window.removeEventListener("blur", this.blur);
  }
}
