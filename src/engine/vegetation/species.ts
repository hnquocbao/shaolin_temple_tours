import type { BufferGeometry } from 'three';
import { createRng, seedFrom, type Rng } from '../rng';
import { TreeMesh, linear, type Crown, type V3 } from './mesh';

/**
 * The four species of the mountain-temple kit. Each is a parametric generator that makes a small set of shape
 * variants at two levels of detail (0 = near, 1 = far). Common contract for every shape:
 *  - the origin is on the ground, +y is up, the tree stands about `height` metres tall at scale 1;
 *  - the trunk reaches 0.6 m below the origin, so a tree on a slope never floats;
 *  - foliage is made of lumpy blobs whose normals are blended towards the crown's, so leaves shade as a volume.
 */
export type SpeciesId = 'pine' | 'cypress' | 'broadleaf' | 'shrub';

export const SPECIES_IDS: readonly SpeciesId[] = ['pine', 'cypress', 'broadleaf', 'shrub'];

export interface SpeciesInfo {
  id: SpeciesId;
  /** Nominal height at scale 1, metres. */
  height: number;
  /** Nominal crown radius at scale 1 (what other trees and exclusion zones keep clear of). */
  crownRadius: number;
  trunkRadius: number;
  /** Height of the bare trunk, used for collision boxes. */
  trunkHeight: number;
  /** Shapes made at near detail. Far detail is one shape per species (or the near shape when `farVariant` is false). */
  variants: number;
  farVariant: boolean;
  castShadow: boolean;
  /** sRGB hex colours of foliage, the default palette for the species. */
  palette: readonly number[];
}

export const SPECIES: Readonly<Record<SpeciesId, SpeciesInfo>> = {
  pine: {
    id: 'pine',
    height: 11,
    crownRadius: 3.8,
    trunkRadius: 0.45,
    trunkHeight: 6,
    variants: 2,
    farVariant: true,
    castShadow: true,
    palette: [0x2b5239, 0x315a3f, 0x274a37, 0x3a6040, 0x2e5645],
  },
  cypress: {
    id: 'cypress',
    height: 10,
    crownRadius: 1.0,
    trunkRadius: 0.3,
    trunkHeight: 1.5,
    variants: 2,
    farVariant: false,
    castShadow: true,
    palette: [0x2c5a40, 0x30603f, 0x285238],
  },
  broadleaf: {
    id: 'broadleaf',
    height: 9,
    crownRadius: 4,
    trunkRadius: 0.5,
    trunkHeight: 3,
    variants: 2,
    farVariant: true,
    castShadow: true,
    palette: [0xd9952a, 0xe0a634, 0xcf6e24, 0xb94c22, 0xdcae45],
  },
  shrub: {
    id: 'shrub',
    height: 1.0,
    crownRadius: 0.9,
    trunkRadius: 0.1,
    trunkHeight: 0.3,
    variants: 2,
    farVariant: false,
    castShadow: false,
    palette: [0x3e6a3a, 0x4d7338, 0xc9772a, 0xd6a038, 0xb04a26, 0xd9822a, 0xe0a83c, 0x3a6640],
  },
};

export type Lod = 0 | 1;

const BARK = linear(0x4a3220);
const BARK_PALE = linear(0x5e4a38);

/** Layout and surface noise use separate streams, so far detail keeps the near shape's layout. */
function streams(species: SpeciesId, variant: number): { layout: Rng; surface: Rng } {
  const seed = seedFrom(`${species}-${variant}`);
  return { layout: createRng(seed), surface: createRng(seed ^ 0x9e3779b9) };
}

const TAU = Math.PI * 2;

