import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import * as T from "three/webgpu";
import { createAssets } from "../src/forest/Assets";
import { TrainModel } from "../src/train/TrainModel";
import { RailwayGenerator } from "../src/train/RailwayGenerator";
import { TrainEffects } from "../src/train/TrainEffects";
import { AnimalManager } from "../src/animals/AnimalManager";
import { ForestGenerator } from "../src/forest/ForestGenerator";
import { Atmosphere } from "../src/effects/Atmosphere";
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
  ImageBitmap: class ImageBitmap {},
});
const assets = createAssets(),
  scene = new T.Scene();
new Atmosphere(scene);
new AnimalManager(scene, new ForestGenerator(scene, assets));
const train = new TrainModel();
scene.add(train.root);
train.animate(1, 4, 1);
const rails = new RailwayGenerator(scene);
rails.update(350, true);
new TrainEffects(scene);
const objects: T.Object3D[] = [
  new T.InstancedMesh(assets.treeGeos[0].foliage, assets.leafMat, 3),
  new T.InstancedMesh(assets.treeGeos[0].wood, assets.barkMat, 3),
  new T.InstancedMesh(assets.grass, assets.grassMat, 3),
  new T.InstancedMesh(assets.fern, assets.grassMat, 3),
  new T.Mesh(new T.PlaneGeometry(40, 40, 2, 2), assets.terrainMat),
  new T.Mesh(new T.PlaneGeometry(10, 40, 2, 2), assets.waterMat),
];
scene.traverse((o) => {
  if ((o as T.Mesh).material) objects.push(o);
});
const lights: T.Light[] = [];
scene.traverse((object) => {
  if ((object as T.Light).isLight) lights.push(object as T.Light);
});
for (const forceWebGL of [false, true]) {
  const canvas = createCanvas(32, 32) as any;
  canvas.style = {};
  canvas.addEventListener = () => {};
  const renderer = new T.WebGPURenderer({ canvas, forceWebGL });
  // Compilation-only harness; no graphics device or browser is available here.
  renderer.hasFeature = () => false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const materialTypes = new Set<string>();
  const compiled = new Set<string>();
  for (const object of objects) {
    (object as T.Mesh).receiveShadow = true;
    const material = (object as T.Mesh).material as T.NodeMaterial;
    const mesh = object as T.InstancedMesh;
    const geometry = (object as T.Mesh).geometry;
    const signature = [
      material.uuid,
      object.type,
      Boolean(mesh.isInstancedMesh),
      Boolean(mesh.instanceColor),
      ...Object.entries(geometry.attributes).map(
        ([name, attribute]) =>
          `${name}:${attribute.itemSize}:${Boolean((attribute as T.InstancedBufferAttribute).isInstancedBufferAttribute)}`,
      ),
    ].join("|");
    if (compiled.has(signature)) continue;
    compiled.add(signature);
    const builder = (renderer.backend as any).createNodeBuilder(
      object,
      renderer,
    );
    builder.camera = new T.PerspectiveCamera();
    builder.scene = scene;
    builder.lightsNode = renderer.lighting.createNode(lights);
    builder.build();
    assert.ok(builder.vertexShader.length > 100);
    assert.ok(builder.fragmentShader.length > 100);
    assert.ok(!/\b(?:NaN|Infinity|undefined)\b/.test(builder.vertexShader));
    materialTypes.add(material.type);
  }
  console.log(
    `PASS ${forceWebGL ? "GLSL / WebGL2" : "WGSL / WebGPU"}: ${compiled.size} distinct shader combinations (${objects.length} scene objects) (${[...materialTypes].join(", ")})`,
  );
}
