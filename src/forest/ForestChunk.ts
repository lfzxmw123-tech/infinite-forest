import { railwayEnabled, railClearance } from "../train/RailwayPath";
import * as T from "three/webgpu";
import { Assets } from "./Assets";
import {
  CHUNK_SIZE,
  heightAt,
  streamX,
  random,
  hash,
  treesForChunk,
  TreePlacement,
} from "./world";
const dummy = new T.Object3D(),
  tint = new T.Color();
export class ForestChunk {
  group = new T.Group();
  cx = 0;
  cz = 0;
  trees: TreePlacement[] = [];
  rockColliders: { x: number; z: number; radius: number }[] = [];
  private terrain: T.Mesh;
  private water: T.Mesh;
  private wood: T.InstancedMesh[] = [];
  private foliage: T.InstancedMesh[] = [];
  private grass: T.InstancedMesh;
  private ferns: T.InstancedMesh;
  private rocks: T.InstancedMesh;
  private detail = true;
  constructor(private assets: Assets) {
    const terrainGeo = new T.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, 24, 24);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.setAttribute(
      "color",
      new T.Float32BufferAttribute(
        new Float32Array(terrainGeo.attributes.position.count * 3),
        3,
      ),
    );
    this.terrain = new T.Mesh(terrainGeo, assets.terrainMat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
    const waterGeo = new T.BufferGeometry();
    waterGeo.setAttribute(
      "position",
      new T.Float32BufferAttribute(new Float32Array(33 * 2 * 3), 3),
    );
    const ix = [];
    for (let i = 0; i < 32; i++) {
      const j = i * 2;
      ix.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
    waterGeo.setIndex(ix);
    this.water = new T.Mesh(waterGeo, assets.waterMat);
    this.group.add(this.water);
    for (let i = 0; i < 3; i++) {
      const w = new T.InstancedMesh(
          assets.treeGeos[i].wood,
          assets.barkMat,
          25,
        ),
        f = new T.InstancedMesh(assets.treeGeos[i].foliage, assets.leafMat, 25);
      w.castShadow = true;
      w.receiveShadow = true;
      f.castShadow = true;
      f.receiveShadow = true;
      w.instanceMatrix.setUsage(T.DynamicDrawUsage);
      f.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.wood.push(w);
      this.foliage.push(f);
      this.group.add(w, f);
    }
    this.grass = new T.InstancedMesh(assets.grass, assets.grassMat, 1100);
    this.ferns = new T.InstancedMesh(assets.fern, assets.grassMat, 95);
    this.rocks = new T.InstancedMesh(assets.rock, assets.rockMat, 35);
    this.grass.receiveShadow = true;
    this.ferns.receiveShadow = true;
    this.rocks.receiveShadow = true;
    this.rocks.castShadow = true;
    this.group.add(this.grass, this.ferns, this.rocks);
  }
  assign(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    this.group.visible = true;
    const rng = random(Math.floor(hash(cx, cz) * 4294967295));
    const p = this.terrain.geometry.attributes.position,
      c = this.terrain.geometry.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx * CHUNK_SIZE,
        z = p.getZ(i) + cz * CHUNK_SIZE,
        y = heightAt(x, z);
      p.setY(i, y);
      const d = Math.abs(x - streamX(z)),
        v = 0.72 + hash(Math.floor(x * 2), Math.floor(z * 2)) * 0.28;
      tint.set(d < 3 ? 0x5b6550 : 0x899b62).multiplyScalar(v);
      c.setXYZ(i, tint.r, tint.g, tint.b);
    }
    p.needsUpdate = true;
    c.needsUpdate = true;
    const normals = this.terrain.geometry.attributes.normal;
    const normal = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx * CHUNK_SIZE,
        z = p.getZ(i) + cz * CHUNK_SIZE;
      normal
        .set(
          heightAt(x - 0.15, z) - heightAt(x + 0.15, z),
          0.3,
          heightAt(x, z - 0.15) - heightAt(x, z + 0.15),
        )
        .normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    normals.needsUpdate = true;
    this.terrain.geometry.computeBoundingSphere();
    const wp = this.water.geometry.attributes.position;
    const minX = cx * CHUNK_SIZE,
      maxX = minX + CHUNK_SIZE;
    let visible = false;
    for (let i = 0; i < 33; i++) {
      const z = cz * CHUNK_SIZE + (i * CHUNK_SIZE) / 32,
        center = streamX(z);
      if (center + 2 > minX && center - 2 < maxX) visible = true;
      for (let j = 0; j < 2; j++)
        wp.setXYZ(
          i * 2 + j,
          T.MathUtils.clamp(center + (j === 0 ? -2 : 2), minX, maxX) - minX,
          -0.58,
          z - cz * CHUNK_SIZE,
        );
    }
    wp.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
    this.water.geometry.computeBoundingSphere();
    this.water.visible = visible;
    this.trees = treesForChunk(cx, cz);
    const counts = [0, 0, 0];
    for (const t of this.trees) {
      dummy.position.set(
        t.x - cx * CHUNK_SIZE,
        heightAt(t.x, t.z) - 0.08,
        t.z - cz * CHUNK_SIZE,
      );
      dummy.rotation.set(0, t.rotation, 0);
      dummy.scale.set(t.scale, t.scale, t.scale);
      dummy.updateMatrix();
      const i = counts[t.variant]++;
      this.wood[t.variant].setMatrixAt(i, dummy.matrix);
      this.foliage[t.variant].setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.22 + rng() * 0.07, 0.2 + rng() * 0.18, 0.52 + rng() * 0.17);
      this.foliage[t.variant].setColorAt(i, tint);
    }
    for (let i = 0; i < 3; i++) {
      this.wood[i].count = counts[i];
      this.foliage[i].count = counts[i];
      for (const mesh of [this.wood[i], this.foliage[i]]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      if (this.foliage[i].instanceColor)
        this.foliage[i].instanceColor!.needsUpdate = true;
    }
    let n = 0;
    for (let i = 0; i < 1100; i++) {
      const x = minX + rng() * CHUNK_SIZE,
        z = cz * CHUNK_SIZE + rng() * CHUNK_SIZE;
      if (
        Math.abs(x - streamX(z)) < 2.8 ||
        (railwayEnabled() && railClearance(x, z) < 2.5)
      )
        continue;
      this.place(this.grass, n++, x, z, 0.5 + rng() * 1.3, rng() * 6.28);
    }
    this.grass.count = n;
    this.finish(this.grass);
    n = 0;
    for (let i = 0; i < 95; i++) {
      const x = minX + rng() * CHUNK_SIZE,
        z = cz * CHUNK_SIZE + rng() * CHUNK_SIZE;
      if (
        Math.abs(x - streamX(z)) < 3 ||
        (railwayEnabled() && railClearance(x, z) < 3)
      )
        continue;
      this.place(this.ferns, n++, x, z, 0.7 + rng() * 0.9, rng() * 6.28);
    }
    this.ferns.count = n;
    this.finish(this.ferns);
    n = 0;
    this.rockColliders.length = 0;
    for (let i = 0; i < 35; i++) {
      const z = cz * CHUNK_SIZE + rng() * CHUNK_SIZE;
      let x =
        i < 20
          ? streamX(z) + (rng() < 0.5 ? -1 : 1) * (2.5 + rng() * 2.6)
          : minX + rng() * CHUNK_SIZE;
      if (
        x < minX ||
        x > maxX ||
        (railwayEnabled() && railClearance(x, z) < 3.6)
      )
        continue;
      const s = 0.2 + rng() * 0.9;
      dummy.position.set(
        x - minX,
        heightAt(x, z) + s * 0.1,
        z - cz * CHUNK_SIZE,
      );
      dummy.rotation.set(rng(), rng() * 6.28, rng());
      dummy.scale.set(s * 1.6, s * 0.7, s);
      dummy.updateMatrix();
      this.rocks.setMatrixAt(n++, dummy.matrix);
      // Enclose the rotated, irregular rock in a conservative horizontal circle.
      this.rockColliders.push({ x, z, radius: s * 1.8 });
    }
    this.rocks.count = n;
    this.finish(this.rocks);
    this.setDetail(true);
  }
  private place(
    mesh: T.InstancedMesh,
    n: number,
    x: number,
    z: number,
    s: number,
    a: number,
  ) {
    dummy.position.set(
      x - this.cx * CHUNK_SIZE,
      heightAt(x, z) - 0.03,
      z - this.cz * CHUNK_SIZE,
    );
    dummy.rotation.set(0, a, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
  }
  private finish(mesh: T.InstancedMesh) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  setDetail(near: boolean) {
    this.detail = near;
    this.grass.visible = near;
    this.ferns.visible = near;
    for (let i = 0; i < 3; i++) {
      this.foliage[i].castShadow = near;
      this.wood[i].castShadow = near;
      this.foliage[i].geometry = near
        ? this.assets.treeGeos[i].foliage
        : this.assets.treeGeos[i].lowFoliage;
      this.wood[i].geometry = near
        ? this.assets.treeGeos[i].wood
        : this.assets.treeGeos[i].lowWood;
      this.foliage[i].computeBoundingSphere();
      this.wood[i].computeBoundingSphere();
    }
  }
  setShadow(enabled: boolean) {
    for (const mesh of this.wood) mesh.castShadow = enabled;
    for (const mesh of this.foliage) mesh.castShadow = enabled;
  }
  get detailed() {
    return this.detail;
  }
  dispose() {
    this.terrain.geometry.dispose();
    this.water.geometry.dispose();
    for (const m of [
      ...this.wood,
      ...this.foliage,
      this.grass,
      this.ferns,
      this.rocks,
    ])
      m.dispose();
  }
}
