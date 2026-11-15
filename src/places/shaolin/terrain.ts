import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { buildRingGeometry, type Rect, type RingSpec, type VertexAttribute } from '../../engine/terrain/heightfield';
import { createTerrainMaterial } from '../../engine/terrain/material';
import { fbm, hash2, mix, ridged, smax, smoothstep } from '../../engine/terrain/noise';

/**
 * Mount Shaoshi: the ground of the Shaolin place.
 *
 * World layout (metres, +y up, the temple axis runs along +z, the player arrives from -z):
 *  - Seven terraces rise along the axis from z = -22 to z = 286, 120 m wide, 44 m deep (pitch), 3.2 m apart.
 *  - The terraces sit on a spur. Cliffs fall away east and west and to the south into valleys whose floor
 *    is about 140 m below the spur, so a cloud sea can lie below the temple.
 *  - A stepped path climbs the spur from the south and arrives at the front of the first terrace.
 *  - Behind (north) the mountain rises; six ridge rings and a few rock spires stand around the valleys.
 */

export const TERRACE_COUNT = 7;
/** Width (x) and pitch (z) of one terrace. Adjacent terraces are one pitch apart. */
export const TERRACE_WIDTH = 120;
export const TERRACE_DEPTH = 44;
/** Height of the first terrace top and the rise between terraces. */
export const TERRACE_BASE_TOP = 3;
export const TERRACE_RISE = 3.2;
/** Part of each terrace that is dead flat: the rest is the slope up to the next one. */
export const TERRACE_FLAT_WIDTH = 114;
export const TERRACE_FLAT_DEPTH = 38;

export interface Terrace {
  index: number;
  centerX: number;
  /** Centre of the terrace pitch. The flat part is `flatDepth` long and starts `RAMP` metres before the next terrace. */
  centerZ: number;
  /** Height of the flat top. */
  top: number;
  width: number;
  depth: number;
  flatWidth: number;
  flatDepth: number;
  /** Flat part: x in [minX, maxX], z in [minZ, maxZ], all at `top` within a few millimetres. */
  flat: Rect;
}

/** The flat part starts 19 m before the pitch centre and ends 19 m after it (terrace 0 starts at z = -19). */
const FLAT_START = -TERRACE_FLAT_DEPTH / 2;

export const terraces: readonly Terrace[] = Array.from({ length: TERRACE_COUNT }, (_, index): Terrace => {
  const centerZ = index * TERRACE_DEPTH;
  return {
    index,
    centerX: 0,
    centerZ,
    top: TERRACE_BASE_TOP + index * TERRACE_RISE,
    width: TERRACE_WIDTH,
    depth: TERRACE_DEPTH,
    flatWidth: TERRACE_FLAT_WIDTH,
    flatDepth: TERRACE_FLAT_DEPTH,
    flat: {
      minX: -TERRACE_FLAT_WIDTH / 2,
      maxX: TERRACE_FLAT_WIDTH / 2,
      minZ: centerZ - TERRACE_FLAT_DEPTH / 2,
      maxZ: centerZ + TERRACE_FLAT_DEPTH / 2,
    },
  };
});

/** First and last z of the terrace stack (flat parts). */
const STACK_START = FLAT_START;
const STACK_END = (TERRACE_COUNT - 1) * TERRACE_DEPTH + TERRACE_FLAT_DEPTH / 2;

/**
 * Path: a built stone stair from the south to the front of the first terrace, in seven straight flights
 * (25 steps of 0.40 m tread and 0.16 m riser each) joined by level landings. It runs straight along x = 0.
 */
export const PATH_END_Z = STACK_START;
export const PATH_START_Z = -262;
export const PATH_WIDTH = 5;
export const PATH_TREAD = 0.4;
export const PATH_RISER = 0.16;
export const PATH_FLIGHTS = 7;
const FLIGHT_STEPS = 25;
const FLIGHT_LENGTH = FLIGHT_STEPS * PATH_TREAD;
const FLIGHT_RISE = FLIGHT_STEPS * PATH_RISER;
const PATH_LENGTH = PATH_END_Z - PATH_START_Z;
/** Distance from one flight's top to the next flight's top. */
const FLIGHT_PERIOD = (PATH_LENGTH - FLIGHT_LENGTH) / (PATH_FLIGHTS - 1);

interface StairSample {
  /** Smooth surface: the flights as straight ramps. */
  ideal: number;
  /** Walkable surface: the actual treads and landings. */
  stepped: number;
}

