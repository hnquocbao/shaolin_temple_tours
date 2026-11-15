import { describe, expect, it } from 'vitest';
import { FIXED_DT, HERO_HEIGHT, MOVE, NO_INPUT, spawnState, stepHero, type HeroInput, type HeroState, type World } from '../src/game/player/motion';
import { advance, createSim } from '../src/game/player/sim';
import type { Solid } from '../src/places/types';

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Solid => ({
  min: [x0, y0, z0],
  max: [x1, y1, z1],
});

function makeWorld(opts: Partial<World> & { spawn?: Partial<World['spawn']> } = {}): World {
  return {
    heightAt: opts.heightAt ?? (() => 0),
    solids: opts.solids ?? [],
    spawn: { x: 0, y: 0, z: 0, facing: 0, ...opts.spawn },
    killY: opts.killY ?? MOVE.killY,
  };
}

const forward = (extra: Partial<HeroInput> = {}): HeroInput => ({ ...NO_INPUT, moveZ: 1, ...extra });

/** Run `seconds` at `fps` frames per second with the same input, through the fixed-step driver. */
function simulate(world: World, input: HeroInput | ((s: HeroState, t: number) => HeroInput), seconds: number, fps: number, from?: HeroState) {
  const sim = createSim(world);
  if (from) {
    sim.state = from;
    sim.previous = from;
  }
  const dt = 1 / fps;
  const frames = Math.round(seconds * fps);
  let maxY = sim.state.y;
  let maxX = sim.state.x;
  for (let i = 0; i < frames; i++) {
    const inp = typeof input === 'function' ? input(sim.state, i * dt) : input;
    advance(sim, inp, dt, world);
    maxY = Math.max(maxY, sim.state.y);
    maxX = Math.max(maxX, sim.state.x);
  }
  return { state: sim.state, maxY, maxX };
}

/** Step directly at the fixed step, for physics measurements. */
function steps(world: World, from: HeroState, input: (s: HeroState, i: number) => HeroInput, n: number) {
  let s = from;
  const trail: HeroState[] = [];
  for (let i = 0; i < n; i++) {
    s = stepHero(s, input(s, i), FIXED_DT, world);
    trail.push(s);
  }
  return trail;
}

describe('running', () => {
  it('runs at the run speed and sprints at the sprint speed', () => {
    const world = makeWorld();
    const run = simulate(world, forward(), 2, 60).state;
    expect(Math.hypot(run.vx, run.vz)).toBeCloseTo(MOVE.runSpeed, 2);
    const sprint = simulate(world, forward({ sprint: true }), 2, 60).state;
    expect(Math.hypot(sprint.vx, sprint.vz)).toBeCloseTo(MOVE.sprintSpeed, 2);
    expect(sprint.z).toBeGreaterThan(run.z + 5);
  });

  it('moves relative to the camera heading and normalises diagonals', () => {
    const world = makeWorld();
    // Camera looks towards +x: forward is +x, right (D) is +z.
    const s = simulate(world, { ...NO_INPUT, moveZ: 1, moveX: 1, cameraYaw: Math.PI / 2 }, 1.5, 60).state;
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vz).toBeGreaterThan(0);
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(MOVE.runSpeed, 2);
  });

  it('stops when the keys are released, and faces the way it travelled', () => {
    const world = makeWorld();
    const s = simulate(world, (_s, t) => (t < 1 ? { ...NO_INPUT, moveX: -1 } : NO_INPUT), 2, 60).state;
    expect(Math.hypot(s.vx, s.vz)).toBe(0);
    expect(s.heading).toBeCloseTo(Math.PI / 2, 1); // strafing left faces +x
  });
});

describe('jumping', () => {
  it('a normal jump rises about 1.7 m', () => {
    const world = makeWorld();
    const trail = steps(world, spawnState(world), (_s, i) => ({ ...NO_INPUT, jump: i < 400 }), 240);
    const apex = Math.max(...trail.map((s) => s.y));
    expect(apex).toBeGreaterThan(1.55);
    expect(apex).toBeLessThan(1.9);
    expect(trail.at(-1)?.grounded).toBe(true);
  });

  it('releasing Space early gives a shorter hop', () => {
    const world = makeWorld();
    const trail = steps(world, spawnState(world), (_s, i) => ({ ...NO_INPUT, jump: i < 12 }), 240);
    expect(Math.max(...trail.map((s) => s.y))).toBeLessThan(1.3);
  });

  it('does not jump again while Space stays held after landing', () => {
    const world = makeWorld();
    const trail = steps(world, spawnState(world), () => ({ ...NO_INPUT, jump: true }), 600);
    const landings = trail.filter((s, i) => s.grounded && !(trail[i - 1]?.grounded ?? true)).length;
    expect(landings).toBeLessThanOrEqual(1);
  });
});

