import { Group, Mesh, type BufferGeometry } from 'three';
import type { Mood } from '../../engine/mood';
import { createRng, seedFrom } from '../../engine/rng';
import { buildRingGeometry, type RingSpec, type VertexAttribute } from '../../engine/terrain/heightfield';
import { createTerrainMaterial } from '../../engine/terrain/material';
import { fbm, smoothstep } from '../../engine/terrain/noise';
import {
  AUTUMN_PALETTE,
  buildVegetation,
  scatterMountainForest,
  scatterTrees,
  trunkSolids,
  type Placement,
  type TreeInstance,
  type Zone,
} from '../../engine/vegetation';
import type { CameraStop, PlaceDef, PlaceInstance, Vec3 } from '../types';
import { COURTYARD, COURTYARD_Y, groveHeight } from './ground';

/** Golden hour, copied from Shaolin: low warm sun from the west-south-west, cool shade, warm haze. */
const goldenHour: Mood = {
  sunPosition: [-906, 156, -423],
  sunColor: 0xffbf80,
  sunIntensity: 5.2,
  skyLight: 0x93a8d0,
  groundLight: 0xb08868,
  ambientIntensity: 3.0,
  horizonColor: 0xf2c394,
  fogNear: 180,
  fogFar: 900,
  exposure: 1,
  sky: {
    zenith: 0x4f77b3,
    mid: 0xa7b7d6,
    horizonWarm: 0xffc58a,
    horizonCool: 0xcdb4c6,
    glow: 0xffae62,
    sunDisc: 28,
    sunRadius: 1.4,
    cloudiness: 0.55,
  },
  haze: {
    shade: 0x7b8fbe,
    density: 0.0009,
    heightScale: 300,
    baseY: 0,
    lowDensity: 0.0005,
    lowHeightScale: 55,
    lowBaseY: 0,
    floorY: -60,
  },
  cloudSea: {
    topY: -6,
    topVariation: 10,
    bottomY: -150,
    density: 0.05,
    scale: 1500,
    drift: [1.8, 0.7],
    litColor: 0xfff0dc,
    shadeColor: 0x7d92c6,
  },
  shafts: { strength: 0.3, decay: 0.945, color: 0xffc27f },
  bloom: { strength: 0.28, threshold: 1.15 },
  grade: { shadowTint: 0xdbe5ff, highlightTint: 0xfff1da, saturation: 1.2, contrast: 1.07, vignette: 0.28 },
  shadow: { min: [-230, -40, -230], max: [230, 130, 230], mapSize: 4096 },
};

const eye = (x: number, z: number, above = 1.7): Vec3 => [x, groveHeight(x, z) + above, z];
const ground = (x: number, z: number, above = 0): Vec3 => [x, groveHeight(x, z) + above, z];

/** The showcase pine for the `pine-close` stop, and the patch of autumn trees for the `autumn` stop. */
const PINE_AT = { x: -52, z: -78 };
const AUTUMN_PATCH = { x: -118, z: 36, radius: 34 };

const STOPS: readonly CameraStop[] = [
  { id: 'overview', position: [-225, 120, -265], target: [20, 34, 10], fov: 50 },
  { id: 'forest-edge', position: eye(0, -34), target: ground(-14, -130, 7), fov: 55 },
  { id: 'pine-close', position: [PINE_AT.x - 11, groveHeight(PINE_AT.x, PINE_AT.z) + 5, PINE_AT.z - 9], target: ground(PINE_AT.x, PINE_AT.z, 6.5), fov: 55 },
  { id: 'autumn', position: eye(-170, 4, 8), target: ground(AUTUMN_PATCH.x, AUTUMN_PATCH.z, 6), fov: 50 },
  { id: 'cliff', position: eye(12, -62, 16), target: [104, groveHeight(104, -12) - 18, -12], fov: 52 },
];

/** Hand-placed trees: cypresses around the courtyard, one large ginkgo, and the showcase pine. */
const COURTYARD_TREES: readonly Placement[] = [
  ...[-18, -9, 9, 18].flatMap((x) => [
    { species: 'cypress', x, z: 19.5, variant: x < 0 ? 0 : 1, scale: 1.05 } as const,
    { species: 'cypress', x, z: -19.5, variant: x < 0 ? 1 : 0, scale: 0.95 } as const,
  ]),
  { species: 'cypress', x: -19.5, z: 0, variant: 0, scale: 1.2 },
  { species: 'cypress', x: 19.5, z: 0, variant: 1, scale: 1.1 },
  { species: 'broadleaf', x: -9, z: 6, variant: 1, scale: 2.3, stretch: 1, rotation: 0.6, color: 0xf0b92a },
];
const HERO_PINE: Placement = { species: 'pine', x: PINE_AT.x, z: PINE_AT.z, variant: 0, scale: 1.35, rotation: 2.2 };