/** Mountain pine: a twisted trunk and flat horizontal pads of dark needles, the shape of a Chinese ink landscape. */
function pine(variant: number, lod: Lod): { mesh: TreeMesh; height: number } {
  const { layout: rng, surface } = streams('pine', variant);
  const near = lod === 0;
  const H = SPECIES.pine.height * (variant === 0 ? 1 : 1.12);
  const mesh = new TreeMesh(surface);

  const leanDir = rng() * TAU;
  const lean = 0.8 + 1.4 * rng();
  const twist = 0.6 + 0.5 * rng();
  const phase = rng() * TAU;
  const trunkAt = (t: number): V3 => {
    const sweep = lean * t * t;
    const wob = twist * Math.sin(t * Math.PI * 1.7 + phase) * (1 - 0.4 * t);
    const wobDir = leanDir + Math.PI / 2;
    return [
      Math.cos(leanDir) * sweep + Math.cos(wobDir) * wob,
      -0.6 + t * (H * 0.95 + 0.6),
      Math.sin(leanDir) * sweep + Math.sin(wobDir) * wob,
    ];
  };
  const steps = near ? 6 : 3;
  const points: V3[] = [];
  const radii: number[] = [];
  for (let k = 0; k < steps; k++) {
    const t = k / (steps - 1);
    points.push(trunkAt(t));
    radii.push(0.4 * (1 - t) ** 0.9 + 0.06 + (k === 0 ? 0.1 : 0));
  }
  mesh.tube(points, radii, near ? 5 : 4, BARK);

  const pads = near ? 5 : 4;
  const crown: Crown = { center: [0, H * 0.66, 0], radii: [4.2, H * 0.42, 4.2], normalMix: 0.22, lo: 0.62, hi: 1.25 };
  const a0 = rng() * TAU;
  for (let i = 0; i < pads; i++) {
    const f = i / (pads - 1);
    const hFrac = 0.24 + 0.7 * f ** 0.9;
    const base = trunkAt((hFrac * H + 0.6) / (H * 0.95 + 0.6));
    const a = a0 + i * 2.4 + (rng() - 0.5) * 0.8;
    const radius = (4.4 - 2.2 * f) * (0.85 + 0.3 * rng());
    const thick = (1.1 + 0.45 * rng()) * (1 - 0.25 * f) * (near ? 1 : 1.3);
    const reach = i === pads - 1 ? radius * 0.1 : radius * 0.5;
    const center: V3 = [base[0] + Math.cos(a) * reach, hFrac * H, base[2] + Math.sin(a) * reach];
    const rot = { yaw: -a, pitch: (rng() - 0.5) * 0.25, roll: (rng() - 0.5) * 0.3 };
    crown.center = [base[0], H * 0.62, base[2]];
    mesh.blob({
      center,
      radii: [radius, thick, radius * 0.72],
      rot,
      segs: near ? 8 : 7,
      rings: near ? 3 : 2,
      jitter: 0.24,
      crown,
      up: 0.6,
      flatBottom: 0.6,
      tone: 0.9 + 0.2 * rng(),
    });
    if (near) {
      // Side lobes break the outline into clumps, the way a pad is a cluster of needle tufts.
      for (const side of [-1, 1]) {
        const lobe: V3 = [
          center[0] + Math.cos(a) * radius * 0.35 + Math.cos(a + Math.PI / 2) * side * radius * 0.5,
          center[1] + 0.1 + 0.3 * rng(),
          center[2] + Math.sin(a) * radius * 0.35 + Math.sin(a + Math.PI / 2) * side * radius * 0.5,
        ];
        mesh.blob({
          center: lobe,
          radii: [radius * 0.5, thick * 0.8, radius * 0.4],
          rot: { yaw: -a + side * 0.4 },
          segs: 6,
          rings: 2,
          jitter: 0.25,
          crown,
          up: 0.6,
          flatBottom: 0.5,
          tone: 0.95 + 0.2 * rng(),
        });
      }
      if (reach > 0.5) {
        const bh = Math.max(0, center[1] - 0.2);
        mesh.tube([base, [center[0] * 0.6 + base[0] * 0.4, bh, center[2] * 0.6 + base[2] * 0.4]], [0.13, 0.08], 3, BARK);
      }
    }
  }
  return { mesh, height: H };
}

/** Cypress: tall, narrow and dark, with a flame-shaped crown. */
function cypress(variant: number, _lod: Lod): { mesh: TreeMesh; height: number } {
  const { layout: rng, surface } = streams('cypress', variant);
  const H = SPECIES.cypress.height * (variant === 0 ? 1 : 1.15);
  const w = variant === 0 ? 1 : 0.82;
  const mesh = new TreeMesh(surface);
  mesh.tube(
    [
      [0, -0.6, 0],
      [0.05, 0.6, 0.02],
      [0.04, 1.5, 0.02],
    ],
    [0.34, 0.26, 0.18],
    4,
    BARK,
  );
  const lean = (rng() - 0.5) * 0.5;
  const crown: Crown = { center: [0, H * 0.54, 0], radii: [1.05 * w, H * 0.46, 1.05 * w], normalMix: 0.55, lo: 0.5, hi: 1.3 };
  mesh.blob({
    center: [lean * 0.2, H * 0.52, 0],
    radii: [1.0 * w, H * 0.46, 1.0 * w],
    rot: { roll: lean * 0.05 },
    segs: 6,
    rings: 5,
    jitter: 0.16,
    crown,
    pointTop: 0.6,
    tone: 1,
  });
  mesh.blob({
    center: [0.4 * w, H * 0.3, 0.2 * w],
    radii: [0.75 * w, H * 0.2, 0.7 * w],
    segs: 5,
    rings: 3,
    jitter: 0.2,
    crown,
    pointTop: 0.3,
    tone: 0.95,
  });
  return { mesh, height: H };
}