describe('lightness leap', () => {
  const world = makeWorld();

  /** Sprint for a second, then leap holding Space until the hero lands. */
  function leapFlat(holdSpace = true) {
    let landed = false;
    let leapStarted = false;
    return steps(
      world,
      spawnState(world),
      (s, i) => {
        if (i < 120) return forward({ sprint: true });
        if (!leapStarted) leapStarted = true;
        if (leapStarted && i > 130 && s.grounded) landed = true;
        return forward({ sprint: true, jump: holdSpace && !landed });
      },
      1000,
    );
  }

  it('is higher and far longer than a normal jump', () => {
    const trail = leapFlat();
    const start = trail[119]!;
    const apex = Math.max(...trail.map((s) => s.y));
    const landing = trail.findIndex((s, i) => i > 125 && s.grounded);
    const reach = trail[landing]!.z - start.z;
    expect(apex).toBeGreaterThan(7.5);
    expect(apex).toBeLessThan(10);
    expect(reach).toBeGreaterThan(22);
    expect(reach).toBeLessThan(40);
    // A clear arc, not a jetpack: it keeps rising to an apex then comes down.
    const apexAt = trail.findIndex((s) => s.y === apex);
    expect(apexAt).toBeGreaterThan(125);
    expect(trail[apexAt + 30]!.y).toBeLessThan(apex);
  });

  it('falls gently: the fall speed while floating is capped', () => {
    const trail = leapFlat();
    const slowest = Math.min(...trail.map((s) => s.vy));
    expect(slowest).toBeGreaterThanOrEqual(-MOVE.leapFloatFall - 1e-9);
  });

  it('floats only while Space is held: releasing it cuts the leap short', () => {
    const held = leapFlat(true);
    const cut = (() => {
      let released = false;
      return steps(
        world,
        spawnState(world),
        (s, i) => {
          if (i < 120) return forward({ sprint: true });
          if (i > 130 && s.vy < 0) released = true;
          return forward({ sprint: true, jump: !released });
        },
        1000,
      );
    })();
    const reachOf = (t: HeroState[]) => t[t.findIndex((s, i) => i > 125 && s.grounded)]!.z;
    expect(reachOf(cut)).toBeLessThan(reachOf(held) - 4);
  });

  it('needs sprint: Space alone is only a normal jump', () => {
    const trail = steps(world, spawnState(world), (_s, i) => forward({ jump: i > 60 && i < 300 }), 300);
    expect(Math.max(...trail.map((s) => s.y))).toBeLessThan(2);
    expect(trail.some((s) => s.leaping)).toBe(false);
  });

  /** Sprint along +x, leap holding Space once past `launchX`, and brake in the air past `brakeX`. */
  function leapAlongX(w: World, from: HeroState, launchX: number, brakeX: number) {
    let flew = false;
    let done = false;
    return steps(
      w,
      from,
      (s) => {
        if (!s.grounded) flew = true;
        else if (flew) done = true;
        const jump = s.x > launchX && !done;
        return { ...NO_INPUT, moveZ: !s.grounded && s.x > brakeX ? -1 : done ? 0 : 1, cameraYaw: Math.PI / 2, sprint: true, jump };
      },
      1500,
    );
  }

  it('two leaps reach a 12 m rooftop, starting from the ground', () => {
    const a = box(10, 0, -10, 40, 5, 10); // 5 m lower roof
    const b = box(50, 0, -10, 80, 12, 10); // 12 m tower
    const w = makeWorld({ solids: [a, b] });
    const t1 = leapAlongX(w, { ...spawnState(w), x: -6 }, 0, 25);
    const last1 = t1.at(-1)!;
    expect(last1.grounded).toBe(true);
    expect(last1.y).toBe(5);
    const t2 = leapAlongX(w, { ...last1, vx: 0, vz: 0 }, 34, 62);
    const last2 = t2.at(-1)!;
    expect(last2.grounded).toBe(true);
    expect(last2.y).toBe(12);
    expect(Math.max(...t2.map((s) => s.y))).toBeGreaterThan(12.5);
    expect(last2.respawns).toBe(0);
  });

  it('crosses a 15 m gap between two platforms', () => {
    const p1 = box(-30, 0, -10, 0, 6, 10);
    const p2 = box(15, 0, -10, 45, 6, 10);
    const w = makeWorld({ solids: [p1, p2] });
    const t = leapAlongX(w, { ...spawnState(w), x: -25, y: 6 }, -0.8, 30);
    const last = t.at(-1)!;
    expect(last.grounded).toBe(true);
    expect(last.y).toBe(6);
    expect(last.x).toBeGreaterThan(15);
    expect(last.respawns).toBe(0);
  });
});

