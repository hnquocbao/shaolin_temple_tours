import type { GateParams, HallParams, PagodaParams } from '../../kit';
import type { PlaceName, Vec3 } from '../types';
import { TERRACE_COUNT, terraces } from './terrain';

/**
 * The layout of the Shaolin compound as data (ST3T-14).
 *
 * Orientation: +z is north (up the mountain, along the central axis). The scene follows the mood's sun
 * comment, which puts the west at -x, so EAST IS +x. The Bell Tower stands east (+x), the Drum Tower west (-x).
 * Every axis hall faces -z (south, towards the arrival stair). Side buildings turn a quarter to face the axis.
 *
 * Each building sits on a terrace's flat top: `offset` is [x, z] from the terrace centre (x = 0 is the axis,
 * z = 0 the middle of the 38 m deep flat part, so the flat part is z from -19 to +19).
 */

export type PaletteName = 'vermilion' | 'slate' | 'jade' | 'gold';

export type BuildingKind = 'gate' | 'hall' | 'tower' | 'pagoda' | 'pavilion';

/** Quarter turns about the vertical axis (three.js `rotation.y`, multiples of PI/2). 1 faces the front to -x, 3 to +x. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export type BuildingRole = 'axis' | 'tower' | 'side' | 'landmark';

export type KitParams<T> = Omit<T, 'rng' | 'palette'>;

interface BuildingBase {
  id: string;
  name: PlaceName;
  role: BuildingRole;
  /** Index into `terraces`. */
  terrace: number;
  /** [x, z] from the terrace centre. */
  offset: readonly [number, number];
  turns: QuarterTurns;
  palette: PaletteName;
}

export type LayoutBuilding = BuildingBase &
  (
    | { kind: 'gate'; params: KitParams<GateParams> }
    | { kind: 'hall' | 'pavilion'; params: KitParams<HallParams> }
    | { kind: 'tower' | 'pagoda'; params: KitParams<PagodaParams> }
  );

/** x of the side buildings' centres and of the perimeter wall, either side of the axis. */
export const SIDE_X = 44;
export const WALL_X = 56;

/** Axis hall on terrace `i`: its back sits 3 m inside the flat part's far end. */
const AXIS_BACK = 16;
/** Where the gate stands on terrace 0, so its front steps end at the first flat tread. */
export const GATE_Z = -11;
/** The gate's wing walls are this long beyond its platform; the perimeter wall continues from there. */
const GATE_WING = 6;
/** Half the width of the gate's platform: three bays of 5.2 m plus the 1.7 m margin either side. */
export const GATE_HALF = (3 * 5.2 + 2 * 1.7) / 2;

const sideHall = { widthBays: 3, depthBays: 2, bayWidth: 5.8, bayDepth: 3.4, eaves: 1, columnHeight: 4.2, platformHeight: 0.9, overhang: 2.2 } as const;