/** Keep the forest off the courtyard and a stone path going south from it. */
const EXCLUSIONS: readonly Zone[] = [
  { kind: 'box', minX: COURTYARD.minX - 3, maxX: COURTYARD.maxX + 3, minZ: COURTYARD.minZ - 3, maxZ: COURTYARD.maxZ + 3 },
  { kind: 'corridor', points: [[0, -24], [0, -90], [-18, -150]], halfWidth: 3 },
  { kind: 'circle', x: PINE_AT.x, z: PINE_AT.z, radius: 13 },
  // The camera stops stand in clearings, so no trunk or crown ever fills the lens.
  ...STOPS.map((s): Zone => ({ kind: 'circle', x: s.position[0], z: s.position[2], radius: 10 })),
];

const toPlacement = (t: TreeInstance): Placement => ({
  species: t.species,
  x: t.x,
  z: t.z,
  variant: t.variant,
  rotation: t.rotation,
  scale: t.scale,
  stretch: t.stretch,
  color: t.color,
});

/** Rings of the ground mesh, fine to coarse; each ring's hole is the one before it. */
const RINGS: readonly RingSpec[] = (() => {
  const a: RingSpec = { minX: -150, maxX: 150, minZ: -300, maxZ: 150, cell: 1.5 };
  const b: RingSpec = { minX: -546, maxX: 546, minZ: -546, maxZ: 546, cell: 6, hole: a };
  const c: RingSpec = { minX: -2058, maxX: 2058, minZ: -2058, maxZ: 2058, cell: 42, hole: b };
  return [a, b, c];
})();

/** Surface per vertex for the terrain material: built-up, forest, autumn, moss. */
const surface: VertexAttribute = {
  name: 'aMat',
  size: 4,
  fill(x, z, _y, out) {
    const ex = Math.max(COURTYARD.minX - x, 0, x - COURTYARD.maxX);
    const ez = Math.max(COURTYARD.minZ - z, 0, z - COURTYARD.maxZ);
    const built = 1 - smoothstep(0, 2.5, Math.hypot(ex, ez));
    const forest = smoothstep(0.3, 0.55, fbm(x / 110, z / 110, 4301, 3));
    const autumn = smoothstep(0.58, 0.8, fbm(x / 70, z / 70, 4303, 3));
    out.push(built, forest, autumn, fbm(x / 24, z / 24, 4307, 3));
  },
};

/**
 * Dev place for the vegetation kit (ST3T-20): a small hilly ground with a cliff and a flat courtyard, a forest from
 * `scatterMountainForest`, hand-placed courtyard cypresses and a large ginkgo. Never shown to players.
 */
export const grove: PlaceDef = {
  id: 'grove',
  name: { zh: '林木试验场', vi: 'Sân thử cây cối', en: 'Grove test yard' },
  dev: true,
  mood: goldenHour,
  stops: STOPS,
  build({ scene, rng }): PlaceInstance {
    const root = new Group();
    root.name = 'grove';

    const material = createTerrainMaterial();
    const geometries: BufferGeometry[] = [];
    RINGS.forEach((ring, i) => {
      const geometry = buildRingGeometry(ring, groveHeight, [surface]);
      geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.name = `grove-ground-${i}`;
      mesh.castShadow = i === 0;
      mesh.receiveShadow = i <= 1;
      mesh.frustumCulled = false;
      root.add(mesh);
    });

    // An autumn patch in the western valley, planted first so the forest keeps clear of it.
    const patchRng = createRng(Math.floor(rng() * 4294967296) ^ seedFrom('grove-autumn'));
    const patch = scatterTrees({
      heightAt: groveHeight,
      region: { minX: AUTUMN_PATCH.x - AUTUMN_PATCH.radius, maxX: AUTUMN_PATCH.x + AUTUMN_PATCH.radius, minZ: AUTUMN_PATCH.z - AUTUMN_PATCH.radius, maxZ: AUTUMN_PATCH.z + AUTUMN_PATCH.radius },
      rng: patchRng,
      density: 0.016,
      rules: [{ species: 'broadleaf', share: 1, palette: AUTUMN_PALETTE, maxSlope: 40, scale: [1.0, 1.7] }],
    }).filter((t) => Math.hypot(t.x - AUTUMN_PATCH.x, t.z - AUTUMN_PATCH.z) <= AUTUMN_PATCH.radius);

    const explicit: Placement[] = [...COURTYARD_TREES, HERO_PINE, ...patch.map(toPlacement)];
    const forest = scatterMountainForest({
      heightAt: groveHeight,
      bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
      rng,
      exclusions: EXCLUSIONS,
      explicit,
      minY: -14,
    });

    const veg = buildVegetation(forest, { lod: { focus: STOPS.map((s) => s.position), near: 75 } });
    root.add(veg.root);
    scene.add(root);

    const courtyardTrees = forest.filter((t) => t.explicit && t.x >= COURTYARD.minX && t.x <= COURTYARD.maxX && t.z >= COURTYARD.minZ && t.z <= COURTYARD.maxZ);
    return {
      root,
      ground: { heightAt: groveHeight },
      solids: trunkSolids(courtyardTrees),
      spawn: { position: [0, COURTYARD_Y, -14], facing: 0 },
      update(elapsed) {
        veg.update(elapsed);
      },
      dispose() {
        scene.remove(root);
        veg.dispose();
        for (const g of geometries) g.dispose();
        material.dispose();
      },
    };
  },
};
