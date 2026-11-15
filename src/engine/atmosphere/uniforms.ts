import { Color, Matrix4, Vector2, Vector3, type DataTexture, type IUniform } from 'three';
import type { ResolvedMood } from './defaults';

/** Shared uniform objects: the sky dome, the haze and the cloud sea all read the same ones. */
export interface AtmosphereUniforms {
  [name: string]: IUniform;
}

const linear = (hex: number): Color => new Color(hex);

/** Unit vector pointing at the sun. */
export function sunDirection(mood: ResolvedMood): Vector3 {
  return new Vector3(...mood.base.sunPosition).normalize();
}

export function createAtmosphereUniforms(mood: ResolvedMood, noise: DataTexture): AtmosphereUniforms {
  const { sky, haze, cloudSea } = mood;
  const sun = sunDirection(mood);
  const lit = cloudSea ? linear(cloudSea.litColor) : linear(0xffffff);
  const shade = cloudSea ? linear(cloudSea.shadeColor) : linear(0x808080);
  return {
    tNoise: { value: noise },
    uSunDir: { value: sun },
    uSkyZenith: { value: linear(sky.zenith) },
    uSkyMid: { value: linear(sky.mid) },
    uSkyHorizonWarm: { value: linear(sky.horizonWarm) },
    uSkyHorizonCool: { value: linear(sky.horizonCool) },
    uSkyGlow: { value: linear(sky.glow) },
    uSunDisc: { value: sky.sunDisc },
    uSunCos: { value: Math.cos((sky.sunRadius * Math.PI) / 180) },
    uCloudiness: { value: sky.cloudiness },
    uSkyDrift: { value: new Vector2(0, 0) },

    uProjInv: { value: new Matrix4() },
    uCamWorld: { value: new Matrix4() },
    uCamPos: { value: new Vector3() },
    uFar: { value: 4000 },

    uHazeShade: { value: linear(haze.shade) },
    uHazeDensity: { value: haze.density },
    uHazeScale: { value: haze.heightScale },
    uHazeBase: { value: haze.baseY },
    uLowDensity: { value: haze.lowDensity },
    uLowScale: { value: haze.lowHeightScale },
    uLowBase: { value: haze.lowBaseY },
    uHazeFloor: { value: haze.floorY },

    uCloudOn: { value: cloudSea ? 1 : 0 },
    uCloudTop: { value: cloudSea?.topY ?? 0 },
    uCloudVar: { value: cloudSea?.topVariation ?? 0 },
    uCloudBottom: { value: cloudSea?.bottomY ?? 0 },
    uCloudDensity: { value: cloudSea?.density ?? 0 },
    uCloudScale: { value: cloudSea?.scale ?? 1000 },
    uCloudDrift: { value: new Vector2(0, 0) },
    uCloudLit: { value: lit },
    uCloudShade: { value: shade },
  };
}
