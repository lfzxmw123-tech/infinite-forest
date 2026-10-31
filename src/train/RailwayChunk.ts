import * as T from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RailwayPath, railX, railY, tunnelSection } from "./RailwayPath";
import { heightAt, streamX } from "../forest/world";
export interface RailAssets {
  steel: T.Material;
  wood: T.Material;
  ballast: T.Material;
  stone: T.Material;
  rail: T.BufferGeometry;
  sleeper: T.BufferGeometry;
  bed: T.BufferGeometry;
  pier: T.BufferGeometry;
  arch: T.BufferGeometry;
  wall: T.BufferGeometry;
  guard: T.BufferGeometry;
}
const up = new T.Vector3(0, 1, 0),
  forward = new T.Vector3(0, 0, -1);
export class RailwayChunk {
  group = new T.Group();
  index = 0;
  rails: T.InstancedMesh;
  sleepers: T.InstancedMesh;
  bed: T.InstancedMesh;
  piers: T.InstancedMesh;
  walls: T.InstancedMesh;
  arch: T.Mesh;
  guards: T.InstancedMesh;
  private temp = new T.Object3D();
  private point = new T.Vector3();
  private tangent = new T.Vector3();
  private right = new T.Vector3();
  constructor(
    private path: RailwayPath,
    private assets: RailAssets,
  ) {
    this.rails = new T.InstancedMesh(assets.rail, assets.steel, 64);
    this.sleepers = new T.InstancedMesh(assets.sleeper, assets.wood, 40);
    this.bed = new T.InstancedMesh(assets.bed, assets.ballast, 32);
    this.piers = new T.InstancedMesh(assets.pier, assets.stone, 16);
    this.walls = new T.InstancedMesh(assets.wall, assets.stone, 2);
    this.arch = new T.Mesh(assets.arch, assets.stone);
    this.guards = new T.InstancedMesh(assets.guard, assets.steel, 16);
    this.group.add(
      this.rails,
      this.sleepers,
      this.bed,
      this.piers,
      this.arch,
      this.walls,
      this.guards,
    );
    this.rails.castShadow = false;
    this.sleepers.receiveShadow = true;
    this.bed.receiveShadow = true;
    this.arch.receiveShadow = true;
  }
  assign(index: number) {
    this.index = index;
    this.group.visible = true;
    let r = 0,
      b = 0,
      p = 0,
      g = 0;
    for (let i = 0; i < 32; i++) {
      const parameter = index * 32 + i + 0.5;
      this.path.sample(parameter, this.point);
      this.path.tangent(parameter, this.tangent);
      this.right.crossVectors(this.tangent, up).normalize();
      this.temp.quaternion.setFromUnitVectors(forward, this.tangent);
      for (const side of [-1, 1]) {
        this.temp.position
          .copy(this.point)
          .addScaledVector(this.right, side * 0.78);
        this.temp.scale.set(1, 1, 1.025);
        this.temp.updateMatrix();
        this.rails.setMatrixAt(r++, this.temp.matrix);
      }
      this.temp.position.copy(this.point);
      this.temp.position.y -= 0.27;
      const overWater = Math.abs(this.point.x - streamX(this.point.z)) < 5;
      this.temp.scale.set(overWater ? 1.3 : 1, 1, 1.04);
      this.temp.updateMatrix();
      this.bed.setMatrixAt(b++, this.temp.matrix);
      if (i % 4 === 0 && overWater) {
        for (const side of [-1, 1]) {
          this.temp.position
            .copy(this.point)
            .addScaledVector(this.right, side * 1.8);
          this.temp.quaternion.setFromUnitVectors(forward, this.tangent);
          this.temp.scale.setScalar(1);
          this.temp.updateMatrix();
          this.guards.setMatrixAt(g++, this.temp.matrix);
        }
      }
      if (i % 4 === 0) {
        const ground = heightAt(this.point.x, this.point.z),
          depth = this.point.y - 0.3 - ground;
        if (depth > 0.45) {
          this.temp.position.set(
            this.point.x,
            ground + depth * 0.5,
            this.point.z,
          );
          this.temp.rotation.set(0, 0, 0);
          this.temp.scale.set(1, depth, 1);
          this.temp.updateMatrix();
          this.piers.setMatrixAt(p++, this.temp.matrix);
        }
      }
    }
    for (let i = 0; i < 40; i++) {
      const parameter = index * 32 + i * 0.8;
      this.path.sample(parameter, this.point);
      this.path.tangent(parameter, this.tangent);
      this.temp.position.copy(this.point);
      this.temp.position.y -= 0.14;
      this.temp.quaternion.setFromUnitVectors(forward, this.tangent);
      this.temp.scale.set(1, 1, 1);
      this.temp.updateMatrix();
      this.sleepers.setMatrixAt(i, this.temp.matrix);
    }
    this.rails.count = r;
    this.bed.count = b;
    this.piers.count = p;
    this.guards.count = g;
    const middle = index * 32 + 16;
    const bridge = Math.abs(railX(-middle) - streamX(-middle)) < 5;
    this.arch.visible = tunnelSection(middle) && !bridge;
    this.walls.visible = this.arch.visible;
    this.path.sample(middle, this.point);
    this.path.tangent(middle, this.tangent);
    this.arch.position.copy(this.point);
    this.arch.position.y += 0.8;
    this.arch.quaternion.setFromUnitVectors(forward, this.tangent);
    for (let i = 0; i < 2; i++) {
      this.temp.position.copy(this.point);
      this.right.crossVectors(this.tangent, up).normalize();
      this.temp.position.addScaledVector(this.right, i === 0 ? -4.3 : 4.3);
      this.temp.position.y += 0.35;
      this.temp.quaternion.copy(this.arch.quaternion);
      this.temp.scale.set(1, 1, 1);
      this.temp.updateMatrix();
      this.walls.setMatrixAt(i, this.temp.matrix);
    }
    for (const mesh of [
      this.rails,
      this.sleepers,
      this.bed,
      this.piers,
      this.walls,
      this.guards,
    ]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  dispose() {
    this.group.removeFromParent();
    for (const m of [
      this.rails,
      this.sleepers,
      this.bed,
      this.piers,
      this.walls,
      this.guards,
    ])
      m.dispose();
  }
}
export function createRailAssets(): RailAssets {
  const steel = new T.MeshStandardNodeMaterial({
      color: 0x777f79,
      metalness: 0.9,
      roughness: 0.32,
    }),
    wood = new T.MeshStandardNodeMaterial({ color: 0x483a2a, roughness: 0.96 }),
    ballast = new T.MeshStandardNodeMaterial({ color: 0x66675a, roughness: 1 }),
    stone = new T.MeshStandardNodeMaterial({
      color: 0x4d5550,
      roughness: 1,
      side: T.DoubleSide,
    });
  const arch = new T.CylinderGeometry(
    4.2,
    4.2,
    32,
    28,
    1,
    true,
    Math.PI / 2,
    Math.PI,
  );
  arch.rotateX(Math.PI / 2);
  const post = new T.BoxGeometry(0.075, 1.15, 0.075);
  post.translate(0, 0.57, 0);
  const handrail = new T.BoxGeometry(0.07, 0.08, 4.05);
  handrail.translate(0, 1.1, 0);
  const guard = mergeGeometries([post, handrail]);
  post.dispose();
  handrail.dispose();
  return {
    guard,
    steel,
    wood,
    ballast,
    stone,
    rail: new T.BoxGeometry(0.095, 0.13, 1),
    sleeper: new T.BoxGeometry(2.5, 0.16, 0.24),
    bed: new T.BoxGeometry(3.1, 0.32, 1),
    pier: new T.BoxGeometry(1.3, 1, 1.3),
    arch,
    wall: new T.BoxGeometry(0.4, 1.6, 32),
  };
}
