import { describe, expect, it } from 'vitest';
import { solveCamera } from '../src/game/player/camera-rig';
import { SolidGrid } from '../src/game/player/grid';
import { FIXED_DT, HERO_RADIUS, MOVE, NO_INPUT, spawnState, stepHero, type HeroInput, type HeroState, type World } from '../src/game/player/motion';
import { advance, createSim } from '../src/game/player/sim';
import type { Solid } from '../src/places/types';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Solid => ({ min: [x0, y0, z0], max: [x1, y1, z1] });

function makeWorld(opts: Partial<World> = {}): World {
  return { heightAt: () => 0, solids: [], spawn: { x: 0, y: 0, z: 0, facing: 0 }, killY: MOVE.killY, ...opts };
}

function steps(w: World, from: HeroState, input: (s: HeroState, i: number) => HeroInput, n: number): HeroState[] {
  const trail: HeroState[] = [];
  let s = from;
  for (let i = 0; i < n; i++) {
    s = stepHero(s, input(s, i), FIXED_DT, w);
    trail.push(s);
  }
  return trail;
}

function frames(w: World, from: HeroState, input: (s: HeroState) => HeroInput, seconds: number, fps: number): HeroState {
  const sim = createSim(w);
  sim.state = from;
  sim.previous = from;
  for (let i = 0; i < Math.round(seconds * fps); i++) advance(sim, input(sim.state), 1 / fps, w);
  return sim.state;
}

const forward = (extra: Partial<HeroInput> = {}): HeroInput => ({ ...NO_INPUT, moveZ: 1, ...extra });

describe('frame rate', () => {
  it('gives exactly the same final state at 60 and 120 fps for constant input', () => {
    const w = makeWorld({ solids: [box(-3, 0, 12, 3, 2, 14)] });
    const input = (): HeroInput => forward({ sprint: true, jump: true });
    const a = frames(w, spawnState(w), input, 3, 60);
    const b = frames(w, spawnState(w), input, 3, 120);
    expect(a).toEqual(b);
  });

  it('a tap is one pressed step: it neither vanishes nor becomes a hold', () => {
    const w = makeWorld();
    for (const fps of [10, 144]) {
      // A tap seen between frames, key already up again. The latch holds until a frame runs a step.
      const hop = createSim(w);
      let apex = 0;
      let framesWithoutStep = 0;
      while (advance(hop, NO_INPUT, 1 / fps, w, true) === 0) framesWithoutStep++;
      expect(framesWithoutStep).toBe(fps === 144 ? 1 : 0); // 144 fps: the first frame is too short for a step
      for (let i = 0; i < fps; i++) {
        advance(hop, NO_INPUT, 1 / fps, w);
        apex = Math.max(apex, hop.state.y);
      }
      // A hop (the key was not held), not a full jump, and it has landed again.
      expect(apex).toBeGreaterThan(0.1);
      expect(apex).toBeLessThan(1.2);
      expect(hop.state.grounded).toBe(true);
    }
  });
});

describe('thin walls and seams', () => {
  it('a leap into a 0.2 m wall does not tunnel, even with a 0.1 s frame', () => {
    const w = makeWorld({ solids: [box(-10, 0, 10, 10, 12, 10.2)] });
    for (const fps of [10, 30, 60, 144]) {
      let flew = false;
      const end = frames(
        w,
        spawnState(w),
        (s) => {
          if (!s.grounded) flew = true;
          return forward({ sprint: true, jump: s.z > 0 && !flew });
        },
        4,
        fps,
      );
      expect(end.z).toBeLessThan(10 - HERO_RADIUS + 1e-6);
      expect(end.respawns).toBe(0);
    }
  });

  it('slides along a wall of abutting boxes without snagging at the seams', () => {
    const wall = Array.from({ length: 14 }, (_, i) => box(-28 + i * 4, 0, 5, -24 + i * 4, 6, 6));
    const w = makeWorld({ solids: wall });
    // Camera yaw 0: D strafes towards -x. Press into the wall and along it.
    const trail = steps(w, spawnState(w), () => ({ ...NO_INPUT, moveZ: 1, moveX: 1 }), 480);
    const end = trail.at(-1)!;
    expect(end.z).toBeLessThanOrEqual(5 - HERO_RADIUS + 1e-6);
    // 4 s at 6.5 m/s: diagonal sliding should cover most of 26 m along the wall, crossing 3+ seams, never stalling.
    expect(-end.x).toBeGreaterThan(14);
    let stalled = 0;
    for (const s of trail.slice(60)) if (Math.hypot(s.vx, s.vz) < 1) stalled++;
    expect(stalled).toBe(0);
  });
});