export const layout: readonly LayoutBuilding[] = [
  // The seven halls of the central axis, south to north.
  {
    id: 'mountain-gate',
    name: { zh: '山门', vi: 'Sơn Môn', en: 'Mountain Gate' },
    role: 'axis',
    kind: 'gate',
    terrace: 0,
    offset: [0, GATE_Z],
    turns: 0,
    palette: 'slate',
    params: { widthBays: 3, depthBays: 2, bayWidth: 5.2, bayDepth: 3.6, doorWidth: 3.6, wing: GATE_WING, wallHeight: 3.4 },
  },
  {
    id: 'heavenly-kings-hall',
    name: { zh: '天王殿', vi: 'Thiên Vương Điện', en: 'Hall of Heavenly Kings' },
    role: 'axis',
    kind: 'hall',
    terrace: 1,
    offset: [0, AXIS_BACK - 7.7],
    turns: 0,
    palette: 'jade',
    params: { widthBays: 5, depthBays: 3, bayWidth: 5.6, bayDepth: 4, eaves: 2, columnHeight: 5.8, platformHeight: 1.2 },
  },
  {
    id: 'mahavira-hall',
    name: { zh: '大雄宝殿', vi: 'Đại Hùng Bảo Điện', en: 'Mahavira Hall' },
    role: 'axis',
    kind: 'hall',
    terrace: 2,
    offset: [0, AXIS_BACK - 10.1],
    turns: 0,
    palette: 'vermilion',
    params: { widthBays: 5, depthBays: 4, bayWidth: 6.4, bayDepth: 4.2, eaves: 2, columnHeight: 7.4, platformHeight: 1.6, overhang: 3 },
  },
  {
    id: 'sutra-library',
    name: { zh: '藏经阁', vi: 'Tàng Kinh Các', en: 'Sutra Library' },
    role: 'axis',
    kind: 'hall',
    terrace: 3,
    offset: [0, AXIS_BACK - 7.7],
    turns: 0,
    palette: 'gold',
    params: { widthBays: 5, depthBays: 3, bayWidth: 5.4, bayDepth: 4, eaves: 2, columnHeight: 6.6, platformHeight: 1.9 },
  },
  {
    id: 'abbot-room',
    name: { zh: '方丈室', vi: 'Phương Trượng Thất', en: "Abbot's Room" },
    role: 'axis',
    kind: 'hall',
    terrace: 4,
    offset: [0, AXIS_BACK - 7.1],
    turns: 0,
    palette: 'slate',
    params: { widthBays: 5, depthBays: 3, bayWidth: 5, bayDepth: 3.6, eaves: 1, columnHeight: 4.4, platformHeight: 0.9 },
  },
  {
    id: 'lixue-pavilion',
    name: { zh: '立雪亭', vi: 'Lập Tuyết Đình', en: 'Lixue Pavilion' },
    role: 'axis',
    kind: 'hall',
    terrace: 5,
    offset: [0, AXIS_BACK - 8.3],
    turns: 0,
    palette: 'vermilion',
    params: { widthBays: 3, depthBays: 3, bayWidth: 5, bayDepth: 4.4, roof: 'hip', eaves: 1, columnHeight: 4.6, platformHeight: 1.1, overhang: 2.2 },
  },
  {
    id: 'thousand-buddha-hall',
    name: { zh: '千佛殿', vi: 'Thiên Phật Điện', en: 'Thousand Buddha Hall' },
    role: 'axis',
    kind: 'hall',
    terrace: 6,
    offset: [0, AXIS_BACK - 8],
    turns: 0,
    palette: 'gold',
    params: { widthBays: 7, depthBays: 3, bayWidth: 5.7, bayDepth: 4.2, eaves: 1, columnHeight: 7.2, platformHeight: 2, overhang: 3 },
  },

  // Bell Tower (east, +x) and Drum Tower (west, -x) flank the Mahavira court and face it.
  {
    id: 'bell-tower',
    name: { zh: '钟楼', vi: 'Chung Lâu', en: 'Bell Tower' },
    role: 'tower',
    kind: 'tower',
    terrace: 2,
    offset: [SIDE_X - 8, -9],
    turns: 1,
    palette: 'vermilion',
    params: { tiers: 3, baseWidth: 7, taper: 0.88, tierHeight: 4.6, platformHeight: 1.4 },
  },
  {
    id: 'drum-tower',
    name: { zh: '鼓楼', vi: 'Cổ Lâu', en: 'Drum Tower' },
    role: 'tower',
    kind: 'tower',
    terrace: 2,
    offset: [-(SIDE_X - 8), -9],
    turns: 3,
    palette: 'vermilion',
    params: { tiers: 3, baseWidth: 7, taper: 0.88, tierHeight: 4.6, platformHeight: 1.4 },
  },

  // Side halls and galleries, east (+x, turned to face -x) and west (-x, turned to face +x).
  {
    id: 'stele-gallery',
    name: { zh: '碑廊', vi: 'Hành lang bia', en: 'Stele Gallery' },
    role: 'side',
    kind: 'hall',
    terrace: 1,
    offset: [SIDE_X, -2],
    turns: 1,
    palette: 'slate',
    params: sideHall,
  },
  {
    id: 'fist-manual-hall',
    name: { zh: '锤谱堂', vi: 'Chùy Phổ Đường', en: 'Fist Manual Hall' },
    role: 'side',
    kind: 'hall',
    terrace: 1,
    offset: [-SIDE_X, -2],
    turns: 3,
    palette: 'slate',
    params: sideHall,
  },
  {
    id: 'east-library-wing',
    name: { zh: '东配殿', vi: 'Đông Phối Điện', en: 'East Side Hall' },
    role: 'side',
    kind: 'hall',
    terrace: 3,
    offset: [SIDE_X, 0],
    turns: 1,
    palette: 'jade',
    params: sideHall,
  },
  {
    id: 'west-library-wing',
    name: { zh: '西配殿', vi: 'Tây Phối Điện', en: 'West Side Hall' },
    role: 'side',
    kind: 'hall',
    terrace: 3,
    offset: [-SIDE_X, 0],
    turns: 3,
    palette: 'jade',
    params: sideHall,
  },
  {
    id: 'baiyi-hall',
    name: { zh: '白衣殿', vi: 'Bạch Y Điện', en: 'Baiyi Hall' },
    role: 'side',
    kind: 'hall',
    terrace: 5,
    offset: [SIDE_X, -2],
    turns: 1,
    palette: 'vermilion',
    params: sideHall,
  },
  {
    id: 'dizang-hall',
    name: { zh: '地藏殿', vi: 'Địa Tạng Điện', en: 'Dizang Hall' },
    role: 'side',
    kind: 'hall',
    terrace: 5,
    offset: [-SIDE_X, -2],
    turns: 3,
    palette: 'vermilion',
    params: sideHall,
  },

  // Landmarks on terrace corners: a seven-tier pagoda in the west, two smaller pagodas and a pavilion.
  {
    id: 'seven-tier-pagoda',
    name: { zh: '七级浮屠', vi: 'Tháp bảy tầng', en: 'Seven-tier Pagoda' },
    role: 'landmark',
    kind: 'pagoda',
    terrace: 4,
    offset: [-36, 0],
    turns: 3,
    palette: 'vermilion',
    params: { tiers: 7, baseWidth: 9, taper: 0.9, tierHeight: 2.8, platformHeight: 1.3 },
  },
  {
    id: 'three-tier-pagoda',
    name: { zh: '三层塔', vi: 'Tháp ba tầng', en: 'Three-tier Pagoda' },
    role: 'landmark',
    kind: 'pagoda',
    terrace: 0,
    offset: [-30, 6],
    turns: 3,
    palette: 'slate',
    params: { tiers: 3, baseWidth: 5.5, taper: 0.88, tierHeight: 3, platformHeight: 1.2 },
  },
  {
    id: 'five-tier-pagoda',
    name: { zh: '五层塔', vi: 'Tháp năm tầng', en: 'Five-tier Pagoda' },
    role: 'landmark',
    kind: 'pagoda',
    terrace: 4,
    offset: [36, -2],
    turns: 1,
    palette: 'jade',
    params: { tiers: 5, baseWidth: 7, taper: 0.9, tierHeight: 2.8, platformHeight: 1.3 },
  },
  {
    id: 'pine-pavilion',
    name: { zh: '听松亭', vi: 'Thính Tùng Đình', en: 'Pine-listening Pavilion' },
    role: 'landmark',
    kind: 'pavilion',
    terrace: 0,
    offset: [30, 6],
    turns: 1,
    palette: 'vermilion',
    params: { widthBays: 3, depthBays: 3, bayWidth: 3.4, bayDepth: 3.4, roof: 'hip', columnHeight: 4, platformHeight: 0.8, overhang: 2, windows: true },
  },
];

