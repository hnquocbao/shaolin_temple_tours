import { MeshStandardMaterial, type DataTexture } from 'three';
import { createNoiseTexture } from './noise-texture';

/**
 * Surface material for height-field terrain. A standard lit material (so sun, shadows and ambient light
 * work as for everything else) whose colour is made in the shader from three things:
 *  - the slope of the ground: steep faces are rock, gentle ones are growth;
 *  - the height: bare rock higher up;
 *  - four per-vertex weights in `aMat`: built-up ground, forest, autumn colour, moss.
 * Rock, growth and earth are projected from three sides (triplanar), so cliffs never show stretched texture.
 * All patterns come from one repeating noise texture; nothing is downloaded.
 */

const VERTEX_PARS = /* glsl */ `
attribute vec4 aMat;
varying vec4 vMat;
varying vec3 vWPos;
varying vec3 vWNormal;
`;

const VERTEX_BODY = /* glsl */ `
vMat = aMat;
vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
vWNormal = normalize(mat3(modelMatrix) * normal);
`;

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D tNoise;
varying vec4 vMat;
varying vec3 vWPos;
varying vec3 vWNormal;

// Each octave is rotated a different amount so the repeat of the texture never lines up into a pattern.
vec4 triNoise(vec3 p, vec3 w, float scale, float turn) {
  mat2 r = mat2(cos(turn), sin(turn), -sin(turn), cos(turn));
  return texture2D(tNoise, r * p.yz * scale) * w.x
       + texture2D(tNoise, r * p.xz * scale + 0.37) * w.y
       + texture2D(tNoise, r * p.xy * scale + 0.71) * w.z;
}
`;

const COLOR_FRAGMENT = /* glsl */ `
vec3 tN = normalize(vWNormal);
vec3 tW = pow(abs(tN), vec3(4.0));
tW /= (tW.x + tW.y + tW.z);
vec3 tP = vWPos;
vec4 nA = triNoise(tP, tW, 0.0173, 0.4);
vec4 nB = triNoise(tP, tW, 0.083, 1.1);
vec4 nC = triNoise(tP, tW, 0.37, 2.3);
// Fine scales that still hold up at 20-50 m: about 50 cm and 18 cm features.
vec4 nD = triNoise(tP, tW, 1.93, 0.7);
vec4 nE = triNoise(tP, tW, 5.41, 1.9);

// Layered rock: horizontal bands that wobble, iron stains running down the face.
float tWarp = (nA.g - 0.5) * 2.0;
float tS1 = texture2D(tNoise, vec2((tP.x + tP.z) * 0.0071 + tWarp * 0.06, tP.y * 0.061 + tWarp * 0.22 + nA.r * 0.45)).r;
float tS2 = texture2D(tNoise, vec2((tP.x - tP.z) * 0.0131 + 0.3, tP.y * 0.17 + tWarp * 0.5 + nB.g * 0.3)).g;
float tStrata = mix(tS1, tS2, 0.35 + 0.35 * nB.r);
float tBands = texture2D(tNoise, vec2((tP.x - tP.z) * 0.0173 + nA.b * 0.1, tP.y * 0.29 + nB.r * 0.5)).g;
float tStreak = texture2D(tNoise, vec2((tP.x + tP.z) * 0.09, tP.y * 0.008 + nA.r * 0.2)).g;
vec3 rockLit = vec3(0.40, 0.33, 0.26);
vec3 rockDark = vec3(0.17, 0.16, 0.17);
vec3 tRock = mix(rockDark, rockLit, clamp(tStrata * 0.8 + tBands * 0.3, 0.0, 1.0));
tRock = mix(tRock, vec3(0.52, 0.30, 0.17), smoothstep(0.55, 0.85, tStreak) * 0.5);
tRock *= 1.0 - 0.3 * pow(nB.b, 3.0);
tRock *= 0.86 + 0.24 * nC.a;
tRock *= 0.82 + 0.36 * nD.r;
tRock *= 0.92 + 0.16 * nE.r;
tRock = mix(tRock, tRock * 0.62, smoothstep(0.7, 0.95, nA.b * 0.5 + nD.b * 0.5) * 0.6);

