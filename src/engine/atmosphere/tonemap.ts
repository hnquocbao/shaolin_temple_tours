import { Color } from 'three';
import type { ResolvedMood } from './defaults';

/**
 * CPU mirror of the final pass in `shaders.ts` (exposure, shadow lift, saturation, tints, ACES, sRGB).
 * It exists so tests can state what a surface in shade ends up as on screen. Keep both in step.
 */

/** Added to the linear picture before tone mapping so the darkest tones are not crushed to black. */
export const SHADOW_LIFT = 0.014;

const aces = (x: number): number => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const srgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Display value (0..1 per channel, gamma-encoded) of linear scene radiance `rgb` after the final pass. */
export function toDisplay(rgb: readonly [number, number, number], mood: ResolvedMood): [number, number, number] {
  const { grade } = mood;
  const shadow = new Color(grade.shadowTint);
  const light = new Color(grade.highlightTint);
  let c = rgb.map((v) => v * mood.base.exposure + SHADOW_LIFT) as [number, number, number];
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  c = c.map((v) => l + (v - l) * grade.saturation) as [number, number, number];
  const t = smooth(0.04, 1.1, l);
  const tint: [number, number, number] = [
    shadow.r + (light.r - shadow.r) * t,
    shadow.g + (light.g - shadow.g) * t,
    shadow.b + (light.b - shadow.b) * t,
  ];
  return c.map((v, i) => (srgb(aces(v * tint[i]!)) - 0.5) * grade.contrast + 0.5) as [number, number, number];
}

export const displayLuma = (rgb: readonly [number, number, number]): number =>
  0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/**
 * Radiance of a Lambert surface (`albedo`, linear) lit only by the hemisphere light, with its normal horizontal
 * (a wall). three.js gives hemisphere irradiance `mix(ground, sky, 0.5) * intensity` and a Lambert BRDF of albedo / pi.
 */
export function wallInShade(albedo: readonly [number, number, number], mood: ResolvedMood): [number, number, number] {
  const sky = new Color(mood.base.skyLight);
  const ground = new Color(mood.base.groundLight);
  const k = mood.base.ambientIntensity / Math.PI;
  return [
    albedo[0] * 0.5 * (sky.r + ground.r) * k,
    albedo[1] * 0.5 * (sky.g + ground.g) * k,
    albedo[2] * 0.5 * (sky.b + ground.b) * k,
  ];
}

/** The same wall facing straight into the sun (with the shade fill too). */
export function wallInSun(albedo: readonly [number, number, number], mood: ResolvedMood): [number, number, number] {
  const sun = new Color(mood.base.sunColor);
  const k = mood.base.sunIntensity / Math.PI;
  const fill = wallInShade(albedo, mood);
  return [fill[0] + albedo[0] * sun.r * k, fill[1] + albedo[1] * sun.g * k, fill[2] + albedo[2] * sun.b * k];
}
