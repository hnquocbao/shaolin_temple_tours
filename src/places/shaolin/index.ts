import { Group } from 'three';
import type { Mood } from '../../engine/mood';
import { createRng, seedFrom } from '../../engine/rng';
import {
  createGate,
  createHall,
  createPagoda,
  createWall,
  darkTilePalette,
  placeSolids,
  templePalette,
  toLocal,
  type Building,
  type Palette,
} from '../../kit';
import type { CameraStop, PlaceDef, PlaceInstance, Solid } from '../types';
import { layout, positionOf, wallRuns, yawOf, type LayoutBuilding, type PaletteName } from './layout';
import { buildShaolinTerrainMesh, createShaolinTerrain } from './terrain';

const palettes: Record<PaletteName, Palette> = {
  vermilion: templePalette,
  slate: darkTilePalette,
  // Green glazed tiles for the Hall of Heavenly Kings and its neighbours.
  jade: { ...templePalette, tile: 0x4f7f68, ridge: 0x365a49, trim: 0x2f6f78, tileVariation: 0.16 },
  // Golden-orange tiles for the great halls at the back.
  gold: { ...templePalette, tile: 0xc4893c, ridge: 0xa9742f, wall: 0xb8432a, tileVariation: 0.16 },
};

/** Build one layout entry with its own seeded random source. */
export function buildLayoutBuilding(b: LayoutBuilding): Building {
  const rng = createRng(seedFrom(`shaolin-${b.id}`));
  const palette = palettes[b.palette];
  switch (b.kind) {
    case 'gate':
      return createGate({ ...b.params, palette, rng });
    case 'hall':
    case 'pavilion':
      return createHall({ ...b.params, palette, rng });
    case 'tower':
    case 'pagoda':
      return createPagoda({ ...b.params, palette, rng });
  }
}

/**
 * Golden hour: a low warm sun from the west-south-west (it rakes across the south-facing fronts and casts long shadows
 * towards the east-north-east), a strong cool sky fill in shade with a warm bounce from the lit ground, warm haze, and a sea of cloud
 * filling the valleys about 80 m below the first terrace. Everything else is in the air, not in the geometry.
 */
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
    topY: -38,
    topVariation: 14,
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
  shadow: { min: [-75, -35, -35], max: [75, 70, 300], mapSize: 4096 },
};

/** A placed building with its world transform and a cheap bounding box for height queries. */
interface Placed {
  building: Building;
  base: number;
  x: number;
  z: number;
  yaw: number;
  /** Local half extents to test: the platform plus its steps, which reach 3 m past the front and back. */
  reachX: number;
  reachZ: number;
  /** World bounding radius squared check: centre and radius. */
  radius: number;
}

/**
 * Shaolin Temple on Mount Shaoshi.
 *
 * ST3T-11 gave it its ground (`terrain.ts`), ST3T-12 its atmosphere and ST3T-13 the building kit.
 * ST3T-14 fills the terraces from the kit: the layout is data in `layout.ts`.
 */
