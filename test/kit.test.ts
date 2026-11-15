import { readdirSync, readFileSync } from 'node:fs';
import { BufferGeometry, InstancedMesh, Material, Mesh, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../src/engine/rng';
import {
  createGate,
  createHall,
  createPagoda,
  createRoofShape,
  createWall,
  darkTilePalette,
  placeSolids,
  templePalette,
  toLocal,
  toWorld,
  type Building,
} from '../src/kit';
import { ribReach, patchPoint } from '../src/kit/roof-shape';
import { bayStops, expandBays, platformHeightAt } from '../src/kit/structure';
import { kitYard } from '../src/places/kit-yard';
import type { Solid } from '../src/places/types';

const built: Building[] = [];
function keep<T extends Building>(b: T): T {
  built.push(b);
  return b;
}
afterEach(() => {
  while (built.length) built.pop()?.dispose();
});

const inside = (s: Solid, p: readonly [number, number, number]): boolean =>
  p[0] > s.min[0] && p[0] < s.max[0] && p[1] > s.min[1] && p[1] < s.max[1] && p[2] > s.min[2] && p[2] < s.max[2];

describe('bays', () => {
  it('expands a count and a size into bay sizes and column lines', () => {
    expect(expandBays(3, 4)).toEqual([4, 4, 4]);
    expect(expandBays(3, [3, 5, 3])).toEqual([3, 5, 3]);
    expect(bayStops([3, 5, 3])).toEqual([-5.5, -2.5, 2.5, 5.5]);
  });

  it('rejects bad counts and sizes', () => {
    expect(() => expandBays(0, 4)).toThrow(/positive integer/);
    expect(() => expandBays(2, [4])).toThrow(/expected 2/);
    expect(() => expandBays(2, -1)).toThrow(/positive/);
  });
});

describe('roof shape', () => {
  const hipGable = createRoofShape({ form: 'hip-gable', a: 14, b: 9, rise: 5, gableHalf: 10.5 });

  it('is concave: steeper near the ridge than near the eave', () => {
    const h = (z: number): number => hipGable.heightAt(0, z);
    // Sample the front slope from the eave line (z = -9) up to the ridge (z = 0), skipping the tip flick.
    const lower = h(-6) - h(-7.5);
    const upper = h(-1.5) - h(-3);
    expect(upper).toBeGreaterThan(lower * 2);
    expect(h(0)).toBeCloseTo(5, 5);
  });

  it('lifts the corners above the middle of the eave', () => {
    const corner = hipGable.heightAt(14, -9);
    const middle = hipGable.heightAt(0, -9);
    expect(corner - middle).toBeGreaterThan(1);
    expect(middle).toBeGreaterThan(0); // eave-tip flick
  });

  it('has a vertical gable at the cut-back line and an end hip below it', () => {
    const base = hipGable.gables[0]?.baseHeight ?? 0;
    // Just outside the cut-back line the end hip tops out at the gable base; just inside, the slope carries on to the ridge.
    expect(hipGable.heightAt(10.5 + 1e-6, 0)).toBeCloseTo(base, 3);
    expect(hipGable.heightAt(10.5 - 1e-6, 0)).toBeCloseTo(5, 5);
    expect(hipGable.heightAt(12, 0)).toBeLessThan(base);
  });

  it('makes a pyramid when the hip ridge is zero', () => {
    const pyr = createRoofShape({ form: 'hip', a: 5, b: 5, rise: 5, ridgeHalf: 0 });
    expect(pyr.apex).toBeDefined();
    expect(pyr.heightAt(0, 0)).toBeCloseTo(5, 5);
    expect(pyr.ridges.every((r) => r.kind === 'hip')).toBe(true);
  });

  it('keeps ribs inside their facet', () => {
    const front = hipGable.patches[0];
    expect(front).toBeDefined();
    if (!front) return;
    expect(ribReach(front, 0)).toBe(1);
    expect(ribReach(front, 13.5)).toBeLessThan(0.2);
    expect(ribReach(front, 15)).toBe(0);
    const [x, z] = patchPoint(front, 0.5, 1);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(-9 * (1 - 0.5), 6);
  });

  it('rejects impossible shapes', () => {
    expect(() => createRoofShape({ form: 'hip-gable', a: 10, b: 5, rise: 3, gableHalf: 12 })).toThrow(/gableHalf/);
    expect(() => createRoofShape({ form: 'ring', a: 5, b: 5, rise: 2, innerA: 6, innerB: 3 })).toThrow(/inside/);
    expect(() => createRoofShape({ form: 'hip', a: 5, b: 5, rise: 0 })).toThrow(/positive/);
  });
});

describe('hall factory', () => {
  const cases = [
    { widthBays: 3, depthBays: 2, bayWidth: 4, bayDepth: 3.5, eaves: 1 as const },
    { widthBays: 5, depthBays: 3, eaves: 2 as const },
    { widthBays: 7, depthBays: 5, bayWidth: [4, 4, 4.5, 6, 4.5, 4, 4], bayDepth: 4, roof: 'hip' as const },
    { widthBays: 1, depthBays: 1, bayWidth: 5, bayDepth: 5, roof: 'hip' as const },
  ];

  for (const c of cases) {
    it(`has the footprint its bays imply (${c.widthBays}x${c.depthBays}, ${c.eaves ?? 1} eave)`, () => {
      const hall = keep(createHall(c));
      const W = (Array.isArray(c.bayWidth) ? c.bayWidth.reduce((a, b) => a + b, 0) : (c.bayWidth ?? 4.4) * c.widthBays) as number;
      const D = (c.bayDepth ?? 4) * c.depthBays;
      expect(hall.footprint.width).toBeCloseTo(W + 2 * 1.7, 6);
      expect(hall.footprint.depth).toBeCloseTo(D + 2 * 1.7, 6);
      expect(hall.height).toBeGreaterThan(c.eaves === 2 ? 15 : 7);
      expect(hall.height).toBeLessThan(40);
      // Wall and column solids stand on the platform; platform-side solids reach 0.3 m past its edge.
      for (const s of hall.solids) {
        expect(Math.abs(s.min[0])).toBeLessThanOrEqual(hall.footprint.width / 2 + 0.3 + 1e-6);
        expect(Math.abs(s.max[2])).toBeLessThanOrEqual(hall.footprint.depth / 2 + 3.5);
        expect(s.max[1]).toBeGreaterThan(s.min[1]);
        if (s.min[1] > 0) expect(s.min[1]).toBeGreaterThanOrEqual(1.1 - 1e-6);
      }
    });
  }

  it('leaves the front door open and the walls closed', () => {
    const hall = keep(createHall({ widthBays: 5, depthBays: 3 }));
    const zFront = -(3 * 4) / 2 + 0.2; // front wall centre line
    const door: [number, number, number] = [0, 1.1 + 1.2, zFront];
    expect(hall.solids.some((s) => inside(s, door))).toBe(false);
    const wallPoint: [number, number, number] = [-9, 1.1 + 1.2, zFront];
    expect(hall.solids.some((s) => inside(s, wallPoint))).toBe(true);
    const sidePoint: [number, number, number] = [(5 * 4.4) / 2 - 0.2, 1.1 + 1.2, 0];
    expect(hall.solids.some((s) => inside(s, sidePoint))).toBe(true);
  });

  it('walks up the steps and across the platform', () => {
    const hall = keep(createHall({}));
    const front = -hall.footprint.depth / 2;
    expect(hall.heightAt(0, 0)).toBeCloseTo(1.1, 6);
    expect(hall.heightAt(0, front - 0.2)).toBeGreaterThan(0.8);
    expect(hall.heightAt(0, front - 1.5)).toBeGreaterThan(0);
    expect(hall.heightAt(0, front - 1.5)).toBeLessThan(1.1);
    expect(hall.heightAt(0, front - 8)).toBe(0);
    expect(hall.heightAt(hall.footprint.width, 0)).toBe(0);
  });

  it('stays inside the budget: 5x3 double eave', () => {
    const hall = keep(createHall({ widthBays: 5, depthBays: 3, eaves: 2 }));
    expect(hall.stats.triangles).toBeLessThanOrEqual(80_000);
    expect(hall.stats.drawCalls).toBeLessThanOrEqual(16);
    expect(hall.stats.meshes).toBeLessThanOrEqual(10);
  });

  it('draws the roof tiles as instances', () => {
    const hall = keep(createHall({}));
    const names: string[] = [];
    hall.object.traverse((o) => {
      if ('isInstancedMesh' in o) names.push(o.name);
    });
    expect(names).toEqual(expect.arrayContaining(['tile-ribs', 'eave-caps', 'columns', 'brackets', 'balusters']));
  });

  it('rejects impossible grids', () => {
    expect(() => createHall({ widthBays: 0 })).toThrow();
    expect(() => createHall({ widthBays: 12 })).toThrow(/up to 11/);
  });

  it('colours tiles from the palette', () => {
    const tileColors = (b: Building): number => {
      let r = 0;
      b.object.traverse((o) => {
        if (o.name === 'tile-ribs' && 'instanceColor' in o) {
          const arr = (o as unknown as { instanceColor: { array: Float32Array } }).instanceColor.array;
          for (let i = 0; i < arr.length; i += 3) r += arr[i] as number;
          r /= arr.length / 3;
        }
      });
      return r;
    };
    const warm = keep(createHall({ widthBays: 3, depthBays: 2, palette: templePalette }));
    const dark = keep(createHall({ widthBays: 3, depthBays: 2, palette: darkTilePalette }));
    expect(tileColors(warm)).toBeGreaterThan(tileColors(dark) * 1.5);
  });
});

describe('pagoda factory', () => {
  it('grows taller with more tiers and tapers', () => {
    const heights = [3, 5, 7, 9].map((tiers) => keep(createPagoda({ tiers })).height);
    for (let i = 1; i < heights.length; i++) expect(heights[i] as number).toBeGreaterThan(heights[i - 1] as number);
  });

  it('reports the platform footprint and a plausible 7-tier height', () => {
    const p = keep(createPagoda({ tiers: 7, baseWidth: 9 }));
    expect(p.footprint.width).toBeCloseTo(9 + 2 * 2.6, 6);
    expect(p.footprint.depth).toBeCloseTo(9 + 2 * 2.6, 6);
    expect(p.height).toBeGreaterThan(30);
    expect(p.height).toBeLessThan(50);
    // One box per upper tier plus the ground tier walls.
    expect(p.solids.length).toBeGreaterThanOrEqual(6 + 4);
  });

  it('stays inside the budget: 7 tiers', () => {
    const p = keep(createPagoda({ tiers: 7 }));
    expect(p.stats.triangles).toBeLessThanOrEqual(120_000);
    expect(p.stats.drawCalls).toBeLessThanOrEqual(24);
  });

  it('accepts 3 and 9 tiers and rejects 2 and 10', () => {
    expect(() => keep(createPagoda({ tiers: 3 }))).not.toThrow();
    expect(() => keep(createPagoda({ tiers: 9 }))).not.toThrow();
    expect(() => createPagoda({ tiers: 2 })).toThrow(/3 to 9/);
    expect(() => createPagoda({ tiers: 10 })).toThrow(/3 to 9/);
  });
});

describe('wall factory', () => {
  it('measures a straight run', () => {
    const w = keep(createWall({ points: [[0, 0], [20, 0]], height: 3 }));
    expect(w.footprint.width).toBeGreaterThan(20.5);
    expect(w.footprint.width).toBeLessThan(21.5);
    expect(w.footprint.depth).toBeGreaterThan(0.9);
    expect(w.footprint.depth).toBeLessThan(1.5);
    expect(w.height).toBeGreaterThan(3.5);
    expect(w.solids.some((s) => inside(s, [10, 1.5, 0]))).toBe(true);
    expect(w.solids.some((s) => inside(s, [10, 1.5, 3]))).toBe(false);
  });

  it('follows a polyline with a corner and a diagonal', () => {
    const w = keep(createWall({ points: [[0, 0], [10, 0], [10, 10], [20, 20]] }));
    expect(w.footprint.width).toBeGreaterThan(20);
    expect(w.footprint.depth).toBeGreaterThan(20);
    expect(w.solids.some((s) => inside(s, [10, 1, 5]))).toBe(true);
    expect(w.solids.some((s) => inside(s, [15, 1, 15]))).toBe(true);
    expect(w.solids.some((s) => inside(s, [15, 1, 10]))).toBe(false);
  });

  it('needs two points', () => {
    expect(() => createWall({ points: [[0, 0]] })).toThrow(/two points/);
  });
});

describe('gate factory', () => {
  it('opens a passage and spans both wings', () => {
    const g = keep(createGate({ wing: 20 }));
    expect(g.footprint.width).toBeGreaterThan(40);
    const passageFront: [number, number, number] = [0, 0.7 + 1.5, -3.6 + 0.2];
    const passageBack: [number, number, number] = [0, 0.7 + 1.5, 3.6 - 0.2];
    expect(g.solids.some((s) => inside(s, passageFront))).toBe(false);
    expect(g.solids.some((s) => inside(s, passageBack))).toBe(false);
    const wingPoint: [number, number, number] = [g.footprint.width / 2 - 5, 1.5, 0];
    expect(g.solids.some((s) => inside(s, wingPoint))).toBe(true);
    expect(g.heightAt(0, 0)).toBeCloseTo(0.7, 6);
    expect(g.heightAt(g.footprint.width / 2 - 5, 0)).toBe(0);
  });
});

describe('determinism and geometry hygiene', () => {
  it('has no Math.random in the kit and repeats exactly for the same seed', () => {
    const dir = new URL('../src/kit/', import.meta.url);
    for (const file of readdirSync(dir)) {
      expect(readFileSync(new URL(file, dir), 'utf8')).not.toMatch(/Math\.random/);
    }
    const a = keep(createHall({ rng: createRng(7) }));
    const b = keep(createHall({ rng: createRng(7) }));
    const c = keep(createHall({ rng: createRng(8) }));
    const ribs = (x: Building): number[] => {
      let out: number[] = [];
      x.object.traverse((o) => {
        if (o.name === 'tile-ribs' && 'instanceColor' in o) {
          out = Array.from((o as unknown as { instanceColor: { array: Float32Array } }).instanceColor.array.slice(0, 60));
        }
      });
      return out;
    };
    expect(ribs(a)).toEqual(ribs(b));
    expect(ribs(a)).not.toEqual(ribs(c));
  });

  it('produces finite vertices and unit normals', () => {
    for (const b of [keep(createHall({ eaves: 2 })), keep(createPagoda({})), keep(createWall({ points: [[0, 0], [8, 3]] }))]) {
      b.object.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const g = o.geometry as BufferGeometry;
        const pos = g.getAttribute('position').array;
        const nor = g.getAttribute('normal').array;
        for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true);
        for (let i = 0; i < nor.length; i += 3) {
          const l = Math.hypot(nor[i] as number, nor[i + 1] as number, nor[i + 2] as number);
          expect(Math.abs(l - 1)).toBeLessThan(0.01);
        }
      });
    }
  });
});

