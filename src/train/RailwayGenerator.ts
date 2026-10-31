import * as T from "three/webgpu";
import { RailwayPath } from "./RailwayPath";
import { RailwayChunk, createRailAssets } from "./RailwayChunk";
export class RailwayGenerator {
  active = new Map<number, RailwayChunk>();
  pool: RailwayChunk[] = [];
  generated = 0;
  recycled = 0;
  readonly path = new RailwayPath();
  readonly assets = createRailAssets();
  private pending: number[] = [];
  private cell = Infinity;
  constructor(private scene: T.Scene) {}
  update(parameter: number, initial = false) {
    const center = Math.floor(parameter / 32);
    if (center !== this.cell) {
      this.cell = center;
      const wanted = new Set<number>();
      for (let i = center - 3; i <= center + 5; i++) wanted.add(i);
      for (const [i, chunk] of this.active)
        if (!wanted.has(i)) {
          this.active.delete(i);
          chunk.group.visible = false;
          this.pool.push(chunk);
          this.recycled++;
        }
      this.pending = [...wanted]
        .filter((i) => !this.active.has(i))
        .sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    }
    for (let i = 0; i < (initial ? 9 : 1) && this.pending.length; i++) {
      const index = this.pending.shift()!,
        chunk = this.pool.pop() ?? new RailwayChunk(this.path, this.assets);
      if (!chunk.group.parent) this.scene.add(chunk.group);
      chunk.assign(index);
      this.active.set(index, chunk);
      this.generated++;
    }
  }
  clear() {
    for (const chunk of this.active.values()) {
      chunk.group.visible = false;
      this.pool.push(chunk);
    }
    this.active.clear();
    this.pending.length = 0;
    this.cell = Infinity;
  }
  dispose() {
    for (const chunk of this.active.values()) chunk.dispose();
    this.pool.forEach((c) => c.dispose());
    this.active.clear();
    this.pool.length = 0;
    Object.values(this.assets).forEach((asset) => asset.dispose());
  }
  stats() {
    return {
      active: this.active.size,
      pool: this.pool.length,
      pending: this.pending.length,
      generated: this.generated,
      recycled: this.recycled,
      cachedCurves: this.path.cachedSegments,
    };
  }
}