/** World position (feet at the terrace top) of a building. */
export function positionOf(b: LayoutBuilding): Vec3 {
  const t = terraces[b.terrace];
  if (!t) throw new Error(`building ${b.id}: no terrace ${b.terrace}`);
  return [t.centerX + b.offset[0], t.top, t.centerZ + b.offset[1]];
}

export function yawOf(b: LayoutBuilding): number {
  return (b.turns * Math.PI) / 2;
}

/** One straight run of perimeter wall at one height: points are world x and z, `base` the ground height at its foot. */
export interface WallRun {
  id: string;
  base: number;
  /** Height of the plastered wall below the coping, metres. */
  height: number;
  points: readonly (readonly [number, number])[];
}

/** Plain wall height, and how many terraces one side-wall run climbs. */
export const WALL_HEIGHT = 3.2;
const TERRACES_PER_RUN = 2;

/**
 * The perimeter wall. Each side wall stands on the lowest terrace of its run and is as tall as the run's rise plus a
 * plain wall, so on its top terrace it is a plain wall and on the one below it is a rampart; the next run starts on the
 * following terrace's floor. This keeps the draw calls down (every wall run costs six). The south wall and the
 * gate's wings share one line; the gap between the wings is the gate passage. Nothing crosses the stair (x = 0, z < -19).
 */
export function wallRuns(): WallRun[] {
  const runs: WallRun[] = [];
  const t0 = terraces[0];
  const tLast = terraces[TERRACE_COUNT - 1];
  if (!t0 || !tLast) return runs;
  // Half the gate's platform plus the wing: where the gate's own wall stops.
  const gateReach = GATE_HALF + GATE_WING;
  const southZ = t0.centerZ + GATE_Z;
  runs.push({ id: 'wall-south-west', base: t0.top, height: WALL_HEIGHT, points: [[-WALL_X, southZ], [-gateReach, southZ]] });
  runs.push({ id: 'wall-south-east', base: t0.top, height: WALL_HEIGHT, points: [[gateReach, southZ], [WALL_X, southZ]] });
  const northZ = tLast.flat.maxZ - 0.5;
  for (let first = 0; first < TERRACE_COUNT; first += TERRACES_PER_RUN) {
    const lowest = terraces[first];
    const last = Math.min(TERRACE_COUNT - 1, first + TERRACES_PER_RUN - 1);
    const highest = terraces[last];
    if (!lowest || !highest) continue;
    const z0 = first === 0 ? southZ : lowest.flat.minZ;
    const z1 = last === TERRACE_COUNT - 1 ? northZ : highest.centerZ + highest.depth / 2 + 3;
    const height = WALL_HEIGHT + (highest.top - lowest.top);
    for (const side of [-1, 1]) {
      runs.push({ id: `wall-${side < 0 ? 'west' : 'east'}-${first}`, base: lowest.top, height, points: [[side * WALL_X, z0], [side * WALL_X, z1]] });
    }
  }
  runs.push({ id: 'wall-north', base: tLast.top, height: WALL_HEIGHT, points: [[-WALL_X, northZ], [WALL_X, northZ]] });
  return runs;
}
