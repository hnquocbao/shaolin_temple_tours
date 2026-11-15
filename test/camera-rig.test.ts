import { describe, expect, it } from 'vitest';
import { CAMERA, orbitOffset, solveCamera } from '../src/game/player/camera-rig';
import type { World } from '../src/game/player/motion';
import type { Solid } from '../src/places/types';

const world = (solids: Solid[] = [], heightAt: World['heightAt'] = () => 0): World => ({
  heightAt,
  solids,
  spawn: { x: 0, y: 0, z: 0, facing: 0 },
  killY: -40,
});

describe('camera rig', () => {
  it('sits behind the heading and above the eye', () => {
    const [x, y, z] = orbitOffset(0, 0.3, 8);
    expect(z).toBeLessThan(0); // heading 0 faces +z, so behind is -z
    expect(y).toBeGreaterThan(0);
    expect(Math.hypot(x, y, z)).toBeCloseTo(8, 6);
    const [rx] = orbitOffset(Math.PI / 2, 0, 5); // facing +x: behind is -x
    expect(rx).toBeCloseTo(-5, 6);
  });

  it('keeps the asked distance when nothing is in the way', () => {
    const c = solveCamera(world(), [0, 1.5, 0], 0, 0.3, 8);
    expect(c.distance).toBeCloseTo(8, 6);
  });

  it('is pulled in when a wall is behind the hero, and never ends up inside it', () => {
    const wall: Solid = { min: [-20, 0, -4], max: [20, 10, -3] };
    const c = solveCamera(world([wall]), [0, 1.5, 0], 0, 0.1, 8);
    expect(c.distance).toBeLessThan(3.5);
    expect(c.z).toBeGreaterThan(-3);
  });

  it('never goes below the ground, even looking up from low ground behind a rise', () => {
    const hill = (_x: number, z: number): number => (z < -2 ? 3 : 0);
    const c = solveCamera(world([], hill), [0, 1.5, 0], 0, -0.15, 8);
    expect(c.y).toBeGreaterThanOrEqual(hill(c.x, c.z) + CAMERA.clearance - 1e-9);
  });

  it('can still back away when the hero hugs a wall', () => {
    const wall: Solid = { min: [-1, 0, 0.1], max: [1, 10, 2] };
    const c = solveCamera(world([wall]), [0, 1.5, 0], 0, 0.3, 8);
    expect(c.distance).toBeGreaterThan(0.5);
    expect(Number.isFinite(c.x + c.y + c.z)).toBe(true);
  });
});
