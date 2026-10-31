import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import * as T from "three/webgpu";
import {
  RailwayPath,
  railX,
  railY,
  enableRailway,
  tunnelBlend,
} from "../src/train/RailwayPath";
import { RailwayGenerator } from "../src/train/RailwayGenerator";
import { TrainPhysics } from "../src/train/TrainPhysics";
import { TrainModel } from "../src/train/TrainModel";
import { TrainCamera } from "../src/train/TrainCamera";
import { heightAt, streamX, treesForChunk } from "../src/forest/world";
const route = new RailwayPath(),
  a = new T.Vector3(),
  b = new T.Vector3();
for (let p = -1000; p < 3000; p += 3.73) {
  route.sample(p, a);
  assert.ok(Math.abs(a.x - railX(a.z)) < 1e-9);
  assert.ok(Math.abs(a.y - railY(a.z)) < 1e-9);
  assert.ok(Math.abs(route.tangent(p, b).y) < 0.04, "Gentle railway grades");
  const next = route.advance(p, 1);
  route.sample(next, b);
  assert.ok(
    Math.abs(a.distanceTo(b) - 1) < 0.002,
    "Physical speed follows curve arc length",
  );
}
for (let i = -20; i < 80; i++) {
  route.sample(i * 32 - 1e-6, a);
  route.sample(i * 32 + 1e-6, b);
  assert.ok(a.distanceTo(b) < 0.00001, "Continuous rail chunk boundary");
  const left = route.tangent(i * 32 - 0.001, new T.Vector3()),
    right = route.tangent(i * 32 + 0.001, new T.Vector3());
  assert.ok(left.dot(right) > 0.999999, "Continuous tangent at rail seam");
}
assert.ok(route.cachedSegments <= 32);
const physics = new TrainPhysics();
physics.restart();
let previous = 0;
for (let i = 0; i < 2400; i++) {
  physics.update(1 / 60);
  assert.ok(
    Math.abs(physics.speed - previous) < 0.02,
    "Acceleration remains smooth",
  );
  previous = physics.speed;
}
assert.ok(Math.abs(physics.speed - physics.throttle * physics.maxSpeed) < 0.1);
const distance = physics.distance;
physics.brake();
for (let i = 0; i < 600; i++) {
  physics.update(1 / 60);
  assert.ok(physics.speed >= 0);
}
assert.equal(physics.speed, 0);
assert.ok(physics.distance > distance);
assert.equal(physics.state, "静止");
physics.restart();
physics.update(1 / 60);
assert.ok(physics.speed > 0);
enableRailway();
let bridges = 0;
for (let p = 0; p < 2000; p += 2) {
  route.sample(p, a);
  if (Math.abs(a.x - streamX(a.z)) < 5) {
    bridges++;
    assert.ok(heightAt(a.x, a.z) < a.y, "River remains under the bridge");
  } else
    assert.ok(
      Math.abs(heightAt(a.x, a.z) - (a.y - 0.27)) < 1e-8,
      "Track bed follows the rail grade",
    );
}
assert.ok(bridges > 10);
for (let cx = -3; cx < 3; cx++)
  for (let cz = -10; cz < 10; cz++)
    for (const tree of treesForChunk(cx, cz))
      assert.ok(
        Math.abs(tree.x - railX(tree.z)) >= 4.4,
        "Rail corridor excludes tree trunks",
      );
const scene = new T.Scene(),
  rails = new RailwayGenerator(scene);
rails.update(0, true);
const pool = new Set(rails.active.values());
for (let p = 0; p <= 4000; p += 32) {
  rails.update(p, true);
  assert.equal(rails.active.size, 9);
  assert.ok(scene.children.length <= 9);
  for (const chunk of rails.active.values()) {
    assert.ok(pool.has(chunk));
    assert.equal(chunk.rails.count, 64);
    assert.equal(chunk.sleepers.count, 40);
    assert.ok(chunk.guards.count <= 16);
  }
}
assert.ok(rails.recycled > 100);
assert.ok(rails.path.cachedSegments <= 32);
assert.ok(
  tunnelBlend(350) > 0.99 && tunnelBlend(300) === 0 && tunnelBlend(400) === 0,
);
const model = new TrainModel();
assert.equal(model.units.length, 4);
for (const unit of model.units)
  for (const x of unit.wheelX)
    assert.ok(
      Math.abs(Math.abs(x) - 0.78) < 0.1,
      "Wheel tread aligns with the steel rail gauge",
    );
assert.equal(model.units[1].group.children[0] instanceof T.Mesh, true);
model.animate(1, 3, 1);
const before = new T.Matrix4();
model.units[0].wheels.getMatrixAt(0, before);
model.animate(2, 3, 2);
const after = new T.Matrix4();
model.units[0].wheels.getMatrixAt(0, after);
assert.ok(!before.equals(after), "Wheels animate from physical distance");
const view = new T.PerspectiveCamera(),
  camera = new TrainCamera(view, route);
view.position.set(20, 4, 20);
camera.beginTransition();
for (let i = 0; i < 180; i++) camera.update(1 / 60, 30);
for (const mode of ["window", "follow", "cab"] as const) {
  const oldPosition = view.position.clone(),
    oldRotation = view.quaternion.clone();
  camera.switch(mode);
  camera.update(1 / 60, 30);
  assert.ok(
    view.position.distanceTo(oldPosition) < 0.1,
    "Camera switches do not jump",
  );
  assert.ok(oldRotation.angleTo(view.quaternion) < 0.01);
  for (let i = 0; i < 180; i++) camera.update(1 / 60, 30);
  assert.ok(Number.isFinite(view.position.length()));
}
model.dispose();
rails.dispose();
assert.equal(scene.children.length, 0, "Rail objects fully released");
console.log(
  "PASS train: smooth acceleration and emergency stop, physical wheel motion, four cars, three smooth cameras, continuous Catmull-Rom path, gentle grades, clear corridor, river bridges, tunnel fade, 4 km bounded rail reuse/disposal.",
);
