import { Color, Matrix4, Vector3 } from 'three';
import { createRng, seedFrom, type Rng } from '../engine/rng';
import type { Solid, Vec3 } from '../places/types';
import { cross, length, mixRgb, normalize, rgb, shade, type RGB } from './geom';
import { templePalette, type Palette } from './palette';
import { KitParts } from './parts';
import { RIB_SPACING, ROW_LENGTH } from './roof-mesh';
import type { Building } from './types';

export interface WallParams {
  /** The run as a polyline of (x, z) points in the caller's frame; at least two. */
  points: readonly (readonly [number, number])[];
  /** Height of the plastered wall below the coping, metres. Default 3.2. */
  height?: number;
  /** Wall thickness, metres. Default 0.9. */
  thickness?: number;
  /** Add a post at the ends of the run. Default true (interior corners always get one). */
  endPosts?: boolean;
  palette?: Palette;
  rng?: Rng;
}

/**
 * Wall factory: a run of perimeter wall with a stone plinth, vermilion plaster, a painted band and
 * a small tiled coping roof (concave slopes, instanced half-round ribs, a ridge, eave caps).
 *
 * Contract:
 * - Unlike buildings, a wall has no platform: the polyline points are in the caller's frame and
 *   are used as given, so the origin is whatever the caller chose; +y up, metres.
 * - `footprint` is the bounding box of the run, thickness included. `height` is the top of the coping.
 * - `solids` are axis-aligned boxes covering the run from the ground to the wall top (diagonal runs
 *   are cut into 0.5 m chunks, so the over-block stays small). `heightAt` is 0 everywhere.
 * - Each polyline vertex gets a square post, so corners and ends are closed. About 3k triangles per
 *   10 m of wall.
 */
