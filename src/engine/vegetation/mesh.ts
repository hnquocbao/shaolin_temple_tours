import { BufferAttribute, BufferGeometry, Color } from 'three';
import type { Rng } from '../rng';

export type V3 = readonly [number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-9 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Rotation: roll about z, then pitch about x, then yaw about y (radians). */
export interface Rot {
  yaw?: number;
  pitch?: number;
  roll?: number;
}

function rotate(v: V3, r: Rot): V3 {
  let [x, y, z] = v;
  const roll = r.roll ?? 0;
  if (roll !== 0) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  const pitch = r.pitch ?? 0;
  if (pitch !== 0) {
    const c = Math.cos(pitch);
    const s = Math.sin(pitch);
    [y, z] = [y * c - z * s, y * s + z * c];
  }
  const yaw = r.yaw ?? 0;
  if (yaw !== 0) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    [x, z] = [x * c + z * s, -x * s + z * c];
  }
  return [x, y, z];
}

/** What a crown looks like as a whole: its centre and size, and how its light falls from top to bottom. */
export interface Crown {
  center: V3;
  radii: V3;
  /** 0 = every blob shades on its own, 1 = the whole crown shades as one big ball. */
  normalMix: number;
  /** Baked light at the crown's lowest and highest point (a grey multiplier on the instance colour). */
  lo: number;
  hi: number;
}

export interface BlobParams {
  center: V3;
  radii: V3;
  rot?: Rot;
  segs: number;
  rings: number;
  /** Radial lumpiness, 0..1 (fraction of the radius). */
  jitter: number;
  crown: Crown;
  /** Extra push of the normals towards +y: flat pads read lit from above. */
  up?: number;
  /** 0..1: squash the lower half flat. */
  flatBottom?: number;
  /** 0..1: narrow the upper part to a flame (cypress tips). */
  pointTop?: number;
  /** Multiplier on this blob's baked light. */
  tone?: number;
}

/**
 * Plain-array tree mesh under construction (pure data until `toGeometry`, so shape maths runs in Node).
 * Vertices carry: position, normal, colour, `aLeaf` (1 for foliage, which takes the instance colour and wind;
 * 0 for wood, whose colour is its own) and `aSway` (how far up the tree: wind moves the top most).
 */
export class TreeMesh {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly leaf: number[] = [];
  readonly indices: number[] = [];

  constructor(private readonly rng: Rng) {}

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  private vertex(p: V3, n: V3, c: V3, leaf: number): number {
    const i = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.colors.push(c[0], c[1], c[2]);
    this.leaf.push(leaf);
    return i;
  }

  private position(i: number): V3 {
    return [this.positions[i * 3] ?? 0, this.positions[i * 3 + 1] ?? 0, this.positions[i * 3 + 2] ?? 0];
  }

  private normal(i: number): V3 {
    return [this.normals[i * 3] ?? 0, this.normals[i * 3 + 1] ?? 0, this.normals[i * 3 + 2] ?? 0];
  }