/** Broadleaf: a trunk that forks into a rounded crown of leaf clumps, for gold ginkgo and orange or red maple. */
function broadleaf(variant: number, lod: Lod): { mesh: TreeMesh; height: number } {
  const { layout: rng, surface } = streams('broadleaf', variant);
  const near = lod === 0;
  const tall = variant === 1;
  const H = SPECIES.broadleaf.height * (tall ? 1.3 : 1);
  const crownRadius = SPECIES.broadleaf.crownRadius * (tall ? 0.8 : 1);
  const cy = H * (tall ? 0.6 : 0.58);
  const squash = tall ? 1.2 : 0.85;
  const mesh = new TreeMesh(surface);
  const forkY = H * (tall ? 0.3 : 0.27);
  const lean = (rng() - 0.5) * 0.8;
  const trunk: V3[] = near
    ? [
        [0, -0.6, 0],
        [lean * 0.3, forkY * 0.4, 0.1],
        [lean * 0.6, forkY * 0.8, -0.1],
        [lean, forkY, 0],
      ]
    : [
        [0, -0.6, 0],
        [lean, forkY, 0],
      ];
  mesh.tube(trunk, near ? [0.42, 0.3, 0.26, 0.24] : [0.4, 0.24], near ? 5 : 4, BARK_PALE);

  const crown: Crown = {
    center: [lean, cy, 0],
    radii: [crownRadius * 1.1, crownRadius * squash * 1.1, crownRadius * 1.1],
    normalMix: 0.5,
    lo: 0.5,
    hi: 1.25,
  };
  const count = near ? 5 : 3;
  const a0 = rng() * TAU;
  for (let j = 0; j < count; j++) {
    const top = j === count - 1;
    const a = a0 + j * 2.4 + (rng() - 0.5) * 0.5;
    const r = top ? crownRadius * 0.1 : crownRadius * (near ? 0.55 + 0.2 * rng() : 0.5);
    const y = cy + (top ? crownRadius * squash * 0.5 : (rng() - 0.5) * crownRadius * 0.5);
    const c: V3 = [lean + Math.cos(a) * r, y, Math.sin(a) * r];
    const size = crownRadius * (top ? 0.7 : 0.66 + 0.14 * rng()) * (near ? 1 : 1.25);
    mesh.blob({
      center: c,
      radii: [size, size * squash * (0.85 + 0.2 * rng()), size],
      rot: { yaw: rng() * TAU },
      segs: near ? 8 : 6,
      rings: near ? 4 : 3,
      jitter: 0.24,
      crown,
      up: 0.15,
      tone: 0.88 + 0.26 * rng(),
    });
    if (near && !top && j < 2) {
      mesh.tube(
        [
          [lean, forkY, 0],
          [lean + (c[0] - lean) * 0.5, forkY + (c[1] - forkY) * 0.5, c[2] * 0.5],
          [c[0] * 0.9 + lean * 0.1, c[1] - size * 0.35, c[2] * 0.9],
        ],
        [0.17, 0.12, 0.08],
        4,
        BARK_PALE,
      );
    }
  }
  return { mesh, height: H };
}

/** Low shrub or cliff bush: a clump of leaf lobes for ledges, spire tops and the edges of paths. */
function shrub(variant: number, _lod: Lod): { mesh: TreeMesh; height: number } {
  const { layout: rng, surface } = streams('shrub', variant);
  const H = SPECIES.shrub.height;
  const mesh = new TreeMesh(surface);
  const crown: Crown = { center: [0, 0.55, 0], radii: [1.0, 0.7, 1.0], normalMix: 0.45, lo: 0.5, hi: 1.35 };
  const count = variant === 0 ? 3 : 4;
  const a0 = rng() * TAU;
  for (let j = 0; j < count; j++) {
    const a = a0 + j * 2.2 + rng() * 0.6;
    const r = j === 0 ? 0.05 : 0.38 + 0.25 * rng();
    const size = (j === 0 ? 0.62 : 0.4 + 0.2 * rng()) * (variant === 0 ? 1 : 0.9);
    mesh.blob({
      center: [Math.cos(a) * r, 0.1 + (j === 0 ? 0.3 : 0.14 * rng()), Math.sin(a) * r],
      radii: [size, size * 0.8, size],
      rot: { yaw: rng() * TAU },
      segs: 6,
      rings: 3,
      jitter: 0.28,
      crown,
      up: 0.15,
      flatBottom: 0.3,
      tone: 0.9 + 0.2 * rng(),
    });
  }
  return { mesh, height: H };
}

/** The pure shape of one variant (plain arrays; no GPU objects). Variants wrap round if out of range. */
export function generateTreeMesh(species: SpeciesId, variant: number, lod: Lod): { mesh: TreeMesh; height: number } {
  const info = SPECIES[species];
  const v = ((Math.floor(variant) % info.variants) + info.variants) % info.variants;
  const l: Lod = lod === 1 && info.farVariant ? 1 : 0;
  switch (species) {
    case 'pine':
      return pine(v, l);
    case 'cypress':
      return cypress(v, l);
    case 'broadleaf':
      return broadleaf(v, l);
    case 'shrub':
      return shrub(v, l);
  }
}

export function createTreeGeometry(species: SpeciesId, variant: number, lod: Lod): BufferGeometry {
  const { mesh, height } = generateTreeMesh(species, variant, lod);
  return mesh.toGeometry(height);
}
