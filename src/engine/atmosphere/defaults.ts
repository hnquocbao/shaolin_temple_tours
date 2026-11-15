import type {
  BloomMood,
  CloudSeaMood,
  GradeMood,
  HazeMood,
  Mood,
  ShadowMood,
  ShaftsMood,
  SkyMood,
} from '../mood';

/** A mood with every optional block filled in. */
export interface ResolvedMood {
  base: Mood;
  sky: SkyMood;
  haze: HazeMood;
  /** Undefined when the place has no cloud sea. */
  cloudSea: CloudSeaMood | undefined;
  shafts: ShaftsMood;
  bloom: BloomMood;
  grade: GradeMood;
  shadow: ShadowMood;
}

/** Plain, neutral air: a clear day with light haze and no cloud sea. Places override what they need. */
export function resolveMood(mood: Mood): ResolvedMood {
  const sky: SkyMood = {
    zenith: 0x4f7fc0,
    mid: 0x9fb6d6,
    horizonWarm: mood.horizonColor,
    horizonCool: mood.horizonColor,
    glow: mood.sunColor,
    sunDisc: 30,
    sunRadius: 1.1,
    cloudiness: 0.3,
    ...mood.sky,
  };
  const haze: HazeMood = {
    shade: 0x8fa3c8,
    density: 0.0012,
    heightScale: 320,
    baseY: 0,
    lowDensity: 0,
    lowHeightScale: 60,
    lowBaseY: 0,
    floorY: -100,
    ...mood.haze,
  };
  const cloudSea: CloudSeaMood | undefined =
    mood.cloudSea === false || mood.cloudSea === undefined
      ? undefined
      : {
          topY: -40,
          topVariation: 14,
          bottomY: -120,
          density: 0.06,
          scale: 1400,
          drift: [1.6, 0.6],
          litColor: 0xfff0dc,
          shadeColor: 0x93a6cc,
          ...mood.cloudSea,
        };
  const shafts: ShaftsMood = { strength: 0.0, decay: 0.95, color: mood.sunColor, ...mood.shafts };
  const bloom: BloomMood = { strength: 0.2, threshold: 1.0, ...mood.bloom };
  const grade: GradeMood = {
    shadowTint: 0xffffff,
    highlightTint: 0xffffff,
    saturation: 1,
    contrast: 1,
    vignette: 0.15,
    ...mood.grade,
  };
  const shadow: ShadowMood = {
    min: [-200, -50, -200],
    max: [200, 100, 200],
    mapSize: 2048,
    ...mood.shadow,
  };
  return { base: mood, sky, haze, cloudSea, shafts, bloom, grade, shadow };
}
