/** GLSL for the sky and the post-processing chain. Plain strings; three.js compiles them. */

/** The sky gradient, shared by the sky dome and by the haze (so distant ridges fade into exactly the sky behind them). */
export const SKY_CHUNK = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizonWarm;
uniform vec3 uSkyHorizonCool;
uniform vec3 uSkyGlow;

vec3 skyBase(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  float s = max(dot(d, uSunDir), 0.0);
  vec2 hd = normalize(d.xz + vec2(1e-5));
  vec2 hs = normalize(uSunDir.xz + vec2(1e-5));
  float side = 0.5 + 0.5 * dot(hd, hs);
  vec3 horizon = mix(uSkyHorizonCool, uSkyHorizonWarm, smoothstep(0.1, 1.0, side));
  vec3 c = mix(horizon, uSkyMid, smoothstep(0.0, 0.22, h));
  c = mix(c, uSkyZenith, smoothstep(0.12, 0.95, h));
  c += uSkyGlow * (0.22 * pow(s, 4.0) + 0.3 * pow(s, 32.0));
  c += uSkyGlow * 0.3 * pow(s, 2.5) * exp(-h * 8.0);
  return c;
}
`;

export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAGMENT = /* glsl */ `
${SKY_CHUNK}
uniform sampler2D tNoise;
uniform float uSunDisc;
uniform float uSunCos;
uniform float uCloudiness;
uniform vec2 uSkyDrift;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  vec3 c = skyBase(d);
  float s = dot(d, uSunDir);

  // Thin streaks of cloud high up, lit gold near the sun and lilac away from it.
  if (uCloudiness > 0.0 && d.y > 0.02) {
    vec2 q = d.xz / (d.y + 0.18);
    vec2 uv = q * vec2(0.22, 0.5) + uSkyDrift;
    float n = texture2D(tNoise, uv).r * 0.6 + texture2D(tNoise, uv * 2.3 + 0.37).g * 0.4;
    float cover = smoothstep(0.5 - 0.25 * uCloudiness, 0.82, n) * smoothstep(0.02, 0.2, d.y);
    vec3 shade = mix(uSkyMid, uSkyHorizonCool, 0.5) * 0.9;
    vec3 lit = uSkyGlow * 0.9 + uSkyHorizonWarm * 0.4;
    vec3 cloud = mix(shade, lit, clamp(pow(max(s, 0.0), 1.5) * 1.6 + 0.1, 0.0, 1.0));
    c = mix(c, cloud, cover * 0.75 * uCloudiness);
  }

  // The sun itself.
  float disc = smoothstep(uSunCos - 0.00012, uSunCos + 0.00006, s);
  c += uSkyGlow * uSunDisc * disc;
  gl_FragColor = vec4(c, 1.0);
}
`;

/** Haze and cloud sea, applied to the finished scene using its depth. */
export const COMPOSE_FRAGMENT = /* glsl */ `
${SKY_CHUNK}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNoise;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uFar;

uniform vec3 uHazeShade;
uniform float uHazeDensity;
uniform float uHazeScale;
uniform float uHazeBase;
uniform float uLowDensity;
uniform float uLowScale;
uniform float uLowBase;
uniform float uHazeFloor;

uniform float uCloudOn;
uniform float uCloudTop;
uniform float uCloudVar;
uniform float uCloudBottom;
uniform float uCloudDensity;
uniform float uCloudScale;
uniform vec2 uCloudDrift;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;

varying vec2 vUv;

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float expInt(float y0, float dy, float t0, float t1, float rho0, float yb, float H) {
  float k = dy / H;
  float a = rho0 * exp(-(y0 - yb) / H);
  if (abs(k) < 1e-6) return a * (t1 - t0);
  return a * (exp(-k * t0) - exp(-k * t1)) / k;
}

// Optical depth along a ray for a density that thins exponentially with height and stops growing below yc.
float layerOD(float y0, float dy, float D, float rho0, float yb, float H, float yc) {
  float t0 = 0.0;
  float t1 = D;
  if (abs(dy) < 1e-5) {
    if (y0 < yc) t1 = 0.0;
  } else {
    float tc = (yc - y0) / dy;
    if (dy > 0.0) t0 = clamp(tc, 0.0, D);
    else t1 = clamp(tc, 0.0, D);
  }
  float above = expInt(y0, dy, t0, t1, rho0, yb, H);
  float below = (D - (t1 - t0)) * rho0 * exp(-(yc - yb) / H);
  return above + below;
}

float surfaceNoise(vec2 xz) {
  vec2 q = (xz + uCloudDrift) / uCloudScale;
  float a = texture2D(tNoise, q).r;
  float b = texture2D(tNoise, q * 2.7 + vec2(0.31, 0.17)).g;
  float c = texture2D(tNoise, q * 7.3 + vec2(0.71, 0.53)).r;
  return a * 0.5 + b * 0.32 + c * 0.18;
}

