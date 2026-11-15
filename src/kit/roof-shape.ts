/**
 * Roof shapes as pure maths (no three.js, no GPU): a height function over the plan plus the facets,
 * ridge lines and ornament points that follow from it. `roof-mesh.ts` turns a shape into geometry.
 *
 * Plan frame: roof-local, x along the main ridge, z across it, origin at the plan centre, the eave
 * rectangle spanning x in [-a, a] and z in [-b, b]. Heights are measured up from the eave-tip base line.
 *
 * Every slope is concave (steeper near the ridge, flatter at the eave: s^n with n > 1), the eave tip
 * has a small flick, and the corners rise by `upturn`, so the hips sweep up like a Chinese roof.
 */

export type Vec2 = readonly [x: number, z: number];

export type RoofForm = 'hip-gable' | 'hip' | 'ring';

export interface RoofShapeParams {
  form: RoofForm;
  /** Eave half extents (x, z) in metres. */
  a: number;
  b: number;
  /** Total rise from eave line to ridge (hip-gable, hip) or to the inner edge (ring), metres. */
  rise: number;
  /** Slope curve exponent, > 1 for a concave sweep. Default 1.8. */
  curve?: number;
  /** Eave-tip flick: height gained in the last `lipLength` metres. Default 0.45 / 1.3. */
  lip?: number;
  lipLength?: number;
  /** Extra height at the four corners. Default 0.3 * rise, at least 0.6. */
  upturn?: number;
  /** How narrowly the upturn is held to the corner (higher is tighter). Default 3.4. */
  sweep?: number;
  /** hip-gable: gable plane half width on x (the roof is cut back to here). */
  gableHalf?: number;
  /** hip-gable: fraction of the slope height at which the end hip meets the gable. Default 0.5. */
  gableBase?: number;
  /** hip: half length of the main ridge; 0 makes a pyramid. */
  ridgeHalf?: number;
  /** ring: inner half extents (x, z) where the roof meets the wall above. */
  innerA?: number;
  innerB?: number;
}

/**
 * One roof facet in plan: P(u, v) = lerp(lerp(e0, e1, u), lerp(r0, r1, u), v), v = 0 on the eave side.
 * Facet edges e0-e1 and r0-r1 are parallel to the lateral axis (x for front/back facets, z for ends).
 */
export interface Patch {
  e0: Vec2;
  e1: Vec2;
  r0: Vec2;
  r1: Vec2;
  /** Which plan axis tiles are laid across: ribs run down the slope along the other axis. */
  lateral: 'x' | 'z';
  /** True when the v = 0 edge is a real eave edge (fascia, eave caps). */
  eave: boolean;
}

export interface RidgeLine {
  kind: 'main' | 'hip' | 'verge' | 'sill';
  /** Plan end points; `nudge` pushes the sampled height point sideways to stay on one facet. */
  from: Vec2;
  to: Vec2;
}

export interface GablePanel {
  /** Plan x of the vertical gable plane (sign gives the end). */
  x: number;
  /** Half width in z at the base, and the base height. */
  halfZ: number;
  baseHeight: number;
}

