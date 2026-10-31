import { CatmullRomCurve3, Vector3, MathUtils } from "three/webgpu";
export const RAIL_SEGMENT = 32;
let enabled = false;
export function enableRailway() {
  enabled = true;
}
export function railwayEnabled() {
  return enabled;
}
const controlX = (i: number) =>
  18 + 24 * Math.sin(-i * 32 * 0.003) + 6 * Math.sin(-i * 32 * 0.013);
const controlY = (i: number) =>
  1.9 + 0.55 * Math.sin(-i * 32 * 0.008) + 0.22 * Math.sin(-i * 32 * 0.025);
function interpolate(a: number, b: number, c: number, d: number, t: number) {
  const v0 = (c - a) * 0.5,
    v1 = (d - b) * 0.5;
  return (
    (2 * b - 2 * c + v0 + v1) * t * t * t +
    (-3 * b + 3 * c - 2 * v0 - v1) * t * t +
    v0 * t +
    b
  );
}
function sampleScalar(z: number, control: (i: number) => number) {
  const p = -z / 32,
    i = Math.floor(p),
    t = p - i;
  return interpolate(
    control(i - 1),
    control(i),
    control(i + 1),
    control(i + 2),
    t,
  );
}
export const railX = (z: number) => sampleScalar(z, controlX);
export const railY = (z: number) => sampleScalar(z, controlY);
export function railClearance(x: number, z: number) {
  return Math.abs(x - railX(z));
}
export function tunnelSection(parameter: number) {
  const i = Math.floor(parameter / 32),
    phase = ((i % 28) + 28) % 28;
  return phase === 10 || phase === 11;
}
export function tunnelBlend(parameter: number) {
  const phase = ((parameter % 896) + 896) % 896;
  return (
    MathUtils.smoothstep(phase, 320, 327) *
    (1 - MathUtils.smoothstep(phase, 377, 384))
  );
}
/** Each curve evaluates its middle span, so adjacent chunks share the same points AND derivatives. */
export class RailwayPath {
  private cache = new Map<number, CatmullRomCurve3>();
  private a = new Vector3();
  private b = new Vector3();
  sample(parameter: number, target = new Vector3()) {
    const index = Math.floor(parameter / 32),
      local = parameter / 32 - index;
    let curve = this.cache.get(index);
    if (!curve) {
      curve = new CatmullRomCurve3(
        [-1, 0, 1, 2].map((offset) => {
          const i = index + offset;
          return new Vector3(controlX(i), controlY(i), -i * 32);
        }),
        false,
        "catmullrom",
        0.5,
      );
      this.cache.set(index, curve);
      if (this.cache.size > 32)
        this.cache.delete(this.cache.keys().next().value!);
    }
    return curve.getPoint((1 + local) / 3, target);
  }
  tangent(parameter: number, target = new Vector3()) {
    this.sample(parameter - 0.05, this.a);
    this.sample(parameter + 0.05, this.b);
    return target.subVectors(this.b, this.a).normalize();
  }
  /** Convert metres along the actual curve into the z parameter used by streaming. */
  advance(parameter: number, metres: number) {
    const steps = Math.max(1, Math.ceil(Math.abs(metres) / 4)),
      step = metres / steps;
    for (let i = 0; i < steps; i++) {
      this.sample(parameter - 0.1, this.a);
      this.sample(parameter + 0.1, this.b);
      parameter += step / (this.a.distanceTo(this.b) / 0.2);
    }
    return parameter;
  }
  get cachedSegments() {
    return this.cache.size;
  }
}
