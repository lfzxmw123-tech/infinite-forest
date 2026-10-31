import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { createCanvas } from "@napi-rs/canvas";
import * as T from "three/webgpu";
import { createAssets } from "../src/forest/Assets";
import { ForestGenerator } from "../src/forest/ForestGenerator";
import { FirstPersonController } from "../src/controls/FirstPersonController";
import { TrainManager } from "../src/train/TrainManager";
import { AnimalManager } from "../src/animals/AnimalManager";
const browser = new Window({
  settings: {
    disableJavaScriptEvaluation: true,
    disableCSSFileLoading: true,
    disableJavaScriptFileLoading: true,
  },
});
const doc = browser.document;
doc.write(readFileSync(new URL("../index.html", import.meta.url), "utf8"));
const create = doc.createElement.bind(doc);
doc.createElement = ((name: string, ...args: any[]) =>
  name === "canvas" ? createCanvas(64, 64) : create(name, ...args)) as any;
const parameter = {
  value: 0,
  setTargetAtTime() {},
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
};
class Audio {
  state = "running";
  sampleRate = 32;
  currentTime = 0;
  destination = {};
  createGain() {
    return { gain: { ...parameter }, connect() {} };
  }
  createBuffer() {
    return {
      getChannelData() {
        return new Float32Array(64);
      },
    };
  }
  createBufferSource() {
    return { connect() {}, start() {}, stop() {} };
  }
  createBiquadFilter() {
    return { frequency: { ...parameter }, connect() {} };
  }
  createOscillator() {
    return { frequency: { ...parameter }, connect() {}, start() {}, stop() {} };
  }
  async resume() {}
  async close() {}
}
Object.assign(globalThis, {
  window: browser,
  document: doc,
  Element: browser.Element,
  AudioContext: Audio,
  ImageBitmap: class {},
  matchMedia: () => ({ matches: false }),
});
const scene = new T.Scene(),
  view = new T.PerspectiveCamera(),
  assets = createAssets(),
  forest = new ForestGenerator(scene, assets);
const input = create("div");
const walker = new FirstPersonController(
  view,
  input as unknown as HTMLElement,
  forest,
);
forest.update(view.position.x, view.position.z, true);
for (let i = 0; i < 30; i++) forest.update(view.position.x, view.position.z);
const ecosystem = new AnimalManager(scene, forest);
ecosystem.update(0.1, view.position);
const initialAnimals = ecosystem.count;
const manager = new TrainManager(
  scene,
  view,
  walker,
  forest,
  doc.getElementById("train-panel") as unknown as HTMLElement,
);
manager.onHorn = () =>
  ecosystem.reactToTrain(manager.focus, manager.physics.speed, true);
const events: boolean[] = [];
manager.onModeChange = (active) => events.push(active);
manager.enter();
assert.equal(manager.active, true);
assert.equal(manager.cameras.mode, "window");
assert.ok(manager.physics.throttle > 0, "boarding automatically starts the train");
assert.equal(walker.suspended, true);
assert.equal(doc.getElementById("train-panel")!.hidden, false);
const panel = doc.getElementById("train-panel")!;
assert.ok(
  panel.classList.contains("expanded"),
  "boarding previews the controls",
);
await new Promise((resolve) => setTimeout(resolve, 2100));
assert.ok(
  panel.classList.contains("expanded"),
  "preview waits for the camera transition",
);
for (let i = 0; i < 120; i++) manager.update(1 / 60, i / 60);
assert.ok(manager.cameras.settled);
assert.ok(
  panel.classList.contains("expanded"),
  "controls remain visible when camera settles",
);
await new Promise((resolve) => setTimeout(resolve, 2100));
assert.ok(
  !panel.classList.contains("expanded"),
  "preview collapses two seconds after camera settles",
);
panel.dispatchEvent(
  new browser.PointerEvent("pointerenter", { pointerType: "mouse" }),
);
assert.ok(panel.classList.contains("expanded"));
const horn = panel.querySelector<HTMLButtonElement>('[data-train="horn"]')!;
horn.focus();
horn.click();
assert.ok(
  panel.classList.contains("expanded"),
  "clicking a control must keep the panel open",
);
horn.blur();
assert.ok(
  panel.classList.contains("expanded"),
  "losing button focus while hovered must keep the panel open",
);
panel.dispatchEvent(
  new browser.PointerEvent("pointerleave", { pointerType: "mouse" }),
);
assert.ok(
  !panel.classList.contains("expanded"),
  "leaving the panel must collapse it",
);

assert.ok(manager.physics.speed > 0, "train accelerates automatically without keyboard input");
doc.getElementById("train-enter")!.focus();
doc.getElementById("train-enter")!.dispatchEvent(
  new browser.KeyboardEvent("keydown", {
    code: "KeyR",
    bubbles: true,
    cancelable: true,
  }),
);
assert.ok(
  manager.physics.throttle > 0,
  "Keyboard controls still work if a boarding button retains focus",
);
for (let i = 0; i < 900; i++) {
  manager.update(1 / 60, i / 60);
  forest.update(manager.focus.x, manager.focus.z);
  ecosystem.reactToTrain(manager.focus, manager.physics.speed);
  ecosystem.update(1 / 60, manager.focus);
}
assert.ok(manager.physics.speed > 3);
assert.equal(manager.railway.active.size, 9);
assert.equal(ecosystem.maxAnimals, 64);
assert.ok(initialAnimals > 0 && ecosystem.count > 0);
for (const unit of manager.model.units) {
  const p = manager.railway.path.advance(manager.parameter, -unit.offset),
    expected = manager.railway.path.sample(p);
  assert.ok(
    expected.distanceTo(unit.group.position) < 1e-8,
    "Every coach remains on the railway",
  );
  const forward = new T.Vector3(0, 0, -1).applyQuaternion(
    unit.group.quaternion,
  );
  assert.ok(
    forward.dot(manager.railway.path.tangent(p)) > 0.999999,
    "Coach follows the local tangent",
  );
}
(doc.querySelector('[data-train="camera"]') as any).click();
assert.equal(manager.cameras.mode, "follow");
(doc.querySelector('[data-train="camera"]') as any).click();
assert.equal(manager.cameras.mode, "cab");
manager.horn();
const oldVelocityY = walker.velocityY;
doc.body.dispatchEvent(
  new browser.KeyboardEvent("keydown", {
    code: "Space",
    bubbles: true,
    cancelable: true,
  }),
);
assert.equal(manager.physics.emergency, true);
assert.equal(
  walker.velocityY,
  oldVelocityY,
  "Train brake does not trigger a player jump",
);
manager.requestExit();
for (let i = 0; i < 900 && manager.active; i++)
  manager.update(1 / 60, 20 + i / 60);
assert.equal(manager.active, false);
assert.equal(manager.physics.speed, 0);
assert.equal(walker.suspended, false);
assert.equal(walker.started, true);
assert.equal(walker.active, false);
assert.equal(doc.getElementById("train-panel")!.hidden, true);
assert.ok(
  !forest.collides(view.position.x, view.position.z, 0.32),
  "Exit places walker on clear ground",
);
assert.deepEqual(events, [true, false]);
manager.enter();
assert.equal(manager.active, true);
assert.equal(manager.railway.active.size, 9);
manager.requestExit();
assert.equal(manager.active, false);
manager.dispose();
console.log(
  "PASS train integration: actual HTML panel bindings, boarding, controls isolated from walking, physical rail following for all coaches, existing animal ecology, UI camera switching, safe braking before exit, walking restored and repeated boarding.",
);
await browser.happyDOM.abort();
browser.close();
