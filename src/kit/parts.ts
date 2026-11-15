import {
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import type { Rng } from '../engine/rng';
import type { Vec3 } from '../places/types';
import { instanced, MeshBuilder, rgb, shade, type RGB } from './geom';
import type { Palette } from './palette';
import { createTileSink } from './roof-mesh';
import { acquireTextures, releaseTextures } from './textures';
import type { BuildingStats } from './types';

const UP = new Vector3(0, 1, 0);

/** Unit-height column shaft with a gentle swell (entasis). Scale y by the height, xz by the radius ratio. */
function columnGeometry(color: RGB): BufferGeometry {
  const b = new MeshBuilder();
  b.lathe(
    [0, 0, 0],
    [
      [0.3, 0],
      [0.315, 0.12],
      [0.31, 0.5],
      [0.27, 0.95],
      [0.29, 1],
    ],
    10,
    color,
  );
  return b.toGeometry();
}

/**
 * One bracket cluster (dougong): stacked blocks and crossing arms. Arms run along x; the cantilever
 * runs out along +z. Height is 1 (scale y to fit the gap under the eave); x and z are metres.
 */
function bracketGeometry(base: RGB, accent: RGB, light: RGB): BufferGeometry {
  const b = new MeshBuilder();
  const layer = (y0: number, y1: number, x0: number, x1: number, z0: number, z1: number, c: RGB): void =>
    b.box([x0, y0, z0], [x1, y1, z1], c, undefined, false);
  layer(0, 0.16, -0.3, 0.3, -0.3, 0.3, base);
  layer(0.16, 0.32, -0.75, 0.75, -0.15, 0.15, accent);
  layer(0.16, 0.32, -0.15, 0.15, -0.3, 0.7, accent);
  for (const x of [-0.6, 0.6]) layer(0.32, 0.46, x - 0.2, x + 0.2, -0.2, 0.2, base);
  layer(0.32, 0.46, -0.2, 0.2, 0.5, 0.9, base);
  layer(0.46, 0.62, -1.1, 1.1, -0.16, 0.16, light);
  layer(0.46, 0.62, -0.16, 0.16, -0.3, 1.0, light);
  for (const x of [-0.95, 0.95]) layer(0.62, 0.76, x - 0.2, x + 0.2, -0.2, 0.2, accent);
  layer(0.62, 0.76, -0.2, 0.2, 0.75, 1.1, accent);
  layer(0.76, 1, -1.45, 1.45, -0.22, 0.22, base);
  layer(0.76, 1, -0.22, 0.22, -0.3, 1.15, base);
  return b.toGeometry();
}

/** Stone baluster post with a capped head, 1.15 m tall. */
function balusterGeometry(color: RGB): BufferGeometry {
  const b = new MeshBuilder();
  b.box([-0.17, 0, -0.17], [0.17, 0.22, 0.17], shade(color, 0.92), undefined, false);
  b.box([-0.12, 0.22, -0.12], [0.12, 0.95, 0.12], color, undefined, false);
  b.box([-0.17, 0.95, -0.17], [0.17, 1.08, 0.17], shade(color, 1.05), undefined, false);
  b.lathe([0, 1.08, 0], [[0.14, 0], [0.14, 0.04], [0.09, 0.1], [0.0, 0.17]], 6, shade(color, 1.1));
  return b.toGeometry();
}

/** Half-round tile rib of unit length along z, lying on a surface (y = 0), radius 0.115. */
function ribGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const r = 0.115;
  const arc: [number, number][] = [];
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * Math.PI;
    arc.push([Math.cos(a) * r, Math.sin(a) * r * 0.85]);
  }
  const white: RGB = [1, 1, 1];
  for (let k = 0; k < 4; k++) {
    const p = arc[k] as [number, number];
    const q = arc[k + 1] as [number, number];
    // Outward normal of the arc segment, shared with its neighbours for a smooth shade.
    const nrm = (a: [number, number]): Vec3 => {
      const l = Math.hypot(a[0], a[1] / 0.85) || 1;
      return [a[0] / l, a[1] / 0.85 / l, 0];
    };
    const i0 = b.vertex([p[0], p[1], -0.5], nrm(p), white);
    const i1 = b.vertex([q[0], q[1], -0.5], nrm(q), white);
    const i2 = b.vertex([q[0], q[1], 0.5], nrm(q), white);
    const i3 = b.vertex([p[0], p[1], 0.5], nrm(p), white);
    // Winding so the normal points out of the arc.
    b.quadIdx(i0, i1, i2, i3);
  }
  return b.toGeometry();
}