/** The stair at `d` metres south of its top (the gate). Flat above the gate and below the last flight. */
function stairAt(d: number): StairSample {
  if (d <= 0) return { ideal: TERRACE_BASE_TOP, stepped: TERRACE_BASE_TOP };
  const j = Math.min(PATH_FLIGHTS - 1, Math.floor(d / FLIGHT_PERIOD));
  const u = d - j * FLIGHT_PERIOD;
  const top = TERRACE_BASE_TOP - j * FLIGHT_RISE;
  if (u < FLIGHT_LENGTH) {
    const k = Math.min(FLIGHT_STEPS - 1, Math.floor(u / PATH_TREAD));
    return { ideal: top - (FLIGHT_RISE * u) / FLIGHT_LENGTH, stepped: top - k * PATH_RISER };
  }
  const landing = top - FLIGHT_RISE;
  return { ideal: landing, stepped: landing };
}

export interface PathStep {
  kind: 'tread' | 'landing';
  /** Centre of the tread or landing. */
  x: number;
  z: number;
  /** Length along z. */
  depth: number;
  /** Height of the walkable surface. */
  top: number;
}

export interface ShaolinTerrain {
  readonly seed: number;
  /** Walkable ground height. Finite everywhere, deterministic, cheap. The steps of the path are in it. */
  heightAt(x: number, z: number): number;
  /** The same ground a little lower under the stair; the mesh is built from this and the treads are added on top. */
  meshHeightAt(x: number, z: number): number;
  /** x of the path centre line at `z`. The stair is straight, so this is always 0. */
  pathX(z: number): number;
  readonly pathSteps: readonly PathStep[];
  readonly terraces: readonly Terrace[];
}

/** Height of the spine (the axis the terraces sit on) at `z`. */
function spine(z: number): number {
  if (z < STACK_START) {
    // The spur carries the stair: its south face is the flights as ramps and the landings as shelves.
    const d = STACK_START - z;
    // It dives faster once past the stair's foot.
    const extra = Math.max(0, d - PATH_LENGTH + 17);
    return stairAt(d).ideal - 0.00075 * extra * extra;
  }
  if (z > STACK_END) {
    const q = z - STACK_END;
    return terraces[TERRACE_COUNT - 1]!.top + (0.46 * q * q) / (q + 30);
  }
  const p = z - STACK_START;
  const k = Math.min(TERRACE_COUNT - 1, Math.floor(p / TERRACE_DEPTH));
  const u = p - k * TERRACE_DEPTH;
  const base = TERRACE_BASE_TOP + k * TERRACE_RISE;
  if (k < TERRACE_COUNT - 1 && u > TERRACE_FLAT_DEPTH) {
    return base + smoothstep(TERRACE_FLAT_DEPTH, TERRACE_DEPTH, u) * TERRACE_RISE;
  }
  return base;
}

/** Half width of the spur's top: the terraces' own half width, narrowing towards the south. */
function spurHalfWidth(z: number): number {
  const half = TERRACE_WIDTH / 2;
  if (z < STACK_START) {
    const d = STACK_START - z;
    return half - 28 * smoothstep(0, 230, d) - 14 * smoothstep(230, 520, d);
  }
  if (z > STACK_END) return half + 70 * smoothstep(0, 320, z - STACK_END);
  return half;
}

const VALLEY_FLOOR = -140;

interface RidgeRing {
  radius: number;
  halfWidth: number;
  peak: number;
}

/** Concentric ranges around the temple valley, each taller and wider than the last, so they read as layers. */
const RIDGE_RINGS: readonly RidgeRing[] = [
  { radius: 400, halfWidth: 160, peak: 130 },
  { radius: 720, halfWidth: 200, peak: 230 },
  { radius: 1120, halfWidth: 250, peak: 320 },
  { radius: 1650, halfWidth: 330, peak: 420 },
  { radius: 2400, halfWidth: 460, peak: 540 },
  { radius: 3000, halfWidth: 560, peak: 640 },
];
const CENTER_Z = 140;

interface Spire {
  x: number;
  z: number;
  radius: number;
  top: number;
}

