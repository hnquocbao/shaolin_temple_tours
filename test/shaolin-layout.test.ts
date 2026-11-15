import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng, seedFrom } from '../src/engine/rng';
import type { Building } from '../src/kit';
import { FIXED_DT, HERO_HEIGHT, HERO_RADIUS, NO_INPUT, spawnState, stepHero, type HeroState, type World } from '../src/game/player/motion';
import { worldFromPlace } from '../src/game/player/world';
import { shaolin, buildLayoutBuilding } from '../src/places/shaolin';
import { GATE_HALF, WALL_X, layout, positionOf, wallRuns, yawOf, type LayoutBuilding } from '../src/places/shaolin/layout';
import { TERRACE_COUNT, createShaolinTerrain, terraces } from '../src/places/shaolin/terrain';
import { placeSolids } from '../src/kit';

const built = new Map<string, Building>(layout.map((b) => [b.id, buildLayoutBuilding(b)]));
const get = (b: LayoutBuilding): Building => {
  const r = built.get(b.id);
  if (!r) throw new Error(`no building ${b.id}`);
  return r;
};

interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** How far the steps reach past the platform in front (-z) and behind (+z), measured on the axis of the building. */
function stairReach(b: Building): { front: number; back: number } {
  const hz = b.footprint.depth / 2;
  const reach = (sign: number): number => {
    let out = 0;
    for (let d = 0.05; d < 8; d += 0.05) if (b.heightAt(0, sign * (hz + d)) > 0) out = d;
    return out;
  };
  return { front: reach(-1), back: reach(1) };
}

