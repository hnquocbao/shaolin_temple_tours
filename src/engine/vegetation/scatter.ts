import type { Rng } from '../rng';
import { fbm, smoothstep } from '../terrain/noise';
import type { Rect } from '../terrain/heightfield';
import { SPECIES, type SpeciesId } from './species';

/** Ground to scatter on: height in metres at a point, defined everywhere. */
export type HeightFn = (x: number, z: number) => number;

/** Ground that trees must keep clear of. Crowns are kept out too: every zone is grown by half the tree's crown radius. */
export type Zone =
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number }
  | { kind: 'corridor'; points: readonly (readonly [x: number, z: number])[]; halfWidth: number }
  | { kind: 'circle'; x: number; z: number; radius: number };

/** A tree placed by hand (a courtyard cypress). Its height always comes from the ground. */
export interface Placement {
  species: SpeciesId;
  x: number;
  z: number;
  variant?: number;
  /** Yaw in radians. Default: from the seeded rng. */
  rotation?: number;
  scale?: number;
  stretch?: number;
  /** sRGB hex. Default: from the species palette. */
  color?: number;
}

/** The result of scattering: plain data, which `buildVegetation` turns into instanced meshes. */
export interface TreeInstance {
  species: SpeciesId;
  variant: number;
  x: number;
  y: number;
  z: number;
  /** Yaw in radians. */
  rotation: number;
  /** Overall size relative to the species' nominal size. */
  scale: number;
  /** Extra height factor: tall and squat trees of one shape. */
  stretch: number;
  /** sRGB hex of the foliage. */
  color: number;
  /** True for trees from `explicit` placements. */
  explicit: boolean;
}

export interface SpeciesRule {
  species: SpeciesId;
  /** Share of the density this species gets where the ground suits it (shares are normalised to sum to 1). */
  share: number;
  /** Foliage colours (sRGB hex); default is the species palette. */
  palette?: readonly number[];
  /** Ground height band in metres. Trees never grow outside it; they thin out over `fade` metres inside the upper edge and `fadeLow` (default `fade`) inside the lower. */
  heightBand?: { min: number; max: number; fade?: number; fadeLow?: number };
  /** Steepest ground in degrees. Trees never grow on it; they thin out over `slopeFade` degrees before it. */
  maxSlope?: number;
  /** Gentlest ground in degrees (for species that cling to steep ground). */
  minSlope?: number;
  slopeFade?: number;
  /** -1 valleys and hollows, +1 ridges and crests, 0 no preference. */
  ridge?: number;
  /** +1 clings to the foot of cliffs and ledges, -1 keeps away from them. */
  cliff?: number;
  /** Clumping: noise of feature size `size` metres modulates the density; `strength` 0..1. */
  cluster?: { size: number; strength: number };
  /** Size range (relative to the nominal size). */
  scale: readonly [min: number, max: number];
}

export interface ScatterInput {
  heightAt: HeightFn;
  region: Rect;
  rng: Rng;
  /** Trees per square metre where every rule is fully suited (0.02 is one tree per 50 m²). */
  density: number;
  rules: readonly SpeciesRule[];
  exclusions?: readonly Zone[];
  explicit?: readonly Placement[];
}

/** What the ground is like at a point: used by the rules, exported so presets and tests can read it too. */
export interface Site {
  y: number;
  /** Steepness in degrees. */
  slope: number;
  /** -1 (in a hollow) .. 1 (on a crest): height against the ground 30 m around. */
  ridge: number;
  /** 0 (open) .. 1 (right beside a cliff face): steepest ground within 7 m. */
  cliff: number;
}

const RIDGE_RADIUS = 30;
const CLIFF_RADIUS = 7;
const DIR8: readonly (readonly [number, number])[] = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)] as const);

