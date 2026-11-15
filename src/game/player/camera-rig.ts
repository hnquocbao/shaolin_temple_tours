import type { World } from './motion';

/** Third-person orbit camera maths, kept free of three.js so it can be tested. */

export const CAMERA = {
  minDistance: 2.5,
  maxDistance: 16,
  defaultDistance: 8,
  /** Elevation of the camera above the hero's eye line, in radians. */
  minPitch: -0.2,
  maxPitch: 1.25,
  defaultPitch: 0.3,
  /** Radius kept clear around the camera, so it never clips a wall or the ground. */
  clearance: 0.35,
  /** Never pulled in closer than this to the hero's eye. */
  minPull: 0.6,
} as const;

export interface CameraSolve {
  x: number;
  y: number;
  z: number;
  /** Distance actually used from the eye; less than asked when something is in the way. */
  distance: number;
}

/** Where the camera wants to be: behind the heading `yaw`, raised by `pitch`, `distance` from the eye. */
export function orbitOffset(yaw: number, pitch: number, distance: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c * distance, Math.sin(pitch) * distance, -Math.cos(yaw) * c * distance];
}

/** Slab test of a segment (origin + dir * t, t in 0..1) against a box. Returns the entry t, or undefined. */
function segmentBox(o: readonly number[], d: readonly number[], min: readonly number[], max: readonly number[]): number | undefined {
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const oi = o[i]!;
    const di = d[i]!;
    const lo = min[i]!;
    const hi = max[i]!;
    if (Math.abs(di) < 1e-9) {
      if (oi < lo || oi > hi) return undefined;
    } else {
      let a = (lo - oi) / di;
      let b = (hi - oi) / di;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return undefined;
    }
  }
  return t0;
}

/**
 * Place the camera on its orbit around `eye`, pulled in so it does not pass through solids or the ground.
 * `wanted` is the distance the player asked for.
 */
export function solveCamera(world: World, eye: readonly [number, number, number], yaw: number, pitch: number, wanted: number): CameraSolve {
  const [ox, oy, oz] = orbitOffset(yaw, pitch, wanted);
  const dir = [ox, oy, oz] as const;
  const pad = CAMERA.clearance;
  let t = 1;

  for (const s of world.solids) {
    // If the eye is inside the padded box (hero hugging a wall), use the bare box so the camera can still back away.
    const inPadded =
      eye[0] > s.min[0] - pad && eye[0] < s.max[0] + pad && eye[1] > s.min[1] - pad && eye[1] < s.max[1] + pad && eye[2] > s.min[2] - pad && eye[2] < s.max[2] + pad;
    const p = inPadded ? 0 : pad;
    const hit = segmentBox(
      eye,
      dir,
      [s.min[0] - p, s.min[1] - p, s.min[2] - p],
      [s.max[0] + p, s.max[1] + p, s.max[2] + p],
    );
    if (hit !== undefined && hit < t) t = hit;
  }

  // Ground: walk along the ray and stop where it dips under the surface.
  const samples = Math.max(8, Math.ceil(wanted / 0.5));
  for (let i = 1; i <= samples; i++) {
    const u = (i / samples) * t;
    const h = world.heightAt(eye[0] + ox * u, eye[2] + oz * u);
    if (eye[1] + oy * u < h + pad) {
      t = Math.max(0, ((i - 1) / samples) * t);
      break;
    }
  }

  let distance = Math.max(wanted * t, Math.min(CAMERA.minPull, wanted));
  distance = Math.min(distance, wanted);
  const k = distance / wanted;
  const x = eye[0] + ox * k;
  let y = eye[1] + oy * k;
  const z = eye[2] + oz * k;
  // The last resort: never below the ground.
  y = Math.max(y, world.heightAt(x, z) + pad);
  return { x, y, z, distance };
}