describe('solids and platform helpers', () => {
  it('moves solids with a quarter turn exactly', () => {
    const box: Solid = { min: [-1, 0, -2], max: [3, 4, 2] };
    const moved = placeSolids([box], [10, 1, 20], Math.PI / 2)[0] as Solid;
    expect(moved.min).toEqual([8, 1, 17]);
    expect(moved.max).toEqual([12, 5, 21]);
    const p = toWorld(2, 1, [10, 0, 20], Math.PI / 2);
    const back = toLocal(p[0], p[1], [10, 0, 20], Math.PI / 2);
    expect(back[0]).toBeCloseTo(2, 9);
    expect(back[1]).toBeCloseTo(1, 9);
  });

  it('steps flat per tread, never more than one rise at a time', () => {
    const spec = { hx: 5, hz: 4, height: 1, stairs: { sides: ['front'] as const, width: 3 } };
    const n = 5;
    const rise = 1 / n;
    const run = 0.42;
    expect(platformHeightAt(spec, 0, 0)).toBe(1);
    for (let k = 1; k < n; k++) {
      expect(platformHeightAt(spec, 0, -(4 + (k - 0.5) * run))).toBeCloseTo(1 - k * rise, 9);
    }
    expect(platformHeightAt(spec, 0, -(4 + n * run + 0.1))).toBe(0);
    expect(platformHeightAt(spec, 4, -4.5)).toBe(0);
    let prev = 1;
    for (let out = 0.001; out < n * run + 0.2; out += 0.01) {
      const h = platformHeightAt(spec, 0, -(4 + out));
      expect(prev - h).toBeLessThanOrEqual(rise + 1e-9);
      expect(h).toBeLessThanOrEqual(prev + 1e-9);
      prev = h;
    }
  });

  it('refuses yaws that are not quarter turns', () => {
    const box: Solid = { min: [-1, 0, -1], max: [1, 1, 1] };
    expect(() => placeSolids([box], [0, 0, 0], Math.PI / 4)).toThrow(/multiple of PI\/2/);
    expect(() => placeSolids([box], [0, 0, 0], Number.NaN)).toThrow();
    expect(() => placeSolids([box], [0, 0, 0], Math.PI)).not.toThrow();
    expect(() => placeSolids([box], [0, 0, 0], -3 * Math.PI / 2)).not.toThrow();
  });
});

