import { Color, Matrix4, Vector3 } from 'three';
import type { Rng } from '../engine/rng';
import type { Vec3 } from '../places/types';
import {
  add,
  cross,
  length,
  lerp3,
  MeshBuilder,
  mixRgb,
  normalize,
  rgb,
  scale,
  shade,
  sub,
  type RGB,
} from './geom';
import type { Palette } from './palette';
import { patchPoint, ribPoint, ribReach, type Patch, type RoofShape, type Vec2 } from './roof-shape';

/** Distance between neighbouring tile ribs, metres. The roof texture repeats with this pitch. */
export const RIB_SPACING = 0.42;
/** Along-slope length of one texture row (one course of flat tiles), metres. */
export const ROW_LENGTH = 0.32;
const SEGMENT_LENGTH = 0.9;

/** Instances collected from every roof of a building; each becomes one InstancedMesh. */
export interface TileSink {
  ribMatrices: Matrix4[];
  ribColors: Color[];
  capMatrices: Matrix4[];
  capColors: Color[];
}

export function createTileSink(): TileSink {
  return { ribMatrices: [], ribColors: [], capMatrices: [], capColors: [] };
}

export interface RoofTargets {
  /** Roof top surface, with UVs. */
  surface: MeshBuilder;
  /** Everything else that is vertex-coloured: undersides, fascia, gables, ridges, ornaments. */
  body: MeshBuilder;
  tiles: TileSink;
}

export interface RoofBuildOptions {
  shape: RoofShape;
  /** Plan position of the shape's origin in the building frame. */
  centre: Vec2;
  /** Height of the eave-tip base line (shape height 0). */
  baseY: number;
  palette: Palette;
  rng: Rng;
  /** Roof slab thickness, metres. Default 0.42. */
  thick?: number;
  /** Size of the pyramid-top finial when the shape has an apex. Default 1. */
  finial?: number;
  /** Scale of ridge ends and corner ornaments. Default 1. */
  ornament?: number;
}

export interface RoofResult {
  /** Top surface height at a plan point of the building frame. */
  topY(x: number, z: number): number;
  /** Underside height at a plan point of the building frame. */
  underY(x: number, z: number): number;
  /** Highest point of the roof including ornaments. */
  maxY: number;
}

interface Grid {
  pos: Vec3[][];
  uv: [number, number][][];
}

function gridFor(patch: Patch, shape: RoofShape, centre: Vec2, baseY: number): Grid {
  const lat = patch.lateral === 'x' ? 0 : 1;
  const width = Math.hypot(patch.e1[0] - patch.e0[0], patch.e1[1] - patch.e0[1]);
  const slopeLen = Math.hypot(patch.r0[0] - patch.e0[0], patch.r0[1] - patch.e0[1]);
  const nu = Math.max(2, Math.min(40, Math.ceil(width / 0.9)));
  const nv = Math.max(6, Math.min(18, Math.ceil(slopeLen / 0.8)));
  const pos: Vec3[][] = [];
  const uv: [number, number][][] = [];
  const acc: number[] = new Array<number>(nu + 1).fill(0);
  for (let i = 0; i <= nv; i++) {
    const v = (i / nv) ** 1.35;
    const row: Vec3[] = [];
    const uvRow: [number, number][] = [];
    for (let j = 0; j <= nu; j++) {
      const [px, pz] = patchPoint(patch, j / nu, v);
      const p: Vec3 = [px + centre[0], baseY + shape.heightAt(px, pz), pz + centre[1]];
      if (i > 0) {
        const prev = (pos[i - 1] as Vec3[])[j] as Vec3;
        acc[j] = (acc[j] as number) + length(sub(p, prev));
      }
      row.push(p);
      uvRow.push([(lat === 0 ? px : pz) / RIB_SPACING, (acc[j] as number) / ROW_LENGTH]);
    }
    pos.push(row);
    uv.push(uvRow);
  }
  return { pos, uv };
}

