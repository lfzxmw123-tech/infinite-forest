import * as T from "three/webgpu";
import { heightAt, streamX } from "../forest/world";
import { ForestGenerator } from "../forest/ForestGenerator";
import { AutoNavigator } from "./AutoNavigator";
export class FirstPersonController {
  keys = new Set<string>();
  active = false;
  suspended = false;
  tour = false;
  tourPaused = false;
  tourSpeed = 2.2;
  private navigator: AutoNavigator;
  started = false;
  distance = 0;
  velocityY = 0;
  grounded = true;
  private yaw = 0.14;
  private pitch = -0.015;
  private velocity = new T.Vector3();
  private euler = new T.Euler(0, 0, 0, "YXZ");
  private walking = 0;
  onLockChange: (locked: boolean) => void = () => {};
  private touchStart: { x: number; y: number } | null = null;
  constructor(
    public camera: T.PerspectiveCamera,
    private element: HTMLElement,
    private forest: ForestGenerator,
  ) {
    this.navigator = new AutoNavigator(forest);
    camera.position.set(10, heightAt(10, 24) + 1.75, 24);
    this.applyLook();
    window.addEventListener("keydown", (e) => {
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      if (e.code === "Escape" && this.tour) {
        this.pauseTour();
      }
      this.keys.add(e.code);
      if (
        e.code === "Space" &&
        this.active &&
        !this.suspended &&
        this.grounded
      ) {
        this.velocityY = 5.4;
        this.grounded = false;
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.velocity.set(0, 0, 0);
      if (this.tour) this.pauseTour();
    });
    document.addEventListener("pointerlockchange", () => {
      this.active = this.tour || document.pointerLockElement === element;
      this.keys.clear();
      this.onLockChange(this.active);
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.active || this.tour) return;
      this.yaw -= e.movementX * 0.0018;
      this.pitch = T.MathUtils.clamp(
        this.pitch - e.movementY * 0.0018,
        -1.35,
        1.35,
      );
      this.applyLook();
    });
    element.addEventListener(
      "touchstart",
      (e) => {
        if (!this.active) return;
        this.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      },
      { passive: true },
    );
    element.addEventListener(
      "touchmove",
      (e) => {
        if (!this.active || !this.touchStart) return;
        const t = e.touches[0];
        this.yaw -= (t.clientX - this.touchStart.x) * 0.004;
        this.pitch = T.MathUtils.clamp(
          this.pitch - (t.clientY - this.touchStart.y) * 0.004,
          -1.35,
          1.35,
        );
        this.touchStart = { x: t.clientX, y: t.clientY };
        this.applyLook();
      },
      { passive: true },
    );
    element.addEventListener("touchend", () => (this.touchStart = null));
  }
  async enter() {
    this.tour = false;
    this.tourPaused = false;
    this.started = true;
    if (matchMedia("(pointer:coarse)").matches) {
      this.active = true;
      this.onLockChange(true);
      return;
    }
    try {
      await this.element.requestPointerLock();
    } catch {
      this.active = false;
      this.onLockChange(false);
    }
  }
  pauseTour() {
    this.tour = false;
    this.tourPaused = true;
    this.active = false;
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.onLockChange(false);
  }
  startTour() {
    this.tourPaused = false;
    this.navigator.reset();
    this.keys.clear();
    this.started = true;
    this.tour = true;
    this.active = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onLockChange(true);
  }
  restorePose(position: T.Vector3, quaternion: T.Quaternion) {
    this.camera.position.copy(position);
    this.euler.setFromQuaternion(quaternion, "YXZ");
    this.yaw = this.euler.y;
    this.pitch = this.euler.x;
    this.velocity.set(0, 0, 0);
    this.velocityY = 0;
    this.grounded = true;
    this.keys.clear();
    this.applyLook();
  }
  applyLook() {
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }
  update(dt: number, time: number) {
    if (!this.active || this.suspended) {
      return;
    }
    const pos = this.camera.position;
    let forward =
      Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) -
      Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    let right =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    let movementYaw = this.yaw;
    if (this.tour) {
      forward = 1;
      right = 0;
      const heading = this.navigator.heading(pos.x, pos.z, dt);
      const targetYaw = heading ?? this.yaw;
      forward = heading === null ? 0 : 1;
      movementYaw = targetYaw;
      // Follow the road's forward direction, never the sideways offset used to avoid a rock.
      const gazeYaw = Math.atan2(streamX(pos.z) - streamX(pos.z - 24), 24);
      const angle = Math.atan2(
        Math.sin(gazeYaw - this.yaw),
        Math.cos(gazeYaw - this.yaw),
      );
      const deadZone = Math.PI / 30;
      const correction =
        Math.sign(angle) * Math.max(0, Math.abs(angle) - deadZone);
      this.yaw += T.MathUtils.clamp(
        correction * (1 - Math.exp(-dt * 0.35)),
        -dt * 0.05,
        dt * 0.05,
      );
      this.pitch = T.MathUtils.damp(this.pitch, -0.015, 0.6, dt);
      this.applyLook();
    }
    const len = Math.hypot(forward, right) || 1,
      speed = this.tour
        ? this.tourSpeed
        : this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")
          ? 8
          : 3.3;
    const vx =
        ((right * Math.cos(movementYaw) - forward * Math.sin(movementYaw)) /
          len) *
        speed,
      vz =
        ((-right * Math.sin(movementYaw) - forward * Math.cos(movementYaw)) /
          len) *
        speed;
    this.velocity.x = T.MathUtils.damp(this.velocity.x, vx, 8, dt);
    this.velocity.z = T.MathUtils.damp(this.velocity.z, vz, 8, dt);
    const oldX = pos.x,
      oldZ = pos.z;
    const nx = pos.x + this.velocity.x * dt,
      nz = pos.z + this.velocity.z * dt;
    if (this.tour) {
      if (!this.forest.pathBlocked(pos.x, pos.z, nx, nz, 0.4)) {
        pos.x = nx;
        pos.z = nz;
      } else {
        // Do not let acceleration smoothing cut across a planned corner.
        const directX = pos.x + vx * dt,
          directZ = pos.z + vz * dt;
        if (!this.forest.pathBlocked(pos.x, pos.z, directX, directZ, 0.4)) {
          pos.x = directX;
          pos.z = directZ;
          this.velocity.set(vx, 0, vz);
        } else {
          this.velocity.set(0, 0, 0);
          this.navigator.blocked();
        }
      }
    } else {
      if (!this.forest.pathBlocked(pos.x, pos.z, nx, pos.z)) pos.x = nx;
      if (!this.forest.pathBlocked(pos.x, pos.z, pos.x, nz)) pos.z = nz;
    }
    const moved = Math.hypot(pos.x - oldX, pos.z - oldZ);
    this.distance += moved;
    this.walking += moved * 1.8;
    const floor = Math.max(heightAt(pos.x, pos.z), -0.66) + 1.75;
    this.velocityY -= 14 * dt;
    pos.y += this.velocityY * dt;
    if (pos.y <= floor) {
      pos.y = floor;
      this.velocityY = 0;
      this.grounded = true;
    }
    if (this.grounded && !this.tour)
      pos.y += Math.sin(this.walking * 2) * Math.min(moved / dt / 4, 1) * 0.022;
  }
}
