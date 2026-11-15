import { InstancedMesh, Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { fbm } from '../src/engine/terrain/noise';
import { TreeMesh } from '../src/engine/vegetation/mesh';
import {
  AUTUMN_PALETTE,
  SPECIES,
  SPECIES_IDS,
  buildVegetation,
  generateTreeMesh,
  heightRange,
  inZone,
  scatterMountainForest,
  scatterTrees,
  siteAt,
  slopeDegrees,
  trunkSolid,
  trunkSolids,
  type Placement,
  type SpeciesRule,
  type TreeInstance,
  type Zone,
} from '../src/engine/vegetation';

const flat = (): number => 12;
/** Hills 0..120 m with a few ridges: plenty of slope, valleys and crests. */
const hills = (x: number, z: number): number => 120 * fbm(x / 160, z / 160, 77, 4) ** 1.6 + 8 * fbm(x / 20, z / 20, 5, 2);
const REGION = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };

const shrubRule: SpeciesRule = { species: 'shrub', share: 1, scale: [1, 1] };

describe('scatterTrees', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const run = (seed: number): TreeInstance[] =>
      scatterTrees({ heightAt: hills, region: REGION, rng: createRng(seed), density: 0.01, rules: [shrubRule, { species: 'pine', share: 1, scale: [0.8, 1.2] }] });
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('puts nothing inside an exclusion zone (box, corridor, circle)', () => {
    const zones: Zone[] = [
      { kind: 'box', minX: -60, maxX: 20, minZ: -40, maxZ: 50 },
      { kind: 'corridor', points: [[-140, 100], [0, 90], [140, 120]], halfWidth: 8 },
      { kind: 'circle', x: 90, z: -80, radius: 30 },
    ];
    const trees = scatterTrees({ heightAt: hills, region: REGION, rng: createRng(1), density: 0.02, rules: [shrubRule], exclusions: zones });
    expect(trees.length).toBeGreaterThan(300);
    for (const t of trees) for (const z of zones) expect(inZone(z, t.x, t.z)).toBe(false);
    // The zones really do bite: the same scatter without them puts trees there.
    const open = scatterTrees({ heightAt: hills, region: REGION, rng: createRng(1), density: 0.02, rules: [shrubRule] });
    expect(open.filter((t) => zones.some((z) => inZone(z, t.x, t.z))).length).toBeGreaterThan(50);
  });

  it('keeps crowns clear of a zone, not just trunks', () => {
    const zone: Zone = { kind: 'box', minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    const trees = scatterTrees({ heightAt: flat, region: REGION, rng: createRng(2), density: 0.02, rules: [{ species: 'broadleaf', share: 1, scale: [1, 1] }], exclusions: [zone] });
    const margin = SPECIES.broadleaf.crownRadius * 0.5;
    for (const t of trees) expect(inZone(zone, t.x, t.z, margin - 1e-6)).toBe(false);
  });

  it('respects height band and maximum slope', () => {
    const rule: SpeciesRule = { species: 'pine', share: 1, scale: [1, 1], heightBand: { min: 30, max: 70, fade: 10 }, maxSlope: 22, slopeFade: 8 };
    const trees = scatterTrees({ heightAt: hills, region: REGION, rng: createRng(3), density: 0.02, rules: [rule] });
    expect(trees.length).toBeGreaterThan(50);
    for (const t of trees) {
      expect(t.y).toBeGreaterThanOrEqual(30);
      expect(t.y).toBeLessThanOrEqual(70);
      expect(slopeDegrees(hills, t.x, t.z)).toBeLessThan(22);
    }
    // And a rule for steep ground only (minSlope) never lands on gentle ground.
    const steep = scatterTrees({ heightAt: hills, region: REGION, rng: createRng(3), density: 0.02, rules: [{ ...shrubRule, minSlope: 15 }] });
    expect(steep.length).toBeGreaterThan(20);
    for (const t of steep) expect(slopeDegrees(hills, t.x, t.z)).toBeGreaterThanOrEqual(15);
  });

  it('gives about the density asked for on open ground', () => {
    const density = 0.01;
    const trees = scatterTrees({ heightAt: flat, region: REGION, rng: createRng(4), density, rules: [shrubRule] });
    const expected = 300 * 300 * density;
    expect(trees.length).toBeGreaterThan(expected * 0.85);
    expect(trees.length).toBeLessThanOrEqual(expected * 1.1);
    // Half the ground suits the rule: about half the trees.
    const half = scatterTrees({ heightAt: (x) => (x < 0 ? 0 : 100), region: REGION, rng: createRng(4), density, rules: [{ ...shrubRule, heightBand: { min: -1, max: 50 } }] });
    expect(half.length).toBeGreaterThan(expected * 0.4);
    expect(half.length).toBeLessThan(expected * 0.6);
  });

  it('stands every tree on the ground', () => {
    const trees = scatterMountainForest({ heightAt: hills, bounds: REGION, rng: createRng(8) });
    expect(trees.length).toBeGreaterThan(500);
    for (const t of trees) expect(Math.abs(t.y - hills(t.x, t.z))).toBeLessThan(1e-9);
  });

  it('stays inside the region and keeps crowns apart', () => {
    const trees = scatterTrees({ heightAt: flat, region: REGION, rng: createRng(9), density: 0.03, rules: [{ species: 'pine', share: 1, scale: [1, 1.4] }] });
    for (const t of trees) {
      expect(t.x).toBeGreaterThanOrEqual(REGION.minX);
      expect(t.x).toBeLessThanOrEqual(REGION.maxX);
      expect(t.z).toBeGreaterThanOrEqual(REGION.minZ);
      expect(t.z).toBeLessThanOrEqual(REGION.maxZ);
    }
    const sample = trees.slice(0, 200);
    for (const a of sample) {
      for (const b of trees) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.4 * (SPECIES.pine.crownRadius * (a.scale + b.scale)) - 1e-6);
      }
    }
  });

  it('honours explicit placements, even inside exclusion zones, and keeps others off them', () => {
    const explicit: Placement[] = [
      { species: 'cypress', x: 0, z: 0, variant: 1, rotation: 0.5, scale: 1.3, color: 0x224433 },
      { species: 'broadleaf', x: 40, z: 0, scale: 2.2 },
    ];
    const zone: Zone = { kind: 'box', minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    const trees = scatterTrees({ heightAt: hills, region: REGION, rng: createRng(10), density: 0.03, rules: [{ species: 'broadleaf', share: 1, scale: [1, 1.2] }], exclusions: [zone], explicit });
    const placed = trees.filter((t) => t.explicit);
    expect(placed).toHaveLength(2);
    expect(placed[0]).toMatchObject({ species: 'cypress', x: 0, z: 0, variant: 1, rotation: 0.5, scale: 1.3, color: 0x224433 });
    expect(placed[0]?.y).toBeCloseTo(hills(0, 0), 9);
    expect(placed[1]?.y).toBeCloseTo(hills(40, 0), 9);
    for (const t of trees.filter((o) => !o.explicit)) {
      expect(Math.hypot(t.x - 40, t.z)).toBeGreaterThan(0.4 * (SPECIES.broadleaf.crownRadius * (2.2 + t.scale)) - 1e-6);
    }
  });

  it('prefers ridges or valleys when asked', () => {
    const rule: SpeciesRule = { species: 'shrub', share: 1, scale: [1, 1] };
    const meanRidge = (ridge: number): number => {
      const trees = scatterTrees({ heightAt: hills, region: REGION, rng: createRng(11), density: 0.02, rules: [{ ...rule, ridge }] });
      return trees.reduce((n, t) => n + siteAt(hills, t.x, t.z).ridge, 0) / trees.length;
    };
    expect(meanRidge(1)).toBeGreaterThan(meanRidge(0) + 0.1);
    expect(meanRidge(-1)).toBeLessThan(meanRidge(0) - 0.1);
  });

  it('clusters when asked: the same trees bunch into patches', () => {
    const count = (strength: number): number[] => {
      const trees = scatterTrees({ heightAt: flat, region: REGION, rng: createRng(12), density: 0.02, rules: [{ ...shrubRule, cluster: { size: 40, strength } }] });
      // Trees per 30 m tile.
      const tiles = new Array<number>(100).fill(0);
      for (const t of trees) tiles[Math.floor((t.x + 150) / 30) + 10 * Math.floor((t.z + 150) / 30)]! += 1;
      return tiles;
    };
    const spread = (a: number[]): number => {
      const mean = a.reduce((n, v) => n + v, 0) / a.length;
      return Math.sqrt(a.reduce((n, v) => n + (v - mean) ** 2, 0) / a.length) / mean;
    };
    expect(spread(count(0.95))).toBeGreaterThan(spread(count(0)) * 2);
  });

  it('refuses absurd candidate counts and does nothing without density or rules', () => {
    expect(() => scatterTrees({ heightAt: flat, region: { minX: 0, maxX: 1e5, minZ: 0, maxZ: 1e5 }, rng: createRng(1), density: 1, rules: [shrubRule] })).toThrow(/too many/);
    expect(scatterTrees({ heightAt: flat, region: REGION, rng: createRng(1), density: 0, rules: [shrubRule] })).toEqual([]);
    expect(scatterTrees({ heightAt: flat, region: REGION, rng: createRng(1), density: 0.01, rules: [] })).toEqual([]);
  });
});