/** Builds one roof into the shared targets. */
export function buildRoof(opts: RoofBuildOptions, out: RoofTargets): RoofResult {
  const { shape, centre, baseY, palette, rng } = opts;
  const thick = opts.thick ?? 0.42;
  const tileBase = rgb(palette.tile);
  const ridgeBase = rgb(palette.ridge);
  const trimBase = rgb(palette.trim);
  const wallBase = rgb(palette.wall);
  const variation = palette.tileVariation ?? 0.14;
  const ornamentScale = opts.ornament ?? 1;
  const topY = (x: number, z: number): number => baseY + shape.heightAt(x - centre[0], z - centre[1]);
  let maxY = baseY;

  for (const patch of shape.patches) {
    const grid = gridFor(patch, shape, centre, baseY);
    const nv = grid.pos.length - 1;
    const nu = (grid.pos[0] as Vec3[]).length - 1;
    const at = (i: number, j: number): Vec3 => (grid.pos[i] as Vec3[])[j] as Vec3;

    // Area-weighted vertex normals, so creases between patches stay sharp and apex slivers are harmless.
    const normals: Vec3[][] = grid.pos.map((row) => row.map((): Vec3 => [0, 0, 0]));
    let sumY = 0;
    const faceN = (i: number, j: number): Vec3 => cross(sub(at(i, j + 1), at(i, j)), sub(at(i + 1, j), at(i, j)));
    for (let i = 0; i < nv; i++) {
      for (let j = 0; j < nu; j++) {
        const n = faceN(i, j);
        sumY += n[1];
        for (const [di, dj] of [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ] as const) {
          const cell = (normals[i + di] as Vec3[])[j + dj] as Vec3;
          (normals[i + di] as Vec3[])[j + dj] = add(cell, n);
        }
      }
    }
    const flip = sumY < 0;
    const sign = flip ? -1 : 1;

    // Top surface, with low-frequency colour drift.
    const topIdx: number[][] = [];
    for (let i = 0; i <= nv; i++) {
      const row: number[] = [];
      for (let j = 0; j <= nu; j++) {
        const drift = 0.86 + rng() * 0.2;
        const n = normalize(scale((normals[i] as Vec3[])[j] as Vec3, sign));
        const c = shade(tileBase, 0.7 * drift);
        row.push(out.surface.vertex(at(i, j), n, c, (grid.uv[i] as [number, number][])[j] as [number, number]));
      }
      topIdx.push(row);
    }
    for (let i = 0; i < nv; i++) {
      for (let j = 0; j < nu; j++) {
        const a = (topIdx[i] as number[])[j] as number;
        const b = (topIdx[i] as number[])[j + 1] as number;
        const c = (topIdx[i + 1] as number[])[j + 1] as number;
        const d = (topIdx[i + 1] as number[])[j] as number;
        if (flip) out.surface.quadIdx(a, d, c, b);
        else out.surface.quadIdx(a, b, c, d);
      }
    }

    // Underside: the same grid dropped by the slab thickness, facing down. Painted near the eave.
    const underIdx: number[][] = [];
    for (let i = 0; i <= nv; i++) {
      const row: number[] = [];
      const painted = i <= 2;
      for (let j = 0; j <= nu; j++) {
        const p = at(i, j);
        const c = painted ? shade(trimBase, 4.2 + (j % 2) * 2.4) : shade(wallBase, 3.2);
        row.push(out.body.vertex([p[0], p[1] - thick, p[2]], [0, -1, 0], c));
      }
      underIdx.push(row);
    }
    for (let i = 0; i < nv; i++) {
      for (let j = 0; j < nu; j++) {
        const a = (underIdx[i] as number[])[j] as number;
        const b = (underIdx[i] as number[])[j + 1] as number;
        const c = (underIdx[i + 1] as number[])[j + 1] as number;
        const d = (underIdx[i + 1] as number[])[j] as number;
        if (flip) out.body.quadIdx(a, b, c, d);
        else out.body.quadIdx(a, d, c, b);
      }
    }

    if (patch.eave) {
      // Painted fascia along the eave edge, facing away from the roof's middle.
      const mid: Vec3 = [centre[0], baseY, centre[1]];
      for (let j = 0; j < nu; j++) {
        const p0 = at(0, j);
        const p1 = at(0, j + 1);
        const split = 0.55;
        const m0: Vec3 = [p0[0], p0[1] - thick * split, p0[2]];
        const m1: Vec3 = [p1[0], p1[1] - thick * split, p1[2]];
        const b0: Vec3 = [p0[0], p0[1] - thick, p0[2]];
        const b1: Vec3 = [p1[0], p1[1] - thick, p1[2]];
        out.body.quadAway(p0, m0, m1, p1, shade(trimBase, 1.2), mid);
        out.body.quadAway(m0, b0, b1, m1, shade(wallBase, 0.9), mid);
      }
    }
  }

  // Tile ribs and eave caps.
  const ribSegment = (l0: Vec3, t: Vec3, len: number, mid: Vec3, color: Color): void => {
    let n = normalize(cross(t, l0));
    if (n[1] < 0) n = scale(n, -1);
    const l = normalize(cross(n, t));
    const m = new Matrix4().makeBasis(
      new Vector3(l[0], l[1], l[2]),
      new Vector3(n[0], n[1], n[2]),
      new Vector3(t[0] * len, t[1] * len, t[2] * len),
    );
    m.setPosition(mid[0] - n[0] * 0.02, mid[1] - n[1] * 0.02, mid[2] - n[2] * 0.02);
    out.tiles.ribMatrices.push(m);
    out.tiles.ribColors.push(color);
  };
  const tileColor = (): Color => {
    let c: RGB = shade(tileBase, 1 + (rng() - 0.5) * 2 * variation);
    if (rng() < 0.05) c = mixRgb(c, [0.08, 0.2, 0.1], 0.5); // moss
    if (rng() < 0.05) c = shade(c, 1.28); // a newer, brighter tile
    return new Color().setRGB(c[0], c[1], c[2]);
  };

  for (const patch of shape.patches) {
    const li = patch.lateral === 'x' ? 0 : 1;
    const l0: Vec3 = li === 0 ? [1, 0, 0] : [0, 0, 1];
    const qa = Math.min(patch.e0[li], patch.e1[li]);
    const qb = Math.max(patch.e0[li], patch.e1[li]);
    const alongLen = Math.abs((li === 0 ? patch.r0[1] - patch.e0[1] : patch.r0[0] - patch.e0[0]));
    const k0 = Math.ceil((qa + 0.15) / RIB_SPACING - 0.5);
    const k1 = Math.floor((qb - 0.15) / RIB_SPACING - 0.5);
    for (let k = k0; k <= k1; k++) {
      const q = (k + 0.5) * RIB_SPACING;
      let vmax = ribReach(patch, q);
      if (vmax < 1 && alongLen > 0) vmax -= 0.3 / alongLen;
      if (vmax * alongLen < 0.8) continue;
      // Dense samples along the rib, then even segments by arc length.
      const M = 28;
      const pts: Vec3[] = [];
      const cum: number[] = [0];
      for (let m = 0; m <= M; m++) {
        const [px, pz] = ribPoint(patch, q, (vmax * m) / M);
        pts.push([px + centre[0], baseY + shape.heightAt(px, pz), pz + centre[1]]);
        if (m > 0) cum.push((cum[m - 1] as number) + length(sub(pts[m] as Vec3, pts[m - 1] as Vec3)));
      }
      const total = cum[M] as number;
      const nseg = Math.max(1, Math.round(total / SEGMENT_LENGTH));
      const at = (arc: number): Vec3 => {
        let m = 1;
        while (m < M && (cum[m] as number) < arc) m++;
        const c0 = cum[m - 1] as number;
        const c1 = cum[m] as number;
        return lerp3(pts[m - 1] as Vec3, pts[m] as Vec3, c1 > c0 ? (arc - c0) / (c1 - c0) : 0);
      };
      let prev = at(0);
      for (let s = 1; s <= nseg; s++) {
        const next = at((total * s) / nseg);
        const d = sub(next, prev);
        const len = length(d);
        if (len > 1e-4) {
          ribSegment(l0, normalize(d), len * 1.07, lerp3(prev, next, 0.5), tileColor());
        }
        if (s === 1 && patch.eave && len > 1e-4) {
          // Round cap standing at the eave end of the rib.
          const t = normalize(d);
          let n = normalize(cross(t, l0));
          if (n[1] < 0) n = scale(n, -1);
          const l = normalize(cross(n, t));
          const cm = new Matrix4().makeBasis(new Vector3(l[0], l[1], l[2]), new Vector3(n[0], n[1], n[2]), new Vector3(t[0], t[1], t[2]));
          cm.setPosition(prev[0] + n[0] * 0.06 - t[0] * 0.03, prev[1] + n[1] * 0.06 - t[1] * 0.03, prev[2] + n[2] * 0.06 - t[2] * 0.03);
          out.tiles.capMatrices.push(cm);
          const warm = shade(tileBase, 1.25 + rng() * 0.2);
          out.tiles.capColors.push(new Color().setRGB(warm[0], warm[1], warm[2]));
        }
        prev = next;
      }
    }
  }

  // Ridges: swept bands that follow the curved surface.
  const ridgeSpec = {
    main: { w: 0.5, h: 0.62 },
    hip: { w: 0.4, h: 0.4 },
    verge: { w: 0.42, h: 0.36 },
    sill: { w: 0.42, h: 0.3 },
  } as const;
  const hipGable = shape.params.form === 'hip-gable';
  const xg = shape.params.gableHalf ?? 0;
  for (const r of shape.ridges) {
    const spec = ridgeSpec[r.kind];
    const len = Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]);
    const n = Math.max(2, Math.ceil(len / 0.6));
    const path: Vec3[] = [];
    // Verge and main ridge sit on the front/back slopes (just inside the gable plane); the sill on the end hip.
    // `inward` is the sign of the nudge towards the middle of the roof (x only).
    const inward = hipGable ? (r.kind === 'sill' ? -1 : r.kind === 'verge' || r.kind === 'main' ? 1 : 0) : 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let x = r.from[0] + (r.to[0] - r.from[0]) * t;
      const z = r.from[1] + (r.to[1] - r.from[1]) * t;
      if (inward !== 0 && Math.abs(Math.abs(x) - xg) < 1e-6) x -= Math.sign(x) * 1e-3 * inward;
      path.push([x + centre[0], baseY + shape.heightAt(x, z), z + centre[1]]);
    }
    const widths = path.map(() => spec.w * ornamentScale ** 0.3);
    const heights = path.map(() => spec.h);
    if (r.kind === 'main') {
      // Ridge crest: a lighter cap and small blocks along the top.
      const capPath = path.map((q): Vec3 => [q[0], q[1] + spec.h - 0.02, q[2]]);
      out.body.sweep(capPath, capPath.map(() => spec.w * 0.7), capPath.map(() => 0.14), shade(ridgeBase, 1.45), 0.02);
      const blocks = Math.floor(len / 1.1);
      for (let k = 1; k < blocks; k++) {
        const t = k / blocks;
        const q = path[Math.min(path.length - 1, Math.round(t * (path.length - 1)))] as Vec3;
        out.body.box([q[0] - 0.12, q[1] + spec.h + 0.1, q[2] - 0.16], [q[0] + 0.12, q[1] + spec.h + 0.3, q[2] + 0.16], shade(trimBase, 2.2));
      }
    }
    out.body.sweep(path, widths, heights, ridgeBase, 0.16);
    for (const p of path) maxY = Math.max(maxY, p[1] + spec.h);
  }

  // Ridge-end curls and corner spires.
  for (const end of shape.ridgeEnds) {
    const [x, z] = end.at;
    const y = baseY + shape.heightAt(x - Math.sign(x) * 1e-3 * (hipGable ? 1 : 0), z);
    const R = 0.8 * ornamentScale;
    const pts: [number, number][] = [
      [0, 0.1],
      [0.04, 0.5 * ornamentScale],
      [0, 0.9 * ornamentScale],
    ];
    const top = pts[2] as [number, number];
    for (let k = 1; k <= 8; k++) {
      const th = (k / 8) * Math.PI * 1.08;
      pts.push([top[0] + R * (Math.cos(th) - 1), top[1] + R * Math.sin(th)]);
    }
    const thick0 = pts.map((_, i) => (0.95 - 0.7 * (i / (pts.length - 1))) * ornamentScale ** 0.5);
    out.body.curl([x + centre[0] + end.dir * 0.1, y + ridgeSpec.main.h - 0.1, z + centre[1]], 'x', end.dir, pts, thick0, 0.62, shade(ridgeBase, 1.1));
    maxY = Math.max(maxY, y + ridgeSpec.main.h + 0.9 * ornamentScale + R);
  }
  for (const c of shape.corners) {
    const y = baseY + shape.heightAt(c[0], c[1]);
    const s = ornamentScale;
    out.body.lathe(
      [c[0] + centre[0], y + 0.12, c[1] + centre[1]],
      [
        [0.26 * s, 0],
        [0.3 * s, 0.22 * s],
        [0.2 * s, 0.5 * s],
        [0.12 * s, 0.75 * s],
        [0, 1.0 * s],
      ],
      6,
      shade(ridgeBase, 1.2),
    );
  }
  if (shape.apex) {
    const f = opts.finial ?? 1;
    const y = baseY + shape.heightAt(shape.apex[0], shape.apex[1]);
    out.body.lathe(
      [shape.apex[0] + centre[0], y - 0.1, shape.apex[1] + centre[1]],
      [
        [0.55 * f, 0],
        [0.6 * f, 0.18 * f],
        [0.38 * f, 0.32 * f],
        [0.3 * f, 0.55 * f],
        [0.52 * f, 0.85 * f],
        [0.56 * f, 1.1 * f],
        [0.2 * f, 1.45 * f],
        [0.13 * f, 1.9 * f],
        [0.0, 2.4 * f],
      ],
      10,
      shade(ridgeBase, 1.25),
    );
    maxY = Math.max(maxY, y + 2.3 * f);
  }

  // Gable boards (the vertical triangles of hip-and-gable roofs).
  const boardColor = shade(wallBase, 0.92);
  for (const g of shape.gables) {
    const nz = 14;
    const outward: Vec3 = [Math.sign(g.x), 0, 0];
    const xi = g.x - Math.sign(g.x) * 1e-3;
    for (let j = 0; j < nz; j++) {
      const z0 = -g.halfZ + (2 * g.halfZ * j) / nz;
      const z1 = -g.halfZ + (2 * g.halfZ * (j + 1)) / nz;
      const bottom = baseY + g.baseHeight - thick;
      const y0 = baseY + shape.heightAt(xi, z0);
      const y1 = baseY + shape.heightAt(xi, z1);
      const gx = g.x + centre[0];
      const c = j % 2 === 0 ? boardColor : shade(boardColor, 0.85);
      const p00: Vec3 = [gx, bottom, z0 + centre[1]];
      const p10: Vec3 = [gx, bottom, z1 + centre[1]];
      const p11: Vec3 = [gx, y1, z1 + centre[1]];
      const p01: Vec3 = [gx, y0, z0 + centre[1]];
      const from: Vec3 = [gx - outward[0], bottom, z0 + centre[1]];
      out.body.quadAway(p00, p10, p11, p01, c, from);
    }
  }
  return {
    topY,
    underY: (x, z) => topY(x, z) - thick,
    maxY,
  };
}
