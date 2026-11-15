import { createRng, seedFrom, type Rng } from '../engine/rng';
import type { Solid } from '../places/types';
import { rgb, shade } from './geom';
import { templePalette, type Palette } from './palette';
import { KitParts } from './parts';
import { buildRoof } from './roof-mesh';
import { createRoofShape } from './roof-shape';
import {
  addBalustrade,
  addColumnRing,
  addFrieze,
  addPlatform,
  addWallSide,
  bayStops,
  expandBays,
  platformHeightAt,
  type DoorSpec,
  type PlatformSpec,
  type Side,
} from './structure';
import type { Building } from './types';

export interface HallParams {
  /** Bays across the front (x). 1 to 11. Default 5. */
  widthBays?: number;
  /** Bays front to back (z). 1 to 9. Default 3. */
  depthBays?: number;
  /** Bay width in metres: one size for all, or one per bay. Default 4.4. */
  bayWidth?: number | readonly number[];
  /** Bay depth in metres, same forms. Default 4.0. */
  bayDepth?: number | readonly number[];
  /** One roof, or a skirt roof under a second, smaller one. Default 1. */
  eaves?: 1 | 2;
  /** hip-and-gable (歇山, default) or hip (庑殿). */
  roof?: 'hip-gable' | 'hip';
  /** Column height of the lower storey, metres. Default 5. */
  columnHeight?: number;
  /** Platform height, metres. Default 1.1. */
  platformHeight?: number;
  /** Platform margin beyond the column lines, metres. Default 1.7. */
  platformMargin?: number;
  /** Eave overhang beyond the column line, metres. Default 2.4. */
  overhang?: number;
  /** Door opening width. Default 60% of its bay, at most 3.4. */
  doorWidth?: number;
  /** Door in the back wall too, and steps on both sides: a gate passage. Default false. */
  through?: boolean;
  /** Lattice windows in the front and side walls. Default true. */
  windows?: boolean;
  palette?: Palette;
  /** Seeded random source for tile variation. Default is a fixed seed. */
  rng?: Rng;
}

/** Ridge ornaments grow gently with the roof. */
function ornamentFor(halfDepth: number): number {
  return Math.min(1.15, Math.max(0.75, 0.45 + halfDepth * 0.08));
}

/**
 * Hall factory: a timber-frame hall on a stone platform with a curved, tiled roof.
 *
 * Contract (shared by every kit factory):
 * - Frame: origin at the centre of the platform footprint at ground level; the front (door side) faces
 *   -z; +y is up; metres.
 * - `footprint` is the platform: (sum of bay widths + 2 * margin) by (sum of bay depths + 2 * margin).
 *   Roof eaves overhang it by about `overhang - margin`.
 * - Column grid: `widthBays + 1` by `depthBays + 1` grid lines from the bay sizes; the outer ring
 *   carries columns, brackets and the eave. The door is in the middle bay of the front wall
 *   (the bay right of centre when the count is even).
 * - `height` includes the ridge ornaments. `solids` are walls and columns from the platform top up
 *   to the eave, with the door gap left open; the platform and steps are walkable through `heightAt`.
 * - Triangles: about 40k to 70k for a 5x3 double-eave hall, with about 8 meshes.
 */
