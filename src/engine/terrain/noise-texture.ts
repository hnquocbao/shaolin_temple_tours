import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { valueNoiseTile } from './noise';

/** Fractal tileable noise at lattice period `base` (doubling each octave). */
function tileFbm(u: number, v: number, base: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let period = base;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoiseTile(u * period, v * period, period, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

/**
 * A 256x256 repeating noise texture shared by the terrain material and the sky and cloud shaders.
 * R: soft fractal. G: a second, unrelated fractal. B: ridged cracks. A: fine grain.
 * Built from fixed seeds, so every run gets the same bytes.
 */
export function createNoiseTexture(size = 256): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const r = tileFbm(u, v, 4, 5, 1001);
      const g = tileFbm(u, v, 3, 5, 2003);
      const crack = 1 - Math.abs(2 * tileFbm(u, v, 4, 4, 3011) - 1);
      const grain = 0.6 * valueNoiseTile(u * 64, v * 64, 64, 4001) + 0.4 * valueNoiseTile(u * 128, v * 128, 128, 4003);
      const i = (y * size + x) * 4;
      // Stretch the contrast: a sum of octaves clusters around the middle.
      data[i] = Math.round(Math.min(1, Math.max(0, (r - 0.5) * 1.9 + 0.5)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, (g - 0.5) * 1.9 + 0.5)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, crack * crack)) * 255);
      data[i + 3] = Math.round(grain * 255);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
