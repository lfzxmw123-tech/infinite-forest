import * as T from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
export interface TrainUnit {
  group: T.Group;
  wheels: T.InstancedMesh;
  wheelX: number[];
  wheelZ: number[];
  radius: number;
  offset: number;
  rod?: T.InstancedMesh;
}
/** Replaceable procedural locomotive + three shared-geometry, furnished coaches. Forward is -Z. */
export class TrainModel {
  root = new T.Group();
  units: TrainUnit[] = [];
  lamp = new T.SpotLight(0xffe3a3, 65, 85, 0.3, 0.6, 1.2);
  cabLight = new T.PointLight(0xffb45b, 2, 6);
  private geometries = new Set<T.BufferGeometry>();
  private materials = new Set<T.Material>();
  private temp = new T.Object3D();
  private metal = new T.MeshStandardNodeMaterial({
    color: 0x1c2828,
    metalness: 0.8,
    roughness: 0.34,
  });
  private green = new T.MeshStandardNodeMaterial({
    color: 0x19392f,
    metalness: 0.35,
    roughness: 0.42,
  });
  private brass = new T.MeshStandardNodeMaterial({
    color: 0xb69a5d,
    metalness: 0.85,
    roughness: 0.28,
  });
  private wood = new T.MeshStandardNodeMaterial({
    color: 0x53352c,
    roughness: 0.72,
  });
  private fabric = new T.MeshStandardNodeMaterial({
    color: 0x354c42,
    roughness: 0.95,
  });
  private glass = new T.MeshStandardNodeMaterial({
    color: 0xb4d1be,
    transparent: true,
    opacity: 0.14,
    roughness: 0.12,
    metalness: 0.1,
    depthWrite: false,
  });
  private glow = new T.MeshStandardNodeMaterial({
    color: 0xffefbc,
    emissive: 0xffc45f,
    emissiveIntensity: 2,
  });
  constructor() {
    [
      this.metal,
      this.green,
      this.brass,
      this.wood,
      this.fabric,
      this.glass,
      this.glow,
    ].forEach((m) => this.materials.add(m));
    const wheel = this.wheelGeometry();
    const engine = this.buildEngine(wheel);
    this.units.push(engine);
    this.root.add(engine.group);
    const prototype = this.buildCoach(wheel, 10);
    this.units.push(prototype);
    this.root.add(prototype.group);
    for (let i = 1; i < 3; i++) {
      const group = new T.Group();
      for (const child of prototype.group.children) {
        if (child === prototype.wheels) continue;
        group.add(child.clone());
      }
      const wheels = new T.InstancedMesh(wheel, this.metal, 8);
      wheels.castShadow = true;
      group.add(wheels);
      const unit = {
        group,
        wheels,
        wheelX: [...prototype.wheelX],
        wheelZ: [...prototype.wheelZ],
        radius: 0.48,
        offset: 10 + i * 8.8,
      };
      this.units.push(unit);
      this.root.add(group);
    }
    this.lamp.position.set(0, 2.5, -5.1);
    this.lamp.target.position.set(0, 0, -45);
    engine.group.add(this.lamp, this.lamp.target);
    this.cabLight.position.set(0, 2.6, 1.6);
    engine.group.add(this.cabLight);
  }
  private wheelGeometry() {
    const parts: T.BufferGeometry[] = [];
    const rim = new T.TorusGeometry(0.57, 0.085, 7, 28);
    rim.rotateY(Math.PI / 2);
    parts.push(rim);
    const hub = new T.CylinderGeometry(0.16, 0.16, 0.25, 16);
    hub.rotateZ(Math.PI / 2);
    parts.push(hub);
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5,
        g = new T.BoxGeometry(0.11, 0.06, 0.9);
      g.rotateX(a);
      parts.push(g);
    }
    const geometry = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    this.geometries.add(geometry);
    return geometry;
  }
  private builder(group: T.Group) {
    const buckets = new Map<T.Material, T.BufferGeometry[]>();
    const add = (
      g: T.BufferGeometry,
      m: T.Material,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0,
    ) => {
      const matrix = new T.Matrix4().compose(
        new T.Vector3(x, y, z),
        new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)),
        new T.Vector3(1, 1, 1),
      );
      g.applyMatrix4(matrix);
      let list = buckets.get(m);
      if (!list) buckets.set(m, (list = []));
      list.push(g);
    };
    const box = (
      w: number,
      h: number,
      d: number,
      m: T.Material,
      x: number,
      y: number,
      z: number,
    ) => add(new T.BoxGeometry(w, h, d), m, x, y, z);
    const finish = () => {
      for (const [m, parts] of buckets) {
        const geometry = mergeGeometries(parts);
        parts.forEach((g) => g.dispose());
        this.geometries.add(geometry);
        const mesh = new T.Mesh(geometry, m);
        mesh.castShadow = m !== this.glass;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    };
    return { add, box, finish };
  }
  private buildEngine(wheel: T.BufferGeometry): TrainUnit {
    const group = new T.Group(),
      b = this.builder(group);
    b.box(2.7, 0.3, 9.2, this.metal, 0, 1.02, -0.5);
    b.add(
      new T.CylinderGeometry(1.0, 1.0, 5.3, 32),
      this.metal,
      0,
      2.25,
      -1.6,
      Math.PI / 2,
    );
    for (const z of [-3.8, -2.1, -0.4]) {
      b.add(new T.TorusGeometry(1.015, 0.035, 6, 32), this.brass, 0, 2.25, z);
    }
    b.add(
      new T.CylinderGeometry(0.96, 0.96, 0.13, 32),
      this.metal,
      0,
      2.25,
      -4.3,
      Math.PI / 2,
    );
    b.add(
      new T.CylinderGeometry(0.27, 0.4, 1.5, 20),
      this.metal,
      0,
      3.75,
      -3.2,
    );
    b.add(
      new T.CylinderGeometry(0.43, 0.32, 0.24, 20),
      this.brass,
      0,
      4.5,
      -3.2,
    );
    b.add(
      new T.SphereGeometry(0.47, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      this.brass,
      0,
      3.15,
      -0.8,
    );
    // Cab has real openings, an interior floor, firebox and driving controls.
    b.box(2.8, 0.18, 2.7, this.wood, 0, 1.25, 1.8);
    for (const x of [-1.28, 1.28]) {
      b.box(0.15, 2.4, 0.15, this.green, x, 2.5, 0.5);
      b.box(0.15, 2.4, 0.15, this.green, x, 2.5, 3.0);
      b.box(0.13, 0.85, 2.6, this.green, x, 1.85, 1.75);
      b.box(0.1, 0.8, 0.75, this.glass, x, 2.9, 1);
    }
    b.box(2.8, 0.18, 3.1, this.metal, 0, 3.85, 1.7);
    b.box(0.45, 0.8, 0.45, this.wood, -0.7, 1.7, 2.2);
    b.box(0.7, 0.12, 0.6, this.fabric, -0.7, 2.15, 2.2);
    b.box(1.6, 0.85, 0.4, this.metal, 0, 1.8, 0.65);
    b.box(0.4, 0.3, 0.02, this.glow, 0, 1.8, 0.42);
    for (const x of [-0.46, 0.46]) {
      b.add(new T.TorusGeometry(0.18, 0.025, 6, 16), this.brass, x, 2.4, 0.4);
      b.add(
        new T.CylinderGeometry(0.025, 0.025, 0.7, 8),
        this.brass,
        x,
        1.9,
        1.1,
        0,
        0,
        0.15,
      );
    }
    b.add(
      new T.CylinderGeometry(0.24, 0.24, 0.35, 20),
      this.brass,
      0,
      2.6,
      -4.65,
      Math.PI / 2,
    );
    b.add(new T.CircleGeometry(0.2, 20), this.glow, 0, 2.6, -4.84, 0, Math.PI);
    b.box(2.8, 0.35, 0.35, this.brass, 0, 0.95, -5);
    b.box(0.3, 0.25, 1.3, this.metal, 0, 0.85, 4.4);
    b.finish();
    const wheelZ = [-3, -1.5, 0, 2.4],
      wheelX = [-0.8, 0.8];
    const wheels = new T.InstancedMesh(wheel, this.metal, 8);
    wheels.castShadow = true;
    group.add(wheels);
    const rodGeometry = new T.BoxGeometry(0.12, 0.13, 3.0);
    this.geometries.add(rodGeometry);
    const rod = new T.InstancedMesh(rodGeometry, this.brass, 2);
    group.add(rod);
    return { group, wheels, wheelZ, wheelX, radius: 0.65, offset: 0, rod };
  }
  private buildCoach(wheel: T.BufferGeometry, offset: number): TrainUnit {
    const group = new T.Group(),
      b = this.builder(group);
    b.box(2.8, 0.24, 8.1, this.metal, 0, 0.95, 0);
    b.box(2.65, 0.12, 7.8, this.wood, 0, 1.25, 0);
    const roof = new T.CylinderGeometry(
      1.5,
      1.5,
      8.2,
      24,
      1,
      false,
      Math.PI / 2,
      Math.PI,
    );
    roof.rotateX(Math.PI / 2);
    roof.scale(1, 0.28, 1);
    b.add(roof, this.metal, 0, 3.9, 0);
    b.box(3, 0.08, 8.2, this.green, 0, 3.9, 0);
    for (const x of [-1.35, 1.35]) {
      b.box(0.12, 1.0, 7.9, this.green, x, 1.85, 0);
      b.box(0.14, 0.25, 7.9, this.brass, x, 3.65, 0);
      for (let i = 0; i < 6; i++) {
        const z = -3.3 + i * 1.32;
        b.box(0.16, 1.25, 0.1, this.wood, x, 2.95, z - 0.6);
        b.box(0.025, 0.95, 1.13, this.glass, x, 2.95, z);
        b.box(0.18, 0.07, 1.2, this.brass, x, 2.43, z);
      }
    }
    for (const z of [-3.94, 3.94]) {
      b.box(0.9, 2.5, 0.12, this.green, -0.88, 2.6, z);
      b.box(0.9, 2.5, 0.12, this.green, 0.88, 2.6, z);
      b.box(0.9, 0.7, 0.1, this.glass, 0, 3.25, z);
      b.box(0.3, 0.2, 0.8, this.metal, 0, 0.8, z * 1.1);
    }
    for (let row = 0; row < 5; row++) {
      const z = -2.8 + row * 1.4;
      for (const x of [-0.85, 0.85]) {
        b.box(0.78, 0.15, 0.75, this.fabric, x, 1.8, z);
        b.box(0.78, 0.65, 0.12, this.fabric, x, 2.15, z + 0.35);
        b.box(0.1, 0.5, 0.1, this.wood, x - 0.28, 1.5, z);
        b.box(0.1, 0.5, 0.1, this.wood, x + 0.28, 1.5, z);
      }
    }
    for (const z of [-2.5, 0, 2.5])
      b.box(0.2, 0.05, 0.55, this.glow, 0, 3.87, z);
    b.finish();
    const wheels = new T.InstancedMesh(wheel, this.metal, 8);
    wheels.castShadow = true;
    group.add(wheels);
    return {
      group,
      wheels,
      wheelX: [-0.8, 0.8],
      wheelZ: [-2.8, -1.8, 1.8, 2.8],
      radius: 0.48,
      offset,
    };
  }
  animate(distance: number, speed: number, time: number) {
    for (const unit of this.units) {
      const angle = -distance / unit.radius;
      let index = 0;
      for (const x of unit.wheelX)
        for (const z of unit.wheelZ) {
          this.temp.position.set(x, unit.radius + 0.065, z);
          this.temp.rotation.set(angle, 0, 0);
          this.temp.scale.setScalar(unit.radius / 0.65);
          this.temp.updateMatrix();
          unit.wheels.setMatrixAt(index++, this.temp.matrix);
        }
      unit.wheels.instanceMatrix.needsUpdate = true;
      if (unit.rod) {
        index = 0;
        for (const x of [-1.0, 1.0]) {
          this.temp.position.set(
            x,
            0.715 + Math.sin(angle) * 0.23,
            -1.5 + Math.cos(angle) * 0.23,
          );
          this.temp.rotation.set(0, 0, 0);
          this.temp.scale.setScalar(1);
          this.temp.updateMatrix();
          unit.rod.setMatrixAt(index++, this.temp.matrix);
        }
        unit.rod.instanceMatrix.needsUpdate = true;
      }
      // Millimetre-scale suspension motion; cameras deliberately exclude this transform.
      unit.group.scale.y =
        1 + Math.sin(time * 8 + unit.offset) * Math.min(speed, 8) * 0.00012;
    }
  }
  dispose() {
    this.root.removeFromParent();
    this.units.forEach((u) => {
      u.wheels.dispose();
      u.rod?.dispose();
    });
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