export function createHall(params: HallParams = {}): Building {
  const widthBays = params.widthBays ?? 5;
  const depthBays = params.depthBays ?? 3;
  if (widthBays > 11 || depthBays > 9) throw new Error('hall supports up to 11 x 9 bays');
  const bx = expandBays(widthBays, params.bayWidth ?? 4.4);
  const bz = expandBays(depthBays, params.bayDepth ?? 4.0);
  const eaves = params.eaves ?? 1;
  const form = params.roof ?? 'hip-gable';
  const palette = params.palette ?? templePalette;
  const rng = params.rng ?? createRng(seedFrom('kit-hall'));
  const hc = params.columnHeight ?? 5;
  const ph = params.platformHeight ?? 1.1;
  const margin = params.platformMargin ?? 1.7;
  const o1 = params.overhang ?? 2.4;
  const through = params.through ?? false;
  const windows = params.windows ?? true;

  const xs = bayStops(bx);
  const zs = bayStops(bz);
  const W = (xs[xs.length - 1] as number) - (xs[0] as number);
  const D = (zs[zs.length - 1] as number) - (zs[0] as number);
  const hx = W / 2;
  const hz = D / 2;

  // The door sits in the middle bay (right of centre for an even count).
  const doorBay = Math.floor(widthBays / 2);
  const bayA = xs[doorBay] as number;
  const bayB = xs[doorBay + 1] as number;
  const doorWidth = Math.min(params.doorWidth ?? Math.min(3.4, (bayB - bayA) * 0.6), (bayB - bayA) - 0.7);
  const doorCx = (bayA + bayB) / 2;
  const door: DoorSpec = { c0: doorCx - doorWidth / 2, c1: doorCx + doorWidth / 2, height: Math.min(3.6, hc * 0.72) };

  const stairWidth = Math.max(3, doorWidth + 1.8);
  const platform: PlatformSpec = {
    hx: hx + margin,
    hz: hz + margin,
    height: ph,
    stairs: { sides: through ? ['front', 'back'] : ['front'], width: stairWidth },
  };

  const parts = new KitParts(palette, rng);
  addPlatform(parts, platform);
  addBalustrade(parts, platform);

  const solids: Solid[] = [];
  const thick = 0.42;
  const gapNominal = 0.95;
  const wallThick = 0.4;
  const wallInset = 0.2;

  // Dark interior floor, so open doors read as a room.
  parts.body.quad([-hx + 0.3, ph + 0.02, -hz + 0.3], [-hx + 0.3, ph + 0.02, hz - 0.3], [hx - 0.3, ph + 0.02, hz - 0.3], [hx - 0.3, ph + 0.02, -hz + 0.3], shade(rgb(palette.wall), 0.3));

  const sideWalls = (
    halfX: number,
    halfZ: number,
    stopsX: readonly number[],
    stopsZ: readonly number[],
    y0: number,
    y1: number,
    withDoorBack: boolean,
    withWindows: boolean,
    beam: boolean,
  ): void => {
    const sides: [Side, number, readonly number[], DoorSpec | undefined][] = [
      ['front', -halfZ + wallInset, stopsX, door],
      ['back', halfZ - wallInset, stopsX, withDoorBack ? door : undefined],
      ['left', -halfX + wallInset, stopsZ, undefined],
      ['right', halfX - wallInset, stopsZ, undefined],
    ];
    for (const [side, line, stops, d] of sides) {
      solids.push(
        ...addWallSide(parts, {
          side,
          line,
          stops,
          y0,
          y1,
          thick: wallThick,
          door: d,
          windows: withWindows && side !== 'back' ? { sill: 0.9, head: Math.min(3.5, y1 - y0 - 0.9) } : undefined,
          beam,
        }),
      );
    }
  };

  let maxY = 0;
  if (eaves === 1) {
    const y1 = ph + hc;
    const a = hx + o1;
    const b = hz + o1;
    const shape = createRoofShape(
      form === 'hip-gable'
        ? { form, a, b, rise: b * 0.58, gableHalf: Math.max(hx - 0.9, 1), curve: 1.8 }
        : { form, a, b, rise: b * 0.56, curve: 1.8 },
    );
    const baseY = y1 + gapNominal + thick - shape.heightAt(0, -hz);
    const roof = buildRoof(
      { shape, centre: [0, 0], baseY, palette, rng, thick, ornament: ornamentFor(shape.params.b) },
      { surface: parts.surface, body: parts.body, tiles: parts.tiles },
    );
    solids.push(...addColumnRing(parts, xs, zs, ph, hc, roof.underY));
    sideWalls(hx, hz, xs, zs, ph, y1, through, windows, true);
    addFrieze(parts, hx, hz, y1, roof.underY);
    maxY = roof.maxY;
  } else {
    // Double eave: a ring of columns under a skirt roof, an inset inner storey, and the main roof above.
    const inset = Math.min(2.6, Math.min(hx, hz) * 0.45);
    const ix = hx - inset;
    const iz = hz - inset;
    const y1 = ph + hc;
    const skirtRise = Math.max(1.8, (o1 + inset) * 0.55);
    const ring = createRoofShape({
      form: 'ring',
      a: hx + o1,
      b: hz + o1,
      rise: skirtRise,
      curve: 1.5,
      innerA: ix - 0.1,
      innerB: iz - 0.1,
      lip: 0.4,
      upturn: Math.max(0.6, skirtRise * 0.4),
    });
    const baseY1 = y1 + gapNominal + thick - ring.heightAt(0, -hz);
    const skirt = buildRoof(
      { shape: ring, centre: [0, 0], baseY: baseY1, palette, rng, thick },
      { surface: parts.surface, body: parts.body, tiles: parts.tiles },
    );
    solids.push(...addColumnRing(parts, xs, zs, ph, hc, skirt.underY));
    addFrieze(parts, hx, hz, y1, skirt.underY);

    // Inner storey on the inner bay lines (same bay counts, scaled to the inset box).
    const ixs = bayStops(new Array<number>(widthBays).fill((2 * ix) / widthBays));
    const izs = bayStops(new Array<number>(depthBays).fill((2 * iz) / depthBays));
    const yIn = baseY1 + skirtRise; // where the skirt meets the inner wall
    const upperHeight = 3.6;
    const yTop = yIn + upperHeight;
    const innerDoorBay = Math.floor(widthBays / 2);
    const innerCx = ((ixs[innerDoorBay] as number) + (ixs[innerDoorBay + 1] as number)) / 2;
    const innerDoorW = Math.min(doorWidth, ((ixs[innerDoorBay + 1] as number) - (ixs[innerDoorBay] as number)) - 0.5);
    const innerDoor: DoorSpec = { c0: innerCx - innerDoorW / 2, c1: innerCx + innerDoorW / 2, height: door.height };
    const innerSides: [Side, number, readonly number[]][] = [
      ['front', -iz + wallInset, ixs],
      ['back', iz - wallInset, ixs],
      ['left', -ix + wallInset, izs],
      ['right', ix - wallInset, izs],
    ];
    for (const [side, line, stops] of innerSides) {
      // Lower storey, seen from the gallery: door and windows up to the gallery ceiling.
      solids.push(
        ...addWallSide(parts, {
          side,
          line,
          stops,
          y0: ph,
          y1: ph + hc,
          thick: wallThick,
          door: side === 'front' || (through && side === 'back') ? innerDoor : undefined,
          windows: windows && side !== 'back' ? { sill: 0.9, head: Math.min(3.5, hc - 0.9) } : undefined,
          beam: false,
        }),
      );
      // Solid wall from the gallery ceiling up to the skirt, then the upper storey with windows.
      const axisX = side === 'front' || side === 'back';
      const a0 = stops[0] as number;
      const a1 = stops[stops.length - 1] as number;
      const c0 = line - wallThick / 2;
      const c1 = line + wallThick / 2;
      const wall = rgb(palette.wall);
      if (axisX) parts.body.box([a0, ph + hc, c0], [a1, yIn + 0.3, c1], wall, undefined, false);
      else parts.body.box([c0, ph + hc, a0], [c1, yIn + 0.3, a1], wall, undefined, false);
      addWallSide(parts, {
        side,
        line,
        stops,
        y0: yIn,
        y1: yTop,
        thick: wallThick,
        windows: { sill: 0.8, head: upperHeight - 0.65 },
        beam: true,
      });
    }
    // Inner posts: tall ones in the gallery, upper ones above the skirt.
    const upperXs = ixs;
    const upperZs = izs;
    const roofA = ix + 2.1;
    const roofB = iz + 2.1;
    const upperShape = createRoofShape(
      form === 'hip-gable'
        ? { form, a: roofA, b: roofB, rise: roofB * 0.6, gableHalf: Math.max(ix - 0.8, 1), curve: 1.8 }
        : { form, a: roofA, b: roofB, rise: roofB * 0.58, curve: 1.8 },
    );
    const baseY2 = yTop + gapNominal + thick - upperShape.heightAt(0, -iz);
    const upper = buildRoof(
      { shape: upperShape, centre: [0, 0], baseY: baseY2, palette, rng, thick, ornament: ornamentFor(roofB) },
      { surface: parts.surface, body: parts.body, tiles: parts.tiles },
    );
    addColumnRing(parts, upperXs, upperZs, yIn - 0.6, upperHeight + 0.6, upper.underY, 0.85, false);
    // Tall inner posts standing in the gallery, up to the skirt.
    for (const x of ixs) for (const z of [-iz, iz]) parts.column(x, ph, z, yIn - ph, 0.85);
    for (const z of izs.slice(1, -1)) for (const x of [-ix, ix]) parts.column(x, ph, z, yIn - ph, 0.85);
    addFrieze(parts, ix, iz, yTop, upper.underY, 0.35);
    maxY = Math.max(upper.maxY, skirt.maxY);
  }

  const built = parts.finish(eaves === 2 ? 'hall-double-eave' : 'hall');
  return {
    object: built.object,
    footprint: { width: 2 * platform.hx, depth: 2 * platform.hz },
    height: maxY,
    solids,
    heightAt: (x, z) => platformHeightAt(platform, x, z),
    stats: built.stats,
    dispose: built.dispose,
  };
}
