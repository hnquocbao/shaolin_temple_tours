import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_DT, NO_INPUT, spawnState, stepHero, type HeroInput, type HeroState, type World } from '../src/game/player/motion';
import { worldFromPlace } from '../src/game/player/world';
import { shaolin } from '../src/places/shaolin';
import type { PlaceDef } from '../src/places/types';
import { yard } from '../src/places/yard';

function worldOf(place: PlaceDef): World {
  return worldFromPlace(place.build({ scene: new Scene(), rng: () => 0.5 }));
}

function run(w: World, from: HeroState, input: (s: HeroState) => HeroInput, seconds: number): HeroState[] {
  const trail: HeroState[] = [];
  let s = from;
  for (let i = 0; i < seconds / FIXED_DT; i++) {
    s = stepHero(s, input(s), FIXED_DT, w);
    trail.push(s);
  }
  return trail;
}

/** Sprint along `yaw`, leap holding Space once `past(s)`, brake in the air once `brake(s)`, until landed. */
function leap(w: World, from: HeroState, yaw: number, past: (s: HeroState) => boolean, brake: (s: HeroState) => boolean = () => false): HeroState {
  let flew = false;
  let landed = false;
  const trail = run(
    w,
    from,
    (s) => {
      if (!s.grounded) flew = true;
      else if (flew) landed = true;
      return { ...NO_INPUT, moveZ: flew && !landed && brake(s) ? -1 : landed ? 0 : 1, cameraYaw: yaw, sprint: true, jump: past(s) && !landed };
    },
    8,
  );
  return trail[trail.length - 1]!;
}

describe('Shaolin in play mode', () => {
  const w = worldOf(shaolin);

  it('spawns on the stair path, standing on the ground', () => {
    const start = spawnState(w);
    expect(start.y).toBeCloseTo(w.heightAt(start.x, start.z), 5);
    expect(Math.abs(start.x)).toBeLessThan(2.5);
  });

  it('can be run up the stone stair onto the first terrace without leaving the ground for long', () => {
    const start = spawnState(w);
    const trail = run(w, start, () => ({ ...NO_INPUT, moveZ: 1, sprint: true }), 8);
    const end = trail[trail.length - 1]!;
    expect(end.respawns).toBe(0);
    expect(end.z).toBeGreaterThan(start.z + 30);
    expect(end.y).toBeGreaterThan(start.y + 1);
    // Feet stay on the ground: never more than a tread's hop above it.
    for (const s of trail) expect(s.y - w.heightAt(s.x, s.z)).toBeLessThan(0.6);
  });

  it('cannot walk off the terrace edge into the valley and survive unnoticed', () => {
    // Run east off the first terrace: the hero must fall and be brought back, never end below the kill height.
    const start: HeroState = { ...spawnState(w), x: 0, z: 0, y: w.heightAt(0, 0) };
    const trail = run(w, start, () => ({ ...NO_INPUT, moveZ: 1, sprint: true, cameraYaw: Math.PI / 2 }), 30);
    const end = trail[trail.length - 1]!;
    expect(Number.isFinite(end.y)).toBe(true);
    expect(end.y).toBeGreaterThan(-45);
  });
});

describe('dev yard', () => {
  const w = worldOf(yard);

  it('is a dev place with the two stops the tools use', () => {
    expect(yard.dev).toBe(true);
    expect(yard.stops.map((s) => s.id)).toEqual(['overview', 'spawn']);
  });

  it('can be walked up the stepped mound and down again', () => {
    const trail = run(w, spawnState(w), () => ({ ...NO_INPUT, moveZ: 1 }), 6);
    expect(Math.max(...trail.map((s) => s.y))).toBeCloseTo(1.5, 5);
    const end = trail[trail.length - 1]!;
    expect(end.y).toBe(0);
    expect(end.z).toBeGreaterThan(-14);
  });

  it('can be walked up the 40 degree ramp to the plateau', () => {
    // Camera yaw pi/2 walks +x, along the ramp's slope.
    const start: HeroState = { ...spawnState(w), x: 12, z: -25 };
    const trail = run(w, start, (s) => ({ ...NO_INPUT, moveZ: s.x > 24 ? 0 : 1, cameraYaw: Math.PI / 2 }), 4);
    const end = trail[trail.length - 1]!;
    expect(end.y).toBeCloseTo(2.5, 5);
    expect(end.x).toBeGreaterThan(21);
  });

  it('blocks and slides along the wall', () => {
    const start: HeroState = { ...spawnState(w), x: 14, z: 0 };
    // Run at the wall (x 22..23): blocked in x, still free to move in z.
    const trail = run(w, start, () => ({ ...NO_INPUT, moveZ: 1, moveX: 0.5, cameraYaw: Math.PI / 2 }), 3);
    const end = trail[trail.length - 1]!;
    expect(end.x).toBeLessThanOrEqual(22 - 0.35 + 1e-6);
    expect(end.z).toBeGreaterThan(3);
    expect(end.respawns).toBe(0);
  });

  it('lets the hero cross the 15 m gap between the two platforms', () => {
    const start: HeroState = { ...spawnState(w), x: -30, y: 6, z: 60 };
    const end = leap(w, start, Math.PI / 2, (s) => s.x > -21);
    expect(end.grounded).toBe(true);
    expect(end.y).toBe(6);
    expect(end.x).toBeGreaterThan(-5);
    expect(end.respawns).toBe(0);
  });

  it('reaches the 8 m hall roof from the ground in one leap', () => {
    const onHall = leap(w, { ...spawnState(w), x: 10, z: -2 }, 0, (s) => s.z > 0, (s) => s.z > 17);
    expect(onHall.grounded).toBe(true);
    expect(onHall.y).toBe(8);
    expect(onHall.respawns).toBe(0);
  });
});