export const shaolin: PlaceDef = {
  id: 'shaolin',
  name: { zh: '少室山少林寺', vi: 'Thiếu Lâm Tự, núi Thiếu Thất', en: 'Shaolin Temple, Mount Shaoshi' },
  mood: goldenHour,
  stops: shaolinStops(),
  build({ scene, rng }): PlaceInstance {
    const root = new Group();
    root.name = 'shaolin';

    const terrain = createShaolinTerrain(Math.floor(rng() * 4294967296));
    const land = buildShaolinTerrainMesh(terrain, terrain.seed);
    root.add(land.root);

    const buildings: Building[] = [];
    const placed: Placed[] = [];
    const solids: Solid[] = [];

    for (const entry of layout) {
      const building = buildLayoutBuilding(entry);
      const [x, y, z] = positionOf(entry);
      const yaw = yawOf(entry);
      building.object.position.set(x, y, z);
      building.object.rotation.y = yaw;
      root.add(building.object);
      buildings.push(building);
      solids.push(...placeSolids(building.solids, [x, y, z], yaw));
      const reachX = building.footprint.width / 2 + 0.5;
      const reachZ = building.footprint.depth / 2 + 3.2;
      placed.push({ building, base: y, x, z, yaw, reachX, reachZ, radius: Math.hypot(reachX, reachZ) });
    }

    const wallRng = createRng(seedFrom('shaolin-walls'));
    for (const run of wallRuns()) {
      const wall = createWall({ points: run.points, height: run.height, thickness: 0.9, rng: wallRng });
      wall.object.position.set(0, run.base, 0);
      root.add(wall.object);
      buildings.push(wall);
      solids.push(...placeSolids(wall.solids, [0, run.base, 0], 0));
    }

    scene.add(root);

    const heightAt = (x: number, z: number): number => {
      let h = terrain.heightAt(x, z);
      for (const p of placed) {
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz > p.radius * p.radius) continue;
        const [lx, lz] = toLocal(x, z, [p.x, p.base, p.z], p.yaw);
        if (Math.abs(lx) > p.reachX || Math.abs(lz) > p.reachZ) continue;
        const top = p.building.heightAt(lx, lz);
        if (top > 0) h = Math.max(h, p.base + top);
      }
      return h;
    };

    return {
      root,
      ground: { heightAt },
      solids,
      spawn: { position: [0, terrain.heightAt(0, -40), -40], facing: 0 },
      dispose() {
        scene.remove(root);
        land.dispose();
        for (const b of buildings) b.dispose();
      },
    };
  },
};

/** A view of one axis hall's front from the previous terrace, off the axis so the previous hall is not in the way. */
function hallFront(id: string, x: number, back: number, up: number, ahead: number, lookY: number, fov: number): CameraStop {
  const entry = layout.find((b) => b.id === id);
  if (!entry) throw new Error(`no building ${id}`);
  const [, top, z] = positionOf(entry);
  const depth = 'depthBays' in entry.params && typeof entry.params.bayDepth === 'number' ? (entry.params.depthBays ?? 3) * entry.params.bayDepth + 3.4 : 15;
  const front = z - depth / 2;
  return { id: `${id.split('-')[0]}-front`, position: [x, top + up, front - back], target: [0, top + lookY, front + ahead], fov };
}

function shaolinStops(): readonly CameraStop[] {
  const named = (stop: CameraStop, id: string): CameraStop => ({ ...stop, id });
  return [
    { id: 'arrival-1', position: [-104, 68, -108], target: [8, 28, 112], fov: 45 },
    { id: 'arrival-2', position: [235, 75, 240], target: [0, 45, 60], fov: 45 },
    { id: 'arrival-3', position: [0, 24, -78], target: [0, 24, 110], fov: 48 },
    { id: 'gate-front', position: [0, 3, -42], target: [0, 6, 0], fov: 55 },
    named(hallFront('heavenly-kings-hall', 18, 24, 6, 8, 9, 55), 'heavenly-kings-front'),
    named(hallFront('mahavira-hall', -27, 19.3, 5, 10, 12, 68), 'mahavira-front'),
    named(hallFront('sutra-library', 26, 24, 7, 8, 11, 58), 'sutra-library-front'),
    named(hallFront('abbot-room', -24, 25, 6, 8, 6, 58), 'abbot-front'),
    named(hallFront('lixue-pavilion', 22, 23, 6, 6, 6, 58), 'lixue-front'),
    named(hallFront('thousand-buddha-hall', -28, 23.5, 7, 8, 10, 66), 'thousand-buddha-front'),
    { id: 'mahavira-court', position: [0, 38, 44], target: [0, 14, 92], fov: 68 },
    { id: 'rooftops', position: [-52, 46, 74], target: [6, 40, 250], fov: 55 },
  ];
}