export interface RoofShape {
  params: Required<Pick<RoofShapeParams, 'form' | 'a' | 'b' | 'rise'>> & RoofShapeParams;
  /** Surface height above the eave-tip base line at a plan point. */
  heightAt(x: number, z: number): number;
  patches: Patch[];
  ridges: RidgeLine[];
  gables: GablePanel[];
  /** Plan points that carry a ridge-end ornament, with the direction it faces. */
  ridgeEnds: { at: Vec2; dir: 1 | -1 }[];
  corners: Vec2[];
  /** Pyramid apex, when the roof comes to a point. */
  apex: Vec2 | undefined;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function createRoofShape(p: RoofShapeParams): RoofShape {
  const { a, b, rise, form } = p;
  if (!(a > 0 && b > 0 && rise > 0)) throw new Error('roof shape needs positive a, b and rise');
  const n = p.curve ?? 1.8;
  const lip = p.lip ?? 0.45;
  const lipLength = p.lipLength ?? 1.3;
  const upturn = p.upturn ?? Math.max(0.6, rise * 0.3);
  const sweep = p.sweep ?? 3.4;

  let xg = 0;
  let sg = 0.5;
  let ridgeHalf = 0;
  let innerA = 0;
  let innerB = 0;
  if (form === 'hip-gable') {
    xg = p.gableHalf ?? a - 3;
    sg = p.gableBase ?? 0.5;
    if (!(xg > 0 && xg < a)) throw new Error('gableHalf must be between 0 and a');
  } else if (form === 'hip') {
    ridgeHalf = Math.max(0, Math.min(a - 0.5, p.ridgeHalf ?? Math.max(0, a - b * 1.1)));
  } else {
    innerA = p.innerA ?? a * 0.6;
    innerB = p.innerB ?? b * 0.6;
    if (!(innerA < a && innerB < b)) throw new Error('ring inner extents must be inside the eave');
  }
  const sx = form === 'hip-gable' ? (a - xg) / sg : form === 'hip' ? a - ridgeHalf : a - innerA;
  const sz = form === 'ring' ? b - innerB : b;

  /** Normalised distance up the slope: 0 at the eave, 1 at the ridge (or the inner edge). */
  const slope = (x: number, z: number): number => {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    const tz = (b - az) / sz;
    const tx = (a - ax) / sx;
    if (form === 'hip-gable') return clamp01(ax >= xg ? Math.min(tz, tx) : tz);
    return clamp01(Math.min(tz, tx));
  };

  const heightAt = (x: number, z: number): number => {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    const s = slope(x, z);
    const dm = Math.max(0, Math.min(b - az, a - ax));
    const tip = dm < lipLength ? lip * (1 - dm / lipLength) ** 2 : 0;
    const corner = upturn * ((ax / a) * (az / b)) ** sweep * (1 - s) ** 1.5;
    return rise * s ** n + tip + corner;
  };

  const patches: Patch[] = [];
  const ridges: RidgeLine[] = [];
  const gables: GablePanel[] = [];
  const ridgeEnds: { at: Vec2; dir: 1 | -1 }[] = [];
  const corners: Vec2[] = [
    [-a, -b],
    [a, -b],
    [a, b],
    [-a, b],
  ];
  let apex: Vec2 | undefined;

  if (form === 'hip-gable') {
    const zg = b * (1 - sg);
    for (const zs of [-1, 1] as const) {
      patches.push({ e0: [-a, zs * b], e1: [a, zs * b], r0: [-xg, zs * zg], r1: [xg, zs * zg], lateral: 'x', eave: true });
      patches.push({ e0: [-xg, zs * zg], e1: [xg, zs * zg], r0: [-xg, 0], r1: [xg, 0], lateral: 'x', eave: false });
    }
    for (const xs of [-1, 1] as const) {
      patches.push({ e0: [xs * a, -b], e1: [xs * a, b], r0: [xs * xg, -zg], r1: [xs * xg, zg], lateral: 'z', eave: true });
      gables.push({ x: xs * xg, halfZ: zg, baseHeight: rise * sg ** n });
      ridges.push({ kind: 'sill', from: [xs * xg, -zg], to: [xs * xg, zg] });
      ridgeEnds.push({ at: [xs * xg, 0], dir: xs });
      for (const zs of [-1, 1] as const) {
        ridges.push({ kind: 'hip', from: [xs * a, zs * b], to: [xs * xg, zs * zg] });
        ridges.push({ kind: 'verge', from: [xs * xg, zs * zg], to: [xs * xg, 0] });
      }
    }
    ridges.push({ kind: 'main', from: [-xg, 0], to: [xg, 0] });
  } else if (form === 'hip') {
    for (const zs of [-1, 1] as const) {
      patches.push({ e0: [-a, zs * b], e1: [a, zs * b], r0: [-ridgeHalf, 0], r1: [ridgeHalf, 0], lateral: 'x', eave: true });
    }
    for (const xs of [-1, 1] as const) {
      patches.push({ e0: [xs * a, -b], e1: [xs * a, b], r0: [xs * ridgeHalf, 0], r1: [xs * ridgeHalf, 0], lateral: 'z', eave: true });
      for (const zs of [-1, 1] as const) {
        ridges.push({ kind: 'hip', from: [xs * a, zs * b], to: [xs * ridgeHalf, 0] });
      }
    }
    if (ridgeHalf > 0.2) {
      ridges.push({ kind: 'main', from: [-ridgeHalf, 0], to: [ridgeHalf, 0] });
      ridgeEnds.push({ at: [-ridgeHalf, 0], dir: -1 }, { at: [ridgeHalf, 0], dir: 1 });
    } else {
      apex = [0, 0];
    }
  } else {
    for (const zs of [-1, 1] as const) {
      patches.push({ e0: [-a, zs * b], e1: [a, zs * b], r0: [-innerA, zs * innerB], r1: [innerA, zs * innerB], lateral: 'x', eave: true });
    }
    for (const xs of [-1, 1] as const) {
      patches.push({ e0: [xs * a, -b], e1: [xs * a, b], r0: [xs * innerA, -innerB], r1: [xs * innerA, innerB], lateral: 'z', eave: true });
      for (const zs of [-1, 1] as const) {
        ridges.push({ kind: 'hip', from: [xs * a, zs * b], to: [xs * innerA, zs * innerB] });
      }
    }
  }

  return {
    params: { ...p, form, a, b, rise },
    heightAt,
    patches,
    ridges,
    gables,
    ridgeEnds,
    corners,
    apex,
  };
}

/**
 * Where ribs run on a facet. For lateral position `q` (in metres on the lateral axis) returns the
 * largest v in [0, 1] before the rib would leave the facet through a hip, or 0 if it never enters.
 */
export function ribReach(patch: Patch, q: number): number {
  const li = patch.lateral === 'x' ? 0 : 1;
  const e0 = patch.e0[li];
  const e1 = patch.e1[li];
  const r0 = patch.r0[li];
  const r1 = patch.r1[li];
  const lo = e0 <= e1 ? [e0, r0] : [e1, r1];
  const hi = e0 <= e1 ? [e1, r1] : [e0, r0];
  const [loE, loR] = lo as [number, number];
  const [hiE, hiR] = hi as [number, number];
  if (q < loE || q > hiE) return 0;
  let vmax = 1;
  if (loR > loE) vmax = Math.min(vmax, (q - loE) / (loR - loE));
  if (hiR < hiE) vmax = Math.min(vmax, (hiE - q) / (hiE - hiR));
  return vmax;
}

/** Plan point of a patch at (u, v). */
export function patchPoint(patch: Patch, u: number, v: number): Vec2 {
  const ex = patch.e0[0] + (patch.e1[0] - patch.e0[0]) * u;
  const ez = patch.e0[1] + (patch.e1[1] - patch.e0[1]) * u;
  const rx = patch.r0[0] + (patch.r1[0] - patch.r0[0]) * u;
  const rz = patch.r0[1] + (patch.r1[1] - patch.r0[1]) * u;
  return [ex + (rx - ex) * v, ez + (rz - ez) * v];
}

/** Plan point on a patch at lateral position q and slope fraction v (rib centre lines). */
export function ribPoint(patch: Patch, q: number, v: number): Vec2 {
  if (patch.lateral === 'x') return [q, patch.e0[1] + (patch.r0[1] - patch.e0[1]) * v];
  return [patch.e0[0] + (patch.r0[0] - patch.e0[0]) * v, q];
}
