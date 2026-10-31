import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import * as T from "three/webgpu";
import {
  heightAt,
  treesForChunk,
  CHUNK_SIZE,
  desiredChunks,
} from "../src/forest/world";
import { createAssets } from "../src/forest/Assets";
import { ForestGenerator } from "../src/forest/ForestGenerator";
import { FirstPersonController } from "../src/controls/FirstPersonController";
import { Atmosphere } from "../src/effects/Atmosphere";
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
});
assert.deepEqual(
  treesForChunk(-3, 4),
  treesForChunk(-3, 4),
  "Returning to a chunk must reproduce its trees",
);
assert.notDeepEqual(treesForChunk(-3, 4), treesForChunk(-2, 4));
for (let x = -300; x < 300; x += 3.7)
  for (let z = -50; z < 50; z += 9.1) {
    assert.ok(Number.isFinite(heightAt(x, z)));
    assert.ok(Math.abs(heightAt(x + 1e-6, z) - heightAt(x - 1e-6, z)) < 1e-4);
  }
assert.equal(desiredChunks(-0.1, -0.1, 2).length, 25);
const assets = createAssets(),
  scene = new T.Scene(),
  forest = new ForestGenerator(scene, assets);
function settle(x: number, z: number) {
  for (let i = 0; i < 50; i++) forest.update(x, z);
}
settle(10, 24);
assert.equal(forest.active.size, 25);
const initial = new Set(forest.active.values());
const left = forest.active.get("0,0")!,
  right = forest.active.get("1,0")!;
const lp = (left.group.children[0] as T.Mesh).geometry.attributes.position,
  rp = (right.group.children[0] as T.Mesh).geometry.attributes.position;
const ln = (left.group.children[0] as T.Mesh).geometry.attributes.normal,
  rn = (right.group.children[0] as T.Mesh).geometry.attributes.normal;
for (let row = 0; row < 25; row++) {
  const l = row * 25 + 24,
    r = row * 25;
  assert.equal(lp.getY(l), rp.getY(r), "Shared terrain edge heights");
  for (const key of ["getX", "getY", "getZ"] as const)
    assert.equal(ln[key](l), rn[key](r), "Shared terrain edge normals");
}
for (let step = 1; step <= 25; step++) {
  settle(step * CHUNK_SIZE, step * CHUNK_SIZE * 0.6);
  assert.equal(forest.active.size, 25);
  assert.ok(scene.children.length <= 25, "Streaming must reuse chunk objects");
  for (const chunk of forest.active.values())
    assert.ok(initial.has(chunk), "Original pool is reused");
}
assert.ok(forest.recycled > 150);
const tree = [...forest.active.values()].flatMap((c) => c.trees)[0];
assert.ok(forest.collides(tree.x, tree.z), "Trunk collision");
forest.setQuality(true);
settle(1000, 600);
assert.equal(forest.active.size, 49);
assert.equal(scene.children.length, 49);
forest.setQuality(false);
settle(-1000, -600);
assert.equal(forest.active.size, 25);
assert.equal(forest.pool.length, 24);
for (const g of assets.treeGeos) {
  assert.ok(
    g.lowFoliage.attributes.position.count <
      g.foliage.attributes.position.count * 0.5,
  );
  assert.ok(
    g.lowWood.attributes.position.count < g.wood.attributes.position.count,
  );
}
console.log(
  "PASS: deterministic world, continuous height and normals, 1 km streaming, pooled object bound, collisions, real geometry LOD, quality changes.",
);
console.log(forest.stats());

