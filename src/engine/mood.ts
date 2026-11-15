import type { Vec3 } from '../places/types';

/**
 * The light and air of a place: one time of day, one palette. Data only.
 * `createPipeline` turns it into lights, sky, fog and post-processing.
 * ST3T-12 extends this (cloud sea, haze layers, light shafts, bloom, grade); keep existing fields.
 */
export interface Mood {
  /** Direction the sunlight travels FROM, as a point on the sky. Need not be normalised. */
  sunPosition: Vec3;
  sunColor: number;
  sunIntensity: number;
  /** Ambient light from above and from below. */
  skyLight: number;
  groundLight: number;
  ambientIntensity: number;
  /** Colour at the horizon; also the fog colour. */
  horizonColor: number;
  /** Distances at which fog starts and is complete, in metres. */
  fogNear: number;
  fogFar: number;
  exposure: number;
}
