import type { Solid, Vec3 } from '../places/types';
import { cross, dot, rgb, shade, sub, type RGB } from './geom';
import type { KitParts } from './parts';
import { LATTICE_CELL } from './textures';

/** Bay sizes from a count and either one size or one size per bay. */
export function expandBays(count: number, size: number | readonly number[]): number[] {
  if (!Number.isInteger(count) || count < 1) throw new Error(`bay count must be a positive integer, got ${count}`);
  if (typeof size === 'number') {
    if (!(size > 0)) throw new Error('bay size must be positive');
    return new Array<number>(count).fill(size);
  }
  if (size.length !== count) throw new Error(`expected ${count} bay sizes, got ${size.length}`);
  if (!size.every((s) => s > 0)) throw new Error('bay sizes must be positive');
  return [...size];
}

/** Boundaries of consecutive bays centred on 0: n + 1 positions. */
export function bayStops(sizes: readonly number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  const stops = [-total / 2];
  for (const s of sizes) stops.push((stops[stops.length - 1] as number) + s);
  return stops;
}

export type Side = 'front' | 'back' | 'left' | 'right';

export const SIDE_YAW: Record<Side, number> = { front: Math.PI, back: 0, left: -Math.PI / 2, right: Math.PI / 2 };

export interface StairSpec {
  /** Which sides carry steps. */
  sides: readonly ('front' | 'back')[];
  /** Total stair width. */
  width: number;
}

export interface PlatformSpec {
  hx: number;
  hz: number;
  height: number;
  stairs: StairSpec;
}

const STEP_RISE = 0.2;
const STEP_RUN = 0.42;

function stairCount(height: number): number {
  return Math.max(2, Math.round(height / STEP_RISE));
}

/** Walkable height of a platform with steps, in its local frame. */
export function platformHeightAt(spec: PlatformSpec, x: number, z: number): number {
  const { hx, hz, height, stairs } = spec;
  if (Math.abs(x) <= hx && Math.abs(z) <= hz) return height;
  if (Math.abs(x) > stairs.width / 2) return 0;
  const n = stairCount(height);
  const run = n * STEP_RUN;
  for (const side of stairs.sides) {
    const out = side === 'front' ? -z - hz : z - hz; // distance beyond the platform edge
    if (out > 0 && out < run) return height * (1 - out / run);
  }
  return 0;
}

/** Two-layer stone platform with steps and sloping stair cheeks. Returns nothing: it draws into `parts.body`. */
export function addPlatform(parts: KitParts, spec: PlatformSpec): void {
  const { hx, hz, height, stairs } = spec;
  const stone = rgb(parts.palette.stone);
  const b = parts.body;
  b.box([-hx - 0.5, 0, -hz - 0.5], [hx + 0.5, 0.34, hz + 0.5], shade(stone, 0.82), shade(stone, 0.95));
  b.box([-hx, 0.3, -hz], [hx, height, hz], stone, shade(stone, 1.06));
  b.box([-hx - 0.14, height - 0.2, -hz - 0.14], [hx + 0.14, height, hz + 0.14], shade(stone, 1.08), shade(stone, 1.1));
  const n = stairCount(height);
  const rise = height / n;
  const sw = stairs.width;
  for (const side of stairs.sides) {
    const sgn = side === 'front' ? -1 : 1;
    // Treads: step k is the k-th below the top.
    for (let k = 1; k < n; k++) {
      const z0 = sgn * (hz + k * STEP_RUN);
      const zA = Math.min(sgn * hz, z0);
      const zB = Math.max(sgn * hz, z0);
      b.box([-sw / 2, 0, zA], [sw / 2, height - k * rise, zB], shade(stone, 1 - k * 0.006), shade(stone, 1.04));
    }
    // Sloping cheek walls (垂带) on both sides of the stairs.
    const run = n * STEP_RUN;
    for (const xs of [-1, 1] as const) {
      const xi = xs * sw / 2;
      const xo = xs * (sw / 2 + 0.5);
      const zTop = sgn * hz;
      const zLow = sgn * (hz + run);
      const inside: Vec3 = [xs * sw * 0.25, height * 0.4, sgn * (hz + run * 0.3)];
      const cheek = shade(stone, 1.03);
      // Sloped top, outer face triangle, inner face triangle.
      b.quadAway([xi, height, zTop], [xo, height, zTop], [xo, 0.0, zLow], [xi, 0.0, zLow], shade(stone, 1.1), [xs * sw / 2, -1, sgn * (hz + run / 2)]);
      b.triAway([xo, 0, zTop], [xo, height, zTop], [xo, 0, zLow], cheek, inside);
      b.triAway([xi, 0, zTop], [xi, height, zTop], [xi, 0, zLow], shade(cheek, 0.94), [xo, 0, sgn * (hz + run * 0.3)]);
    }
  }
}

