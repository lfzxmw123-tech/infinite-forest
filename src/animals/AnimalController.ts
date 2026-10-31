import * as T from "three/webgpu";
export type Species = "deer" | "rabbit" | "fox" | "squirrel" | "bear";
export const traits = {
  deer: {
    color: 0xa87947,
    size: 1,
    leg: 0.64,
    length: 1.15,
    radius: 0.85,
    walk: 1.1,
    run: 4.6,
    fear: 12,
    range: 15,
    prob: 0.65,
  },
  rabbit: {
    color: 0xc5b6a0,
    size: 0.55,
    leg: 0.22,
    length: 0.65,
    radius: 0.4,
    walk: 0.65,
    run: 3.4,
    fear: 9,
    range: 9,
    prob: 0.85,
  },
  fox: {
    color: 0xc45b24,
    size: 0.8,
    leg: 0.34,
    length: 0.95,
    radius: 0.65,
    walk: 1.1,
    run: 4,
    fear: 11,
    range: 18,
    prob: 0.38,
  },
  squirrel: {
    color: 0x8b5231,
    size: 0.4,
    leg: 0.25,
    length: 0.7,
    radius: 0.35,
    walk: 1.2,
    run: 3.8,
    fear: 8,
    range: 10,
    prob: 0.35,
  },
  bear: {
    color: 0x513b2c,
    size: 1.3,
    leg: 0.4,
    length: 1.25,
    radius: 1.2,
    walk: 0.7,
    run: 3,
    fear: 5,
    range: 14,
    prob: 0.08,
  },
};
export const animalGeometry = new T.SphereGeometry(1, 10, 7);
const materials = new Map<number, T.MeshStandardMaterial>();
function material(color: number) {
  if (!materials.has(color))
    materials.set(color, new T.MeshStandardMaterial({ color, roughness: 1 }));
  return materials.get(color)!;
}
export class AnimalController {
  root = new T.Group();
  body = new T.Group();
  head = new T.Group();
  tail = new T.Group();
  legs: T.Group[] = [];
  ears: T.Group[] = [];
  phase = 0;
  readonly parts: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>[] = [];
  constructor(
    public species: Species,
    phase: number,
  ) {
    const t = traits[species];
    this.phase = phase;
    this.root.add(this.body);
    this.root.scale.setScalar(t.size);
    const part = (
      parent: T.Object3D,
      color: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      const m = new T.Mesh(animalGeometry, material(color));
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      // Parts keep their animated hierarchy, but the manager draws them in one GPU batch.
      m.visible = false;
      this.parts.push(m);
      parent.add(m);
      return m;
    };
    part(this.body, t.color, 0, t.leg + 0.28, 0, 0.3, 0.32, t.length * 0.5);
    this.head.position.set(0, t.leg + 0.55, t.length * 0.43);
    this.body.add(this.head);
    part(this.head, t.color, 0, 0, 0, 0.22, 0.25, 0.25);
    part(
      this.head,
      species === "fox" ? 0xf3dfbe : t.color,
      0,
      -0.08,
      0.23,
      0.14,
      0.12,
      0.24,
    );
    part(this.head, 0x201b16, 0, -0.05, 0.43, 0.065, 0.06, 0.05);
    for (const side of [-1, 1]) {
      part(this.head, 0x171711, side * 0.17, 0.05, 0.16, 0.035, 0.04, 0.035);
      const ear = new T.Group();
      ear.position.set(side * 0.15, 0.19, 0);
      this.head.add(ear);
      this.ears.push(ear);
      part(
        ear,
        t.color,
        0,
        0.14,
        0,
        0.075,
        species === "rabbit" ? 0.32 : 0.15,
        0.065,
      );
      part(
        ear,
        0xd49c88,
        0,
        0.15,
        0.045,
        0.04,
        species === "rabbit" ? 0.24 : 0.09,
        0.02,
      );
    }
    for (const x of [-0.21, 0.21])
      for (const z of [-t.length * 0.32, t.length * 0.32]) {
        const leg = new T.Group();
        leg.position.set(x, t.leg + 0.12, z);
        this.body.add(leg);
        part(leg, t.color, 0, -t.leg * 0.5, 0, 0.07, t.leg * 0.5 + 0.06, 0.085);
        part(leg, 0x30281f, 0, -t.leg, 0.035, 0.08, 0.055, 0.12);
        this.legs.push(leg);
      }
    this.tail.position.set(0, t.leg + 0.3, -t.length * 0.48);
    this.body.add(this.tail);
    part(
      this.tail,
      t.color,
      0,
      0.02,
      -0.23,
      species === "fox" ? 0.19 : 0.11,
      0.14,
      species === "fox" || species === "squirrel" ? 0.48 : 0.15,
    );
    if (species === "fox")
      part(this.tail, 0xf4e9d1, 0, 0.02, -0.61, 0.14, 0.11, 0.16);
    if (species === "squirrel") this.tail.rotation.x = 0.9;
    if (species === "deer")
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const a = part(
            this.head,
            0x8c7352,
            side * (0.16 + i * 0.07),
            0.42 + i * 0.1,
            -0.04,
            0.035,
            0.23 - i * 0.04,
            0.035,
          );
          a.rotation.z = -side * 0.4;
        }
  }
  animate(dt: number, state: string, speed: number) {
    this.phase += dt * (speed > 0 ? 7 + speed * 2 : 1.5);
    const p = this.phase,
      moving = speed > 0;
    this.body.position.y = moving
      ? this.species === "rabbit"
        ? Math.max(0, Math.sin(p)) * 0.22
        : Math.abs(Math.sin(p * 2)) * 0.025
      : Math.sin(p) * 0.008;
    this.body.rotation.z = moving ? Math.sin(p) * 0.018 : 0;
    this.legs.forEach(
      (l, i) =>
        (l.rotation.x = moving
          ? Math.sin(p + (i === 0 || i === 3 ? 0 : Math.PI)) *
            (state === "Run" ? 0.65 : 0.35)
          : 0),
    );
    this.head.rotation.x =
      state === "Eat"
        ? 0.85 + Math.sin(p * 2) * 0.07
        : Math.sin(p * 0.4) * 0.07;
    this.head.rotation.y =
      state === "Alert" ? Math.sin(p * 2) * 0.35 : Math.sin(p * 0.6) * 0.12;
    this.ears.forEach((e, i) => (e.rotation.z = Math.sin(p * 0.8 + i) * 0.08));
    this.tail.rotation.y = Math.sin(p) * 0.2;
  }
  dispose() {
    this.root.removeFromParent();
  }
}