/** Free-standing rock towers rising out of the valleys, some above the temple, some just through the cloud. */
const SPIRES: readonly Spire[] = [
  { x: -150, z: 20, radius: 26, top: 78 },
  { x: -178, z: 52, radius: 14, top: 42 },
  { x: 150, z: 118, radius: 30, top: 112 },
  { x: 188, z: 96, radius: 15, top: 58 },
  { x: -215, z: 250, radius: 34, top: 138 },
  { x: -250, z: 224, radius: 16, top: 70 },
  { x: 195, z: 305, radius: 22, top: 66 },
  { x: -125, z: -150, radius: 20, top: 30 },
  { x: 178, z: -165, radius: 28, top: 58 },
  { x: -310, z: 110, radius: 40, top: 168 },
  { x: 335, z: 185, radius: 32, top: 118 },
  { x: -95, z: 430, radius: 24, top: 118 },
  { x: 90, z: -330, radius: 22, top: -4 },
  { x: 262, z: -62, radius: 17, top: 26 },
  { x: 120, z: 380, radius: 18, top: 70 },
  { x: -380, z: -40, radius: 24, top: 60 },
];

/** Soften a height into rock ledges about 11 m apart: steep faces step like layered stone. */
function ledges(h: number, amount: number, x: number, z: number): number {
  // The ledge height wanders with position so the rows are never level or locked to the mesh grid.
  const q = h / 11 + 1.7 * fbm(x / 83, z / 83, 4711, 2);
  const f = q - Math.floor(q);
  const stepped = (Math.floor(q) + smoothstep(0.3, 0.7, f)) * 11 - 1.7 * 11 * fbm(x / 83, z / 83, 4711, 2);
  return mix(h, stepped, amount);
}