describe('roof edges', () => {
  it('stands to the true edge of a roof and falls from there, not 0.35 m beyond', () => {
    const w = makeWorld({ solids: [box(-10, 0, -5, 0, 4, 5)] });
    const start: HeroState = { ...spawnState(w), x: -2, y: 4 };
    const trail = steps(w, start, () => forward({ cameraYaw: Math.PI / 2 }), 240);
    const fall = trail.findIndex((s) => !s.grounded);
    expect(fall).toBeGreaterThan(0);
    expect(trail[fall - 1]!.x).toBeLessThanOrEqual(0.08 + 0.06);
    expect(trail[fall]!.x).toBeGreaterThan(0.05);
  });

  it('a hero landing beside a wall is pushed clear instead of being put back', () => {
    const w = makeWorld({ solids: [box(-10, 0, -5, 0, 4, 5)] });
    const start: HeroState = { ...spawnState(w), x: 0.1, y: 3 };
    const trail = steps(w, start, () => NO_INPUT, 300);
    const end = trail.at(-1)!;
    expect(end.respawns).toBe(0);
    expect(end.y).toBe(0);
    expect(end.x).toBeGreaterThanOrEqual(HERO_RADIUS - 1e-6);
  });

  it('an airborne hero is not popped up onto a low ledge it has not cleared', () => {
    const w = makeWorld({ solids: [box(2, 0, -5, 6, 0.5, 5)] });
    const start: HeroState = { ...spawnState(w), x: 0, y: 0.15, vy: 4, grounded: false, airTime: 1 };
    const trail = steps(w, start, () => forward({ cameraYaw: Math.PI / 2, sprint: true }), 10);
    for (const s of trail) expect(s.x).toBeLessThanOrEqual(2 - HERO_RADIUS + 1e-6);
  });
});

describe('ground faces', () => {
  const steep = (deg: number, top = 5): Pick<World, 'heightAt'> => ({
    heightAt: (_x, z) => (z < 0 ? top : Math.max(0, top - z * Math.tan((deg * Math.PI) / 180))),
  });

  it('sprinting off an 80 degree face makes the hero airborne instead of gluing it to the face', () => {
    const w = makeWorld(steep(80));
    const start: HeroState = { ...spawnState(w), z: -4, y: 5 };
    const trail = steps(w, start, () => forward({ sprint: true }), 240);
    const onFace = trail.filter((s) => s.z > 0.05 && s.z < 0.8 && s.grounded);
    expect(onFace).toHaveLength(0);
    expect(trail.some((s) => !s.grounded)).toBe(true);
    expect(trail.at(-1)!.y).toBe(0);
  });

  it('still follows a 40 degree slope down while running', () => {
    const w = makeWorld(steep(40, 3));
    const start: HeroState = { ...spawnState(w), z: -4, y: 3 };
    const trail = steps(w, start, () => forward(), 240);
    const onSlope = trail.filter((s) => s.z > 0.5 && s.z < 3);
    expect(onSlope.length).toBeGreaterThan(10);
    expect(onSlope.every((s) => s.grounded)).toBe(true);
  });

  it('never records a safe position on ground steeper than the walkable limit', () => {
    const w = makeWorld(steep(70));
    const far = { x: 50, y: 0, z: 50 };
    const start: HeroState = { ...spawnState(w), z: 0.5, y: 5 - 0.5 * Math.tan((70 * Math.PI) / 180), safe: far };
    const trail = steps(w, start, () => NO_INPUT, 360);
    expect(trail.every((s) => s.safe.x === 50)).toBe(true);
  });

  it('records one on walkable ground', () => {
    const w = makeWorld(steep(30, 2));
    const start: HeroState = { ...spawnState(w), z: 1, y: 2 - Math.tan((30 * Math.PI) / 180), safe: { x: 50, y: 0, z: 50 } };
    const trail = steps(w, start, () => NO_INPUT, 120);
    expect(trail.at(-1)!.safe.x).not.toBe(50);
  });

  it('the body stops a radius short of a cliff face', () => {
    const w = makeWorld({ heightAt: (_x, z) => (z < 3 ? 0 : 3.2) });
    const trail = steps(w, spawnState(w), () => forward({ sprint: true }), 360);
    expect(trail.at(-1)!.z).toBeLessThanOrEqual(3 - HERO_RADIUS + 1e-6);
  });

  it('slides along a diagonal cliff instead of sticking to it', () => {
    const w = makeWorld({ heightAt: (x, z) => (x + z > 10 ? 3.2 : 0) });
    const trail = steps(w, spawnState(w), () => forward(), 600);
    const end = trail.at(-1)!;
    expect(end.x).toBeLessThan(-6); // slid away along the face
    expect(end.x + end.z).toBeLessThan(10);
    expect(Math.hypot(end.vx, end.vz)).toBeGreaterThan(2);
  });
});

