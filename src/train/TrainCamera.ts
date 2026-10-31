import * as T from "three/webgpu";
import { RailwayPath } from "./RailwayPath";
export type CameraMode = "cab" | "window" | "follow";
export const cameraNames: Record<CameraMode, string> = {
  cab: "驾驶室",
  window: "车窗观光",
  follow: "第三人称",
};
export class TrainCamera {
  mode: CameraMode = "window";
  private position = new T.Vector3();
  private look = new T.Vector3();
  private tangent = new T.Vector3();
  private right = new T.Vector3();
  private up = new T.Vector3(0, 1, 0);
  private matrix = new T.Matrix4();
  private rotation = new T.Quaternion();
  private switching = 0;
  private origin = new T.Vector3();
  private fromRotation = new T.Quaternion();
  constructor(
    private camera: T.PerspectiveCamera,
    private path: RailwayPath,
  ) {}
  switch(mode?: CameraMode) {
    const modes: CameraMode[] = ["cab", "window", "follow"];
    this.mode = mode ?? modes[(modes.indexOf(this.mode) + 1) % 3];
    this.beginTransition();
  }
  get settled() {
    return this.switching >= 1;
  }
  beginTransition() {
    this.switching = 0;
    this.origin.copy(this.camera.position);
    this.fromRotation.copy(this.camera.quaternion);
  }
  update(dt: number, parameter: number) {
    const p =
      this.mode === "window" ? this.path.advance(parameter, -10) : parameter;
    this.path.sample(p, this.position);
    this.path.tangent(p, this.tangent);
    this.right.crossVectors(this.tangent, this.up).normalize();
    this.look.copy(this.position);
    if (this.mode === "cab") {
      this.position
        .addScaledVector(this.up, 3.35)
        .addScaledVector(this.tangent, -1.5);
      this.look.addScaledVector(this.tangent, 55).addScaledVector(this.up, 3.1);
    }
    if (this.mode === "window") {
      this.position
        .addScaledVector(this.right, 1.03)
        .addScaledVector(this.up, 2.95);
      this.look
        .addScaledVector(this.right, 14)
        .addScaledVector(this.tangent, 24)
        .addScaledVector(this.up, 2.8);
    }
    if (this.mode === "follow") {
      this.position
        .addScaledVector(this.right, 9)
        .addScaledVector(this.tangent, -14)
        .addScaledVector(this.up, 7);
      this.look.addScaledVector(this.up, 2);
    }
    this.matrix.lookAt(this.position, this.look, this.up);
    this.rotation.setFromRotationMatrix(this.matrix);
    this.switching = Math.min(1, this.switching + dt / 1.8);
    const t = this.switching * this.switching * (3 - 2 * this.switching);
    if (this.switching < 1) {
      this.camera.position.lerpVectors(this.origin, this.position, t);
      this.camera.quaternion.slerpQuaternions(
        this.fromRotation,
        this.rotation,
        t,
      );
    } else {
      this.camera.position.lerp(this.position, 1 - Math.exp(-dt * 7));
      this.camera.quaternion.slerp(this.rotation, 1 - Math.exp(-dt * 1.5));
    }
  }
}
