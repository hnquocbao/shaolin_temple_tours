import { createRng, type Rng } from '../rng';
import type { Rect } from '../terrain/heightfield';
import { scatterTrees, type HeightFn, type Placement, type SpeciesRule, type TreeInstance, type Zone } from './scatter';

/** Foliage colours for the autumn patches: ginkgo gold, maple orange and red. */
export const AUTUMN_PALETTE: readonly number[] = [0xdc9a2a, 0xe6ae36, 0xd8842a, 0xcc6422, 0xe2a83e, 0xb84a20, 0xc9702a, 0xe8b448];
/** Summer-green broadleaf, the quiet body of the forest. */
export const GREEN_PALETTE: readonly number[] = [0x2f5a3c, 0x376642, 0x2a5239, 0x44703f, 0x2c5a48, 0x4f7a3e];

export interface MountainForestInput {
  /** The ground. Must be defined everywhere inside `bounds`. */
  heightAt: HeightFn;
  /** Where trees may grow. */
  bounds: Rect;
  rng: Rng;
  /** Building footprints, courtyards, paths and anything else to keep clear. */
  exclusions?: readonly Zone[];
  /** Hand-placed trees (courtyard cypresses); the forest keeps clear of them. */
  explicit?: readonly Placement[];
  /** Trees per square metre on ideal ground. Default 0.07 (one per 14 m²); real ground thins it out. */
  density?: number;
  /** Nothing grows below this height (the cloud sea fills the valleys: trees there would be wasted). Default: the lowest ground in `bounds`. */
  minY?: number;
  /** Highest ground for trees; above it only bushes. Default: the highest ground in `bounds`. */
  maxY?: number;
}

/** Lowest and highest ground in a rectangle, from a coarse grid. */
export function heightRange(heightAt: HeightFn, bounds: Rect, steps = 28): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j <= steps; j++) {
    for (let i = 0; i <= steps; i++) {
      const y = heightAt(bounds.minX + ((bounds.maxX - bounds.minX) * i) / steps, bounds.minZ + ((bounds.maxZ - bounds.minZ) * j) / steps);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  return { min, max };
}

/**
 * The species mix of a mountain temple, as rules for `scatterTrees`:
 * dense mixed forest on gentle and moderate slopes, pines on ridges and near cliffs, autumn patches in valleys and
 * on lower slopes, cypresses on the flat, bushes on ledges and spire tops; everything thins with height and steepness.
 */
export function mountainForestRules(lo: number, hi: number): SpeciesRule[] {
  const span = Math.max(1, hi - lo);
  const treeLine = hi - 0.04 * span;
  return [
    {
      species: 'broadleaf',
      share: 0.28,
      palette: GREEN_PALETTE,
      heightBand: { min: lo, max: lo + 0.8 * span, fade: 0.25 * span, fadeLow: 0 },
      maxSlope: 42,
      slopeFade: 16,
      ridge: -0.25,
      cluster: { size: 70, strength: 0.55 },
      scale: [0.85, 1.5],
    },
    {
      species: 'pine',
      share: 0.38,
      heightBand: { min: lo + 0.1 * span, max: treeLine, fade: 0.45 * span },
      maxSlope: 54,
      slopeFade: 16,
      ridge: 0.3,
      cliff: 0.35,
      cluster: { size: 45, strength: 0.45 },
      scale: [0.8, 1.55],
    },
    {
      species: 'broadleaf',
      share: 0.08,
      palette: AUTUMN_PALETTE,
      heightBand: { min: lo, max: lo + 0.6 * span, fade: 0.2 * span, fadeLow: 0 },
      maxSlope: 36,
      slopeFade: 14,
      ridge: -0.7,
      cluster: { size: 34, strength: 0.92 },
      scale: [0.9, 1.6],
    },
    {
      species: 'cypress',
      share: 0.025,
      heightBand: { min: lo, max: lo + 0.55 * span, fade: 0.2 * span, fadeLow: 0 },
      maxSlope: 28,
      cluster: { size: 55, strength: 0.7 },
      scale: [0.8, 1.25],
    },
    {
      species: 'shrub',
      share: 0.34,
      heightBand: { min: lo, max: hi + 1, fade: 0.4 * span, fadeLow: 0 },
      maxSlope: 72,
      slopeFade: 18,
      cliff: 0.85,
      ridge: 0.35,
      cluster: { size: 22, strength: 0.5 },
      scale: [1.1, 2.4],
    },
  ];
}

/**
 * A second, denser pass that only looks at the foot of cliffs: bushes and the odd pine cling to every ledge,
 * where the main pass's spacing (about 4 m) would mostly miss a ledge 2 to 3 m deep.
 */
function ledgeRules(lo: number, hi: number): SpeciesRule[] {
  const span = Math.max(1, hi - lo);
  return [
    {
      species: 'shrub',
      share: 0.8,
      heightBand: { min: lo, max: hi + 1, fade: 0.3 * span, fadeLow: 0 },
      maxSlope: 66,
      slopeFade: 14,
      cliff: 1,
      cluster: { size: 16, strength: 0.6 },
      scale: [1.2, 2.6],
    },
    {
      species: 'pine',
      share: 0.2,
      heightBand: { min: lo, max: hi - 0.04 * span, fade: 0.4 * span, fadeLow: 0 },
      maxSlope: 46,
      slopeFade: 12,
      cliff: 1,
      ridge: 0.3,
      cluster: { size: 30, strength: 0.7 },
      scale: [0.7, 1.2],
    },
  ];
}

/** Scatter a believable mountain forest on any ground. See `mountainForestRules` for the mix. */
export function scatterMountainForest(input: MountainForestInput): TreeInstance[] {
  const range = heightRange(input.heightAt, input.bounds);
  const lo = input.minY ?? range.min;
  const hi = input.maxY ?? range.max;
  const density = input.density ?? 0.07;
  const main = scatterTrees({
    heightAt: input.heightAt,
    region: input.bounds,
    rng: input.rng,
    density,
    rules: mountainForestRules(lo, hi),
    exclusions: input.exclusions,
    explicit: input.explicit,
  });
  const ledges = scatterTrees({
    heightAt: input.heightAt,
    region: input.bounds,
    rng: createRng(Math.floor(input.rng() * 4294967296)),
    density: density * 1.6,
    rules: ledgeRules(lo, hi),
    exclusions: input.exclusions,
    // Everything so far is in the way: the ledge trees fit between.
    explicit: main.map(
      (t): Placement => ({ species: t.species, x: t.x, z: t.z, variant: t.variant, rotation: t.rotation, scale: t.scale, stretch: t.stretch, color: t.color }),
    ),
  });
  return [...main, ...ledges.filter((t) => !t.explicit)];
}