// Growth: meadow, and dark canopy with sunlit speckle.
vec3 tGrass = mix(vec3(0.20, 0.31, 0.10), vec3(0.38, 0.40, 0.13), nB.g);
vec3 tCanopy = mix(vec3(0.07, 0.18, 0.08), vec3(0.2, 0.34, 0.1), nC.r);
tCanopy *= 0.55 + 0.95 * nC.a;
vec3 tGrowth = mix(tGrass, tCanopy, smoothstep(0.15, 0.55, vMat.y + (nA.r - 0.5) * 0.5));
float tAutumn = vMat.z * smoothstep(0.2, 0.5, vMat.y);
vec3 tLeaf = mix(vec3(0.66, 0.22, 0.06), vec3(0.82, 0.52, 0.10), nB.r);
tGrowth = mix(tGrowth, tLeaf * (0.7 + 0.5 * nC.a), tAutumn * 0.85);

// Slope and height decide how much is rock.
float tSlope = tN.y;
float tCliff = smoothstep(0.62, 0.30, tSlope);
tCliff = clamp(tCliff + (nA.r - 0.5) * 0.5 + (nB.r - 0.5) * 0.25, 0.0, 1.0);
float tHigh = smoothstep(210.0, 380.0, tP.y);
float tRockW = clamp(tCliff * 1.25 + tHigh * 0.7, 0.0, 1.0);
tRockW = smoothstep(0.25, 0.75, tRockW);

vec3 tAlbedo = mix(tGrowth, tRock, tRockW);
// Moss and shrubs cling to ledges and gentle rock.
float tLedge = smoothstep(0.1, 0.7, tSlope) * tRockW * smoothstep(0.35, 0.65, vMat.w + (nB.g - 0.5) * 0.6);
tAlbedo = mix(tAlbedo, tCanopy * 1.5 + vec3(0.03, 0.04, 0.0), tLedge * 0.85);
// Bare earth on moderate ground.
float tEarth = smoothstep(0.58, 0.8, nA.g) * (1.0 - tRockW) * 0.65;
tAlbedo = mix(tAlbedo, vec3(0.42, 0.28, 0.17) * (0.8 + 0.4 * nC.a), tEarth);
// Paved and built ground: terraces and the path.
vec2 tSlab = abs(fract(tP.xz * vec2(0.25, 0.22)) - 0.5);
float tJoint = smoothstep(0.455, 0.49, max(tSlab.x, tSlab.y));
vec3 tStone = vec3(0.47, 0.43, 0.37) * (0.84 + 0.24 * nB.r) * (0.9 + 0.2 * nC.a) * (1.0 - 0.28 * tJoint);
tAlbedo = mix(tAlbedo, tStone, vMat.x * smoothstep(0.7, 0.95, tSlope));
diffuseColor.rgb = tAlbedo;
`;

const NORMAL_FRAGMENT = /* glsl */ `
vec3 tBump = (vec3(nA.g * 0.5 + nB.g * 0.3 + nD.g * 0.2, nC.r * 0.6 + nE.r * 0.4, nA.r * 0.4 + nB.r * 0.3 + nD.r * 0.3) - 0.5) * (0.1 + 0.62 * tRockW);
normal = normalize(normal + (viewMatrix * vec4(tBump, 0.0)).xyz);
`;

export function createTerrainMaterial(noise: DataTexture = createNoiseTexture()): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['tNoise'] = { value: noise };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', COLOR_FRAGMENT)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${NORMAL_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => 'shaolin-terrain-v1';
  const dispose = material.dispose.bind(material);
  material.dispose = () => {
    noise.dispose();
    dispose();
  };
  return material;
}
