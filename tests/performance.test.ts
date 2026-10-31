import assert from "node:assert/strict";
import * as T from "three/webgpu";
import { AdaptiveQuality } from "../src/core/AdaptiveQuality";
import { AnimalManager } from "../src/animals/AnimalManager";
import { AnimalController } from "../src/animals/AnimalController";
import { ForestGenerator } from "../src/forest/ForestGenerator";
const quality = new AdaptiveQuality();
for (let i = 0; i < 100; i++) quality.sample(1 / 20);
assert.equal(quality.level, 1);
for (let i = 0; i < 100; i++) quality.sample(1 / 20);
assert.equal(quality.level, 2);
for (let i = 0; i < 1000; i++) quality.sample(1 / 60, false);
assert.equal(quality.level, 2);
for (let i = 0; i < 1500; i++) quality.sample(1 / 60);
assert.equal(quality.level, 1);
const scene = new T.Scene();
const forest = {
  active: new Map(),
  pathBlocked: () => false,
} as unknown as ForestGenerator;
const animals = new AnimalManager(scene, forest);
const view = new AnimalController("deer", 1);
view.root.position.set(3, 2, 4);
scene.add(view.root);
animals.chunks.set("0,0", [
  { view, ai: null!, homeX: 3, homeZ: 4, acc: 0, speed: 0 },
]);
// Verify batching independently from AI and terrain so transforms remain inspectable.
(animals as any).updateBatch();
assert.equal(animals.batch.count, view.parts.length);
assert.equal(animals.renderStats().drawCalls, 1);
const matrix = new T.Matrix4();
animals.batch.getMatrixAt(0, matrix);
assert.ok(
  matrix.elements.every(
    (v, i) => Math.abs(v - view.parts[0].matrixWorld.elements[i]) < 1e-5,
  ),
);
assert.ok(view.parts.every((p) => !p.visible));
view.root.visible = false;
(animals as any).updateBatch();
assert.equal(animals.batch.count, 0);
console.log(
  "PASS adaptive quality, hidden-tab handling, batched animal transforms and visibility",
);