export function createShaolinTerrain(seed: number): ShaolinTerrain {
  const s = seed | 0;
  const sValley = s + 11;
  const sPlateau = s + 23;
  const sEdge = s + 37;
  const sRingWarp = s + 41;
  const sRingDetail = s + 53;
  const sRingAmp = s + 67;
  const sBack = s + 79;
  const sSpire = s + 97;

  const pathCentre = (): number => 0;

  function natural(x: number, z: number): number {
    const ax = Math.abs(x);

    // Valley floor.
    let h = VALLEY_FLOOR + 40 * (fbm(x / 420, z / 420, sValley, 4) - 0.5);

    // The spur the temple sits on.
    {
      const hw = spurHalfWidth(z);
      const edge = Math.max(0, ax - hw);
      const warp = 1 + 0.7 * (fbm(x / 70, z / 70, sEdge, 3) - 0.5);
      const u = edge * warp;
      const drop = 165 * (1 - Math.exp(-u / 52));
      // Gentle lumps on the top, none on the terraces themselves.
      const lumpAmp = 3.2 * smoothstep(STACK_START, STACK_START - 60, z) + 5 * smoothstep(STACK_END, STACK_END + 50, z);
      const lumps = lumpAmp * (fbm(x / 38, z / 38, sPlateau, 3) - 0.5) * 2;
      const top = spine(z) + lumps * (1 - smoothstep(0, 30, edge) * 0.4);
      h = smax(h, top - drop, 30);
    }

    // Ridge rings.
    for (let k = 0; k < RIDGE_RINGS.length; k++) {
      const ring = RIDGE_RINGS[k]!;
      const r = Math.hypot(x, z - CENTER_Z);
      if (Math.abs(r - ring.radius) > ring.halfWidth * 2.2) continue;
      // Keep the south approach open: the inner ranges part where the path comes in.
      const gap = k <= 1 ? Math.exp(-((x / 300) ** 2)) * smoothstep(60, -80, z) : 0;
      const warp = (fbm(x / 520 + k * 3.1, z / 520 - k, sRingWarp, 3) - 0.5) * 2 * 0.5 * ring.halfWidth;
      const t = (r - ring.radius - warp) / ring.halfWidth;
      const bell = Math.max(0, 1 - t * t);
      const prof = bell * Math.sqrt(bell);
      if (prof <= 0) continue;
      const crest = 0.68 + 0.5 * ridged(x / (ring.halfWidth * 1.3) + k * 5, z / (ring.halfWidth * 1.3), sRingDetail + k, 3);
      const amp = 0.42 + 0.95 * smoothstep(0.28, 0.78, fbm(x / (ring.radius * 0.45) + k * 9, z / (ring.radius * 0.45), sRingAmp + k, 3));
      const ridge = VALLEY_FLOOR + (ring.peak - VALLEY_FLOOR) * prof * crest * amp * (1 - 0.92 * gap);
      h = smax(h, ridge > -60 ? ledges(ridge, 0.1, x, z) : ridge, 40);
    }

    // The mountain behind the temple.
    if (z > 200) {
      const rise = smoothstep(230, 760, z);
      const mass = 1 - smoothstep(700, 1700, ax);
      const detail = 0.55 + 0.7 * ridged(x / 240, z / 240, sBack, 5);
      const back = VALLEY_FLOOR + (360 - VALLEY_FLOOR) * rise * mass * detail * (0.72 + 0.4 * fbm(x / 700, z / 700, sBack + 5, 3));
      h = smax(h, back > -60 ? ledges(back, 0.1, x, z) : back, 50);
    }

    // Spires: tapering towers with ledges, a wide foot and an uneven crown.
    for (const sp of SPIRES) {
      const dx = x - sp.x;
      const dz = z - sp.z;
      const d2 = dx * dx + dz * dz;
      const reach = sp.radius * 3.6;
      if (d2 > reach * reach) continue;
      const angle = Math.atan2(dz, dx);
      const lobes =
        1 + 0.24 * Math.sin(angle * 3 + sp.x) + 0.14 * Math.sin(angle * 5 + sp.z * 0.3) + 0.09 * Math.sin(angle * 9 + sp.x * 0.7);
      const rr = sp.radius * lobes * (0.78 + 0.5 * fbm(x / 11, z / 11, sSpire, 3));
      const t = Math.sqrt(d2) / rr;
      const core = smoothstep(1.0, 0.3, t);
      const foot = 0.58 * Math.pow(1 - smoothstep(0.5, 3.0, t), 2);
      const profile = core + foot * (1 - core);
      const crown = 16 * (fbm(x / 14, z / 14, sSpire + 3, 3) - 0.5) + 0.1 * (dx / sp.radius) * sp.top * 0.3;
      const height = -200 + (sp.top + crown + 200) * profile;
      h = Math.max(h, height > -60 ? ledges(height, 0.3, x, z) : height);
    }

    // The world ends in low ground well inside the camera's far plane, so no wall of terrain is ever cut off.
    const far = smoothstep(3150, 3800, Math.hypot(x, z - CENTER_Z));
    return far > 0 ? mix(h, VALLEY_FLOOR - 20, far) : h;
  }

  function ground(x: number, z: number, treads: boolean): number {
    const nat = natural(x, z);
    if (z >= PATH_START_Z - 12 && z < PATH_END_Z && Math.abs(x) < 8) {
      const ax = Math.abs(x);
      const along = smoothstep(PATH_START_Z - 12, PATH_START_Z - 2, z);
      const w = (1 - smoothstep(PATH_WIDTH / 2 + 0.4, 7.5, ax)) * along;
      if (w > 0) {
        const st = stairAt(PATH_END_Z - z);
        const tread = 1 - smoothstep(PATH_WIDTH / 2, PATH_WIDTH / 2 + 0.2, ax);
        // The mesh sits under the treads so they stand proud of it; outside the stair both agree.
        const surface = treads ? mix(st.ideal, st.stepped, tread) : st.ideal - 0.2 * tread;
        return mix(nat, surface, w);
      }
    }
    return nat;
  }

  const pathSteps: PathStep[] = [];
  for (let j = 0; j < PATH_FLIGHTS; j++) {
    const d0 = j * FLIGHT_PERIOD;
    const top = TERRACE_BASE_TOP - j * FLIGHT_RISE;
    for (let k = 0; k < FLIGHT_STEPS; k++) {
      pathSteps.push({
        kind: 'tread',
        x: 0,
        z: PATH_END_Z - (d0 + (k + 0.5) * PATH_TREAD),
        depth: PATH_TREAD,
        top: top - k * PATH_RISER,
      });
    }
    if (j < PATH_FLIGHTS - 1) {
      const length = FLIGHT_PERIOD - FLIGHT_LENGTH;
      pathSteps.push({ kind: 'landing', x: 0, z: PATH_END_Z - (d0 + FLIGHT_LENGTH + length / 2), depth: length, top: top - FLIGHT_RISE });
    }
  }

  return {
    seed: s,
    heightAt: (x, z) => ground(x, z, true),
    meshHeightAt: (x, z) => ground(x, z, false),
    pathX: pathCentre,
    pathSteps,
    terraces,
  };
}

/** The rings of the terrain mesh, fine to coarse. Each ring's hole is the one before it. */
export const TERRAIN_RINGS: readonly RingSpec[] = (() => {
  const a: RingSpec = { minX: -102, maxX: 102, minZ: -270, maxZ: 342, cell: 1.5 };
  const b: RingSpec = { minX: -420, maxX: 420, minZ: -516, maxZ: 636, cell: 4, hole: a };
  const c: RingSpec = { minX: -1400, maxX: 1400, minZ: -1316, maxZ: 1708, cell: 14, hole: b };
  const d: RingSpec = { minX: -4060, maxX: 4060, minZ: -3900, maxZ: 4100, cell: 70, hole: c };
  return [a, b, c, d];
})();