describe('frame rate independence', () => {
  it('gives the same result at 30, 60 and 144 fps for the same input', () => {
    const world = makeWorld({ solids: [box(5, 0, 20, 15, 3, 30)] });
    const input = (_s: HeroState, t: number): HeroInput => ({
      ...NO_INPUT,
      moveZ: 1,
      moveX: t > 1.5 ? 0.4 : 0,
      sprint: t > 0.5,
      jump: t > 1 && t < 1.6,
    });
    const results = [30, 60, 144].map((fps) => simulate(world, input, 3, fps).state);
    const ref = results[1]!;
    for (const r of results) {
      expect(Math.abs(r.x - ref.x)).toBeLessThan(0.3);
      expect(Math.abs(r.y - ref.y)).toBeLessThan(0.3);
      expect(Math.abs(r.z - ref.z)).toBeLessThan(0.3);
    }
  });

  it('survives a huge frame without tunnelling through a thin wall', () => {
    const world = makeWorld({ solids: [box(-5, 0, 3, 5, 4, 3.2)] });
    const sim = createSim(world);
    for (let i = 0; i < 10; i++) advance(sim, forward({ sprint: true }), 0.1, world);
    expect(sim.state.z).toBeLessThan(3);
    expect(sim.state.respawns).toBe(0);
  });
});

describe('solids', () => {
  const wall = box(-10, 0, 5, 10, 6, 6);
  const world = makeWorld({ solids: [wall] });

  it('is blocked by a wall', () => {
    const s = simulate(world, forward({ sprint: true }), 3, 60).state;
    expect(s.z).toBeLessThanOrEqual(5 + 1e-6); // radius keeps it off the face
    expect(s.z).toBeGreaterThan(4.4);
    expect(s.vz).toBe(0);
  });

  it('slides along a wall when walking into it at an angle', () => {
    const s = simulate(world, { ...NO_INPUT, moveZ: 1, moveX: 1, cameraYaw: 0 }, 2, 60).state;
    // D is -x with camera yaw 0 (right is -x when facing +z). It keeps moving sideways while pressed against the wall.
    expect(s.z).toBeLessThan(5);
    expect(Math.abs(s.x)).toBeGreaterThan(3);
  });

  it('lands on top of a solid and stands there', () => {
    const w = makeWorld({ solids: [box(-3, 0, 4, 3, 1.2, 14)] });
    // Run at it and jump: a 1.2 m block is above a step but below a jump.
    let flew = false;
    let done = false;
    const t = steps(
      w,
      { ...spawnState(w), z: -4 },
      (s) => {
        if (!s.grounded) flew = true;
        else if (flew) done = true;
        return { ...forward({ jump: s.z > 1.5 && !done }), moveZ: s.z > 8 ? 0 : 1 };
      },
      600,
    );
    const last = t.at(-1)!;
    expect(last.y).toBe(1.2);
    expect(last.grounded).toBe(true);
    expect(last.z).toBeGreaterThan(3.5);
  });

  it('bumps its head on an overhang instead of passing through', () => {
    const w = makeWorld({ solids: [box(-5, 3, -5, 5, 4, 5)] });
    const t = steps(w, spawnState(w), (_s, i) => ({ ...NO_INPUT, jump: i < 200 }), 200);
    expect(Math.max(...t.map((s) => s.y))).toBeLessThanOrEqual(3 - HERO_HEIGHT + 1e-6 + 0.0001);
  });
});

