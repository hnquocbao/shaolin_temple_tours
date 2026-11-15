import { createRng, seedFrom, type Rng } from '../engine/rng';
import type { Solid } from '../places/types';
import { templePalette, type Palette } from './palette';
import { KitParts } from './parts';
import { buildRoof } from './roof-mesh';
import { createRoofShape } from './roof-shape';
import { addBalustrade, addColumnRing, addFrieze, addPlatform, addWallSide, platformHeightAt, type PlatformSpec } from './structure';
import type { Building } from './types';

export interface PagodaParams {
  /** Number of tiers, 3 to 9. Default 7. */
  tiers?: number;
  /** Width of the ground-tier body (wall to wall), metres. Default 9. */
  baseWidth?: number;
  /** Width of each tier relative to the one below. Default 0.9. */
  taper?: number;
  /** Wall height of a tier body, metres. Default 2.8. */
  tierHeight?: number;
  /** Platform height, metres. Default 1.3. */
  platformHeight?: number;
  palette?: Palette;
  rng?: Rng;
}

/**
 * Pagoda factory: square tiers on a stone platform, each tier a short walled body under its own
 * skirt roof with upturned corners, tapering upward to a pyramid roof and a finial.
 *
 * Contract:
 * - Frame as every kit factory: origin at the centre of the platform footprint at ground level,
 *   the door of the ground tier faces -z, +y up, metres.
 * - `footprint` is the platform (ground-tier width + 2 * 2.6 m by the same). Eaves overhang it a little.
 * - `height` is the tip of the finial. Tier widths are `baseWidth * taper^i`.
 * - `solids`: ground-tier walls and corner posts (door left open) and one box per upper tier.
 * - About 40k to 90k triangles and about 8 meshes for 7 tiers.
 */
export function createPagoda(params: PagodaParams = {}): Building {
  const tiers = params.tiers ?? 7;
  if (!Number.isInteger(tiers) || tiers < 3 || tiers > 9) throw new Error(`pagoda tiers must be an integer from 3 to 9, got ${tiers}`);
  const baseWidth = params.baseWidth ?? 9;
  const taper = params.taper ?? 0.9;
  const bodyH = params.tierHeight ?? 2.8;
  const ph = params.platformHeight ?? 1.3;
  const palette = params.palette ?? templePalette;
  const rng = params.rng ?? createRng(seedFrom('kit-pagoda'));
  const thick = 0.4;
  const gapNominal = 0.8;
  const wallThick = 0.4;
  const wallInset = 0.2;

  const margin = 2.6;
  const half0 = baseWidth / 2;
  const platform: PlatformSpec = {
    hx: half0 + margin,
    hz: half0 + margin,
    height: ph,
    stairs: { sides: ['front'], width: 3.4 },
  };
  const parts = new KitParts(palette, rng);
  const solids: Solid[] = [...addPlatform(parts, platform), ...addBalustrade(parts, platform)];
  let y = ph;
  let maxY = ph;

  for (let i = 0; i < tiers; i++) {
    const w = (baseWidth * taper ** i) / 2; // half width of this tier's body (column line)
    const wNext = (baseWidth * taper ** (i + 1)) / 2;
    const top = y + bodyH;
    const last = i === tiers - 1;
    const overhang = Math.min(2.3, Math.max(1.3, w * 0.34));
    const stops = [-w, w];
    const doorW = 2.2;
    const door = i === 0 ? { c0: -doorW / 2, c1: doorW / 2, height: Math.min(3, bodyH - 0.1) } : undefined;

    for (const [side, line] of [
      ['front', -w + wallInset],
      ['back', w - wallInset],
      ['left', -w + wallInset],
      ['right', w - wallInset],
    ] as const) {
      const got = addWallSide(parts, {
        side,
        line,
        stops,
        y0: y,
        y1: top,
        thick: wallThick,
        door: side === 'front' ? door : undefined,
        windows: side === 'front' && i === 0 ? undefined : { sill: 0.6, head: bodyH - 0.55 },
      });
      if (i === 0) solids.push(...got);
    }
    if (i > 0) solids.push({ min: [-w, y, -w], max: [w, top + 2, w] });

    let shape;
    let baseY: number;
    if (last) {
      const a = w + overhang;
      shape = createRoofShape({ form: 'hip', a, b: a, rise: a * 0.95, ridgeHalf: 0, curve: 1.7 });
      baseY = top + gapNominal + thick - shape.heightAt(0, -w);
      const roof = buildRoof(
        { shape, centre: [0, 0], baseY, palette, rng, thick, finial: 1.7, ornament: 0.85 },
        { surface: parts.surface, body: parts.body, tiles: parts.tiles },
      );
      const posts = addColumnRing(parts, stops, stops, y, bodyH, roof.underY, 0.8, i === 0);
      if (i === 0) solids.push(...posts);
      addFrieze(parts, w, w, top, roof.underY, 0.35);
      maxY = Math.max(maxY, roof.maxY);
    } else {
      const run = overhang + (w - wNext);
      const rise = Math.max(1.5, run * 0.5);
      shape = createRoofShape({
        form: 'ring',
        a: w + overhang,
        b: w + overhang,
        rise,
        curve: 1.5,
        innerA: wNext - 0.1,
        innerB: wNext - 0.1,
        lip: 0.35,
        lipLength: 1.1,
        upturn: Math.max(0.6, rise * 0.42),
      });
      baseY = top + gapNominal + thick - shape.heightAt(0, -w);
      const roof = buildRoof(
        { shape, centre: [0, 0], baseY, palette, rng, thick, ornament: 0.8 },
        { surface: parts.surface, body: parts.body, tiles: parts.tiles },
      );
      const posts = addColumnRing(parts, stops, stops, y, bodyH, roof.underY, 0.8, i === 0);
      if (i === 0) solids.push(...posts);
      addFrieze(parts, w, w, top, roof.underY, 0.35);
      maxY = Math.max(maxY, roof.maxY);
      y = baseY + rise; // the next tier starts where this skirt meets its wall
    }
  }

  const built = parts.finish('pagoda');
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
