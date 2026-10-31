import * as T from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { random } from "./world";
import {
  positionLocal,
  positionWorld,
  uniform,
  sin,
  vec3,
  float,
  color,
  mix,
} from "three/tsl";
export const clockUniform = uniform(0),
  windUniform = uniform(0.7),
  nightUniform = uniform(0);
export const trainPositionUniform = uniform(new T.Vector3(0, -1000, 0)),
  trainSpeedUniform = uniform(0);
function canvasTexture(
  w: number,
  h: number,
  paint: (c: CanvasRenderingContext2D) => void,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function createAssets() {
  const rng = random(271828);
  const bark = canvasTexture(256, 512, (c) => {
    c.fillStyle = "#514b37";
    c.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 16000; i++) {
      let x = rng() * 256,
        y = rng() * 512;
      const v = 32 + rng() * 65;
      c.fillStyle = `rgba(${v + 7},${v + 4},${v - 4},${0.2 + rng() * 0.4})`;
      c.fillRect(x, y, 0.5 + rng() * 3, 3 + rng() * 55);
    }
    for (let i = 0; i < 85; i++) {
      const x = rng() * 256;
      c.strokeStyle = "#1d241bbc";
      c.lineWidth = 0.5 + rng() * 2;
      c.beginPath();
      c.moveTo(x, 0);
      for (let y = 0; y < 540; y += 15)
        c.lineTo(x + Math.sin(y * 0.025 + i) * 2, y);
      c.stroke();
    }
  });
  bark.wrapS = bark.wrapT = T.RepeatWrapping;
  bark.repeat.set(2, 3);
  const leaf = canvasTexture(128, 128, (c) => {
    for (let i = 0; i < 26; i++) {
      const x = 15 + rng() * 98,
        y = 12 + rng() * 100,
        a = rng() * 6.28;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = ["#879d39", "#526e2d", "#adc15a", "#37582c", "#6a8b35"][
        i % 5
      ];
      c.beginPath();
      c.moveTo(0, -13);
      c.bezierCurveTo(12, -7, 10, 8, 0, 14);
      c.bezierCurveTo(-9, 7, -11, -6, 0, -13);
      c.fill();
      c.strokeStyle = "#b7c57b66";
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(0, -12);
      c.lineTo(0, 12);
      c.stroke();
      c.restore();
    }
  });
  const soil = canvasTexture(256, 256, (c) => {
    c.fillStyle = "#4e5634";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 20000; i++) {
      const v = rng() * 65;
      c.fillStyle = `rgba(${40 + v},${43 + v},${22 + v * 0.6},.45)`;
      c.fillRect(rng() * 256, rng() * 256, 1 + rng() * 4, 1 + rng() * 3);
    }
    for (let i = 0; i < 400; i++) {
      c.save();
      c.translate(rng() * 256, rng() * 256);
      c.rotate(rng() * 6.28);
      c.fillStyle = i % 3 === 0 ? "#74603b" : "#85834a";
      c.beginPath();
      c.ellipse(0, 0, 1.5, 3.8, 0, 0, 6.28);
      c.fill();
      c.restore();
    }
  });
  soil.wrapS = soil.wrapT = T.RepeatWrapping;
  soil.repeat.set(20, 20);
  const barkMat = new T.MeshStandardNodeMaterial({
    map: bark,
    roughness: 1,
    color: 0xb1ad88,
  });
  const leafMat = new T.MeshStandardNodeMaterial({
    map: leaf,
    alphaTest: 0.36,
    side: T.DoubleSide,
    roughness: 0.86,
    color: 0xadb981,
  });
  // Local height weights keep roots fixed. World phase gives each instance its own gust.
  const phase = positionWorld.x.mul(0.18).add(positionWorld.z.mul(0.11));
  const trainOffset = positionWorld.xz.sub(trainPositionUniform.xz);
  const trainGust = trainOffset
    .dot(trainOffset)
    .div(324)
    .oneMinus()
    .max(0)
    .pow(2)
    .mul(trainSpeedUniform)
    .mul(0.055)
    .mul(sin(clockUniform.mul(11).add(phase)));
  const gust = sin(clockUniform.mul(sin(phase).mul(0.18).add(1.1)).add(phase))
    .mul(0.65)
    .add(sin(clockUniform.mul(2.3).add(positionLocal.x.mul(1.7))).mul(0.35));
  const leafWind = gust.mul(windUniform).add(trainGust);
  leafMat.positionNode = positionLocal.add(
    vec3(
      leafWind.mul(positionLocal.y.div(22).pow(2)).mul(0.55),
      sin(clockUniform.add(phase)).mul(0.055).mul(windUniform),
      leafWind.mul(0.18),
    ),
  );
  barkMat.positionNode = positionLocal.add(
    vec3(
      gust.mul(windUniform).mul(positionLocal.y.div(22).pow(3)).mul(0.18),
      0,
      0,
    ),
  );
  const grassMat = new T.MeshStandardNodeMaterial({
    side: T.DoubleSide,
    roughness: 1,
    vertexColors: true,
  });
  grassMat.positionNode = positionLocal.add(
    vec3(
      sin(clockUniform.mul(1.8).add(phase).add(positionLocal.y.mul(2)))
        .mul(windUniform)
        .add(trainGust)
        .mul(positionLocal.y.pow(2))
        .mul(0.32),
      0,
      sin(clockUniform.mul(1.3).add(phase))
        .mul(positionLocal.y.pow(2))
        .mul(windUniform)
        .mul(0.2),
    ),
  );
  const terrainMat = new T.MeshStandardNodeMaterial({
    map: soil,
    vertexColors: true,
    roughness: 1,
  });
  const rockMat = new T.MeshStandardNodeMaterial({
    color: 0x656c55,
    roughness: 1,
    vertexColors: true,
  });
  const waterMat = new T.MeshStandardNodeMaterial({
    color: 0x708f7d,
    metalness: 0.55,
    roughness: 0.22,
    transparent: true,
    opacity: 0.83,
    side: T.DoubleSide,
  });
  const wave = sin(positionWorld.z.mul(3).add(clockUniform.mul(2)))
    .mul(0.018)
    .add(sin(positionWorld.x.mul(5).sub(clockUniform.mul(1.7))).mul(0.012));
  waterMat.positionNode = positionLocal.add(vec3(0, wave, 0));
  waterMat.colorNode = mix(
    color("#254c45"),
    color("#b0c1a0"),
    sin(
      positionWorld.z
        .mul(12)
        .add(positionWorld.x.mul(4))
        .sub(clockUniform.mul(2.5)),
    )
      .mul(0.5)
      .add(0.5)
      .pow(float(14))
      .mul(0.55),
  );
  const treeGeos = Array.from({ length: 3 }, (_, i) => makeTree(i));
  const grass = makeGrass(),
    fern = makeFern();
  const rock = new T.IcosahedronGeometry(1, 2);
  const p = rock.attributes.position,
    co = [];
  for (let i = 0; i < p.count; i++) {
    const k = 0.87 + rng() * 0.25;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    const v = 0.6 + rng() * 0.4;
    co.push(v * 0.85, v, v * 0.73);
  }
  rock.setAttribute("color", new T.Float32BufferAttribute(co, 3));
  rock.computeVertexNormals();
  return {
    barkMat,
    leafMat,
    grassMat,
    terrainMat,
    rockMat,
    waterMat,
    treeGeos,
    grass,
    fern,
    rock,
    leaf,
  };
}
export type Assets = ReturnType<typeof createAssets>;
function cylinderBetween(a: T.Vector3, b: T.Vector3, r1: number, r2: number) {
  const dir = b.clone().sub(a),
    g = new T.CylinderGeometry(r2, r1, dir.length(), 7, 3);
  g.applyQuaternion(
    new T.Quaternion().setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      dir.normalize(),
    ),
  );
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
function makeTree(seed: number) {
  const r = random(719 + seed * 81),
    branches: T.BufferGeometry[] = [],
    leaves: T.BufferGeometry[] = [];
  const height = 20 + r() * 3;
  const trunk = new T.CylinderGeometry(0.17, 0.78, height, 11, 16);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + height / 2,
      angle = Math.atan2(p.getZ(i), p.getX(i));
    const root = 1 + Math.exp(-y * 0.9) * (0.6 + Math.sin(angle * 5) * 0.35);
    p.setXYZ(
      i,
      p.getX(i) * root + Math.sin(y * 0.17 + seed) * y * 0.018,
      y,
      p.getZ(i) * root + Math.cos(y * 0.21) * y * 0.012,
    );
  }
  trunk.computeVertexNormals();
  branches.push(trunk);
  for (let i = 0; i < 19; i++) {
    const angle = i * 2.399 + seed,
      level = 9 + i * 0.62,
      len = (1 - i / 27) * (3 + r() * 3);
    const a = new T.Vector3(
        Math.sin(level * 0.17 + seed) * level * 0.018,
        level,
        Math.cos(level * 0.21) * level * 0.012,
      ),
      b = new T.Vector3(
        Math.cos(angle) * len,
        level + 1 + r() * 2,
        Math.sin(angle) * len,
      );
    branches.push(cylinderBetween(a, b, 0.16 * (1 - i / 28), 0.025));
    for (let j = 0; j < 3; j++) {
      const along = 0.35 + j * 0.29;
      const c = a.clone().lerp(b, along);
      c.y += 0.3;
      const tip = c
        .clone()
        .add(
          new T.Vector3(
            Math.cos(angle + j) * 1.4,
            0.8 + r(),
            Math.sin(angle + j) * 1.4,
          ),
        );
      branches.push(cylinderBetween(c, tip, 0.045, 0.007));
      for (let k = 0; k < 12; k++) {
        const pos = c.clone().lerp(tip, r());
        pos.add(
          new T.Vector3(
            (r() - 0.5) * 2.9,
            (r() - 0.5) * 1.1,
            (r() - 0.5) * 2.9,
          ),
        );
        const g = new T.PlaneGeometry(1.1 + r() * 1.5, 0.8 + r());
        g.rotateX(-Math.PI / 2 + (r() - 0.5) * 1.7);
        g.rotateY(r() * 6.28);
        g.rotateZ((r() - 0.5) * 0.8);
        g.translate(pos.x, pos.y, pos.z);
        leaves.push(g);
      }
    }
  }
  // Buttress roots spread into the soil.
  for (let i = 0; i < 7; i++) {
    const a = (i * 6.28) / 7;
    branches.push(
      cylinderBetween(
        new T.Vector3(Math.cos(a) * 1.9, -0.15, Math.sin(a) * 1.9),
        new T.Vector3(Math.cos(a) * 0.3, 1.8, Math.sin(a) * 0.3),
        0.12,
        0.35,
      ),
    );
  }
  const wood = mergeGeometries(branches),
    foliage = mergeGeometries(leaves);
  const lowWood = mergeGeometries(
    branches.filter((_, i) => i === 0 || i % 4 === 1),
  );
  const lowFoliage = mergeGeometries(
    leaves
      .filter((_, i) => i % 3 === 0)
      .map((g) => {
        const copy = g.clone();
        const center = new T.Vector3();
        copy.computeBoundingBox();
        copy.boundingBox!.getCenter(center);
        copy.translate(-center.x, -center.y, -center.z);
        copy.scale(1.5, 1, 1.5);
        copy.translate(center.x, center.y, center.z);
        return copy;
      }),
  );
  branches.forEach((g) => g.dispose());
  leaves.forEach((g) => g.dispose());
  return { wood, foliage, lowWood, lowFoliage };
}
function makeGrass() {
  const pos: number[] = [],
    cols: number[] = [],
    idx: number[] = [];
  const r = random(52);
  for (let b = 0; b < 5; b++) {
    const a = r() * 6.28,
      x = (r() - 0.5) * 0.22,
      z = (r() - 0.5) * 0.22,
      h = 0.3 + r() * 0.55,
      w = 0.024 + r() * 0.035;
    const s = pos.length / 3;
    for (let k = 0; k < 4; k++) {
      const t = k / 3;
      for (let side = -1; side <= 1; side += 2) {
        pos.push(
          x + Math.cos(a) * w * (1 - t) * side + Math.sin(a) * t * t * 0.19,
          h * t,
          z + Math.sin(a) * w * (1 - t) * side + Math.cos(a) * t * t * 0.19,
        );
        cols.push(0.12 + t * 0.18, 0.22 + t * 0.17, 0.055 + t * 0.055);
      }
    }
    for (let k = 0; k < 3; k++) {
      const q = s + k * 2;
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function makeFern() {
  const gs: T.BufferGeometry[] = [];
  for (let f = 0; f < 7; f++) {
    const angle = f * 2.399;
    for (let j = 1; j < 9; j++) {
      const t = j / 9;
      for (const side of [-1, 1]) {
        const g = new T.PlaneGeometry((1 - t) * 0.34 + 0.05, 0.12);
        g.rotateX(-Math.PI / 2);
        g.rotateY(angle + side * 0.65);
        g.translate(
          Math.cos(angle) * t * 0.9 +
            Math.cos(angle + side * 1.3) * (1 - t) * 0.13,
          Math.sin(t * Math.PI * 0.9) * 0.55,
          Math.sin(angle) * t * 0.9 +
            Math.sin(angle + side * 1.3) * (1 - t) * 0.13,
        );
        gs.push(g);
      }
    }
  }
  const g = mergeGeometries(gs);
  gs.forEach((x) => x.dispose());
  const c = [];
  for (let i = 0; i < g.attributes.position.count; i++)
    c.push(0.13, 0.29, 0.075);
  g.setAttribute("color", new T.Float32BufferAttribute(c, 3));
  return g;
}