describe('collision boxes', () => {
  it('has the specific boxes a place relies on', () => {
    const hall = keep(createHall({ widthBays: 5, depthBays: 3 }));
    const ph = 1.1;
    const hz = 6 + 1.7;
    // Front wall, left of the door.
    expect(hall.solids.some((s) => inside(s, [-5, ph + 1, -6 + 0.2]))).toBe(true);
    // Platform side: blocks a point on the front rim face, at ground height, away from the stairs.
    expect(hall.solids.some((s) => inside(s, [-8, 0.5, -hz - 0.15]))).toBe(true);
    // The stairs stay open at ground and tread level.
    expect(hall.solids.some((s) => inside(s, [0, 0.4, -hz - 1.2]))).toBe(false);
    // Rim parapet beside the stairs, with the gap at the stairs open.
    expect(hall.solids.some((s) => inside(s, [-8, ph + 0.5, -hz + 0.32]))).toBe(true);
    expect(hall.solids.some((s) => inside(s, [0, ph + 0.5, -hz + 0.32]))).toBe(false);
    // Stair cheek wall, at the top and lower down.
    expect(hall.solids.some((s) => inside(s, [2.4, ph - 0.1, -hz - 0.2]))).toBe(true);
    expect(hall.solids.some((s) => inside(s, [2.4, 0.1, -hz - 1.5]))).toBe(true);
    expect(hall.solids.some((s) => inside(s, [2.4, ph - 0.1, -hz - 1.5]))).toBe(false);
  });

  it('gives the ground-tier pagoda corner posts a box each', () => {
    const p = keep(createPagoda({ tiers: 3 }));
    const w = 4.5;
    for (const [x, z] of [[-w, -w], [w, -w], [w, w], [-w, w]] as const) {
      expect(p.solids.some((s) => inside(s, [x, 1.3 + 1, z]))).toBe(true);
    }
  });

  it('only blocks where a wall post is drawn', () => {
    const open = keep(createWall({ points: [[0, 0], [10, 0]], endPosts: false }));
    const closed = keep(createWall({ points: [[0, 0], [10, 0]], endPosts: true }));
    expect(closed.solids.length).toBe(open.solids.length + 2);
  });

  it('keeps a 45 degree wall close to its real width', () => {
    const w = keep(createWall({ points: [[0, 0], [20, 20]], thickness: 0.9 }));
    // 1.5 m off the centre line is open ground; the diagonal's enclosing box would have blocked it.
    expect(w.solids.some((s) => inside(s, [10 + 1.0, 1, 10 - 1.0]))).toBe(false);
    expect(w.solids.some((s) => inside(s, [10, 1, 10]))).toBe(true);
  });
});