/** Round tile end, a short disc of radius 0.13 whose axis is z, facing -z (down the slope). */
function capGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const white: RGB = [1, 1, 1];
  const segs = 8;
  const front = b.vertex([0, 0.02, -0.03], [0, 0, -1], white);
  const ring: number[] = [];
  for (let k = 0; k <= segs; k++) {
    const a = (k / segs) * Math.PI;
    ring.push(b.vertex([Math.cos(a) * 0.13, Math.sin(a) * 0.12 + 0.02, -0.03], [0, 0, -1], white));
  }
  for (let k = 0; k < segs; k++) b.tri(front, ring[k + 1] as number, ring[k] as number);
  return b.toGeometry();
}

export interface PartsResult {
  object: Group;
  stats: BuildingStats;
  dispose(): void;
}

/**
 * Collects everything one building needs and turns it into a handful of meshes: one merged
 * vertex-coloured body, the roof surface, instanced ribs, caps, columns, brackets and balusters,
 * and the window lattice. That keeps a whole hall to about eight draw calls.
 */
export class KitParts {
  readonly body = new MeshBuilder();
  readonly surface = new MeshBuilder(true);
  readonly lattice = new MeshBuilder(true);
  readonly tiles = createTileSink();
  private readonly columns: Matrix4[] = [];
  private readonly brackets: Matrix4[] = [];
  private readonly balusters: Matrix4[] = [];

  constructor(
    readonly palette: Palette,
    readonly rng: Rng,
  ) {}

  /** A column from y to y + height, radius scale 1 is 0.3 m. */
  column(x: number, y: number, z: number, height: number, radiusScale = 1): void {
    this.columns.push(new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(radiusScale, height, radiusScale)));
  }

  /** A bracket cluster at the top of a column; `yaw` turns its +z cantilever to point outwards. */
  bracket(x: number, y: number, z: number, yaw: number, gap: number, size = 1): void {
    this.brackets.push(
      new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(UP, yaw), new Vector3(size, Math.max(0.5, gap), size)),
    );
  }

  baluster(x: number, y: number, z: number): void {
    this.balusters.push(new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(1, 1, 1)));
  }

  finish(name: string): PartsResult {
    const textures = acquireTextures();
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const group = new Group();
    group.name = name;
    const p = this.palette;

    const vertexMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const roofMat = new MeshStandardMaterial({ map: textures.roof, vertexColors: true, roughness: 0.8, metalness: 0 });
    const latticeMat = new MeshStandardMaterial({ map: textures.lattice, color: p.column, roughness: 0.7, metalness: 0 });
    materials.push(vertexMat, roofMat, latticeMat);

    const add = (mesh: Mesh | InstancedMesh, label: string, cast: boolean): void => {
      mesh.name = label;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      geometries.push(mesh.geometry);
      group.add(mesh);
    };
    const merged = (b: MeshBuilder, mat: Material, label: string, cast: boolean): void => {
      if (b.triangleCount === 0) return;
      add(new Mesh(b.toGeometry(), mat), label, cast);
    };

    merged(this.body, vertexMat, 'body', true);
    merged(this.surface, roofMat, 'roof-surface', true);
    merged(this.lattice, latticeMat, 'lattice', false);

    const inst = (geo: BufferGeometry, matrices: Matrix4[], label: string, colors?: Color[], cast = false): void => {
      if (matrices.length === 0) {
        geo.dispose();
        return;
      }
      add(instanced(geo, vertexMat, matrices, colors), label, cast);
    };
    inst(ribGeometry(), this.tiles.ribMatrices, 'tile-ribs', this.tiles.ribColors);
    inst(capGeometry(), this.tiles.capMatrices, 'eave-caps', this.tiles.capColors);
    inst(columnGeometry(rgb(p.column)), this.columns, 'columns', undefined, true);
    inst(bracketGeometry(rgb(p.trim), shade(rgb(p.trim), 1.5), shade(rgb(p.column), 1.1)), this.brackets, 'brackets');
    inst(balusterGeometry(rgb(p.stone)), this.balusters, 'balusters');

    const stats = measure(group);
    return {
      object: group,
      stats,
      dispose() {
        for (const g of geometries) g.dispose();
        for (const m of materials) m.dispose();
        releaseTextures();
      },
    };
  }
}

/** Triangles, meshes and per-frame draw calls of a built group (main pass plus shadow pass). */
export function measure(group: Group): BuildingStats {
  let triangles = 0;
  let meshes = 0;
  let casters = 0;
  group.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const g = o.geometry as BufferGeometry;
    const per = g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
    triangles += o instanceof InstancedMesh ? per * o.count : per;
    meshes++;
    if (o.castShadow) casters++;
  });
  return { triangles: Math.round(triangles), meshes, drawCalls: meshes + casters };
}