/** Stone parapet with instanced baluster posts around a platform rim, skipping the stair openings. */
export function addBalustrade(parts: KitParts, spec: PlatformSpec): void {
  const { hx, hz, height, stairs } = spec;
  const inset = 0.32;
  const rx = hx - inset;
  const rz = hz - inset;
  const stone = rgb(parts.palette.stone);
  const b = parts.body;
  const gapHalf = stairs.width / 2 + 0.2;
  const run = (side: Side, a0: number, a1: number): void => {
    if (a1 - a0 < 0.4) return;
    const axisX = side === 'front' || side === 'back';
    const c = side === 'front' ? -rz : side === 'back' ? rz : side === 'left' ? -rx : rx;
    const rail = (y0: number, y1: number, w: number, color: RGB): void => {
      if (axisX) b.box([a0, height + y0, c - w], [a1, height + y1, c + w], color);
      else b.box([c - w, height + y0, a0], [c + w, height + y1, a1], color);
    };
    rail(0, 0.18, 0.16, shade(stone, 0.9));
    rail(0.18, 0.9, 0.06, shade(stone, 0.96));
    rail(0.9, 1.0, 0.11, shade(stone, 1.05));
    const count = Math.max(1, Math.round((a1 - a0) / 1.25));
    for (let i = 0; i <= count; i++) {
      const t = a0 + ((a1 - a0) * i) / count;
      if (axisX) parts.baluster(t, height, c);
      else parts.baluster(c, height, t);
    }
  };
  const open = (side: 'front' | 'back'): boolean => stairs.sides.includes(side);
  for (const side of ['front', 'back'] as const) {
    if (open(side)) {
      run(side, -rx, -gapHalf);
      run(side, gapHalf, rx);
    } else run(side, -rx, rx);
  }
  run('left', -rz, rz);
  run('right', -rz, rz);
}

export interface DoorSpec {
  /** Opening along the wall, from c0 to c1 (metres along the wall axis). */
  c0: number;
  c1: number;
  height: number;
  /** Draw door leaves swung open. Default true. */
  leaves?: boolean;
}

export interface WallSideSpec {
  side: Side;
  /** Centre line of the wall on the axis across it (z for front/back, x for left/right). */
  line: number;
  /** Bay boundaries along the wall (x for front/back, z for left/right). */
  stops: readonly number[];
  y0: number;
  y1: number;
  thick?: number;
  door?: DoorSpec;
  /** Lattice windows in every bay without a door. Heights above y0. */
  windows?: { sill: number; head: number } | undefined;
  /** Draw a painted beam along the top. Default true. */
  beam?: boolean;
}

/**
 * One side of a timber-frame building: wall panels per bay, lattice windows, an optional door with
 * open leaves, and a painted beam. Returns collision boxes (the door gap is left open).
 */