describe('scatterMountainForest', () => {
  const trees = scatterMountainForest({ heightAt: hills, bounds: REGION, rng: createRng(21) });
  const range = heightRange(hills, REGION);
  const mean = (list: readonly number[]): number => list.reduce((n, v) => n + v, 0) / Math.max(1, list.length);

  it('makes a mixed forest with every species', () => {
    for (const id of SPECIES_IDS) expect(trees.filter((t) => t.species === id).length).toBeGreaterThan(8);
    expect(trees.length).toBeGreaterThan(800);
  });

  it('puts pines higher and on steeper ground than broadleaf, and shrubs on the steepest', () => {
    const of = (id: string): TreeInstance[] => trees.filter((t) => t.species === id);
    const slope = (list: TreeInstance[]): number => mean(list.map((t) => slopeDegrees(hills, t.x, t.z)));
    expect(slope(of('pine'))).toBeGreaterThan(slope(of('broadleaf')));
    expect(slope(of('shrub'))).toBeGreaterThan(slope(of('broadleaf')));
    expect(mean(of('pine').map((t) => t.y))).toBeGreaterThan(mean(of('broadleaf').map((t) => t.y)));
  });

  it('colours autumn broadleaf in gold, orange and red and the rest of the forest in green', () => {
    const warm = trees.filter((t) => t.species === 'broadleaf' && ((t.color >> 16) & 255) > ((t.color >> 8) & 255));
    const green = trees.filter((t) => t.species === 'broadleaf' && ((t.color >> 16) & 255) <= ((t.color >> 8) & 255));
    expect(warm.length).toBeGreaterThan(30);
    expect(green.length).toBeGreaterThan(warm.length);
    expect(AUTUMN_PALETTE.length).toBeGreaterThanOrEqual(6);
  });

  it('thins with altitude and keeps only bushes above the tree line', () => {
    const span = range.max - range.min;
    // Tree crown area per tile: what the eye reads as forest cover.
    const perTile = (lo: number, hi: number): number => {
      let tiles = 0;
      let count = 0;
      for (let x = REGION.minX; x < REGION.maxX; x += 10) {
        for (let z = REGION.minZ; z < REGION.maxZ; z += 10) {
          const y = hills(x + 5, z + 5);
          if (y < lo || y >= hi) continue;
          tiles++;
          for (const t of trees) if (t.species !== 'shrub' && t.x >= x && t.x < x + 10 && t.z >= z && t.z < z + 10) count += (SPECIES[t.species].crownRadius * t.scale) ** 2;
        }
      }
      return count / Math.max(1, tiles);
    };
    expect(perTile(range.min + 0.7 * span, range.max + 1)).toBeLessThan(perTile(range.min, range.min + 0.3 * span) * 0.5);
    for (const t of trees.filter((o) => o.y > range.max - 0.04 * span)) expect(t.species).toBe('shrub');
  });

  it('respects minY, exclusions and explicit trees', () => {
    const zone: Zone = { kind: 'box', minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
    const keep: Placement = { species: 'pine', x: 0, z: 0 };
    const minY = range.min + 20;
    const some = scatterMountainForest({ heightAt: hills, bounds: REGION, rng: createRng(22), minY, exclusions: [zone], explicit: [keep] });
    expect(some.filter((t) => t.explicit)).toHaveLength(1);
    for (const t of some.filter((o) => !o.explicit)) {
      expect(t.y).toBeGreaterThanOrEqual(minY);
      expect(inZone(zone, t.x, t.z)).toBe(false);
    }
  });
});

describe('species shapes', () => {
  for (const id of SPECIES_IDS) {
    const info = SPECIES[id];
    for (let variant = 0; variant < info.variants; variant++) {
      for (const lod of [0, 1] as const) {
        it(`${id} variant ${variant} detail ${lod} is a sound shape on the ground`, () => {
          const { mesh, height } = generateTreeMesh(id, variant, lod);
          const p = mesh.positions;
          expect(p.every(Number.isFinite)).toBe(true);
          expect(mesh.normals.every(Number.isFinite)).toBe(true);
          expect(Math.max(...mesh.indices)).toBeLessThan(p.length / 3);
          for (let i = 0; i < mesh.normals.length; i += 3) {
            expect(Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!)).toBeCloseTo(1, 4);
          }
          let minY = Infinity;
          let maxY = -Infinity;
          let reach = 0;
          for (let i = 0; i < p.length; i += 3) {
            minY = Math.min(minY, p[i + 1]!);
            maxY = Math.max(maxY, p[i + 1]!);
            reach = Math.max(reach, Math.hypot(p[i]!, p[i + 2]!));
          }
          // Origin at the ground; the trunk goes a little below it; the tree is about as tall as it says.
          expect(minY).toBeLessThan(id === 'shrub' ? -0.05 : -0.4);
          expect(minY).toBeGreaterThan(-1.2);
          expect(maxY).toBeGreaterThan(height * 0.8);
          expect(maxY).toBeLessThan(height * 1.3);
          expect(reach).toBeLessThan(info.crownRadius * 2.6);
          expect(mesh.triangleCount).toBeGreaterThan(20);
        });
      }
    }
    it(`${id} shapes are repeatable and variants differ`, () => {
      expect(generateTreeMesh(id, 0, 0).mesh.positions).toEqual(generateTreeMesh(id, 0, 0).mesh.positions);
      expect(generateTreeMesh(id, 0, 0).mesh.positions).not.toEqual(generateTreeMesh(id, 1, 0).mesh.positions);
    });
  }

  it('far detail is much cheaper than near detail for the species that have it', () => {
    for (const id of SPECIES_IDS) {
      const near = generateTreeMesh(id, 0, 0).mesh.triangleCount;
      const far = generateTreeMesh(id, 0, 1).mesh.triangleCount;
      if (SPECIES[id].farVariant) expect(far).toBeLessThan(near * 0.35);
      else expect(far).toBe(near);
    }
  });

  it('foliage carries volume shading: normals spread over the sphere, not all up', () => {
    const { mesh } = generateTreeMesh('broadleaf', 0, 0);
    let down = 0;
    let leaves = 0;
    for (let i = 0; i < mesh.leaf.length; i++) {
      if (mesh.leaf[i] !== 1) continue;
      leaves++;
      if ((mesh.normals[i * 3 + 1] ?? 0) < -0.2) down++;
    }
    expect(leaves).toBeGreaterThan(100);
    expect(down / leaves).toBeGreaterThan(0.15);
    // Light is baked darker underneath than on top.
    let lowSum = 0;
    let lowN = 0;
    let highSum = 0;
    let highN = 0;
    for (let i = 0; i < mesh.leaf.length; i++) {
      if (mesh.leaf[i] !== 1) continue;
      const lum = mesh.colors[i * 3] ?? 0;
      if ((mesh.normals[i * 3 + 1] ?? 0) < -0.3) {
        lowSum += lum;
        lowN++;
      } else if ((mesh.normals[i * 3 + 1] ?? 0) > 0.5) {
        highSum += lum;
        highN++;
      }
    }
    expect(highSum / highN).toBeGreaterThan((lowSum / lowN) * 1.2);
    // Never black: the darkest baked light is still a fair share of the brightest.
    expect(Math.min(...mesh.colors.filter((_, i) => mesh.leaf[Math.floor(i / 3)] === 1))).toBeGreaterThan(0.2);
  });
});

