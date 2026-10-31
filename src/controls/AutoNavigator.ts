import { ForestGenerator } from "../forest/ForestGenerator";
import { streamX } from "../forest/world";
type Point = { x: number; z: number };
type Entry = { id: number; score: number };
const HALF = 18,
  SIZE = HALF * 2 + 1,
  COUNT = SIZE * SIZE,
  MARGIN = 0.85;
interface Search {
  x: number;
  z: number;
  goalX: number;
  goalZ: number;
  start: number;
  cost: Float64Array;
  parent: Int32Array;
  closed: Uint8Array;
  clearance: Float64Array;
  open: Entry[];
  best: number;
  bestDistance: number;
}
/** Follow roomy paths; spread searches across frames so navigation cannot freeze the UI. */
export class AutoNavigator {
  private path: Point[] = [];
  private search: Search | null = null;
  private stalled = 0;
  private lastX = Infinity;
  private lastZ = Infinity;
  private retry = 0;
  constructor(private forest: ForestGenerator) {}
  reset() {
    this.path.length = 0;
    this.search = null;
    this.stalled = 0;
    this.retry = 0;
    this.lastX = Infinity;
    this.lastZ = Infinity;
  }
  blocked() {
    this.path.length = 0;
    this.retry = 0;
  }
  heading(x: number, z: number, dt: number) {
    this.retry = Math.max(0, this.retry - dt);
    const moved = Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    this.stalled = moved < dt * 0.15 ? this.stalled + dt : 0;
    while (
      this.path.length &&
      Math.hypot(this.path[0].x - x, this.path[0].z - z) < 0.55
    )
      this.path.shift();
    const next = this.path[0];
    if (next && this.forest.pathBlocked(x, z, next.x, next.z, MARGIN, true))
      this.path.length = 0;
    if (this.stalled > 0.7) {
      this.blocked();
      this.stalled = 0;
    }
    const end = this.path[this.path.length - 1];
    if (
      !this.search &&
      this.retry === 0 &&
      (!end || Math.hypot(end.x - x, end.z - z) < 4)
    )
      this.begin(x, z);
    if (this.search) this.advance();
    // Visibility smoothing retains the same side of an obstacle until the path clears it.
    for (let i = this.path.length - 1; i > 0; i--) {
      const p = this.path[i];
      if (!this.forest.pathBlocked(x, z, p.x, p.z, MARGIN, true)) {
        this.path.splice(0, i);
        break;
      }
    }
    const p = this.path[0];
    return p ? Math.atan2(x - p.x, z - p.z) : null;
  }
  private point(s: Search, id: number): Point {
    return {
      x: s.x + ((id % SIZE) - HALF),
      z: s.z + (Math.floor(id / SIZE) - HALF),
    };
  }
  private heuristic(s: Search, id: number) {
    const gx = (id % SIZE) - HALF,
      gz = Math.floor(id / SIZE) - HALF;
    return Math.hypot(s.x + gx - s.goalX, s.z + gz - s.goalZ);
  }
  private push(heap: Entry[], entry: Entry) {
    let i = heap.length;
    heap.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= entry.score) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = entry;
  }
  private pop(heap: Entry[]) {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].score < heap[child].score
        )
          child++;
        if (heap[child].score >= last.score) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first.id;
  }
  private begin(x: number, z: number) {
    const start = HALF * SIZE + HALF;
    const s: Search = {
      x,
      z,
      goalX: streamX(z - 14) + 4,
      goalZ: z - 14,
      start,
      cost: new Float64Array(COUNT).fill(Infinity),
      parent: new Int32Array(COUNT).fill(-1),
      closed: new Uint8Array(COUNT),
      clearance: new Float64Array(COUNT).fill(-1),
      open: [],
      best: start,
      bestDistance: Infinity,
    };
    s.cost[start] = 0;
    s.bestDistance = this.heuristic(s, start);
    this.push(s.open, { id: start, score: s.bestDistance });
    this.search = s;
  }
  private advance() {
    const s = this.search!,
      deadline = performance.now() + 3;
    let complete = false;
    // Both a node cap and a wall-clock budget bound each frame's work.
    for (let work = 0; work < 64 && s.open.length; work++) {
      if (work > 0 && performance.now() >= deadline) return;
      const current = this.pop(s.open);
      if (s.closed[current]) continue;
      s.closed[current] = 1;
      const distance = this.heuristic(s, current);
      if (distance < s.bestDistance) {
        s.best = current;
        s.bestDistance = distance;
      }
      if (distance < 1) {
        complete = true;
        break;
      }
      const gx = current % SIZE,
        gz = Math.floor(current / SIZE),
        p = this.point(s, current);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (
            (!dx && !dz) ||
            gx + dx < 0 ||
            gx + dx >= SIZE ||
            gz + dz < 0 ||
            gz + dz >= SIZE
          )
            continue;
          const id = (gz + dz) * SIZE + gx + dx;
          if (s.closed[id]) continue;
          const nx = p.x + dx,
            nz = p.z + dz;
          if (s.clearance[id] < 0)
            s.clearance[id] = this.forest.clearance(nx, nz, 3);
          const clearance = s.clearance[id];
          if (clearance < MARGIN) continue;
          if (
            this.forest.pathBlocked(
              p.x,
              p.z,
              nx,
              nz,
              MARGIN,
              current === s.start,
            )
          )
            continue;
          const nextCost =
            s.cost[current] +
            Math.hypot(dx, dz) * (1 + Math.max(0, 2 - clearance) ** 2 * 2);
          if (nextCost >= s.cost[id]) continue;
          s.cost[id] = nextCost;
          s.parent[id] = current;
          this.push(s.open, { id, score: nextCost + this.heuristic(s, id) });
        }
    }
    if (!complete && s.open.length) return;
    const route: Point[] = [];
    for (let id = s.best; id !== s.start && id >= 0; id = s.parent[id])
      route.push(this.point(s, id));
    route.reverse();
    this.path = route;
    this.search = null;
    this.retry = route.length ? 0.25 : 1;
  }
}