  /**
   * A triangle wound so its face looks away from `inside` (a point inside the solid) when given, otherwise
   * the way the vertex normals point. Shading normals are bent on purpose, so blobs use the point.
   */
  private tri(a: number, b: number, c: number, inside?: V3): void {
    const pa = this.position(a);
    const pb = this.position(b);
    const pc = this.position(c);
    const face = cross(sub(pb, pa), sub(pc, pa));
    const ref = inside
      ? sub([(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3], inside)
      : add(add(this.normal(a), this.normal(b)), this.normal(c));
    if (dot(face, ref) >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  /** A lumpy ellipsoid of leaves. Normals are the blob's own, blended towards the whole crown's. */
  blob(p: BlobParams): void {
    const { segs, rings, crown } = p;
    const rot = p.rot ?? {};
    const rng = this.rng;
    const up = p.up ?? 0;
    const flat = p.flatBottom ?? 0;
    const point = p.pointTop ?? 0;
    const tone = p.tone ?? 1;
    const unit: V3[] = [[0, 1, 0]];
    const phase = rng() * Math.PI * 2;
    for (let k = 1; k < rings; k++) {
      const theta = (Math.PI * k) / rings;
      for (let i = 0; i < segs; i++) {
        // Alternate rings sit half a segment apart, so a band is a zig-zag of triangles with no seam lines.
        const phi = phase + ((i + (k % 2) * 0.5) / segs) * Math.PI * 2;
        unit.push([Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)]);
      }
    }
    unit.push([0, -1, 0]);

    const first = this.positions.length / 3;
    for (const u0 of unit) {
      const pole = Math.abs(u0[1]) > 0.999;
      let [ux, uy, uz] = u0;
      const j = pole ? 1 + p.jitter * 0.3 * (rng() * 2 - 1) : 1 + p.jitter * (rng() * 2 - 1);
      if (uy < 0 && flat > 0) uy *= 1 - flat;
      if (uy > 0 && point > 0) {
        const narrow = 1 - point * uy;
        ux *= narrow;
        uz *= narrow;
      }
      const local: V3 = [ux * j * p.radii[0], uy * j * p.radii[1], uz * j * p.radii[2]];
      const pos = add(p.center, rotate(local, rot));
      // The blob's own normal (ellipsoid gradient), the whole crown's, and a lift towards the sky.
      const own = norm(rotate([u0[0] / p.radii[0], u0[1] / p.radii[1], u0[2] / p.radii[2]], rot));
      const rel = sub(pos, crown.center);
      const whole = norm([rel[0] / crown.radii[0], rel[1] / crown.radii[1], rel[2] / crown.radii[2]]);
      const n = norm(add(add(scale(own, 1 - crown.normalMix), scale(whole, crown.normalMix)), [0, up, 0]));
      // Baked light: bright on top of the crown, dim underneath, dimmer where the surface faces the crown's heart.
      const t = clamp01((rel[1] / crown.radii[1] + 1) / 2);
      const inward = clamp01(dot(own, whole) * 0.5 + 0.5);
      const lum = lerp(crown.lo, crown.hi, t * t * (3 - 2 * t)) * (0.72 + 0.28 * inward) * tone * (1 + 0.1 * (rng() * 2 - 1));
      this.vertex(pos, n, [lum, lum, lum], 1);
    }

    const ring = (k: number, i: number): number => first + 1 + (k - 1) * segs + (((i % segs) + segs) % segs);
    const bottom = first + unit.length - 1;
    const mid = p.center;
    for (let i = 0; i < segs; i++) this.tri(first, ring(1, i), ring(1, i + 1), mid);
    for (let k = 1; k < rings - 1; k++) {
      for (let i = 0; i < segs; i++) {
        if (k % 2 === 1) {
          // Upper ring is the offset one: its vertex i lies between lower vertices i and i + 1.
          this.tri(ring(k, i), ring(k, i + 1), ring(k + 1, i + 1), mid);
          this.tri(ring(k + 1, i), ring(k + 1, i + 1), ring(k, i), mid);
        } else {
          this.tri(ring(k, i), ring(k, i + 1), ring(k + 1, i), mid);
          this.tri(ring(k + 1, i - 1), ring(k + 1, i), ring(k, i), mid);
        }
      }
    }
    for (let i = 0; i < segs; i++) this.tri(bottom, ring(rings - 1, i + 1), ring(rings - 1, i), mid);
  }

  /** A tapering wooden tube through `points` (radius per point), closed at the top. */
  tube(points: readonly V3[], radii: readonly number[], sides: number, color: V3): void {
    const rows: number[][] = [];
    let prevN: V3 = [1, 0, 0];
    for (let k = 0; k < points.length; k++) {
      const p = points[k] as V3;
      const a = points[Math.max(0, k - 1)] as V3;
      const b = points[Math.min(points.length - 1, k + 1)] as V3;
      const tangent = norm(sub(b, a));
      let nrm = sub(prevN, scale(tangent, dot(prevN, tangent)));
      if (Math.hypot(nrm[0], nrm[1], nrm[2]) < 1e-4) nrm = cross(tangent, [0, 0, 1]);
      nrm = norm(nrm);
      prevN = nrm;
      const bin = cross(tangent, nrm);
      const r = radii[k] ?? radii[radii.length - 1] ?? 0.1;
      const row: number[] = [];
      for (let i = 0; i < sides; i++) {
        const phi = (i / sides) * Math.PI * 2;
        const dir = add(scale(nrm, Math.cos(phi)), scale(bin, Math.sin(phi)));
        const g = (1 + 0.08 * (this.rng() * 2 - 1)) * (k === 0 ? 0.8 : 1);
        row.push(this.vertex(add(p, scale(dir, r)), dir, scale(color, g), 0));
      }
      rows.push(row);
    }
    for (let k = 0; k + 1 < rows.length; k++) {
      const r0 = rows[k] as number[];
      const r1 = rows[k + 1] as number[];
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        this.tri(r0[i] as number, r1[i] as number, r1[j] as number);
        this.tri(r0[i] as number, r1[j] as number, r0[j] as number);
      }
    }
    const lastP = points[points.length - 1] as V3;
    const prevP = points[points.length - 2];
    const lastRow = rows[rows.length - 1] as number[];
    const tipDir = prevP ? norm(sub(lastP, prevP)) : ([0, 1, 0] as V3);
    const tip = this.vertex(add(lastP, scale(tipDir, (radii[radii.length - 1] ?? 0.1) * 0.6)), tipDir, color, 0);
    for (let i = 0; i < sides; i++) this.tri(lastRow[i] as number, tip, lastRow[(i + 1) % sides] as number);
  }

  /** Finish: `height` is the tree's height, which sets how much the wind moves each vertex. */
  toGeometry(height: number): BufferGeometry {
    const g = new BufferGeometry();
    const count = this.positions.length / 3;
    const sway = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const y = Math.max(0, (this.positions[i * 3 + 1] ?? 0) / height);
      sway[i] = Math.min(1, y) ** 1.7;
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    g.setAttribute('aLeaf', new BufferAttribute(new Float32Array(this.leaf), 1));
    g.setAttribute('aSway', new BufferAttribute(sway, 1));
    g.setIndex(new BufferAttribute(new Uint32Array(this.indices), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const linearCache = new Map<number, V3>();
/** Linear RGB of an sRGB hex colour. */
export function linear(hex: number): V3 {
  let c = linearCache.get(hex);
  if (!c) {
    const col = new Color(hex);
    c = [col.r, col.g, col.b];
    linearCache.set(hex, c);
  }
  return c;
}