describe('blob winding', () => {
  it('faces every triangle away from the blob, even where the shading normals are bent up', () => {
    const mesh = new TreeMesh(createRng(3));
    const crown = { center: [0, 0, 0] as const, radii: [3, 2, 3] as const, normalMix: 0.3, lo: 0.5, hi: 1.2 };
    // A flat-bottomed pad with the normals pushed hard towards the sky: its underside must still be drawn.
    mesh.blob({ center: [0, 0, 0], radii: [3, 0.6, 2], segs: 8, rings: 3, jitter: 0.2, crown, up: 0.9, flatBottom: 0.8 });
    const p = mesh.positions;
    let under = 0;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = [mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!];
      const at = (k: number): number[] => [p[k * 3]!, p[k * 3 + 1]!, p[k * 3 + 2]!];
      const [pa, pb, pc] = [at(a), at(b), at(c)] as [number[], number[], number[]];
      const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
      const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const mid = [(pa[0]! + pb[0]! + pc[0]!) / 3, (pa[1]! + pb[1]! + pc[1]!) / 3, (pa[2]! + pb[2]! + pc[2]!) / 3];
      expect(n[0]! * mid[0]! + n[1]! * mid[1]! + n[2]! * mid[2]!).toBeGreaterThanOrEqual(0);
      if (n[1]! < 0) under++;
    }
    expect(under).toBeGreaterThan(6);
  });
});