// Exercise actual input handlers and movement integration without a browser UI.
const events = new EventTarget();
const doc = Object.assign(new EventTarget(), {
  createElement: () => createCanvas(256, 256),
  pointerLockElement: null as unknown,
});
Object.assign(globalThis, {
  window: events,
  document: doc,
  matchMedia: () => ({ matches: false }),
});
const element = Object.assign(new EventTarget(), {
  async requestPointerLock() {
    doc.pointerLockElement = element;
    doc.dispatchEvent(new Event("pointerlockchange"));
  },
});
settle(10, 24);
const camera = new T.PerspectiveCamera();
const player = new FirstPersonController(
  camera,
  element as unknown as HTMLElement,
  forest,
);
await player.enter();
assert.equal(player.active, true);
const event = (
  target: EventTarget,
  type: string,
  props: Record<string, unknown>,
) => target.dispatchEvent(Object.assign(new Event(type), props));
const before = camera.position.clone();
event(events, "keydown", { code: "KeyW" });
for (let i = 0; i < 60; i++) player.update(1 / 60, i / 60);
event(events, "keyup", { code: "KeyW" });
assert.ok(camera.position.distanceTo(before) > 1, "WASD advances camera");
const rotation = camera.quaternion.clone();
event(doc, "mousemove", { movementX: 30, movementY: -10 });
assert.ok(!rotation.equals(camera.quaternion), "Mouse changes view");
const ground = camera.position.y;
event(events, "keydown", { code: "Space" });
for (let i = 0; i < 12; i++) player.update(1 / 60, 1 + i / 60);
event(events, "keyup", { code: "Space" });
assert.ok(camera.position.y > ground + 0.4, "Space makes player jump");
for (let i = 0; i < 180; i++) player.update(1 / 60, i / 60);
assert.ok(player.grounded, "Player lands");
const trunk = [...forest.active.values()]
  .flatMap((c) => c.trees)
  .find((t) => Math.abs(t.x - 10) < 20 && Math.abs(t.z - 24) < 20)!;
camera.position.set(
  trunk.x,
  heightAt(trunk.x, trunk.z + 3) + 1.75,
  trunk.z + 3,
);
(player as any).yaw = 0;
event(events, "keydown", { code: "KeyW" });
for (let i = 0; i < 120; i++) player.update(1 / 60, i / 60);
event(events, "keyup", { code: "KeyW" });
assert.ok(
  Math.hypot(camera.position.x - trunk.x, camera.position.z - trunk.z) >=
    trunk.radius + 0.31,
  "Movement stops at trunk",
);
doc.pointerLockElement = null;
doc.dispatchEvent(new Event("pointerlockchange"));
assert.equal(player.active, false);
assert.equal(player.keys.size, 0);
const atmosphere = new Atmosphere(scene);
atmosphere.cycle = false;
atmosphere.time = 0.28;
atmosphere.update(0, 0, camera);
const sunlight = atmosphere.sun.intensity,
  dayFog = atmosphere.fog.color.clone();
atmosphere.time = 0.95;
atmosphere.update(1, 10, camera);
assert.ok(atmosphere.sun.intensity < sunlight * 0.1);
assert.ok(!dayFog.equals(atmosphere.fog.color));
console.log(
  "PASS: pointer-lock lifecycle, keyboard movement, mouse look, jump/landing, trunk blocking, day/night atmosphere.",
);

camera.position.set(10, heightAt(10, 24) + 1.75, 24);
settle(10, 24);
player.startTour();
const tourStart = camera.position.clone();
for (let i = 0; i < 10800; i++) {
  player.update(1 / 60, i / 60);
  forest.update(camera.position.x, camera.position.z);
  assert.ok(
    !forest.collides(camera.position.x, camera.position.z),
    "Auto tour must not pass through trunks",
  );
}
assert.ok(
  camera.position.distanceTo(tourStart) > 200,
  "Auto tour keeps making progress for three simulated minutes",
);
player.pauseTour();
const pausedPosition = camera.position.clone();
player.update(1, 200);
assert.ok(camera.position.equals(pausedPosition));
assert.equal(player.tourPaused, true);
player.startTour();
assert.equal(player.active, true);
event(events, "keydown", { code: "Escape" });
assert.equal(player.active, false);
assert.equal(player.tourPaused, true);
console.log(
  "PASS: three-minute automatic tour, collision-free progress beyond 200 m, pause/resume and Escape.",
);

// Endpoints alone miss a rock in between; the swept body must catch it.
const obstacleWorld = new ForestGenerator(new T.Scene(), assets);
const obstacles = {
  trees: [],
  rockColliders: [{ x: 5, z: 5, radius: 1 }],
} as unknown as import("../src/forest/ForestChunk").ForestChunk;
obstacleWorld.active.set("0,0", obstacles);
assert.ok(obstacleWorld.collides(5, 5), "Rocks have collision bodies");
assert.ok(!obstacleWorld.collides(2, 5) && !obstacleWorld.collides(8, 5));
assert.ok(
  obstacleWorld.pathBlocked(2, 5, 8, 5),
  "A long step cannot tunnel through a rock",
);
assert.ok(
  !obstacleWorld.pathBlocked(2, 7, 8, 7),
  "A clear parallel route remains open",
);
obstacles.rockColliders = Array.from({ length: 14 }, (_, i) => ({
  x: i - 4,
  z: 5,
  radius: 0.65,
}));
const detourCamera = new T.PerspectiveCamera(),
  detourPlayer = new FirstPersonController(
    detourCamera,
    element as unknown as HTMLElement,
    obstacleWorld,
  );
