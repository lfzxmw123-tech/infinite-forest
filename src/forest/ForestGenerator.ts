import * as T from "three/webgpu";
import { Assets } from "./Assets";
import { ForestChunk } from "./ForestChunk";
import { desiredChunks, CHUNK_SIZE } from "./world";
export class ForestGenerator {
  active = new Map<string, ForestChunk>();
  pool: ForestChunk[] = [];
  pending: [number, number][] = [];
  radius = 2;
  shadowDistance = 42;
  detailDistance = 58;
  generated = 0;
  recycled = 0;
  private cell = "";
  private refreshQueue: ForestChunk[] = [];
  refresh() {
    this.refreshQueue = [...this.active.values()];
  }
  constructor(
    private scene: T.Scene,
    private assets: Assets,
  ) {}
  update(x: number, z: number, initial = false) {
    const cell = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)},${this.radius}`;
    if (cell !== this.cell) {
      this.cell = cell;
      const wanted = desiredChunks(x, z, this.radius),
        keys = new Set(wanted.map((p) => p.join(",")));
      for (const [key, chunk] of this.active) {
        if (!keys.has(key)) {
          this.active.delete(key);
          chunk.group.visible = false;
          this.pool.push(chunk);
          this.recycled++;
        }
      }
      this.pending = wanted.filter((p) => !this.active.has(p.join(",")));
    }
    const count = initial ? 9 : 1;
    for (let i = 0; i < count && this.pending.length; i++) {
      const [cx, cz] = this.pending.shift()!,
        key = `${cx},${cz}`;
      const chunk = this.pool.pop() ?? new ForestChunk(this.assets);
      if (!chunk.group.parent) this.scene.add(chunk.group);
      chunk.assign(cx, cz);
      this.active.set(key, chunk);
      this.generated++;
    }
    const refresh = this.refreshQueue.shift();
    if (refresh && this.active.get(`${refresh.cx},${refresh.cz}`) === refresh)
      refresh.assign(refresh.cx, refresh.cz);
    for (const c of this.active.values()) {
      const distance = Math.hypot(
        (c.cx + 0.5) * CHUNK_SIZE - x,
        (c.cz + 0.5) * CHUNK_SIZE - z,
      );
      const detailed = distance < this.detailDistance + (c.detailed ? 12 : 0);
      if (c.detailed !== detailed) c.setDetail(detailed);
      c.setShadow(distance < this.shadowDistance);
    }
  }
  /** Horizontal distance to the nearest obstacle surface, capped for route scoring. */
  clearance(x: number, z: number, limit = 3) {
    let distance = limit;
    const cx = Math.floor(x / CHUNK_SIZE),
      cz = Math.floor(z / CHUNK_SIZE);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const chunk = this.active.get(`${cx + a},${cz + b}`);
        if (!chunk) continue;
        for (const obstacles of [chunk.trees, chunk.rockColliders])
          for (const obstacle of obstacles)
            distance = Math.min(
              distance,
              Math.hypot(x - obstacle.x, z - obstacle.z) - obstacle.radius,
            );
      }
    return Math.max(0, distance);
  }
  collides(x: number, z: number, radius = 0.32) {
    return this.pathBlocked(x, z, x, z, radius);
  }
  pathBlocked(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    radius = 0.32,
    allowLeavingMargin = false,
  ) {
    const dx = bx - ax,
      dz = bz - az,
      lengthSq = dx * dx + dz * dz;
    // Neighbor cells also contain obstacles whose radius overlaps this segment.
    const minX = Math.floor(Math.min(ax, bx) / CHUNK_SIZE) - 1,
      maxX = Math.floor(Math.max(ax, bx) / CHUNK_SIZE) + 1;
    const minZ = Math.floor(Math.min(az, bz) / CHUNK_SIZE) - 1,
      maxZ = Math.floor(Math.max(az, bz) / CHUNK_SIZE) + 1;
    for (let cx = minX; cx <= maxX; cx++)
      for (let cz = minZ; cz <= maxZ; cz++) {
        const chunk = this.active.get(`${cx},${cz}`);
        if (!chunk) continue;
        for (const obstacles of [chunk.trees, chunk.rockColliders])
          for (const obstacle of obstacles) {
            const t = lengthSq
              ? T.MathUtils.clamp(
                  ((obstacle.x - ax) * dx + (obstacle.z - az) * dz) / lengthSq,
                  0,
                  1,
                )
              : 0;
            // Planning padding must not trap a player who can safely move out of it.
            if (
              allowLeavingMargin &&
              t === 0 &&
              (ax - obstacle.x) ** 2 + (az - obstacle.z) ** 2 >=
                (obstacle.radius + 0.32) ** 2 &&
              (bx - obstacle.x) ** 2 + (bz - obstacle.z) ** 2 >
                (ax - obstacle.x) ** 2 + (az - obstacle.z) ** 2
            )
              continue;
            if (
              (ax + dx * t - obstacle.x) ** 2 +
                (az + dz * t - obstacle.z) ** 2 <
              (radius + obstacle.radius) ** 2
            )
              return true;
          }
      }
    return false;
  }
  setQuality(high: boolean) {
    this.radius = high ? 3 : 2;
    this.cell = "";
  }
  stats() {
    return {
      active: this.active.size,
      pool: this.pool.length,
      pending: this.pending.length,
      generated: this.generated,
      recycled: this.recycled,
      trees: [...this.active.values()].reduce((n, c) => n + c.trees.length, 0),
    };
  }
}