describe('buildVegetation', () => {
  const forest = scatterMountainForest({ heightAt: hills, bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 }, rng: createRng(31), density: 0.1 });

  it('turns thousands of trees into a handful of instanced meshes within the budget', () => {
    const trees = forest.slice(0, 4000);
    expect(trees.length).toBeGreaterThanOrEqual(3000);
    const veg = buildVegetation(trees, { lod: { focus: [[0, 40, 0]], near: 60 } });
    expect(veg.stats.trees).toBe(trees.length);
    expect(veg.stats.triangles).toBeLessThanOrEqual(450_000);
    expect(veg.stats.drawCalls).toBeLessThanOrEqual(16);
    expect(veg.stats.meshes).toBeLessThanOrEqual(10);
    let instanced = 0;
    let count = 0;
    veg.root.traverse((o) => {
      if (o instanceof InstancedMesh) {
        instanced++;
        count += o.count;
      } else if (o instanceof Mesh) throw new Error('every tree mesh is instanced');
    });
    expect(instanced).toBe(veg.stats.meshes);
    expect(count).toBe(trees.length);
    veg.dispose();
  });

  it('puts instances where the data says, scaled and rotated, with their own colour', () => {
    const t: TreeInstance = { species: 'pine', variant: 1, x: 10, y: 5, z: -7, rotation: 0.8, scale: 1.5, stretch: 1.1, color: 0x335544, explicit: false };
    const veg = buildVegetation([t]);
    const mesh = veg.root.children[0] as InstancedMesh;
    const e = mesh.instanceMatrix.array;
    expect([e[12], e[13], e[14]]).toEqual([10, 5, -7]);
    expect(Math.hypot(e[0]!, e[1]!, e[2]!)).toBeCloseTo(1.5, 5);
    expect(Math.hypot(e[4]!, e[5]!, e[6]!)).toBeCloseTo(1.65, 5);
    expect(mesh.instanceColor).not.toBeNull();
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    veg.dispose();
  });

  it('uses the cheap shape beyond the focus distance and the full shape near it', () => {
    const near: TreeInstance = { species: 'broadleaf', variant: 0, x: 0, y: 0, z: 0, rotation: 0, scale: 1, stretch: 1, color: 0xdd9933, explicit: false };
    const far: TreeInstance = { ...near, x: 500 };
    const veg = buildVegetation([near, far], { lod: { focus: [[0, 0, 0]], near: 50 } });
    expect(veg.stats.meshes).toBe(2);
    const full = generateTreeMesh('broadleaf', 0, 0).mesh.triangleCount;
    const cheap = generateTreeMesh('broadleaf', 0, 1).mesh.triangleCount;
    expect(veg.stats.triangles).toBe(full + cheap);
    // Far trees and bushes do not cast into the shadow map.
    expect(veg.stats.shadowCasters).toBe(1);
    veg.dispose();
  });

  it('is identical between runs (nothing random, wind only moves with the clock)', () => {
    const matrices = (): number[] => {
      const veg = buildVegetation(forest.slice(0, 300));
      const out: number[] = [];
      veg.root.traverse((o) => {
        if (o instanceof InstancedMesh) out.push(...Array.from(o.instanceMatrix.array), ...Array.from(o.instanceColor?.array ?? []));
      });
      veg.dispose();
      return out;
    };
    expect(matrices()).toEqual(matrices());
  });

  it('disposes everything, and disposing twice is harmless', () => {
    const veg = buildVegetation(forest.slice(0, 200));
    const meshes: InstancedMesh[] = [];
    veg.root.traverse((o) => {
      if (o instanceof InstancedMesh) meshes.push(o);
    });
    expect(meshes.length).toBeGreaterThan(2);
    let meshEvents = 0;
    let geometryEvents = 0;
    let materialEvents = 0;
    for (const m of meshes) {
      m.addEventListener('dispose', () => meshEvents++);
      m.geometry.addEventListener('dispose', () => geometryEvents++);
    }
    (meshes[0]?.material as { addEventListener(t: string, f: () => void): void }).addEventListener('dispose', () => materialEvents++);
    const parent = { children: [veg.root] };
    veg.dispose();
    veg.dispose();
    expect(meshEvents).toBe(meshes.length);
    expect(geometryEvents).toBe(meshes.length);
    expect(materialEvents).toBe(1);
    expect(veg.root.parent).toBeNull();
    expect(parent.children).toHaveLength(1);
  });

  it('wind is driven only by update(elapsed)', () => {
    const veg = buildVegetation(forest.slice(0, 10));
    expect(() => veg.update(12.5)).not.toThrow();
    veg.dispose();
  });
});

describe('trunk solids', () => {
  it('are thin boxes around the trunk, standing on the ground', () => {
    const t: TreeInstance = { species: 'cypress', variant: 0, x: 5, y: 20, z: -3, rotation: 0, scale: 1.2, stretch: 1, color: 0x224433, explicit: true };
    const s = trunkSolid(t);
    expect(s.min[0]).toBeLessThan(5);
    expect(s.max[0]).toBeGreaterThan(5);
    expect(s.max[0] - s.min[0]).toBeLessThan(1.2);
    expect(s.min[1]).toBeLessThanOrEqual(20);
    expect(s.max[1]).toBeGreaterThan(21);
    expect(trunkSolids([t, t])).toHaveLength(2);
  });
});
