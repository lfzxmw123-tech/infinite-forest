import * as T from "three/webgpu";
import { attribute } from "three/tsl";
export class TrainEffects {
  readonly mesh: T.InstancedMesh;
  private ages = new Float32Array(72).fill(10);
  private velocities = new Float32Array(72 * 3);
  private positions = new Float32Array(72 * 3);
  private fades = new T.InstancedBufferAttribute(new Float32Array(72), 1);
  private temp = new T.Object3D();
  private spawn = 0;
  private cursor = 0;
  constructor(scene: T.Scene) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d")!,
      gradient = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(230,233,216,.6)");
    gradient.addColorStop(0.4, "rgba(215,224,209,.3)");
    gradient.addColorStop(1, "rgba(210,220,210,0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 64, 64);
    const geometry = new T.PlaneGeometry(1, 1);
    geometry.setAttribute("fade", this.fades);
    const material = new T.MeshBasicNodeMaterial({
      map: new T.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      color: 0xd9ded2,
      side: T.DoubleSide,
    });
    material.opacityNode = attribute("fade", "float");
    this.mesh = new T.InstancedMesh(geometry, material, 72);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(dt: number, speed: number, chimney: T.Vector3, camera: T.Camera) {
    this.spawn += dt;
    const interval = speed > 0.2 ? 0.07 : 0.23;
    if (this.spawn > interval) {
      this.spawn = 0;
      const i = this.cursor++ % 72;
      this.ages[i] = 0;
      this.positions.set([chimney.x, chimney.y, chimney.z], i * 3);
      this.velocities.set(
        [(Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.5, 0.25],
        i * 3,
      );
    }
    for (let i = 0; i < 72; i++) {
      const age = (this.ages[i] += dt);
      if (age > 5) {
        this.temp.scale.setScalar(0);
        this.fades.setX(i, 0);
      } else {
        const k = i * 3;
        this.positions[k] += this.velocities[k] * dt;
        this.positions[k + 1] += this.velocities[k + 1] * dt;
        this.positions[k + 2] += this.velocities[k + 2] * dt;
        this.temp.position.fromArray(this.positions, k);
        this.temp.quaternion.copy(camera.quaternion);
        this.temp.scale.setScalar(0.3 + age * 0.65);
        this.fades.setX(i, (1 - age / 5) * 0.6);
      }
      this.temp.updateMatrix();
      this.mesh.setMatrixAt(i, this.temp.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.fades.needsUpdate = true;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    const m = this.mesh.material as T.MeshBasicNodeMaterial;
    m.map?.dispose();
    m.dispose();
    this.mesh.geometry.dispose();
  }
}