export function addWallSide(parts: KitParts, spec: WallSideSpec): Solid[] {
  const { side, line, stops, y0, y1 } = spec;
  const t = spec.thick ?? 0.4;
  const palette = parts.palette;
  const wall = rgb(palette.wall);
  const trim = rgb(palette.trim);
  const column = rgb(palette.column);
  const b = parts.body;
  const axisX = side === 'front' || side === 'back';
  const out = side === 'front' || side === 'left' ? -1 : 1;
  const start = stops[0] as number;
  const end = stops[stops.length - 1] as number;
  const solids: Solid[] = [];

  const lo = (a0: number, c0: number, y: number): Vec3 => (axisX ? [a0, y, c0] : [c0, y, a0]);
  const wallBox = (a0: number, a1: number, ya: number, yb: number, c0: number, c1: number, color = wall): void => {
    if (a1 - a0 < 1e-3 || yb - ya < 1e-3) return;
    b.box(lo(a0, c0, ya), lo(a1, c1, yb), color, undefined, false);
  };
  const solid = (a0: number, a1: number): void => {
    if (a1 - a0 < 1e-3) return;
    solids.push({ min: lo(a0, line - t / 2, y0), max: lo(a1, line + t / 2, y1) });
  };

  const cLo = line - t / 2;
  const cHi = line + t / 2;
  const door = spec.door;
  for (let i = 0; i + 1 < stops.length; i++) {
    const a0 = stops[i] as number;
    const a1 = stops[i + 1] as number;
    const hasDoor = door !== undefined && door.c0 >= a0 - 1e-6 && door.c1 <= a1 + 1e-6;
    if (hasDoor && door) {
      wallBox(a0, door.c0, y0, y1, cLo, cHi);
      wallBox(door.c1, a1, y0, y1, cLo, cHi);
      wallBox(door.c0, door.c1, y0 + door.height, y1, cLo, cHi);
      // Painted door header and frame.
      const pro = out > 0 ? [cHi, cHi + 0.07] : [cLo - 0.07, cLo];
      wallBox(door.c0 - 0.12, door.c1 + 0.12, y0 + door.height - 0.28, y0 + door.height, pro[0] as number, pro[1] as number, trim);
      solid(a0, door.c0);
      solid(door.c1, a1);
      if (door.leaves !== false) {
        const w = (door.c1 - door.c0) / 2;
        const inner = out > 0 ? [cLo - w, cLo] : [cHi, cHi + w];
        const leafColor = shade(column, 0.72);
        wallBox(door.c0, door.c0 + 0.12, y0, y0 + door.height - 0.05, inner[0] as number, inner[1] as number, leafColor);
        wallBox(door.c1 - 0.12, door.c1, y0, y0 + door.height - 0.05, inner[0] as number, inner[1] as number, leafColor);
      }
    } else if (spec.windows) {
      const { sill, head } = spec.windows;
      const jamb = Math.min(0.45, (a1 - a0) * 0.2);
      wallBox(a0, a1, y0, y0 + sill, cLo, cHi);
      wallBox(a0, a1, y0 + head, y1, cLo, cHi);
      wallBox(a0, a0 + jamb, y0 + sill, y0 + head, cLo, cHi);
      wallBox(a1 - jamb, a1, y0 + sill, y0 + head, cLo, cHi);
      // Window sill ledge and head band.
      const pro = out > 0 ? [cHi, cHi + 0.08] : [cLo - 0.08, cLo];
      wallBox(a0 + jamb - 0.06, a1 - jamb + 0.06, y0 + sill - 0.08, y0 + sill, pro[0] as number, pro[1] as number, trim);
      wallBox(a0 + jamb - 0.06, a1 - jamb + 0.06, y0 + head, y0 + head + 0.1, pro[0] as number, pro[1] as number, trim);
      // Lattice plane, recessed a little behind the wall face.
      const plane = (out > 0 ? cHi : cLo) - out * 0.16;
      const l0 = a0 + jamb;
      const l1 = a1 - jamb;
      const yl = y0 + sill;
      const yh = y0 + head;
      const normal: Vec3 = axisX ? [0, 0, out] : [out, 0, 0];
      const corners: Vec3[] = [lo(l0, plane, yl), lo(l1, plane, yl), lo(l1, plane, yh), lo(l0, plane, yh)];
      const uvOf = (a: number, y: number): [number, number] => [a / LATTICE_CELL, y / LATTICE_CELL];
      const uvs = [uvOf(l0, yl), uvOf(l1, yl), uvOf(l1, yh), uvOf(l0, yh)];
      const ids = corners.map((c, k) => parts.lattice.vertex(c, normal, [1, 1, 1], uvs[k]));
      const n = dot(cross(sub(corners[1] as Vec3, corners[0] as Vec3), sub(corners[3] as Vec3, corners[0] as Vec3)), normal);
      if (n > 0) parts.lattice.quadIdx(ids[0] as number, ids[1] as number, ids[2] as number, ids[3] as number);
      else parts.lattice.quadIdx(ids[0] as number, ids[3] as number, ids[2] as number, ids[1] as number);
      solid(a0, a1);
    } else {
      wallBox(a0, a1, y0, y1, cLo, cHi);
      solid(a0, a1);
    }
  }
  if (spec.beam !== false) {
    const pro = 0.12;
    wallBox(start - 0.3, end + 0.3, y1 - 0.55, y1, cLo - pro, cHi + pro, trim);
    wallBox(start - 0.3, end + 0.3, y1 - 0.62, y1 - 0.55, cLo - pro - 0.04, cHi + pro + 0.04, shade(wall, 0.9));
  }
  return solids;
}