export interface TerrainBuild {
  root: Group;
  triangles: number;
  dispose(): void;
}

/** Surface description per vertex for the material: built-up, forest, autumn, moss (each 0..1). */
function surfaceAttribute(terrain: ShaolinTerrain, seed: number): VertexAttribute {
  const s = seed | 0;
  return {
    name: 'aMat',
    size: 4,
    fill(x, z, _height, out) {
      const inStack = smoothstep(STACK_START - 3, STACK_START, z) * (1 - smoothstep(STACK_END, STACK_END + 3, z));
      const side = 1 - smoothstep(TERRACE_WIDTH / 2 - 3, TERRACE_WIDTH / 2 + 2, Math.abs(x));
      let built = inStack * side;
      if (z < STACK_START && z > PATH_START_Z - 10) {
        const d = Math.abs(x - terrain.pathX(z));
        built = Math.max(built, 1 - smoothstep(PATH_WIDTH / 2, PATH_WIDTH / 2 + 3, d));
      }
      const forest = smoothstep(0.3, 0.55, fbm(x / 110, z / 110, s + 201, 3));
      const autumn = smoothstep(0.56, 0.74, fbm(x / 70, z / 70, s + 203, 3));
      const moss = fbm(x / 24, z / 24, s + 207, 3);
      out.push(built, forest, autumn, moss);
    },
  };
}

/** Builds the terrain meshes and the path treads. */
export function buildShaolinTerrainMesh(terrain: ShaolinTerrain, seed: number): TerrainBuild {
  const root = new Group();
  root.name = 'shaolin-terrain';
  const attribute = surfaceAttribute(terrain, seed);
  const material = createTerrainMaterial();
  const geometries: { dispose(): void }[] = [];
  let triangles = 0;

  TERRAIN_RINGS.forEach((ring, i) => {
    const geometry = buildRingGeometry(ring, terrain.meshHeightAt, [attribute]);
    geometries.push(geometry);
    triangles += (geometry.getIndex()?.count ?? 0) / 3;
    const mesh = new Mesh(geometry, material);
    mesh.name = `terrain-ring-${i}`;
    // The sun's shadow map only covers the temple; the far rings need neither side of it.
    mesh.castShadow = i === 0;
    mesh.receiveShadow = i <= 1;
    mesh.frustumCulled = false;
    root.add(mesh);
  });

  // The stair: one instanced box per tread and landing, plus a kerb block either side of each. Every box
  // reaches a metre below its top, so risers are solid and nothing floats. Axis-aligned, so the tops are
  // exactly the heights `heightAt` returns.
  const blocks: { x: number; z: number; w: number; d: number; top: number; thick: number; shade: number }[] = [];
  const half = PATH_WIDTH / 2;
  terrain.pathSteps.forEach((step, n) => {
    const jitter = 0.94 + 0.12 * hash2(n, 7, 31);
    blocks.push({ x: step.x, z: step.z, w: PATH_WIDTH, d: step.depth + 0.01, top: step.top, thick: 1, shade: jitter });
    for (const side of [-1, 1]) {
      blocks.push({ x: step.x + side * (half + 0.2), z: step.z, w: 0.4, d: step.depth + 0.01, top: step.top + 0.3, thick: 1.3, shade: jitter * 0.9 });
    }
  });
  const treadGeometry = new BoxGeometry(1, 1, 1);
  // Same stone as the terrace paving in the terrain shader.
  const treadMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  const treads = new InstancedMesh(treadGeometry, treadMaterial, blocks.length);
  const m = new Matrix4();
  const tint = new Color();
  blocks.forEach((b, n) => {
    m.makeScale(b.w, b.thick, b.d);
    m.setPosition(b.x, b.top - b.thick / 2, b.z);
    treads.setMatrixAt(n, m);
    treads.setColorAt(n, tint.setRGB(0.6 * b.shade, 0.53 * b.shade, 0.43 * b.shade));
  });
  treads.instanceMatrix.needsUpdate = true;
  if (treads.instanceColor) treads.instanceColor.needsUpdate = true;
  treads.castShadow = true;
  treads.receiveShadow = true;
  treads.frustumCulled = false;
  treads.name = 'path-stair';
  triangles += blocks.length * 12;
  root.add(treads);

  return {
    root,
    triangles,
    dispose() {
      for (const g of geometries) g.dispose();
      treadGeometry.dispose();
      treadMaterial.dispose();
      material.dispose();
    },
  };
}