/** World bounding box of the platform; with `steps` also of the steps in front and behind. */
function boxOf(entry: LayoutBuilding, steps: boolean): Box {
  const b = get(entry);
  const [px, , pz] = positionOf(entry);
  const reach = steps ? stairReach(b) : { front: 0, back: 0 };
  const lx0 = -b.footprint.width / 2;
  const lx1 = b.footprint.width / 2;
  const lz0 = -b.footprint.depth / 2 - reach.front;
  const lz1 = b.footprint.depth / 2 + reach.back;
  const c = Math.round(Math.cos(yawOf(entry)));
  const s = Math.round(Math.sin(yawOf(entry)));
  const xs: number[] = [];
  const zs: number[] = [];
  for (const x of [lx0, lx1]) {
    for (const z of [lz0, lz1]) {
      xs.push(x * c + z * s + px);
      zs.push(-x * s + z * c + pz);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

const worldOf = (): World => worldFromPlace(shaolin.build({ scene: new Scene(), rng: createRng(seedFrom('shaolin')) }));

describe('Shaolin layout data', () => {
  it('has seven axis halls, one per terrace, in order, all facing south', () => {
    const axis = layout.filter((b) => b.role === 'axis');
    expect(axis.map((b) => b.id)).toEqual([
      'mountain-gate',
      'heavenly-kings-hall',
      'mahavira-hall',
      'sutra-library',
      'abbot-room',
      'lixue-pavilion',
      'thousand-buddha-hall',
    ]);
    axis.forEach((b, i) => {
      expect(b.terrace).toBe(i);
      expect(b.turns).toBe(0);
      expect(b.offset[0]).toBe(0);
    });
  });

  it('names everything in Chinese, Vietnamese and English with unique ids', () => {
    expect(new Set(layout.map((b) => b.id)).size).toBe(layout.length);
    for (const b of layout) {
      expect(b.name.zh).toMatch(/\p{Script=Han}/u);
      expect(b.name.vi.length).toBeGreaterThan(2);
      expect(b.name.en.length).toBeGreaterThan(2);
    }
  });

  it('gives the axis the bays the design asks for, the Mahavira Hall the greatest height and the Thousand Buddha Hall the greatest width', () => {
    const p = (id: string) => layout.find((b) => b.id === id)?.params as { widthBays?: number; depthBays?: number; eaves?: number; roof?: string };
    expect(p('mountain-gate')).toMatchObject({ widthBays: 3, depthBays: 2 });
    expect(p('heavenly-kings-hall')).toMatchObject({ widthBays: 5, eaves: 2 });
    expect(p('mahavira-hall')).toMatchObject({ widthBays: 5, depthBays: 4, eaves: 2 });
    expect(p('sutra-library')).toMatchObject({ widthBays: 5, eaves: 2 });
    expect(p('abbot-room')).toMatchObject({ widthBays: 5, eaves: 1 });
    expect(p('lixue-pavilion')).toMatchObject({ widthBays: 3, depthBays: 3, roof: 'hip' });
    expect(p('thousand-buddha-hall')).toMatchObject({ widthBays: 7 });
    const axisBuildings = layout.filter((b) => b.role === 'axis' && b.id !== 'mountain-gate').map((b) => get(b));
    expect(Math.max(...axisBuildings.map((b) => b.height))).toBe(get(layout.find((b) => b.id === 'mahavira-hall') as LayoutBuilding).height);
    expect(Math.max(...axisBuildings.map((b) => b.footprint.width))).toBe(get(layout.find((b) => b.id === 'thousand-buddha-hall') as LayoutBuilding).footprint.width);
  });

  it('flanks the Mahavira court with the Bell Tower in the east (+x) and the Drum Tower in the west', () => {
    const bell = layout.find((b) => b.id === 'bell-tower') as LayoutBuilding;
    const drum = layout.find((b) => b.id === 'drum-tower') as LayoutBuilding;
    expect(bell.terrace).toBe(2);
    expect(drum.terrace).toBe(2);
    expect(bell.offset[0]).toBeGreaterThan(0);
    expect(drum.offset[0]).toBeLessThan(0);
    expect(get(bell).height).toBeGreaterThan(18);
  });

  it('has side buildings on at least four terraces, a pagoda of seven tiers or more and two or three smaller landmarks', () => {
    const sideTerraces = new Set(layout.filter((b) => b.role === 'side' || b.role === 'tower').map((b) => b.terrace));
    expect(sideTerraces.size).toBeGreaterThanOrEqual(4);
    const pagodas = layout.filter((b) => b.kind === 'pagoda');
    expect(pagodas.some((b) => (b.params as { tiers: number }).tiers >= 7)).toBe(true);
    const smaller = layout.filter((b) => b.role === 'landmark' && !(b.kind === 'pagoda' && (b.params as { tiers: number }).tiers >= 7));
    expect(smaller.length).toBeGreaterThanOrEqual(2);
    expect(smaller.length).toBeLessThanOrEqual(3);
  });

  it('keeps every footprint, steps included, inside its terrace flat part', () => {
    for (const b of layout) {
      const t = terraces[b.terrace];
      if (!t) throw new Error('terrace');
      const box = boxOf(b, true);
      expect(box.minX, `${b.id} minX`).toBeGreaterThanOrEqual(t.flat.minX - 1e-6);
      expect(box.maxX, `${b.id} maxX`).toBeLessThanOrEqual(t.flat.maxX + 1e-6);
      expect(box.minZ, `${b.id} minZ`).toBeGreaterThanOrEqual(t.flat.minZ - 1e-6);
      expect(box.maxZ, `${b.id} maxZ`).toBeLessThanOrEqual(t.flat.maxZ + 1e-6);
      // Inside the perimeter wall too.
      expect(box.maxX).toBeLessThan(WALL_X - 1);
      expect(box.minX).toBeGreaterThan(-WALL_X + 1);
    }
  });

  it('stands every building on ground that varies by less than 0.3 m across its footprint', () => {
    const terrain = createShaolinTerrain(seedFrom('shaolin'));
    for (const b of layout) {
      const box = boxOf(b, false);
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i <= 8; i++) {
        for (let j = 0; j <= 8; j++) {
          const h = terrain.heightAt(box.minX + ((box.maxX - box.minX) * i) / 8, box.minZ + ((box.maxZ - box.minZ) * j) / 8);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      expect(hi - lo, b.id).toBeLessThan(0.3);
      expect(positionOf(b)[1], b.id).toBeCloseTo(lo, 1);
    }
  });

  it('keeps footprints apart (steps included)', () => {
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = boxOf(layout[i] as LayoutBuilding, true);
        const b = boxOf(layout[j] as LayoutBuilding, true);
        const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
        expect(overlap, `${layout[i]?.id} overlaps ${layout[j]?.id}`).toBe(false);
      }
    }
  });

  it('puts the gate passage on the axis, open for the hero', () => {
    const gate = layout.find((b) => b.id === 'mountain-gate') as LayoutBuilding;
    expect(gate.offset[0]).toBe(0);
    const [x, y, z] = positionOf(gate);
    const solids = placeSolids(get(gate).solids, [x, y, z], yawOf(gate));
    const d = get(gate).footprint.depth;
    for (let k = -d / 2 - 2; k <= d / 2 + 2; k += 0.25) {
      for (const s of solids) {
        const inPath = Math.abs(0 - (s.min[0] + s.max[0]) / 2) < (s.max[0] - s.min[0]) / 2 + HERO_RADIUS && k + z > s.min[2] - HERO_RADIUS && k + z < s.max[2] + HERO_RADIUS;
        const standing = y + 0.55 < s.max[1] && y + HERO_HEIGHT > s.min[1];
        expect(inPath && standing, `solid blocks the passage at z=${z + k}`).toBe(false);
      }
    }
  });

  it('runs the perimeter wall clear of the stair and the gate passage', () => {
    for (const run of wallRuns()) {
      for (const [x, z] of run.points) {
        if (z < -19) throw new Error(`${run.id} reaches the stair side`);
        if (Math.abs(x) < GATE_HALF && run.id.startsWith('wall-south')) throw new Error(`${run.id} enters the gate platform`);
      }
      const xs = run.points.map((p) => p[0]);
      if (run.id.startsWith('wall-south')) expect(Math.min(...xs.map(Math.abs))).toBeGreaterThanOrEqual(GATE_HALF + 6);
    }
  });
});

/** Walk through waypoints at a run; returns the final state. */
function walk(w: World, from: HeroState, points: readonly (readonly [number, number])[], maxSeconds = 40): HeroState {
  let s = from;
  for (const [tx, tz] of points) {
    const limit = Math.round(maxSeconds / FIXED_DT);
    for (let i = 0; i < limit; i++) {
      const dx = tx - s.x;
      const dz = tz - s.z;
      if (Math.hypot(dx, dz) < 0.7) break;
      s = stepHero(s, { ...NO_INPUT, moveZ: 1, cameraYaw: Math.atan2(dx, dz) }, FIXED_DT, w);
    }
    expect(Math.hypot(tx - s.x, tz - s.z), `reached waypoint ${tx},${tz}`).toBeLessThan(0.8);
  }
  return s;
}

describe('Shaolin on foot', () => {
  const w = worldOf();
  const court = (i: number): [number, number] => [0, i === 0 ? -2 : terraces[i]!.centerZ - 12];

  it('runs from the spawn up the stair and through the Mountain Gate onto terrace 0', () => {
    const end = walk(w, spawnState(w), [[0, -20], [0, -2]], 40);
    expect(end.respawns).toBe(0);
    expect(end.y).toBeCloseTo(terraces[0]!.top, 1);
    expect(end.grounded).toBe(true);
  });

  for (let i = 1; i < TERRACE_COUNT; i++) {
    it(`walks from the courtyard of terrace ${i - 1} around the hall to the courtyard of terrace ${i}`, () => {
      const [fx, fz] = court(i - 1);
      const start: HeroState = { ...spawnState(w), x: fx, z: fz, y: w.heightAt(fx, fz) };
      const lane = 22;
      const [tx, tz] = court(i);
      const end = walk(w, start, [[lane, fz], [lane, tz], [tx, tz]], 40);
      expect(end.respawns).toBe(0);
      expect(end.y).toBeCloseTo(terraces[i]!.top, 1);
    });
  }
});
