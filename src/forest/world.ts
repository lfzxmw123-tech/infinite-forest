import { railwayEnabled, railClearance, railY } from "../train/RailwayPath";
export const SEED = 271828;
export const CHUNK_SIZE = 40;
export function hash(x: number, z: number, s = SEED): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ s;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (v: number) => v * v * (3 - 2 * v);
export function noise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = smooth(x - ix),
    fz = smooth(z - iz);
  return (
    (hash(ix, iz) * (1 - fx) + hash(ix + 1, iz) * fx) * (1 - fz) +
    (hash(ix, iz + 1) * (1 - fx) + hash(ix + 1, iz + 1) * fx) * fz
  );
}
export function streamX(z: number): number {
  return Math.sin(z * 0.023) * 10 + Math.sin(z * 0.061) * 3;
}
export function heightAt(x: number, z: number): number {
  const d = Math.abs(x - streamX(z));
  const n =
    noise(x * 0.025, z * 0.025) * 2.1 + noise(x * 0.105, z * 0.105) * 0.4;
  const original = 0.3 + n - 3.6 * Math.exp((-d * d) / 16);
  if (!railwayEnabled()) return original;
  const distance = railClearance(x, z);
  // Fade grading into river banks; a bridge carries the track over preserved water beds.
  if (distance >= 6) return original;
  const bank = smooth(
    Math.min(1, Math.max(0, (Math.abs(x - streamX(z)) - 2.5) / 2.5)),
  );
  const weight =
    (1 - smooth(Math.min(1, Math.max(0, (distance - 2) / 4)))) * bank;
  return original + (railY(z) - 0.27 - original) * weight;
}
export interface TreePlacement {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  variant: number;
  radius: number;
}
export function treesForChunk(cx: number, cz: number): TreePlacement[] {
  const result: TreePlacement[] = [];
  for (let a = 0; a < 5; a++)
    for (let b = 0; b < 5; b++) {
      const gx = cx * 5 + a,
        gz = cz * 5 + b;
      const x = gx * 8 + 1 + hash(gx, gz, 9) * 6,
        z = gz * 8 + 1 + hash(gx, gz, 19) * 6;
      if (
        Math.abs(x - streamX(z)) < 5.8 ||
        hash(gx, gz, 3) < 0.12 ||
        (railwayEnabled() && railClearance(x, z) < 4.4)
      )
        continue;
      const scale = 0.76 + hash(gx, gz, 29) * 0.7;
      result.push({
        x,
        z,
        scale,
        rotation: hash(gx, gz, 7) * Math.PI * 2,
        variant: Math.floor(hash(gx, gz, 47) * 3),
        radius: scale * 0.72,
      });
    }
  return result;
}
export function desiredChunks(
  x: number,
  z: number,
  radius: number,
): [number, number][] {
  const cx = Math.floor(x / CHUNK_SIZE),
    cz = Math.floor(z / CHUNK_SIZE);
  const out: [number, number][] = [];
  for (let a = -radius; a <= radius; a++)
    for (let b = -radius; b <= radius; b++) out.push([cx + a, cz + b]);
  return out.sort(
    (a, b) =>
      (a[0] - cx) ** 2 +
      (a[1] - cz) ** 2 -
      ((b[0] - cx) ** 2 + (b[1] - cz) ** 2),
  );
}
