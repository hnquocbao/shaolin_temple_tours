import { BufferAttribute, BufferGeometry } from 'three';

/** A rectangle on the ground plane, in metres. */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * One grid of the terrain. Several rings of growing cell size make a near-to-far level of detail:
 * fine in the middle, cheap at the horizon. A ring can have a `hole` where a finer ring sits.
 * Bounds and hole must lie on the ring's own lattice (a whole number of cells from `minX`/`minZ`).
 */
export interface RingSpec extends Rect {
  cell: number;
  hole?: Rect;
}

/** A per-vertex attribute computed from position and height (for the surface material). */
export interface VertexAttribute {
  name: string;
  size: number;
  fill(x: number, z: number, height: number, out: number[]): void;
}

export interface HeightfieldStats {
  vertices: number;
  triangles: number;
}

const inRect = (r: Rect, x: number, z: number): boolean => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/**
 * Triangle mesh of `height(x, z)` over one ring, with smooth normals from the height itself and
 * a short skirt along every open edge so rings of different detail never show cracks.
 * Vertices sit exactly on `height`, so the mesh and the function agree at every vertex.
 */
export function buildRingGeometry(
  ring: RingSpec,
  height: (x: number, z: number) => number,
  attributes: readonly VertexAttribute[] = [],
): BufferGeometry {
  const { cell } = ring;
  const nx = Math.round((ring.maxX - ring.minX) / cell);
  const nz = Math.round((ring.maxZ - ring.minZ) / cell);
  const stride = nx + 1;
  const hole = ring.hole;

  const cellUsed = new Uint8Array(nx * nz);
  const vertexIndex = new Int32Array(stride * (nz + 1)).fill(-1);
  let usedCells = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = ring.minX + (i + 0.5) * cell;
      const cz = ring.minZ + (j + 0.5) * cell;
      if (hole && inRect(hole, cx, cz)) continue;
      cellUsed[j * nx + i] = 1;
      usedCells++;
    }
  }
  const used = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < nx && j < nz && cellUsed[j * nx + i] === 1;

  let vertexCount = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!used(i, j)) continue;
      for (const [di, dj] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const k = (j + dj) * stride + (i + di);
        if (vertexIndex[k] === -1) vertexIndex[k] = vertexCount++;
      }
    }
  }

  // Skirt edges: a cell side with no used neighbour.
  const skirts: number[] = []; // pairs of lattice keys (a, b) in winding order
  const key = (i: number, j: number): number => j * stride + i;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!used(i, j)) continue;
      if (!used(i, j - 1)) skirts.push(key(i, j), key(i + 1, j));
      if (!used(i + 1, j)) skirts.push(key(i + 1, j), key(i + 1, j + 1));
      if (!used(i, j + 1)) skirts.push(key(i + 1, j + 1), key(i, j + 1));
      if (!used(i - 1, j)) skirts.push(key(i, j + 1), key(i, j));
    }
  }
  const skirtKeys = [...new Set(skirts)];
  const skirtVertex = new Map<number, number>();
  skirtKeys.forEach((k, n) => skirtVertex.set(k, vertexCount + n));
  const total = vertexCount + skirtKeys.length;

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const heights = new Float32Array(stride * (nz + 1)).fill(Number.NaN);
  const heightAtLattice = (i: number, j: number): number => {
    const k = j * stride + i;
    const cached = heights[k];
    if (cached !== undefined && !Number.isNaN(cached)) return cached;
    return height(ring.minX + i * cell, ring.minZ + j * cell);
  };
  for (let k = 0; k < vertexIndex.length; k++) {
    if (vertexIndex[k] === -1) continue;
    const i = k % stride;
    const j = (k - i) / stride;
    heights[k] = height(ring.minX + i * cell, ring.minZ + j * cell);
  }

  const attrData = attributes.map((a) => new Float32Array(total * a.size));
  const scratch: number[] = [];
  const skirtDepth = Math.max(5, cell * 1.5);
  for (let k = 0; k < vertexIndex.length; k++) {
    const v = vertexIndex[k];
    if (v === undefined || v === -1) continue;
    const i = k % stride;
    const j = (k - i) / stride;
    const x = ring.minX + i * cell;
    const z = ring.minZ + j * cell;
    const y = heights[k] ?? 0;
    const dx = (heightAtLattice(i + 1, j) - heightAtLattice(i - 1, j)) / (2 * cell);
    const dz = (heightAtLattice(i, j + 1) - heightAtLattice(i, j - 1)) / (2 * cell);
    const inv = 1 / Math.hypot(dx, 1, dz);
    const copies = [v];
    const sv = skirtVertex.get(k);
    if (sv !== undefined) copies.push(sv);
    for (const [n, target] of copies.entries()) {
      positions[target * 3] = x;
      positions[target * 3 + 1] = n === 0 ? y : y - skirtDepth;
      positions[target * 3 + 2] = z;
      normals[target * 3] = -dx * inv;
      normals[target * 3 + 1] = inv;
      normals[target * 3 + 2] = -dz * inv;
      attributes.forEach((a, ai) => {
        scratch.length = 0;
        a.fill(x, z, y, scratch);
        const data = attrData[ai];
        if (data) for (let c = 0; c < a.size; c++) data[target * a.size + c] = scratch[c] ?? 0;
      });
    }
  }

  const indices = new Uint32Array((usedCells * 2 + skirts.length) * 3);
  let w = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!used(i, j)) continue;
      const a = vertexIndex[key(i, j)] ?? 0;
      const b = vertexIndex[key(i + 1, j)] ?? 0;
      const c = vertexIndex[key(i, j + 1)] ?? 0;
      const d = vertexIndex[key(i + 1, j + 1)] ?? 0;
      // Counter-clockwise seen from above (+y). Alternate the diagonal to avoid a grain.
      if ((i + j) % 2 === 0) {
        indices.set([a, c, d, a, d, b], w);
      } else {
        indices.set([a, c, b, b, c, d], w);
      }
      w += 6;
    }
  }
  for (let s = 0; s < skirts.length; s += 2) {
    const ka = skirts[s] ?? 0;
    const kb = skirts[s + 1] ?? 0;
    const ta = vertexIndex[ka] ?? 0;
    const tb = vertexIndex[kb] ?? 0;
    const ba = skirtVertex.get(ka) ?? 0;
    const bb = skirtVertex.get(kb) ?? 0;
    // Edges were listed with the used cell on their left; draw both faces so winding never hides them.
    indices.set([ta, tb, bb, ta, bb, ba], w);
    w += 6;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  attributes.forEach((a, ai) => {
    const data = attrData[ai];
    if (data) geometry.setAttribute(a.name, new BufferAttribute(data, a.size));
  });
  geometry.setIndex(new BufferAttribute(indices.subarray(0, w), 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

export function geometryStats(g: BufferGeometry): HeightfieldStats {
  return { vertices: g.getAttribute('position').count, triangles: (g.getIndex()?.count ?? 0) / 3 };
}