describe('disposal', () => {
  it('disposes every geometry, material and instanced mesh once, and survives a second call', () => {
    const geos = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const mats = vi.spyOn(Material.prototype, 'dispose');
    const insts = vi.spyOn(InstancedMesh.prototype, 'dispose');
    const hall = createHall({ widthBays: 3, depthBays: 2, eaves: 2 });
    const geoList = new Set<BufferGeometry>();
    const matList = new Set<Material>();
    const instList: InstancedMesh[] = [];
    hall.object.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      geoList.add(o.geometry as BufferGeometry);
      matList.add(o.material as Material);
      if (o instanceof InstancedMesh) instList.push(o);
    });
    expect(instList.length).toBeGreaterThan(3);
    geos.mockClear();
    mats.mockClear();
    insts.mockClear();
    hall.dispose();
    for (const g of geoList) expect(geos.mock.calls.filter((_, i) => geos.mock.contexts[i] === g).length).toBe(1);
    for (const m of matList) expect(mats.mock.calls.filter((_, i) => mats.mock.contexts[i] === m).length).toBe(1);
    for (const i of instList) expect(insts.mock.contexts.filter((c) => c === i).length).toBe(1);
    const before = [geos.mock.calls.length, mats.mock.calls.length, insts.mock.calls.length];
    hall.dispose();
    expect([geos.mock.calls.length, mats.mock.calls.length, insts.mock.calls.length]).toEqual(before);
  });

  it('does not free shared textures while another building still uses them', () => {
    const a = createHall({ widthBays: 3, depthBays: 2 });
    const b = createHall({ widthBays: 3, depthBays: 2 });
    let map: { dispose: () => void } | undefined;
    b.object.traverse((o) => {
      if (o.name === 'roof-surface') map = ((o as Mesh).material as unknown as { map: { dispose: () => void } }).map;
    });
    const spy = vi.spyOn(map as { dispose: () => void }, 'dispose');
    a.dispose();
    a.dispose();
    expect(spy).not.toHaveBeenCalled();
    b.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('kit-yard place', () => {
  it('has the stops the brief names and is a dev place', () => {
    expect(kitYard.dev).toBe(true);
    expect(kitYard.stops.map((s) => s.id)).toEqual(['overview', 'hall-front', 'hall-corner', 'roof-close', 'pagoda', 'wall-gate']);
  });

  it('builds with solids, ground and a spawn, and disposes', () => {
    const scene = new Scene();
    const instance = kitYard.build({ scene, rng: createRng(1) });
    expect(instance.solids.length).toBeGreaterThan(40);
    expect(instance.ground.heightAt(0, 56)).toBeGreaterThan(1);
    expect(instance.ground.heightAt(-200, -200)).toBe(0);
    expect(instance.spawn.position[1]).toBe(0);
    // Spawn is clear of every solid.
    const [sx, sy, sz] = instance.spawn.position;
    expect(instance.solids.some((s) => inside(s, [sx, sy + 1, sz]))).toBe(false);
    expect(scene.children).toContain(instance.root);
    instance.dispose();
    expect(scene.children).not.toContain(instance.root);
  });
});
