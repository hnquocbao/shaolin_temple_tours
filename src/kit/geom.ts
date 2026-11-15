import { BufferGeometry, Color, Float32BufferAttribute, InstancedMesh, Matrix4, type Material } from 'three';
import type { Vec3 } from '../places/types';

/** Linear-space RGB, the space vertex colours are read in. */
export type RGB = readonly [r: number, g: number, b: number];

const rgbCache = new Map<number, RGB>();

/** Linear RGB of an sRGB hex colour (what `new Color(hex)` stores). */
export function rgb(hex: number): RGB {
  let c = rgbCache.get(hex);
  if (!c) {
    const col = new Color(hex);
    c = [col.r, col.g, col.b];
    rgbCache.set(hex, c);
  }
  return c;
}

export function shade(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l < 1e-9 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
}
export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Plain-array mesh under construction. Pure data until `toGeometry`, so geometry maths runs in Node.
 * Every vertex carries a normal and a linear vertex colour; UVs are optional.
 */
export class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  constructor(readonly withUv = false) {}

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  vertex(p: Vec3, n: Vec3, c: RGB, uv?: readonly [number, number]): number {
    const i = this.vertexCount;
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.colors.push(c[0], c[1], c[2]);
    if (this.withUv) this.uvs.push(uv?.[0] ?? 0, uv?.[1] ?? 0);
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** Two triangles over four vertex indices given counter-clockwise from the visible side. */
  quadIdx(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }

  /** Flat-shaded quad, corners counter-clockwise seen from the side the normal points to. */
  quad(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, color: RGB): void {
    const n = normalize(cross(sub(p1, p0), sub(p3, p0)));
    const a = this.vertex(p0, n, color);
    const b = this.vertex(p1, n, color);
    const c = this.vertex(p2, n, color);
    const d = this.vertex(p3, n, color);
    this.quadIdx(a, b, c, d);
  }

  /** Flat quad whose normal must point away from `from`; the winding is flipped when it does not. */
  quadAway(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, color: RGB, from: Vec3): void {
    const n = cross(sub(p1, p0), sub(p3, p0));
    const mid: Vec3 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2, (p0[2] + p2[2]) / 2];
    if (dot(n, sub(mid, from)) >= 0) this.quad(p0, p1, p2, p3, color);
    else this.quad(p0, p3, p2, p1, color);
  }

  /** Flat triangle whose normal must point away from `from`. */
  triAway(p0: Vec3, p1: Vec3, p2: Vec3, color: RGB, from: Vec3): void {
    let n = cross(sub(p1, p0), sub(p2, p0));
    const mid: Vec3 = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3];
    const flip = dot(n, sub(mid, from)) < 0;
    if (flip) n = scale(n, -1);
    n = normalize(n);
    const a = this.vertex(p0, n, color);
    const b = this.vertex(flip ? p2 : p1, n, color);
    const c = this.vertex(flip ? p1 : p2, n, color);
    this.tri(a, b, c);
  }

  /**
   * Curved bar in a vertical plane: the 2D points (x, y) are mapped to world as
   * origin + dir * x along `axis` and origin.y + y. Thickness is measured in the plane, depth across it.
   */
  curl(
    origin: Vec3,
    axis: 'x' | 'z',
    dir: 1 | -1,
    points: readonly (readonly [number, number])[],
    thickness: readonly number[],
    depth: number,
    color: RGB,
  ): void {
    const world = (x: number, y: number, across: number): Vec3 =>
      axis === 'x'
        ? [origin[0] + dir * x, origin[1] + y, origin[2] + across]
        : [origin[0] + across, origin[1] + y, origin[2] + dir * x];
    const sections: Vec3[][] = [];
    const centres: Vec3[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i] as readonly [number, number];
      const a = points[Math.max(0, i - 1)] as readonly [number, number];
      const b = points[Math.min(points.length - 1, i + 1)] as readonly [number, number];
      const tx = b[0] - a[0];
      const ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl;
      const ny = tx / tl;
      const h = (thickness[i] ?? thickness[thickness.length - 1] ?? 0.2) / 2;
      const d = depth / 2;
      sections.push([
        world(p[0] + nx * h, p[1] + ny * h, -d),
        world(p[0] - nx * h, p[1] - ny * h, -d),
        world(p[0] - nx * h, p[1] - ny * h, d),
        world(p[0] + nx * h, p[1] + ny * h, d),
      ]);
      centres.push(world(p[0], p[1], 0));
    }
    for (let i = 0; i + 1 < sections.length; i++) {
      const s0 = sections[i] as Vec3[];
      const s1 = sections[i + 1] as Vec3[];
      const c = lerp3(centres[i] as Vec3, centres[i + 1] as Vec3, 0.5);
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        this.quadAway(s0[k] as Vec3, s1[k] as Vec3, s1[k2] as Vec3, s0[k2] as Vec3, color, c);
      }
    }
    const first = sections[0];
    const last = sections[sections.length - 1];
    if (first && last) {
      this.quadAway(first[0] as Vec3, first[1] as Vec3, first[2] as Vec3, first[3] as Vec3, color, centres[1] as Vec3);
      this.quadAway(last[0] as Vec3, last[1] as Vec3, last[2] as Vec3, last[3] as Vec3, color, centres[centres.length - 2] as Vec3);
    }
  }

  /** Axis-aligned box. `top` overrides the colour of the +y face. */
  box(min: Vec3, max: Vec3, color: RGB, top?: RGB, bottom = true): void {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top ?? color); // +y
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], shade(color, 0.7)); // -y
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], color); // -z (front)
    this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], color); // +z
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], color); // -x
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], color); // +x
  }

  /** Box turned about the y axis around its own centre. */
  orientedBox(center: Vec3, half: Vec3, yaw: number, color: RGB): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const [hx, hy, hz] = half;
    const p = (sx: number, sy: number, sz: number): Vec3 => {
      const x = sx * hx;
      const z = sz * hz;
      return [center[0] + x * c + z * s, center[1] + sy * hy, center[2] - x * s + z * c];
    };
    this.quad(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), color);
    this.quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), shade(color, 0.7));
    this.quad(p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1), color);
    this.quad(p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), p(-1, -1, 1), color);
    this.quad(p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), p(-1, -1, -1), color);
    this.quad(p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1), color);
  }

  /** Surface of revolution about the vertical axis through `base`. Profile points are (radius, height) bottom to top. */
  lathe(base: Vec3, profile: readonly (readonly [number, number])[], segments: number, color: RGB): void {
    const rings: number[][] = [];
    for (let k = 0; k < profile.length; k++) {
      const [r, h] = profile[k] as readonly [number, number];
      const prev = profile[Math.max(0, k - 1)] as readonly [number, number];
      const next = profile[Math.min(profile.length - 1, k + 1)] as readonly [number, number];
      const dr = next[0] - prev[0];
      const dh = next[1] - prev[1];
      const ring: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        // The outward normal is perpendicular to the profile tangent (dr, dh).
        const n = normalize([dh * ca, -dr, dh * sa]);
        ring.push(this.vertex([base[0] + r * ca, base[1] + h, base[2] + r * sa], n, color));
      }
      rings.push(ring);
    }
    for (let k = 0; k + 1 < rings.length; k++) {
      const lo = rings[k] as number[];
      const hi = rings[k + 1] as number[];
      for (let i = 0; i < segments; i++) {
        this.quadIdx(lo[i] as number, hi[i] as number, hi[i + 1] as number, lo[i + 1] as number);
      }
    }
  }

  /**
   * Rectangular band swept along a path, e.g. a ridge. The cross-section is upright.
   * Width and height may vary along the path (one entry per point).
   */
  sweep(path: readonly Vec3[], widths: readonly number[], heights: readonly number[], color: RGB, below = 0.1): void {
    const n = path.length;
    if (n < 2) return;
    const up: Vec3 = [0, 1, 0];
    interface Frame {
      l: Vec3;
      r: Vec3;
      lt: Vec3;
      rt: Vec3;
    }
    const frames: Frame[] = [];
    for (let i = 0; i < n; i++) {
      const p = path[i] as Vec3;
      const t = normalize(sub(path[Math.min(n - 1, i + 1)] as Vec3, path[Math.max(0, i - 1)] as Vec3));
      let side = cross(up, t);
      if (length(side) < 1e-6) side = [1, 0, 0];
      side = normalize(side);
      const w = (widths[i] ?? widths[widths.length - 1] ?? 0.3) / 2;
      const h = heights[i] ?? heights[heights.length - 1] ?? 0.3;
      frames.push({
        l: [p[0] - side[0] * w, p[1] - below, p[2] - side[2] * w],
        r: [p[0] + side[0] * w, p[1] - below, p[2] + side[2] * w],
        lt: [p[0] - side[0] * w * 0.8, p[1] + h, p[2] - side[2] * w * 0.8],
        rt: [p[0] + side[0] * w * 0.8, p[1] + h, p[2] + side[2] * w * 0.8],
      });
    }
    for (let i = 0; i + 1 < n; i++) {
      const a = frames[i] as Frame;
      const b = frames[i + 1] as Frame;
      this.quad(a.lt, b.lt, b.rt, a.rt, shade(color, 1.12)); // top
      this.quad(a.l, b.l, b.lt, a.lt, color);
      this.quad(a.rt, b.rt, b.r, a.r, color);
    }
    const first = frames[0] as Frame;
    const last = frames[n - 1] as Frame;
    this.quad(first.r, first.l, first.lt, first.rt, color);
    this.quad(last.l, last.r, last.rt, last.lt, color);
  }

  toGeometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    if (this.withUv) g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** One InstancedMesh from a template geometry, a matrix per instance and an optional colour per instance. */
export function instanced(
  geometry: BufferGeometry,
  material: Material,
  matrices: readonly Matrix4[],
  colors?: readonly Color[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, matrices.length);
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i] as Matrix4);
    if (colors) mesh.setColorAt(i, colors[i] as Color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  return mesh;
}