detourCamera.position.set(0, 3, 10);
detourPlayer.startTour();
for (let i = 0; i < 2400; i++) {
  detourPlayer.update(1 / 60, i / 60);
  assert.ok(
    !obstacleWorld.collides(detourCamera.position.x, detourCamera.position.z),
    "A planned detour never enters the rock wall",
  );
}
assert.ok(
  detourCamera.position.z < 3,
  "Navigator routes around a wall rather than stopping in front",
);
console.log(
  "PASS: rock collision bodies, swept collision without tunneling, automatic detour around a rock wall.",
);

// Experience regressions: keep moving around a chicane, including high speed at low FPS.
for (const [speed, dt] of [
  [1.4, 1 / 60],
  [2.2, 1 / 60],
  [3.3, 1 / 20],
]) {
  obstacles.rockColliders = [
    { x: 4, z: 3, radius: 1.8 },
    { x: 0.5, z: -3, radius: 1.5 },
    { x: 6, z: -8, radius: 1.7 },
  ];
  const view = new T.PerspectiveCamera(),
    walker = new FirstPersonController(
      view,
      element as unknown as HTMLElement,
      obstacleWorld,
    );
  view.position.set(4, 3, 10);
  walker.tourSpeed = speed;
  walker.startTour();
  let minimumClearance = Infinity,
    stopped = 0,
    longestStop = 0,
    totalTurn = 0,
    maximumTurnRate = 0,
    minimumPitch = Infinity,
    maximumPitch = -Infinity;
  let previous = view.position.clone(),
    previousYaw = (walker as any).yaw;
  for (let frame = 0; frame < 40 / dt; frame++) {
    walker.update(dt, frame * dt);
    minimumClearance = Math.min(
      minimumClearance,
      obstacleWorld.clearance(view.position.x, view.position.z),
    );
    const movement = Math.hypot(
      view.position.x - previous.x,
      view.position.z - previous.z,
    );
    stopped = movement < dt * 0.1 ? stopped + dt : 0;
    longestStop = Math.max(longestStop, stopped);
    const yaw = (walker as any).yaw;
    totalTurn += Math.abs(yaw - previousYaw);
    maximumTurnRate = Math.max(
      maximumTurnRate,
      Math.abs(yaw - previousYaw) / dt,
    );
    minimumPitch = Math.min(minimumPitch, (walker as any).pitch);
    maximumPitch = Math.max(maximumPitch, (walker as any).pitch);
    previousYaw = yaw;
    previous.copy(view.position);
  }
  assert.ok(
    view.position.z < -12,
    "Automatic tour makes progress through successive obstacles",
  );
  assert.ok(
    minimumClearance > 0.6,
    "Tour leaves visible breathing room instead of brushing the collision body",
  );
  assert.ok(
    longestStop < 1,
    "Tour does not wait at the obstacle before rerouting",
  );
  assert.ok(
    totalTurn < Math.PI / 2,
    "Detours do not make the view swing repeatedly",
  );
  assert.ok(
    maximumTurnRate <= 0.101,
    "Automatic view rotates at no more than six degrees per second",
  );
  assert.ok(
    maximumPitch - minimumPitch < 1e-6,
    "Automatic mode does not add periodic pitch motion",
  );
  console.log(
    "PASS comfortable detour",
    JSON.stringify({
      speed,
      fps: Math.round(1 / dt),
      minimumClearance,
      longestStop,
      totalTurn,
      maximumTurnRate,
    }),
  );
}

obstacles.rockColliders = [];
const leftView = new T.PerspectiveCamera(),
  rightView = new T.PerspectiveCamera();
const leftWalker = new FirstPersonController(
  leftView,
  element as unknown as HTMLElement,
  obstacleWorld,
);
const rightWalker = new FirstPersonController(
  rightView,
  element as unknown as HTMLElement,
  obstacleWorld,
);
leftView.position.set(1, 3, 10);
rightView.position.set(8, 3, 10);
leftWalker.startTour();
rightWalker.startTour();
leftWalker.update(1 / 60, 0);
rightWalker.update(1 / 60, 0);
assert.ok(
  leftView.quaternion.angleTo(rightView.quaternion) < 1e-7,
  "Moving sideways around obstacles must not change where the automatic camera looks",
);
console.log(
  "PASS: automatic view follows the road, independently of lateral detours.",
);
