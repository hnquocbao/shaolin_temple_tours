import type { Vec3 } from '../places/types';

/** The sky: a gradient from zenith to horizon, a sun disc and its glow. Colours are sRGB hex. */
export interface SkyMood {
  zenith: number;
  /** Colour about 15 degrees above the horizon. */
  mid: number;
  /** Horizon on the sun's side, and on the opposite side. */
  horizonWarm: number;
  horizonCool: number;
  /** Colour of the sun's glow and of sunlit cloud edges. */
  glow: number;
  /** Brightness of the sun disc (HDR; the bloom turns it into a glow). */
  sunDisc: number;
  /** Angular radius of the disc in degrees. Larger than the real 0.27 so it reads. */
  sunRadius: number;
  /** Thin clouds in the sky, 0 (none) to 1. */
  cloudiness: number;
}

/** Aerial haze: distance and height dependent, tinted by the sun and cooled in shade. Distant ridges fade in steps. */
export interface HazeMood {
  /** Colour of haze in shade (valleys, away from the sun). */
  shade: number;
  /** Extinction at `baseY` in 1/m for the broad layer, and how fast it thins with height (metres per e-fold). */
  density: number;
  heightScale: number;
  baseY: number;
  /** A low, dense layer of valley mist. */
  lowDensity: number;
  lowHeightScale: number;
  lowBaseY: number;
  /** Below this height both layers stop getting denser, so deep valleys do not turn to murk. */
  floorY: number;
}

/** The cloud sea: a sheet of cloud with a billowing top that fills the valleys and drifts slowly. */
export interface CloudSeaMood {
  /** Mean height of the top surface and how far it wobbles up and down, metres. */
  topY: number;
  topVariation: number;
  /** Where the sheet ends below (it is dense above this). */
  bottomY: number;
  /** Extinction inside the sheet, 1/m. */
  density: number;
  /** Size of the largest billows, metres. */
  scale: number;
  /** Drift in metres per second along x and z. */
  drift: readonly [number, number];
  litColor: number;
  shadeColor: number;
}

export interface ShaftsMood {
  /** 0 turns the light shafts off. */
  strength: number;
  /** Falloff along the shaft, 0..1 per step (higher reaches further). */
  decay: number;
  color: number;
}

export interface BloomMood {
  strength: number;
  /** Scene brightness (linear, before tone mapping) where bloom starts. */
  threshold: number;
}

export interface GradeMood {
  /** Tint pushed into shadows (cool) and highlights (warm). */
  shadowTint: number;
  highlightTint: number;
  /** 1 is neutral. */
  saturation: number;
  contrast: number;
  /** 0..1 darkening at the corners. */
  vignette: number;
}

/** Region the sun's shadow map must cover with usable resolution (the buildings), in world metres. */
export interface ShadowMood {
  min: Vec3;
  max: Vec3;
  mapSize: number;
}

/**
 * The light and air of a place: one time of day, one palette. Data only.
 * `createPipeline` turns it into lights, sky, haze, cloud sea and post-processing.
 * The first block of fields is the baseline; every field after `exposure` is optional and has a default
 * (see `atmosphere/defaults.ts`), so a place only states what is special about its air.
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
  /** Colour at the horizon; also the clear colour behind everything. */
  horizonColor: number;
  /** Baseline fog distances in metres. The haze model supersedes them; kept for places that rely on plain fog. */
  fogNear: number;
  fogFar: number;
  exposure: number;

  sky?: Partial<SkyMood>;
  haze?: Partial<HazeMood>;
  cloudSea?: Partial<CloudSeaMood> | false;
  shafts?: Partial<ShaftsMood>;
  bloom?: Partial<BloomMood>;
  grade?: Partial<GradeMood>;
  shadow?: Partial<ShadowMood>;
}