void main() {
  vec4 src = texture2D(tColor, vUv);
  float depth = texture2D(tDepth, vUv).r;
  vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 vp = uProjInv * clip;
  vp /= vp.w;
  vec3 wp = (uCamWorld * vp).xyz;
  vec3 ray = wp - uCamPos;
  float dist = length(ray);
  vec3 d = ray / max(dist, 1e-4);
  bool isSky = depth > 0.999999;
  float D = isSky ? uFar : min(dist, uFar);
  vec3 color = src.rgb;

  // Cloud sea: a slab of cloud with a billowing top, marched in a few steps.
  if (uCloudOn > 0.5) {
    float yTop = uCloudTop + uCloudVar + 4.0;
    float yBot = uCloudBottom;
    float tA = 0.0;
    float tB = 0.0;
    if (abs(d.y) < 1e-4) {
      if (uCamPos.y < yTop && uCamPos.y > yBot) tB = D;
    } else {
      float t1 = (yTop - uCamPos.y) / d.y;
      float t2 = (yBot - uCamPos.y) / d.y;
      tA = max(min(t1, t2), 0.0);
      tB = min(max(t1, t2), D);
    }
    if (tB > tA) {
      const int N = 14;
      float stp = (tB - tA) / float(N);
      float jitter = ign(gl_FragCoord.xy);
      float T = 1.0;
      vec3 acc = vec3(0.0);
      float sdot = max(dot(d, uSunDir), 0.0);
      vec2 sunXZ = normalize(uSunDir.xz + vec2(1e-5));
      for (int i = 0; i < N; i++) {
        float t = tA + (float(i) + jitter) * stp;
        vec3 p = uCamPos + d * t;
        float n = surfaceNoise(p.xz);
        float topY = uCloudTop + (n - 0.5) * 2.0 * uCloudVar;
        float below = topY - p.y;
        float dens = smoothstep(-5.0, 12.0, below) * smoothstep(uCloudBottom, uCloudBottom + 40.0, p.y);
        dens *= uCloudDensity * (0.6 + 0.8 * n);
        if (dens > 1e-4) {
          float nSun = surfaceNoise(p.xz + sunXZ * 26.0);
          float slope = (nSun - n) * 2.0 * uCloudVar;
          float facing = clamp(0.6 - slope * 0.26, 0.0, 1.0);
          float surf = exp(-max(below, 0.0) * 0.04);
          float L = clamp(facing * (0.3 + 0.7 * surf), 0.0, 1.0);
          vec3 col = mix(uCloudShade, uCloudLit * (1.0 + 1.6 * pow(sdot, 5.0)), L * L);
          col += uSkyGlow * 0.3 * pow(sdot, 3.0) * surf * facing;
          float a = 1.0 - exp(-dens * stp);
          acc += T * a * col;
          T *= 1.0 - a;
        }
      }
      color = color * T + acc;
    }
  }

  // Aerial haze: two exponential layers, warm towards the sun and lit up high, cool and blue in the valleys.
  if (!isSky) {
    float od = layerOD(uCamPos.y, d.y, D, uHazeDensity, uHazeBase, uHazeScale, uHazeFloor);
    od += layerOD(uCamPos.y, d.y, D, uLowDensity, uLowBase, uLowScale, uHazeFloor);
    float T = exp(-od);
    float yMid = uCamPos.y + d.y * D * 0.6;
    float lit = smoothstep(-130.0, 70.0, yMid);
    vec3 horizonSky = skyBase(normalize(vec3(d.x, 0.02 + max(d.y, 0.0) * 0.5, d.z)));
    vec3 hz = mix(uHazeShade * (0.7 + 0.5 * max(dot(d, uSunDir), 0.0)), horizonSky, lit);
    color = color * T + hz * (1.0 - T);
    // Where the ground meets the far plane it must have become the sky exactly.
    float edge = smoothstep(0.7 * uFar, 0.97 * uFar, D);
    color = mix(color, skyBase(d), edge);
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

/** Light shafts: smear bright sky towards the sun's position on screen, but only where something blocks it. */
export const SHAFT_FRAGMENT = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uSunUv;
uniform float uSunVisible;
uniform vec3 uShaftColor;
uniform float uStrength;
uniform float uDecay;
varying vec2 vUv;

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  if (uSunVisible < 0.5 || uStrength <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  const int N = 24;
  vec2 delta = (uSunUv - vUv) / float(N);
  vec2 uv = vUv + delta * ign(gl_FragCoord.xy * 2.0);
  float illum = 1.0;
  float sum = 0.0;
  for (int i = 0; i < N; i++) {
    uv += delta;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    float sky = step(0.999999, texture2D(tDepth, uv).r);
    sum += sky * inside * illum;
    illum *= uDecay;
  }
  sum /= float(N);
  float r = length((vUv - uSunUv) * vec2(1.78, 1.0));
  float falloff = 1.0 / (1.0 + r * r * 2.5);
  gl_FragColor = vec4(uShaftColor * sum * falloff * uStrength, 1.0);
}
`;

export const BRIGHT_FRAGMENT = /* glsl */ `
uniform sampler2D tSource;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSource, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  gl_FragColor = vec4(min(c * k, vec3(24.0)), 1.0);
}
`;

export const BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSource, vUv).rgb * 0.2270270270;
  c += (texture2D(tSource, vUv + uStep * 1.3846153846).rgb + texture2D(tSource, vUv - uStep * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tSource, vUv + uStep * 3.2307692308).rgb + texture2D(tSource, vUv - uStep * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

export const FINAL_FRAGMENT = /* glsl */ `
uniform sampler2D tComp;
uniform sampler2D tBloom0;
uniform sampler2D tBloom1;
uniform sampler2D tBloom2;
uniform sampler2D tBloom3;
uniform sampler2D tShaft;
uniform float uExposure;
uniform float uBloom;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
varying vec2 vUv;

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec3 c = texture2D(tComp, vUv).rgb;
  vec3 bloom = texture2D(tBloom0, vUv).rgb * 0.35 + texture2D(tBloom1, vUv).rgb * 0.3
             + texture2D(tBloom2, vUv).rgb * 0.22 + texture2D(tBloom3, vUv).rgb * 0.18;
  c += bloom * uBloom;
  c += texture2D(tShaft, vUv).rgb;
  c *= uExposure;

  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c *= mix(uShadowTint, uHighlightTint, smoothstep(0.04, 1.1, l));
  c = aces(c);
  c = srgb(c);
  c = (c - 0.5) * uContrast + 0.5;

  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
