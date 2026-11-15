import { nearSolids, type World } from './motion';
import type { Solid } from '../../places/types';

/** Third-person orbit camera maths, kept free of three.js so it can be tested. */

export const CAMERA = {
  minDistance: 2.5,
  maxDistance: 16,
  defaultDistance: 8,
  /** Elevation of the camera above the hero's eye line, in radians. */
  minPitch: -0.2,
  maxPitch: 1.25,
  defaultPitch: 0.3,
  /**
   * Radius kept clear around the camera, so it never clips a wall or the ground. It must exceed the near-plane
   * corner distance: near 0.25 at the widest field of view (59 degrees) and 16:9 puts a corner about 0.45 m
   * from the camera position.
   */
  clearance: 0.45,
  /** Never pulled in closer than this to the hero's eye. */
  minPull: 0.6,
} as const;

export interface CameraSolve {
  x: number;
  y: number;
  z: number;
  /** Where the orbit starts: the eye asked for, pulled back if a wall lies between it and the hero's true eye. */
  originX: number;
  originY: number;
  originZ: number;
  /** Distance actually used from the origin; less than asked when something is in the way. */
  distance: number;
}

/** Where the camera wants to be: behind the heading `yaw`, raised by `pitch`, `distance` from the eye. */
export function orbitOffset(yaw: number, pitch: number, distance: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c * distance, Math.sin(pitch) * distance, -Math.cos(yaw) * c * distance];
}

let slabEnter = 0;
let slabExit = 0;

/** One axis of a segment-box test. Narrows [slabEnter, slabExit]; false when the segment misses. */
function slab(o: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let a = (lo - o) / d;
  let b = (hi - o) / d;
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  if (a > slabEnter) slabEnter = a;
  if (b < slabExit) slabExit = b;
  return slabEnter <= slabExit;
}

const rayBuf: Solid[] = [];

/**
 * How far along the segment (s -> s + d, as 0..1) it stays clear of solids and the ground, with `pad` to spare.
 * Allocates nothing per solid.
 */
function clipSegment(world: World, sx: number, sy: number, sz: number, dx: number, dy: number, dz: number, pad: number): number {
  let t = 1;
  const minX = Math.min(sx, sx + dx) - pad;
  const maxX = Math.max(sx, sx + dx) + pad;
  const minY = Math.min(sy, sy + dy) - pad;
  const maxY = Math.max(sy, sy + dy) + pad;
  const minZ = Math.min(sz, sz + dz) - pad;
  const maxZ = Math.max(sz, sz + dz) + pad;
  const list = nearSolids(world, minX, minZ, maxX, maxZ, rayBuf);
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    const lo = s.min;
    const hi = s.max;
    // Cheap reject against the segment's bounds.
    if (hi[0] < minX || lo[0] > maxX || hi[1] < minY || lo[1] > maxY || hi[2] < minZ || lo[2] > maxZ) continue;
    // If the start is inside the padded box (hero hugging a wall), use the bare box so the camera can still back away.
    const inPadded =
      sx > lo[0] - pad && sx < hi[0] + pad && sy > lo[1] - pad && sy < hi[1] + pad && sz > lo[2] - pad && sz < hi[2] + pad;
    const p = inPadded ? 0 : pad;
    slabEnter = 0;
    slabExit = t;
    if (!slab(sx, dx, lo[0] - p, hi[0] + p) || !slab(sy, dy, lo[1] - p, hi[1] + p) || !slab(sz, dz, lo[2] - p, hi[2] + p)) continue;
    if (slabEnter < t) t = slabEnter;
  }
  // Ground: walk along the segment and stop where it dips under the surface.
  const len = Math.hypot(dx, dy, dz);
  const samples = Math.max(4, Math.ceil(len / 0.5));
  for (let i = 1; i <= samples; i++) {
    const u = (i / samples) * t;
    if (sy + dy * u < world.heightAt(sx + dx * u, sz + dz * u) + pad) {
      t = ((i - 1) / samples) * t;
      break;
    }
  }
  return t;
}

/**
 * Place the camera on its orbit around `eye`, pulled in so it does not pass through solids or the ground.
 * `wanted` is the distance the player asked for. `trueEye` is where the hero's eye really is when `eye` is a
 * smoothed (lagging) point: the orbit then starts no further along the line from `trueEye` to `eye` than is clear.
 */
export function solveCamera(
  world: World,
  eye: readonly [number, number, number],
  yaw: number,
  pitch: number,
  wanted: number,
  trueEye?: readonly [number, number, number],
): CameraSolve {
  let ox = eye[0];
  let oy = eye[1];
  let oz = eye[2];
  if (trueEye) {
    const dx = eye[0] - trueEye[0];
    const dy = eye[1] - trueEye[1];
    const dz = eye[2] - trueEye[2];
    const t = clipSegment(world, trueEye[0], trueEye[1], trueEye[2], dx, dy, dz, 0.1);
    const k = t < 1 ? Math.max(0, t - 0.02) : 1;
    ox = trueEye[0] + dx * k;
    oy = trueEye[1] + dy * k;
    oz = trueEye[2] + dz * k;
  }
  const c = Math.cos(pitch);
  const dirX = -Math.sin(yaw) * c * wanted;
  const dirY = Math.sin(pitch) * wanted;
  const dirZ = -Math.cos(yaw) * c * wanted;
  const t = clipSegment(world, ox, oy, oz, dirX, dirY, dirZ, CAMERA.clearance);
  const distance = Math.min(Math.max(wanted * t, Math.min(CAMERA.minPull, wanted)), wanted);
  const k = distance / wanted;
  const x = ox + dirX * k;
  const z = oz + dirZ * k;
  // The last resort: never below the ground.
  const y = Math.max(oy + dirY * k, world.heightAt(x, z) + CAMERA.clearance);
  return { x, y, z, originX: ox, originY: oy, originZ: oz, distance };
}