export function slopeDegrees(heightAt: HeightFn, x: number, z: number): number {
  // About the cell of a ground mesh: a tree must stand where the mesh really is, not only where the function says.
  const e = 1.0;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

export function siteAt(heightAt: HeightFn, x: number, z: number, wantRidge = true, wantCliff = true): Site {
  const y = heightAt(x, z);
  const slope = slopeDegrees(heightAt, x, z);
  let ridge = 0;
  if (wantRidge) {
    let mean = 0;
    for (const [dx, dz] of DIR8) mean += heightAt(x + dx * RIDGE_RADIUS, z + dz * RIDGE_RADIUS);
    ridge = Math.max(-1, Math.min(1, (y - mean / 8) / 12));
  }
  let cliff = 0;
  if (wantCliff) {
    let steepest = 0;
    for (const [dx, dz] of DIR8) steepest = Math.max(steepest, Math.abs(heightAt(x + dx * CLIFF_RADIUS, z + dz * CLIFF_RADIUS) - y) / CLIFF_RADIUS);
    cliff = smoothstep(0.6, 1.9, steepest);
  }
  return { y, slope, ridge, cliff };
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Whether (x, z) lies inside the zone grown by `margin` metres. */
export function inZone(zone: Zone, x: number, z: number, margin = 0): boolean {
  switch (zone.kind) {
    case 'box':
      return x >= zone.minX - margin && x <= zone.maxX + margin && z >= zone.minZ - margin && z <= zone.maxZ + margin;
    case 'circle':
      return Math.hypot(x - zone.x, z - zone.z) <= zone.radius + margin;
    case 'corridor': {
      const pts = zone.points;
      const limit = zone.halfWidth + margin;
      if (pts.length === 1) {
        const p = pts[0];
        return p !== undefined && Math.hypot(x - p[0], z - p[1]) <= limit;
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (a && b && distToSegment(x, z, a[0], a[1], b[0], b[1]) <= limit) return true;
      }
      return false;
    }
  }
}

/** How well the ground at `site` suits a rule, 0 (never) .. 1 (ideal). */
export function suitability(rule: SpeciesRule, site: Site, x: number, z: number, clusterSeed: number): number {
  let s = 1;
  const band = rule.heightBand;
  if (band) {
    if (site.y < band.min || site.y > band.max) return 0;
    const fade = Math.max(1e-6, band.fade ?? 0);
    const fadeLow = Math.max(1e-6, band.fadeLow ?? band.fade ?? 0);
    s *= smoothstep(band.min, band.min + fadeLow, site.y) * smoothstep(band.max, band.max - fade, site.y);
  }
  const slopeFade = rule.slopeFade ?? 12;
  if (rule.maxSlope !== undefined) {
    if (site.slope >= rule.maxSlope) return 0;
    s *= smoothstep(rule.maxSlope, rule.maxSlope - slopeFade, site.slope);
  }
  if (rule.minSlope !== undefined) {
    if (site.slope < rule.minSlope) return 0;
    s *= smoothstep(rule.minSlope, rule.minSlope + slopeFade, site.slope);
  }
  if (rule.ridge) {
    const crest = site.ridge * 0.5 + 0.5;
    s *= 1 - Math.abs(rule.ridge) * (1 - (rule.ridge > 0 ? crest : 1 - crest)) ** 1.5;
  }
  if (rule.cliff) {
    s *= 1 - Math.abs(rule.cliff) * (1 - (rule.cliff > 0 ? site.cliff : 1 - site.cliff)) ** 1.5;
  }
  if (rule.cluster && rule.cluster.strength > 0) {
    const n = fbm(x / rule.cluster.size, z / rule.cluster.size, clusterSeed, 3);
    s *= 1 - rule.cluster.strength + rule.cluster.strength * smoothstep(0.38, 0.62, n);
  }
  return s;
}

/** A foliage colour: a palette entry with a little brightness and hue variation. */
export function varyColor(hex: number, rng: Rng): number {
  const bright = 0.86 + 0.28 * rng();
  const channel = (shift: number): number => {
    const v = ((hex >> shift) & 255) * bright * (1 + (rng() - 0.5) * 0.12);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

const MAX_CANDIDATES = 4_000_000;

/**
 * Where trees grow. A jittered grid of candidate spots (spacing `1/sqrt(density)`) is thinned by each rule's
 * suitability of the ground there, by exclusion zones and by a minimum spacing between crowns, so the result
 * is even without rows. Everything comes from the seeded `rng`; the same input always gives the same trees.
 * Pure: no GPU, no globals.
 */
export function scatterTrees(input: ScatterInput): TreeInstance[] {
  const { heightAt, region, rng, density, rules } = input;
  const exclusions = input.exclusions ?? [];
  const out: TreeInstance[] = [];
  if (density <= 0 || rules.length === 0) return out;

  const totalShare = rules.reduce((n, r) => n + Math.max(0, r.share), 0);
  if (totalShare <= 0) return out;
  const shares = rules.map((r) => Math.max(0, r.share) / totalShare);
  // One seed per rule for clustering, drawn first so it does not depend on the region.
  const clusterSeeds = rules.map(() => Math.floor(rng() * 1e9));
  const needRidge = rules.some((r) => r.ridge);
  const needCliff = rules.some((r) => r.cliff);
  // The cheap test first: height and slope are hard limits, and most candidates on a cliff fail them,
  // so the expensive ridge and cliff surroundings are only read for the survivors.
  const cheap = rules.map((r): SpeciesRule => ({ ...r, ridge: undefined, cliff: undefined, cluster: undefined }));

  // Minimum spacing: a grid of buckets holding trees, so crowns do not pile onto one trunk.
  const bucket = 8;
  const buckets = new Map<number, TreeInstance[]>();
  const keyOf = (ix: number, iz: number): number => ix * 73856093 + iz * 19349663;
  const radiusOf = (t: TreeInstance): number => SPECIES[t.species].crownRadius * t.scale;
  const crowded = (x: number, z: number, r: number): boolean => {
    const ix = Math.floor(x / bucket);
    const iz = Math.floor(z / bucket);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (const o of buckets.get(keyOf(ix + a, iz + b)) ?? []) {
          if (Math.hypot(o.x - x, o.z - z) < 0.4 * (radiusOf(o) + r)) return true;
        }
      }
    }
    return false;
  };
  const remember = (t: TreeInstance): void => {
    const k = keyOf(Math.floor(t.x / bucket), Math.floor(t.z / bucket));
    const list = buckets.get(k);
    if (list) list.push(t);
    else buckets.set(k, [t]);
  };

  // Hand placements first: they are always honoured, and scattered trees keep clear of them.
  for (const p of input.explicit ?? []) {
    const info = SPECIES[p.species];
    const tree: TreeInstance = {
      species: p.species,
      variant: p.variant ?? Math.floor(rng() * info.variants),
      x: p.x,
      y: heightAt(p.x, p.z),
      z: p.z,
      rotation: p.rotation ?? rng() * Math.PI * 2,
      scale: p.scale ?? 1,
      stretch: p.stretch ?? 1,
      color: p.color ?? varyColor(info.palette[Math.floor(rng() * info.palette.length)] ?? 0x335533, rng),
      explicit: true,
    };
    out.push(tree);
    remember(tree);
  }

  const cell = 1 / Math.sqrt(density);
  const nx = Math.max(1, Math.ceil((region.maxX - region.minX) / cell));
  const nz = Math.max(1, Math.ceil((region.maxZ - region.minZ) / cell));
  if (nx * nz > MAX_CANDIDATES) throw new Error(`scatterTrees: ${nx * nz} candidates is too many; lower the density or the region`);
  const jitter = 0.8;

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      // Every candidate draws the same numbers whether or not it is used, so a change in one place
      // (a new exclusion zone) does not shuffle the trees elsewhere.
      const rx = rng();
      const rz = rng();
      const pick = rng();
      const rVariant = rng();
      const rScale = rng();
      const rStretch = rng();
      const rYaw = rng();
      const rColor = rng();
      const x = region.minX + (i + 0.5 + (rx - 0.5) * jitter) * cell;
      const z = region.minZ + (j + 0.5 + (rz - 0.5) * jitter) * cell;
      if (x < region.minX || x > region.maxX || z < region.minZ || z > region.maxZ) continue;

      let site = siteAt(heightAt, x, z, false, false);
      if (!cheap.some((r) => suitability(r, site, x, z, 0) > 0)) continue;
      if (needRidge || needCliff) site = siteAt(heightAt, x, z, needRidge, needCliff);
      let acc = 0;
      let chosen = -1;
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r] as SpeciesRule;
        acc += (shares[r] as number) * suitability(rule, site, x, z, clusterSeeds[r] as number);
        if (pick < acc) {
          chosen = r;
          break;
        }
      }
      if (chosen < 0) continue;

      const rule = rules[chosen] as SpeciesRule;
      const info = SPECIES[rule.species];
      const scale = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * rScale;
      const margin = info.crownRadius * scale * 0.5;
      if (exclusions.some((z0) => inZone(z0, x, z, margin))) continue;
      if (crowded(x, z, info.crownRadius * scale)) continue;

      const palette = rule.palette ?? info.palette;
      const colorRng = ((): Rng => {
        let s = Math.floor(rColor * 4294967296) >>> 0;
        return () => {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          return s / 4294967296;
        };
      })();
      const hex = palette[Math.floor(colorRng() * palette.length)] ?? 0x335533;
      const tree: TreeInstance = {
        species: rule.species,
        variant: Math.floor(rVariant * info.variants),
        x,
        y: heightAt(x, z),
        z,
        rotation: rYaw * Math.PI * 2,
        scale,
        stretch: 0.88 + 0.3 * rStretch,
        color: varyColor(hex, colorRng),
        explicit: false,
      };
      out.push(tree);
      remember(tree);
    }
  }
  return out;
}