/**
 * Dark wall between the top of a wall run and the underside of the roof above it, so no daylight
 * shows between brackets. `under(x, z)` gives the roof underside height.
 */
export function addFrieze(
  parts: KitParts,
  hx: number,
  hz: number,
  y0: number,
  under: (x: number, z: number) => number,
  inset = 0.35,
): void {
  const color = shade(rgb(parts.palette.wall), 1.6);
  const ix = hx - inset;
  const iz = hz - inset;
  const step = 0.6;
  const run = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i < n; i++) {
      const ta = i / n;
      const tb = (i + 1) / n;
      const xa = x0 + (x1 - x0) * ta;
      const za = z0 + (z1 - z0) * ta;
      const xb = x0 + (x1 - x0) * tb;
      const zb = z0 + (z1 - z0) * tb;
      const ya = under(xa, za) + 0.08;
      const yb = under(xb, zb) + 0.08;
      parts.body.quadAway([xa, y0, za], [xb, y0, zb], [xb, yb, zb], [xa, ya, za], color, [0, y0, 0]);
    }
  };
  run(-ix, -iz, ix, -iz);
  run(ix, -iz, ix, iz);
  run(ix, iz, -ix, iz);
  run(-ix, iz, -ix, -iz);
}

/**
 * A ring of columns and bracket clusters on a rectangular grid line set. `under(x, z)` is the roof
 * underside height, so each bracket cluster is stretched to meet it exactly (no gap under the eave).
 * Returns collision boxes for the columns.
 */
export function addColumnRing(
  parts: KitParts,
  xs: readonly number[],
  zs: readonly number[],
  y0: number,
  height: number,
  under: (x: number, z: number) => number,
  radiusScale = 1,
  pedestals = true,
): Solid[] {
  const solids: Solid[] = [];
  const stone = shade(rgb(parts.palette.stone), 0.95);
  const top = y0 + height;
  const x0 = xs[0] as number;
  const x1 = xs[xs.length - 1] as number;
  const z0 = zs[0] as number;
  const z1 = zs[zs.length - 1] as number;
  const place = (x: number, z: number): void => {
    parts.column(x, y0, z, height, radiusScale);
    if (pedestals) parts.body.box([x - 0.42, y0 - 0.02, z - 0.42], [x + 0.42, y0 + 0.2, z + 0.42], stone);
    solids.push({ min: [x - 0.32, y0, z - 0.32], max: [x + 0.32, top, z + 0.32] });
  };
  for (const x of xs) {
    place(x, z0);
    place(x, z1);
  }
  for (const z of zs.slice(1, -1)) {
    place(x0, z);
    place(x1, z);
  }
  const bracketSize = Math.min(1.15, Math.max(0.7, height / 5));
  const sets = (side: Side, stops: readonly number[], fixed: number): void => {
    const axisX = side === 'front' || side === 'back';
    const emit = (a: number): void => {
      const x = axisX ? a : fixed;
      const z = axisX ? fixed : a;
      parts.bracket(x, top, z, SIDE_YAW[side], under(x, z) - top, bracketSize);
    };
    for (let i = 0; i + 1 < stops.length; i++) {
      const a0 = stops[i] as number;
      const len = (stops[i + 1] as number) - a0;
      const n = Math.max(1, Math.round(len / 2.6));
      emit(a0);
      for (let k = 1; k <= n; k++) emit(a0 + (len * k) / (n + 1));
    }
    emit(stops[stops.length - 1] as number);
  };
  sets('front', xs, z0);
  sets('back', xs, z1);
  sets('left', zs, x0);
  sets('right', zs, x1);
  return solids;
}
