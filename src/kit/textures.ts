import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { createRng, seedFrom } from '../engine/rng';

/** Pixel size of the procedural textures. */
const SIZE = 64;

function make(data: Uint8Array): DataTexture {
  const t = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Grey multiplier for the flat pan tiles between the ribs. One repeat is one rib pitch across
 * (the rib sits at u = 0.5) and one course of tiles down the slope: each course has a dark lower lip.
 */
export function createRoofTexture(): DataTexture {
  const rng = createRng(seedFrom('kit-roof-texture'));
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const edge = Math.abs(u - 0.5);
      // Course: dark overlap line at the bottom edge, brightening up the tile.
      let value = 0.5 + 0.5 * Math.min(1, v / 0.9) ** 1.2;
      if (v < 0.1) value = 0.28;
      // Shade beside the rib and the thin joint down the middle of each pan tile.
      if (edge < 0.3) value *= 0.55;
      else if (edge < 0.37) value *= 0.7 + (edge - 0.3) * 3.5;
      if (Math.abs(u) < 0.025 || Math.abs(u - 1) < 0.025) value *= 0.75;
      value *= 0.94 + rng() * 0.1;
      const g = Math.round(Math.max(0, Math.min(1, value)) * 255);
      const i = (y * SIZE + x) * 4;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  return make(data);
}

/** Cell size of the lattice pattern, metres per texture repeat. */
export const LATTICE_CELL = 0.5;

/**
 * Window lattice: light bars on a near-black ground, so `material.color` tints the bars and the
 * gaps read as the dark room behind. A diamond-in-square pattern.
 */
export function createLatticeTexture(): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const square = Math.min(u, 1 - u, v, 1 - v) < 0.07;
      const diamond = Math.abs(Math.abs(u - 0.5) + Math.abs(v - 0.5) - 0.3) < 0.045;
      const bar = square || diamond;
      const g = bar ? 255 : 14;
      const i = (y * SIZE + x) * 4;
      data[i] = g;
      data[i + 1] = bar ? g : 10;
      data[i + 2] = bar ? g : 6;
      data[i + 3] = 255;
    }
  }
  return make(data);
}

/** Pale paving: slabs with dark joints and slight variation. Greys, tinted by the material colour. */
export function createPavingTexture(): DataTexture {
  const rng = createRng(seedFrom('kit-paving-texture'));
  const data = new Uint8Array(SIZE * SIZE * 4);
  const slab = new Float32Array(4);
  for (let i = 0; i < 4; i++) slab[i] = 0.88 + rng() * 0.12;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = x < SIZE / 2 ? 0 : 1;
      const sy = y < SIZE / 2 ? 0 : 1;
      const lx = x % (SIZE / 2);
      const ly = y % (SIZE / 2);
      const joint = lx < 2 || ly < 2;
      let value = (slab[sy * 2 + sx] as number) * (0.96 + rng() * 0.06);
      if (joint) value *= 0.88;
      const g = Math.round(Math.max(0, Math.min(1, value)) * 255);
      const i = (y * SIZE + x) * 4;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  return make(data);
}

let shared: { roof: DataTexture; lattice: DataTexture } | undefined;
let sharedUsers = 0;

/** Roof and lattice textures are shared by every building; the last release frees them. */
export function acquireTextures(): { roof: DataTexture; lattice: DataTexture } {
  shared ??= { roof: createRoofTexture(), lattice: createLatticeTexture() };
  sharedUsers++;
  return shared;
}

export function releaseTextures(): void {
  sharedUsers = Math.max(0, sharedUsers - 1);
  if (sharedUsers === 0 && shared) {
    shared.roof.dispose();
    shared.lattice.dispose();
    shared = undefined;
  }
}