describe('stairs and cheek walls', () => {
  it('a hero beside a low cheek wall is not lifted onto it', () => {
    const w = makeWorld({ solids: [box(1.5, 0, 0, 1.8, 0.3, 12)] });
    const start: HeroState = { ...spawnState(w), x: 1.3, z: 0.5 };
    const trail = steps(w, start, () => forward(), 120);
    for (const s of trail) expect(s.y).toBe(0);
  });
});

describe('camera against corners', () => {
  it('stays outside solids when the lagging eye has slid past a corner', () => {
    const wall = box(0, 0, 0, 6, 8, 6);
    const w = makeWorld({ solids: [wall] });
    const trueEye = [-0.9, 1.5, 3] as const; // hero just outside the wall
    const lagging = [1.2, 1.5, 3] as const; // smoothed eye, now inside it
    const c = solveCamera(w, lagging, Math.PI / 2, 0.2, 8, trueEye);
    for (const [x, y, z] of [
      [c.originX, c.originY, c.originZ],
      [c.x, c.y, c.z],
    ] as const) {
      const inside = x > 0 && x < 6 && y > 0 && y < 8 && z > 0 && z < 6;
      expect(inside).toBe(false);
    }
  });
});

describe('broad phase', () => {
  const lattice = (): Solid[] => {
    const out: Solid[] = [];
    for (let i = 0; i < 70; i++) {
      for (let j = 0; j < 72; j++) out.push(box(i * 6 + 1, 0, j * 6 + 1, i * 6 + 2, 3, j * 6 + 2));
    }
    return out; // 5,040 solids
  };

  it('gives the same result with and without the grid', () => {
    const solids = lattice();
    const plain = makeWorld({ solids });
    const gridded = makeWorld({ solids, grid: new SolidGrid(solids) });
    const input = (_s: HeroState, i: number): HeroInput => ({ ...NO_INPUT, moveZ: 1, moveX: Math.sin(i / 50), sprint: true, jump: i % 200 > 120 });
    const a = steps(plain, { ...spawnState(plain), x: 3, z: 3 }, input, 600);
    const b = steps(gridded, { ...spawnState(gridded), x: 3, z: 3 }, input, 600);
    expect(b).toEqual(a);
  });

  it('keeps 1,000 steps among 5,000 solids well under a second', () => {
    const solids = lattice();
    const w = makeWorld({ solids, grid: new SolidGrid(solids) });
    expect(solids.length).toBeGreaterThan(5000);
    const start = performance.now();
    steps(w, { ...spawnState(w), x: 3, z: 3 }, (_s, i) => ({ ...NO_INPUT, moveZ: 1, moveX: Math.sin(i / 30), sprint: true }), 1000);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
