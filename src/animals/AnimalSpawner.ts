import { railwayEnabled, railClearance } from "../train/RailwayPath";
import { CHUNK_SIZE, hash, random, streamX } from "../forest/world";
import { ForestGenerator } from "../forest/ForestGenerator";
import { Species, traits } from "./AnimalController";
export class AnimalSpawner {
  constructor(private forest: ForestGenerator) {}
  layout(cx: number, cz: number) {
    const rng = random(Math.floor(hash(cx, cz, 87123) * 4294967295));
    const result: { species: Species; x: number; z: number; seed: number }[] =
      [];
    for (const species of Object.keys(traits) as Species[]) {
      const t = traits[species];
      if (rng() > t.prob) continue;
      for (let i = 0; i < 24; i++) {
        const x = (cx + rng()) * CHUNK_SIZE,
          z = (cz + rng()) * CHUNK_SIZE;
        if (
          Math.abs(x - streamX(z)) < 4 ||
          (railwayEnabled() && railClearance(x, z) < 3.5) ||
          this.forest.collides(x, z, t.radius + 0.2)
        )
          continue;
        result.push({ species, x, z, seed: Math.floor(rng() * 4294967295) });
        break;
      }
    }
    return result;
  }
}
