import * as T from "three/webgpu";
import { railwayEnabled, railX, railClearance } from "../train/RailwayPath";
import { ForestGenerator } from "../forest/ForestGenerator";
import { CHUNK_SIZE, heightAt, streamX } from "../forest/world";
import { AnimalController, traits, animalGeometry } from "./AnimalController";
import { AnimalSpawner } from "./AnimalSpawner";
import { AnimalAI } from "./AnimalAI";
type Animal = {
  view: AnimalController;
  ai: AnimalAI;
  homeX: number;
  homeZ: number;
  acc: number;
  speed: number;
};
export class AnimalManager {
  chunks = new Map<string, Animal[]>();
  spawner: AnimalSpawner;
  maxAnimals = 64;
  private trainThreatTimer = 0;
  readonly batch: T.InstancedMesh;
  drawDistance = 65;
  private frustum = new T.Frustum();
  private projection = new T.Matrix4();
  private bounds = new T.Sphere(new T.Vector3(), 2.3);
  constructor(
    private scene: T.Scene,
    private forest: ForestGenerator,
  ) {
    this.spawner = new AnimalSpawner(forest);
    this.batch = new T.InstancedMesh(
      animalGeometry,
      new T.MeshStandardNodeMaterial({ roughness: 1, vertexColors: false }),
      64 * 32,
    );
    this.batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.batch.instanceColor = new T.InstancedBufferAttribute(
      new Float32Array(64 * 32 * 3).fill(1),
      3,
    ).setUsage(T.DynamicDrawUsage);
    this.batch.count = 0;
    this.batch.frustumCulled = false;
    this.batch.receiveShadow = true;
    this.batch.castShadow = false;
    scene.add(this.batch);
  }
  get count() {
    let n = 0;
    for (const a of this.chunks.values()) n += a.length;
    return n;
  }
  update(dt: number, player: T.Vector3, camera?: T.Camera) {
    this.trainThreatTimer = Math.max(0, this.trainThreatTimer - dt);
    for (const [key, animals] of this.chunks)
      if (!this.forest.active.has(key)) {
        for (const a of animals) a.view.dispose();
        this.chunks.delete(key);
      }
    for (const [key, c] of this.forest.active) {
      if (this.chunks.has(key)) continue;
      const animals: Animal[] = [];
      for (const p of this.spawner.layout(c.cx, c.cz)) {
        if (this.count + animals.length >= this.maxAnimals) break;
        const view = new AnimalController(p.species, p.seed % 100);
        view.root.position.set(p.x, heightAt(p.x, p.z) + 0.06, p.z);
        this.scene.add(view.root);
        animals.push({
          view,
          ai: new AnimalAI(p.seed),
          homeX: p.x,
          homeZ: p.z,
          acc: 0,
          speed: 0,
        });
      }
      this.chunks.set(key, animals);
    }
    for (const animals of this.chunks.values())
      for (const a of animals) {
        const v = a.view,
          p = v.root.position,
          t = traits[v.species],
          distance = Math.hypot(p.x - player.x, p.z - player.z);
        v.root.visible = distance < this.drawDistance;
        if (!v.root.visible) continue;
        a.acc += dt;
        const interval = distance > 60 ? 0.2 : distance > 30 ? 0.08 : 0;
        if (a.acc < interval) continue;
        const step = Math.min(a.acc, 0.25);
        a.acc = 0;
        a.ai.update(step, distance, t.fear);
        let target = a.ai.heading;
        if (a.ai.state === "Run")
          target = Math.atan2(p.x - player.x, p.z - player.z);
        else if (Math.hypot(p.x - a.homeX, p.z - a.homeZ) > t.range)
          target = Math.atan2(a.homeX - p.x, a.homeZ - p.z);
        if (
          a.ai.state === "Run" &&
          this.trainThreatTimer > 0 &&
          railwayEnabled() &&
          railClearance(p.x, p.z) < 6
        ) {
          target = p.x >= railX(p.z) ? Math.PI / 2 : -Math.PI / 2;
        }
        const speed =
          a.ai.state === "Run" ? t.run : a.ai.state === "Walk" ? t.walk : 0;
        let moved = false;
        if (speed)
          for (const turn of [0, 0.55, -0.55, 1.1, -1.1, 1.8, -1.8]) {
            const angle = target + turn;
            const delta = Math.atan2(
              Math.sin(angle - v.root.rotation.y),
              Math.cos(angle - v.root.rotation.y),
            );
            const heading =
              v.root.rotation.y + T.MathUtils.clamp(delta, -step * 4, step * 4);
            const x = p.x + Math.sin(heading) * speed * step,
              z = p.z + Math.cos(heading) * speed * step;
            if (
              !this.forest.active.has(
                `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`,
              ) ||
              Math.abs(x - streamX(z)) < 3.5 ||
              Math.abs(heightAt(x, z) - heightAt(p.x, p.z)) >
                speed * step * 0.45 ||
              this.forest.pathBlocked(p.x, p.z, x, z, t.radius)
            )
              continue;
            p.set(x, heightAt(x, z) + 0.06, z);
            v.root.rotation.y = heading;
            moved = true;
            break;
          }
        if (speed && !moved) {
          v.root.rotation.y += step * 2;
          a.ai.heading += step * 2;
        }
        a.speed = moved ? speed : 0;
        v.animate(step, a.ai.state, a.speed);
      }
    this.updateBatch(camera);
  }
  private updateBatch(camera?: T.Camera) {
    if (camera) {
      camera.updateMatrixWorld();
      this.projection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      this.frustum.setFromProjectionMatrix(
        this.projection,
        camera.coordinateSystem,
      );
    }
    let count = 0;
    for (const animals of this.chunks.values())
      for (const animal of animals) {
        const view = animal.view;
        if (!view.root.visible) continue;
        if (camera) {
          this.bounds.center.copy(view.root.position);
          this.bounds.center.y += 1;
          if (!this.frustum.intersectsSphere(this.bounds)) continue;
        }
        view.root.updateMatrixWorld(true);
        for (const part of view.parts) {
          if (count >= this.batch.instanceMatrix.count) break;
          this.batch.setMatrixAt(count, part.matrixWorld);
          this.batch.setColorAt(count, part.material.color);
          count++;
        }
      }
    this.batch.count = count;
    this.batch.instanceMatrix.needsUpdate = true;
    this.batch.instanceColor!.needsUpdate = true;
  }
  renderStats() {
    return {
      animals: this.count,
      parts: this.batch.count,
      drawCalls: this.batch.count ? 1 : 0,
    };
  }
  /** Optional train stimulus; normal walking ecology keeps its existing behaviour. */
  reactToTrain(position: T.Vector3, speed: number, horn = false) {
    if (speed < 0.1 && !horn) return;
    this.trainThreatTimer = 0.5;
    const radius = horn ? 60 : 18 + speed * 1.5;
    for (const animals of this.chunks.values())
      for (const animal of animals) {
        if (
          animal.view.root.position.distanceToSquared(position) >
          radius * radius
        )
          continue;
        if (animal.ai.state !== "Alert" && animal.ai.state !== "Run") {
          animal.ai.state = "Alert";
          animal.ai.timer = 0.35;
        }
        if (horn) {
          animal.ai.state = "Run";
          animal.ai.timer = 3;
        }
      }
  }
  snapshot() {
    return [...this.chunks].flatMap(([chunk, animals]) =>
      animals.map((a) => ({
        chunk,
        species: a.view.species,
        state: a.ai.state,
        position: a.view.root.position.toArray(),
        phase: a.view.phase,
        speed: a.speed,
        blocked: this.forest.collides(
          a.view.root.position.x,
          a.view.root.position.z,
          traits[a.view.species].radius,
        ),
      })),
    );
  }
}