describe('ground', () => {
  it('walks up ground steps of normal height', () => {
    const w = makeWorld({ heightAt: (_x, z) => (z < 3 ? 0 : z < 6 ? 0.5 : z < 9 ? 1 : 1.5) });
    const s = simulate(w, forward(), 3, 60).state;
    expect(s.z).toBeGreaterThan(12);
    expect(s.y).toBeCloseTo(1.5, 5);
  });

  it('is stopped by a cliff the height of a terrace', () => {
    const w = makeWorld({ heightAt: (_x, z) => (z < 3 ? 0 : 3.2) });
    const s = simulate(w, forward({ sprint: true }), 3, 60).state;
    expect(s.z).toBeLessThan(3);
    expect(s.y).toBe(0);
  });

  it('walks up a 40 degree slope but not a 60 degree one', () => {
    const slope = (deg: number) => makeWorld({ heightAt: (_x, z) => Math.max(0, (z - 2) * Math.tan((deg * Math.PI) / 180)) });
    const up40 = simulate(slope(40), forward(), 2, 60).state;
    expect(up40.z).toBeGreaterThan(8);
    expect(up40.y).toBeGreaterThan(5);
    const up60 = simulate(slope(60), forward(), 2, 60).state;
    expect(up60.z).toBeLessThan(3);
  });

  it('stays on the ground walking down steps', () => {
    const w = makeWorld({ heightAt: (_x, z) => (z < 3 ? 1.2 : z < 6 ? 0.8 : z < 9 ? 0.4 : 0) });
    const start = { ...spawnState(w), z: 0 };
    const trail = steps(w, start, () => forward(), 400);
    expect(trail.at(-1)?.y).toBe(0);
    expect(trail.slice(5).every((s) => s.grounded)).toBe(true);
  });
});

describe('out of the world', () => {
  it('respawns at the last safe grounded position after falling below the kill height', () => {
    // A platform in the void: ground exists only for x < 10.
    const w = makeWorld({ heightAt: (x) => (x < 10 ? 0 : -1000), killY: -40 });
    const trail = steps(w, spawnState(w), () => ({ ...NO_INPUT, moveZ: 1, moveX: -1, cameraYaw: -Math.PI / 2 + 0.0 }), 400);
    // Heading -x... walk towards +x instead: right is +z with yaw pi/2, forward is +x.
    const toEdge = steps(w, spawnState(w), () => ({ ...NO_INPUT, moveZ: 1, cameraYaw: Math.PI / 2 }), 900);
    expect(trail.length).toBe(400);
    const fell = toEdge.findIndex((s) => s.respawns > 0);
    expect(fell).toBeGreaterThan(0);
    const after = toEdge[fell]!;
    expect(after.y).toBeGreaterThan(-1);
    expect(after.x).toBeLessThan(10);
    expect(after.x).toBeGreaterThan(4); // the last safe spot, not the spawn
    expect(after.grounded).toBe(true);
  });

  it('falls back to the spawn when nothing safe is recorded', () => {
    const w = makeWorld({ spawn: { x: 3, y: 0, z: 4, facing: 1 }, heightAt: () => -1000 });
    const s = stepHero({ ...spawnState(w), y: -41, safe: { x: Number.NaN, y: 0, z: 0 } }, NO_INPUT, FIXED_DT, w);
    expect(s.respawns).toBe(1);
    expect([s.x, s.y, s.z]).toEqual([3, 0, 4]);
  });

  it('recovers from a non-finite state and from being buried inside a solid', () => {
    const w = makeWorld({ solids: [box(-5, 0, -5, 5, 20, 5)] });
    const broken = stepHero({ ...spawnState(w), x: Number.NaN }, NO_INPUT, FIXED_DT, w);
    expect(broken.respawns).toBe(1);
    expect(Number.isFinite(broken.x)).toBe(true);
    const buried = simulate(w, NO_INPUT, 2, 60, { ...spawnState(w), x: 0, z: 0, y: 1 }).state;
    expect(buried.respawns).toBeGreaterThanOrEqual(1);
  });
});
