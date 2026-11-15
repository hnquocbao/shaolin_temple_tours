import type { Rect } from '../../engine/terrain/heightfield';
import { fbm, mix, smoothstep } from '../../engine/terrain/noise';

/**
 * The grove's own little mountain (a dev ground for the vegetation kit), in metres, +y up:
 *  - a flat stone courtyard 44 m square at y = 24 in the middle;
 *  - rolling forested hills around it, 6 to 55 m high;
 *  - a valley falling away to the west (the autumn patches);
 *  - a cliff massif to the east, 80 m of ledged rock with a summit, and a free-standing spire to the south-east.
 */
export const COURTYARD: Rect = { minX: -22, maxX: 22, minZ: -22, maxZ: 22 };
export const COURTYARD_Y = 24;

const SEED = 4242;

/** Soften a height into ledges about 10 m apart, so a cliff steps like layered stone. */
function ledged(h: number, amount: number, x: number, z: number): number {
  const wander = 1.3 * fbm(x / 60, z / 60, SEED + 9, 2);
  const q = h / 10 + wander;
  const f = q - Math.floor(q);
  const stepped = (Math.floor(q) + smoothstep(0.62, 0.84, f)) * 10 - wander * 10;
  return mix(h, stepped, amount);
}

export function groveHeight(x: number, z: number): number {
  // Rolling hills and a valley to the west.
  let h = 6 + 44 * fbm(x / 210, z / 210, SEED + 1, 4) + 12 * (fbm(x / 55, z / 55, SEED + 2, 3) - 0.5);
  h -= 34 * smoothstep(-70, -170, x);

  // The cliff massif to the east.
  const warp = 24 * (fbm(x / 48, z / 48, SEED + 3, 3) - 0.5);
  const t = (x + warp - 70) / 50;
  const mass = 1 - smoothstep(150, 240, Math.abs(z - 20));
  const wall = 86 * smoothstep(0, 1, t) * mass;
  const summit = 9 * fbm(x / 30, z / 30, SEED + 4, 3) * smoothstep(0.6, 1.1, t) * mass;
  h += ledged(wall, 0.9, x, z) + summit;

  // A free-standing spire to the south-east: a tapering tower with a bushy crown.
  {
    const dx = x - 78;
    const dz = z + 120;
    const r = Math.hypot(dx, dz);
    const lobes = 1 + 0.22 * Math.sin(Math.atan2(dz, dx) * 3 + 1.3) + 0.12 * Math.sin(Math.atan2(dz, dx) * 5);
    const t2 = r / (13 * lobes);
    const profile = smoothstep(1.15, 0.35, t2);
    const foot = 0.45 * (1 - smoothstep(0.6, 3.4, t2)) ** 2;
    const tower = -10 + (86 + 6 * (fbm(x / 9, z / 9, SEED + 5, 2) - 0.5) + 10) * (profile + foot * (1 - profile));
    h = Math.max(h, ledged(tower, 0.3, x, z));
  }

  // The courtyard: dead flat, with a skirt that blends into the hills.
  const ex = Math.max(COURTYARD.minX - x, 0, x - COURTYARD.maxX);
  const ez = Math.max(COURTYARD.minZ - z, 0, z - COURTYARD.maxZ);
  const d = Math.hypot(ex, ez);
  h = mix(h, COURTYARD_Y, 1 - smoothstep(0, 34, d));

  // The world ends in low ground, well inside the far plane.
  const far = smoothstep(1500, 1950, Math.hypot(x, z));
  return far > 0 ? mix(h, -40, far) : h;
}
