import { Group } from 'three';
import { createRng, seedFrom, type Rng } from '../engine/rng';
import type { Solid } from '../places/types';
import { createHall, type HallParams } from './hall';
import type { Palette } from './palette';
import { createWall } from './wall';
import type { Building } from './types';

export interface GateParams {
  /** Bays across the gate hall. Default 3. */
  widthBays?: number;
  /** Bays front to back. Default 2. */
  depthBays?: number;
  bayWidth?: number | readonly number[];
  bayDepth?: number | readonly number[];
  /** Passage width through the middle bay, metres. Default 3.4. */
  doorWidth?: number;
  /** Length of wall on each side of the gate, from the platform edge. Default 24. */
  wing?: number;
  /** Wall height. Default 3.4. */
  wallHeight?: number;
  /** Wall thickness. Default 0.9. */
  wallThickness?: number;
  roof?: HallParams['roof'];
  palette?: Palette;
  rng?: Rng;
}

/**
 * Gate factory: a single-eave gate hall with an open passage front to back (steps on both sides),
 * built by the hall factory, with a run of perimeter wall on each side.
 *
 * Contract:
 * - Frame: origin at the centre of the gate hall's platform at ground level, the front faces -z,
 *   the wall runs along x through the origin; +y up, metres.
 * - `footprint` spans both wings: (platform width + 2 * wing) by the platform depth.
 * - `solids` are the hall's walls and columns plus the two wing walls; the passage is left open and
 *   `heightAt` follows the platform and its steps, and is 0 on the wings.
 */
export function createGate(params: GateParams = {}): Building {
  const rng = params.rng ?? createRng(seedFrom('kit-gate'));
  const hall = createHall({
    widthBays: params.widthBays ?? 3,
    depthBays: params.depthBays ?? 2,
    bayWidth: params.bayWidth ?? 4,
    bayDepth: params.bayDepth ?? 3.6,
    eaves: 1,
    roof: params.roof ?? 'hip-gable',
    columnHeight: 4.6,
    platformHeight: 0.7,
    overhang: 2.2,
    doorWidth: params.doorWidth ?? 3.4,
    through: true,
    windows: false,
    palette: params.palette,
    rng,
  });
  const wing = params.wing ?? 24;
  const hx = hall.footprint.width / 2;
  const wallOpts = { height: params.wallHeight ?? 3.4, thickness: params.wallThickness ?? 0.9, palette: params.palette, rng };
  const left = createWall({ ...wallOpts, points: [[-hx - wing, 0], [-hx + 0.1, 0]], endPosts: true });
  const right = createWall({ ...wallOpts, points: [[hx - 0.1, 0], [hx + wing, 0]], endPosts: true });

  const object = new Group();
  object.name = 'gate';
  object.add(hall.object, left.object, right.object);
  const solids: Solid[] = [...hall.solids, ...left.solids, ...right.solids];
  const parts = [hall, left, right];
  return {
    object,
    footprint: { width: hall.footprint.width + 2 * wing, depth: hall.footprint.depth },
    height: Math.max(hall.height, left.height, right.height),
    solids,
    heightAt: hall.heightAt,
    stats: {
      triangles: parts.reduce((n, p) => n + p.stats.triangles, 0),
      meshes: parts.reduce((n, p) => n + p.stats.meshes, 0),
      drawCalls: parts.reduce((n, p) => n + p.stats.drawCalls, 0),
    },
    dispose() {
      for (const p of parts) p.dispose();
    },
  };
}