export function createWall(params: WallParams): Building {
  const pts = params.points;
  if (pts.length < 2) throw new Error('a wall needs at least two points');
  const height = params.height ?? 3.2;
  const t = params.thickness ?? 0.9;
  const palette = params.palette ?? templePalette;
  const rng = params.rng ?? createRng(seedFrom('kit-wall'));
  const parts = new KitParts(palette, rng);
  const b = parts.body;
  const stone = rgb(palette.stone);
  const wallC = rgb(palette.wall);
  const trim = rgb(palette.trim);
  const tileBase = rgb(palette.tile);
  const ridgeC = rgb(palette.ridge);
  const variation = palette.tileVariation ?? 0.14;
  const plinth = 0.5;
  const copingRise = 0.62;
  const copingHalf = t / 2 + 0.38;
  const solids: Solid[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = height + copingRise;

  const post = (x: number, z: number): void => {
    const h = t / 2 + 0.22;
    b.box([x - h, 0, z - h], [x + h, 0.6, z + h], shade(stone, 0.95));
    b.box([x - h + 0.06, 0.6, z - h + 0.06], [x + h - 0.06, height + 0.3, z + h - 0.06], wallC);
    b.box([x - h - 0.06, height + 0.3, z - h - 0.06], [x + h + 0.06, height + 0.5, z + h + 0.06], shade(trim, 1.1));
    // Pyramid cap.
    const s = h + 0.16;
    const apex: Vec3 = [x, height + 1.15, z];
    const base = height + 0.5;
    const corners: Vec3[] = [
      [x - s, base, z - s],
      [x + s, base, z - s],
      [x + s, base, z + s],
      [x - s, base, z + s],
    ];
    for (let k = 0; k < 4; k++) {
      b.triAway(corners[k] as Vec3, corners[(k + 1) % 4] as Vec3, apex, shade(mixRgb(tileBase, ridgeC, 0.4), 0.9), [x, base - 0.5, z]);
    }
    b.lathe([x, height + 1.1, z], [[0.12, 0], [0.14, 0.12], [0.05, 0.3], [0, 0.45]], 6, shade(ridgeC, 1.2));
    maxY = Math.max(maxY, height + 1.6);
  };

  const ribColor = (): Color => {
    let c: RGB = shade(tileBase, 1 + (rng() - 0.5) * 2 * variation);
    if (rng() < 0.09) c = mixRgb(c, [0.1, 0.18, 0.05], 0.55);
    return new Color().setRGB(c[0], c[1], c[2]);
  };

  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[i] as readonly [number, number];
    const p1 = pts[i + 1] as readonly [number, number];
    for (const p of [p0, p1]) {
      minX = Math.min(minX, p[0] - t / 2);
      maxX = Math.max(maxX, p[0] + t / 2);
      minZ = Math.min(minZ, p[1] - t / 2);
      maxZ = Math.max(maxZ, p[1] + t / 2);
    }
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const d: Vec3 = [dx / len, 0, dz / len];
    const side: Vec3 = [-d[2], 0, d[0]]; // across the wall
    // Segment spans between the posts; posts cover the joints.
    const u0 = t / 2 + 0.22;
    const u1 = len - u0;
    if (u1 <= u0) continue;
    const P = (u: number, v: number, y: number): Vec3 => [p0[0] + d[0] * u + side[0] * v, y, p0[1] + d[2] * u + side[2] * v];

    // Plinth and plaster body as oriented boxes.
    const yaw = Math.atan2(-dz, dx);
    const mid = (u0 + u1) / 2;
    const half = (u1 - u0) / 2;
    const centre = P(mid, 0, 0);
    b.orientedBox([centre[0], plinth / 2, centre[2]], [half, plinth / 2, t / 2 + 0.1], yaw, shade(stone, 0.92));
    b.orientedBox([centre[0], plinth + (height - plinth) / 2, centre[2]], [half, (height - plinth) / 2, t / 2], yaw, wallC);
    b.orientedBox([centre[0], height - 0.12, centre[2]], [half, 0.17, t / 2 + 0.06], yaw, shade(trim, 1.1));

    // Pilasters dividing the plaster into panels.
    const panels = Math.max(1, Math.round((u1 - u0) / 4.5));
    for (let k = 1; k < panels; k++) {
      const pc = P(u0 + ((u1 - u0) * k) / panels, 0, 0);
      b.orientedBox([pc[0], plinth + (height - plinth - 0.3) / 2, pc[2]], [0.16, (height - plinth - 0.3) / 2, t / 2 + 0.05], yaw, shade(wallC, 0.78));
    }

    // Coping: two concave slopes meeting at a ridge. Profile points (v, y).
    const prof: [number, number][] = [];
    const N = 6;
    for (let k = 0; k <= N; k++) {
      const f = k / N; // 0 at the ridge, 1 at the eave
      const v = f * copingHalf;
      const yy = height + 0.12 + copingRise * (1 - f) ** 1.7 + (f > 0.85 ? (f - 0.85) * 0.5 : 0);
      prof.push([v, yy]);
    }
    const drift = (): RGB => shade(tileBase, 0.6 * (0.9 + rng() * 0.18));
    for (const sgn of [-1, 1] as const) {
      let arc = 0;
      const arcs: number[] = [0];
      for (let k = 1; k <= N; k++) {
        const a = prof[k - 1] as [number, number];
        const c = prof[k] as [number, number];
        arc += Math.hypot(c[0] - a[0], c[1] - a[1]);
        arcs.push(arc);
      }
      const colUnit = (u: number): number => u / RIB_SPACING;
      const ids: [number, number][] = [];
      for (let k = 0; k <= N; k++) {
        const [v, yy] = prof[k] as [number, number];
        const col = drift();
        const next = k < N ? (prof[k + 1] as [number, number]) : (prof[k] as [number, number]);
        const prev = k > 0 ? (prof[k - 1] as [number, number]) : (prof[k] as [number, number]);
        // Tangent down the slope (towards the eave); the normal is perpendicular to it and to the wall axis.
        const tan: Vec3 = [side[0] * sgn * (next[0] - prev[0]), next[1] - prev[1], side[2] * sgn * (next[0] - prev[0])];
        let n3 = normalize(cross(tan, d));
        if (n3[1] < 0) n3 = [-n3[0], -n3[1], -n3[2]];
        const a = parts.surface.vertex(P(u0 - 0.2, sgn * v, yy), n3, col, [colUnit(0), (arcs[k] as number) / ROW_LENGTH]);
        const c2 = parts.surface.vertex(P(u1 + 0.2, sgn * v, yy), n3, col, [colUnit(len), (arcs[k] as number) / ROW_LENGTH]);
        ids.push([a, c2]);
      }
      for (let k = 0; k < N; k++) {
        const [a0, a1] = ids[k] as [number, number];
        const [c0, c1] = ids[k + 1] as [number, number];
        // Orientation chosen so the normal faces up.
        const pa = P(u0, sgn * (prof[k] as [number, number])[0], (prof[k] as [number, number])[1]);
        const pb = P(u1, sgn * (prof[k] as [number, number])[0], (prof[k] as [number, number])[1]);
        const pc = P(u0, sgn * (prof[k + 1] as [number, number])[0], (prof[k + 1] as [number, number])[1]);
        const up = cross([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]])[1];
        if (up > 0) parts.surface.quadIdx(a0, a1, c1, c0);
        else parts.surface.quadIdx(a0, c0, c1, a1);
      }
      // Underside lip along the eave edge.
      const e = prof[N] as [number, number];
      const lipTop0 = P(u0 - 0.2, sgn * e[0], e[1]);
      const lipTop1 = P(u1 + 0.2, sgn * e[0], e[1]);
      const lipBot1: Vec3 = [lipTop1[0], lipTop1[1] - 0.3, lipTop1[2]];
      const lipBot0: Vec3 = [lipTop0[0], lipTop0[1] - 0.3, lipTop0[2]];
      b.quadAway(lipTop0, lipTop1, lipBot1, lipBot0, shade(trim, 1.15), P(mid, 0, height));

      // Ribs run across the coping, one per pitch along the wall, one segment per slope.
      const kA = Math.ceil((u0 - 0.2) / RIB_SPACING + 0.5);
      const kB = Math.floor((u1 + 0.2) / RIB_SPACING - 0.5);
      for (let k = kA; k <= kB; k++) {
        const u = (k + 0.5) * RIB_SPACING;
        const lo = prof[0] as [number, number];
        const hi = prof[N] as [number, number];
        const q0 = P(u, sgn * hi[0], hi[1]); // eave end
        const q1 = P(u, sgn * (lo[0] + 0.1), lo[1]); // ridge end
        const dd: Vec3 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
        const L = length(dd);
        const tt = normalize(dd);
        const l0: Vec3 = d;
        let n = normalize(cross(tt, l0));
        if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
        const l = normalize(cross(n, tt));
        const m = new Matrix4().makeBasis(new Vector3(l[0], l[1], l[2]), new Vector3(n[0], n[1], n[2]), new Vector3(tt[0] * L * 1.05, tt[1] * L * 1.05, tt[2] * L * 1.05));
        m.setPosition((q0[0] + q1[0]) / 2 - n[0] * 0.02, (q0[1] + q1[1]) / 2 - n[1] * 0.02, (q0[2] + q1[2]) / 2 - n[2] * 0.02);
        parts.tiles.ribMatrices.push(m);
        parts.tiles.ribColors.push(ribColor());
        const cm = new Matrix4().makeBasis(new Vector3(l[0], l[1], l[2]), new Vector3(n[0], n[1], n[2]), new Vector3(tt[0], tt[1], tt[2]));
        cm.setPosition(q0[0] + n[0] * 0.06 - tt[0] * 0.03, q0[1] + n[1] * 0.06 - tt[1] * 0.03, q0[2] + n[2] * 0.06 - tt[2] * 0.03);
        parts.tiles.capMatrices.push(cm);
        const warm = shade(tileBase, 1.3 + rng() * 0.15);
        parts.tiles.capColors.push(new Color().setRGB(warm[0], warm[1], warm[2]));
      }
    }
    // Ridge cap along the top.
    b.sweep([P(u0 - 0.2, 0, height + 0.12 + copingRise), P(u1 + 0.2, 0, height + 0.12 + copingRise)], [0.34, 0.34], [0.2, 0.2], ridgeC, 0.1);
    // Under-coping soffit is hidden by the painted band; end caps of the coping are hidden by the posts.

    // Collision: one box for an axis-aligned run, short chunks for a diagonal one.
    const aligned = Math.abs(dx) < 1e-6 || Math.abs(dz) < 1e-6;
    const chunks = aligned ? 1 : Math.ceil(len / 0.5);
    const hh = t / 2 + 0.1;
    for (let c = 0; c < chunks; c++) {
      const ua = u0 - 0.22 + ((u1 - u0 + 0.44) * c) / chunks;
      const ub = u0 - 0.22 + ((u1 - u0 + 0.44) * (c + 1)) / chunks;
      const corners = [P(ua, -hh, 0), P(ua, hh, 0), P(ub, -hh, 0), P(ub, hh, 0)];
      solids.push({
        min: [Math.min(...corners.map((q) => q[0])), 0, Math.min(...corners.map((q) => q[2]))],
        max: [Math.max(...corners.map((q) => q[0])), height + copingRise, Math.max(...corners.map((q) => q[2]))],
      });
    }
  }

  const endPosts = params.endPosts ?? true;
  pts.forEach((p, i) => {
    const isEnd = i === 0 || i === pts.length - 1;
    if (isEnd && !endPosts) return;
    post(p[0], p[1]);
    solids.push({ min: [p[0] - t / 2 - 0.22, 0, p[1] - t / 2 - 0.22], max: [p[0] + t / 2 + 0.22, height + 0.5, p[1] + t / 2 + 0.22] });
  });

  const built = parts.finish('wall');
  return {
    object: built.object,
    footprint: { width: maxX - minX + 0.44, depth: maxZ - minZ + 0.44 },
    height: maxY,
    solids,
    heightAt: () => 0,
    stats: built.stats,
    dispose: built.dispose,
  };
}
