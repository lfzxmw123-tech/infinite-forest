import * as T from "three/webgpu";
import {
  attribute,
  vec3,
  sin,
  cos,
  positionLocal,
  uv,
  float,
  color,
  mix,
  smoothstep,
  length,
} from "three/tsl";
import { clockUniform, nightUniform } from "../forest/Assets";
import { random, heightAt } from "../forest/world";
export class Atmosphere {
  sun = new T.DirectionalLight(0xffe3a7, 3);
  ambient = new T.HemisphereLight(0xbfcbb7, 0x293e21, 2);
  fog = new T.FogExp2(0x83947b, 0.022);
  time = 0.28;
  cycle = true;
  private shaftGroup = new T.Group();
  private mists: T.Mesh[] = [];
  private particles: T.Points;
  private leaves: T.InstancedMesh;
  private shafts: T.MeshBasicNodeMaterial;
  private mistMat: T.MeshBasicNodeMaterial;
  private rng = random(87);
  private temp = new T.Object3D();
  private sky = new T.Color();
  private daySky = new T.Color(0x879985);
  private darkSky = new T.Color(0x101d25);
  private warmSky = new T.Color(0x9c886d);
  private moonAmbient = new T.Color(0x6f8ba4);
  private sunset = new T.Color(0xffa25b);
  constructor(private scene: T.Scene) {
    scene.fog = this.fog;
    scene.background = new T.Color(0x83947b);
    scene.add(this.sun, this.sun.target, this.ambient);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -35,
      right: 35,
      top: 35,
      bottom: -35,
      near: 1,
      far: 110,
    });
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.08;
    const mistTexture = this.makeCloud();
    this.mistMat = new T.MeshBasicNodeMaterial({
      map: mistTexture,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: T.DoubleSide,
      color: 0xcbd3b5,
    });
    for (let i = 0; i < 18; i++) {
      const plane = new T.Mesh(
        new T.PlaneGeometry(18 + this.rng() * 28, 2 + this.rng() * 2),
        this.mistMat,
      );
      plane.rotation.y = this.rng() * Math.PI;
      plane.userData = {
        x: (this.rng() - 0.5) * 150,
        z: (this.rng() - 0.5) * 150,
        phase: this.rng() * 6.28,
      };
      this.mists.push(plane);
      scene.add(plane);
    }
    this.shafts = new T.MeshBasicNodeMaterial({
      transparent: true,
      opacity: 0.11,
      color: 0xffe8ac,
      side: T.DoubleSide,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    const radial = length(
      uv()
        .sub(0.5)
        .mul(vec3(2, 1, 1).xy),
    );
    this.shafts.opacityNode = smoothstep(float(0.03), float(0.5), radial)
      .oneMinus()
      .mul(0.12)
      .mul(nightUniform.oneMinus());
    for (let i = 0; i < 9; i++) {
      const cone = new T.Mesh(
        new T.CylinderGeometry(0.05, 2.1, 25, 16, 1, true),
        this.shafts,
      );
      cone.position.set((i % 3) * 12 - 14, 12, Math.floor(i / 3) * 19 - 40);
      cone.rotation.z = -0.39;
      cone.rotation.x = 0.23;
      this.shaftGroup.add(cone);
    }
    scene.add(this.shaftGroup);
    const geo = new T.BufferGeometry(),
      positions = [],
      phases = [],
      kinds = [];
    for (let i = 0; i < 380; i++) {
      positions.push(
        (this.rng() - 0.5) * 110,
        i < 100 ? 0.7 + this.rng() * 2.8 : this.rng() * 13,
        (this.rng() - 0.5) * 110,
      );
      phases.push(this.rng() * 6.28);
      kinds.push(i < 100 ? 1 : 0);
    }
    geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute("phase", new T.Float32BufferAttribute(phases, 1));
    geo.setAttribute("kind", new T.Float32BufferAttribute(kinds, 1));
    const pm = new T.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      sizeAttenuation: true,
      size: 0.045,
    });
    const phase = attribute("phase", "float"),
      kind = attribute("kind", "float");
    pm.positionNode = positionLocal.add(
      vec3(
        sin(clockUniform.mul(0.3).add(phase)).mul(1.8),
        sin(clockUniform.mul(0.55).add(phase)).mul(0.7),
        cos(clockUniform.mul(0.2).add(phase)).mul(1.3),
      ),
    );
    pm.colorNode = mix(color("#e7d9af"), color("#d7ff64"), kind);
    pm.opacityNode = mix(
      float(0.4),
      sin(clockUniform.mul(1.5).add(phase))
        .mul(0.35)
        .add(0.6)
        .mul(nightUniform.mul(0.8).add(0.25)),
      kind,
    );
    this.particles = new T.Points(geo, pm);
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    const leafMaterial = new T.MeshStandardNodeMaterial({
      color: 0x9e8347,
      side: T.DoubleSide,
      roughness: 1,
    });
    const leafGeo = new T.CircleGeometry(0.07, 6);
    leafGeo.scale(1, 2.1, 1);
    this.leaves = new T.InstancedMesh(leafGeo, leafMaterial, 55);
    this.leaves.frustumCulled = false;
    scene.add(this.leaves);
  }
  private makeCloud() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 30; i++) {
      const x = this.rng() * 256,
        y = 30 + this.rng() * 68,
        r = 20 + this.rng() * 55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,.13)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 128);
    }
    return new T.CanvasTexture(c);
  }
  update(dt: number, t: number, camera: T.Camera) {
    if (this.cycle) this.time = (this.time + dt / 1100) % 1;
    const day = Math.max(0, Math.sin(((this.time - 0.18) / 0.62) * Math.PI)),
      dusk = Math.max(0, 1 - Math.abs(this.time - 0.71) * 12);
    const night = 1 - T.MathUtils.smoothstep(day, 0, 0.32);
    nightUniform.value = night;
    const sky = this.sky
      .copy(this.daySky)
      .lerp(this.warmSky, dusk * 0.65)
      .lerp(this.darkSky, night);
    this.fog.color.copy(sky);
    (this.scene.background as T.Color).copy(sky);
    this.fog.density = 0.018 + night * 0.009;
    this.ambient.intensity = 0.6 + day * 1.65;
    this.ambient.color.set(0xc9d4bf).lerp(this.moonAmbient, night);
    this.sun.intensity = day * 3.5 + 0.05;
    this.sun.color.set(0xffe5b0).lerp(this.sunset, dusk);
    const p = camera.position;
    this.sun.position.set(
      p.x + 25 * Math.cos(this.time * 6.28),
      8 + day * 46,
      p.z - 38,
    );
    this.sun.target.position.set(p.x, 0, p.z - 10);
    this.shaftGroup.position.set(
      Math.floor(p.x / 40) * 40,
      0,
      Math.floor(p.z / 40) * 40,
    );
    this.shaftGroup.visible = night < 0.7;
    this.mistMat.opacity = 0.065 + night * 0.025;
    for (const m of this.mists) {
      const d = m.userData;
      const x = p.x + ((((d.x - p.x + t * 0.16) % 150) + 150) % 150) - 75,
        z = p.z + ((((d.z - p.z + t * 0.07) % 150) + 150) % 150) - 75;
      m.position.set(
        x,
        Math.max(0.4, heightAt(x, z)) +
          0.7 +
          Math.sin(t * 0.13 + d.phase) * 0.2,
        z,
      );
    }
    this.particles.position.set(
      Math.floor(p.x / 40) * 40,
      0,
      Math.floor(p.z / 40) * 40,
    );
    for (let i = 0; i < 55; i++) {
      const phase = i * 2.399;
      const x = p.x + ((((i * 17.71 - p.x + t * 0.35) % 75) + 75) % 75) - 37.5,
        z = p.z + ((((i * 13.31 - p.z + t * 0.2) % 75) + 75) % 75) - 37.5;
      const y = 13 - ((t * 0.38 + i * 1.7) % 13);
      this.temp.position.set(
        x + Math.sin(t * 0.8 + phase),
        Math.max(heightAt(x, z) + 0.2, y),
        z + Math.cos(t + phase) * 0.4,
      );
      this.temp.rotation.set(
        t * 0.7 + phase,
        t * 0.3 + phase,
        Math.sin(t + phase),
      );
      this.temp.scale.setScalar(0.7 + (i % 3) * 0.35);
      this.temp.updateMatrix();
      this.leaves.setMatrixAt(i, this.temp.matrix);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
  }
  get label() {
    return this.time < 0.2
      ? "夜晚"
      : this.time < 0.39
        ? "清晨"
        : this.time < 0.64
          ? "日间"
          : this.time < 0.8
            ? "黄昏"
            : "夜晚";
  }
}
