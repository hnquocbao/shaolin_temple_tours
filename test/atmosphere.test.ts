import { DirectionalLight, OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { resolveMood } from '../src/engine/atmosphere/defaults';
import { fitSunShadow } from '../src/engine/atmosphere/shadow';
import { displayLuma, toDisplay, wallInShade, wallInSun } from '../src/engine/atmosphere/tonemap';
import { sunDirection } from '../src/engine/atmosphere/uniforms';
import type { Mood } from '../src/engine/mood';
import { shaolin } from '../src/places/shaolin';
import { terraces } from '../src/places/shaolin/terrain';

const bare: Mood = {
  sunPosition: [1, 1, 0],
  sunColor: 0xffffff,
  sunIntensity: 1,
  skyLight: 0xffffff,
  groundLight: 0x444444,
  ambientIntensity: 1,
  horizonColor: 0xaabbcc,
  fogNear: 10,
  fogFar: 100,
  exposure: 1,
};

describe('mood defaults', () => {
  it('fills every optional block for a mood that only has the baseline fields', () => {
    const m = resolveMood(bare);
    expect(m.cloudSea).toBeUndefined();
    expect(m.haze.density).toBeGreaterThan(0);
    expect(m.bloom.strength).toBeGreaterThanOrEqual(0);
    expect(m.shadow.mapSize).toBeGreaterThan(0);
    expect(m.sky.sunRadius).toBeGreaterThan(0);
  });

  it('lets a place override single fields and keeps the rest', () => {
    const m = resolveMood({ ...bare, haze: { density: 0.5 }, cloudSea: { topY: -10 } });
    expect(m.haze.density).toBe(0.5);
    expect(m.haze.heightScale).toBeGreaterThan(0);
    expect(m.cloudSea?.topY).toBe(-10);
    expect(m.cloudSea?.density).toBeGreaterThan(0);
  });

  it('can switch the cloud sea off', () => {
    expect(resolveMood({ ...bare, cloudSea: false }).cloudSea).toBeUndefined();
  });
});

describe('Shaolin golden hour', () => {
  const mood = resolveMood(shaolin.mood);

  it('has a low sun, a cloud sea well below the first terrace and drifting', () => {
    const dir = sunDirection(mood);
    const elevation = (Math.asin(dir.y) * 180) / Math.PI;
    expect(elevation).toBeGreaterThan(3);
    expect(elevation).toBeLessThan(20);
    expect(mood.cloudSea).toBeDefined();
    expect((mood.cloudSea?.topY ?? 0) + (mood.cloudSea?.topVariation ?? 0)).toBeLessThan((terraces[0]?.top ?? 0) - 20);
    const [dx, dz] = mood.cloudSea?.drift ?? [0, 0];
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0);
    expect(Math.hypot(dx, dz)).toBeLessThan(5);
  });

  it('is warm in the light and cool in the shade', () => {
    const sun = shaolin.mood.sunColor;
    const shade = shaolin.mood.skyLight;
    const red = (c: number): number => (c >> 16) & 255;
    const blue = (c: number): number => c & 255;
    expect(red(sun)).toBeGreaterThan(blue(sun));
    expect(blue(shade)).toBeGreaterThan(red(shade));
  });

  it('keeps the shadow region over every terrace', () => {
    for (const t of terraces) {
      expect(mood.shadow.min[0]).toBeLessThanOrEqual(t.flat.minX);
      expect(mood.shadow.max[0]).toBeGreaterThanOrEqual(t.flat.maxX);
      expect(mood.shadow.min[2]).toBeLessThanOrEqual(t.flat.minZ);
      expect(mood.shadow.max[2]).toBeGreaterThanOrEqual(t.flat.maxZ);
      expect(mood.shadow.max[1]).toBeGreaterThan(t.top + 20);
    }
  });
});

describe('sun shadow fit', () => {
  const mood = resolveMood(shaolin.mood);
  const sun = new DirectionalLight(0xffffff, 1);
  fitSunShadow(sun, sunDirection(mood), mood.shadow);

  // Place a camera the way three.js places the shadow camera, then project the region's corners through it.
  const cam = sun.shadow.camera as OrthographicCamera;
  const probe = cam.clone();
  probe.position.copy(sun.position);
  probe.lookAt(sun.target.position);
  probe.updateMatrixWorld();
  probe.updateProjectionMatrix();

  it('contains all eight corners of the region', () => {
    const [min, max] = [mood.shadow.min, mood.shadow.max];
    for (const x of [min[0], max[0]]) {
      for (const y of [min[1], max[1]]) {
        for (const z of [min[2], max[2]]) {
          const p = new Vector3(x, y, z).project(probe);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
          expect(p.z).toBeGreaterThanOrEqual(-1);
          expect(p.z).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('reaches back towards the sun so tall casters outside the region still shade it', () => {
    expect(cam.near).toBeLessThan(sun.position.distanceTo(sun.target.position));
  });

  it('has a usable resolution on the terraces (under 15 cm per texel)', () => {
    const width = cam.right - cam.left;
    const height = cam.top - cam.bottom;
    expect(Math.max(width, height) / mood.shadow.mapSize).toBeLessThan(0.15);
  });
});

describe('shade is lifted, cool and never black', () => {
  const mood = resolveMood(shaolin.mood);
  const grey: [number, number, number] = [0.216, 0.216, 0.216]; // sRGB mid-grey (0x808080) in linear light
  const red: [number, number, number] = [0.45, 0.07, 0.05]; // a mid-toned red wall

  it('a mid-grey wall in full shade stays above luma 0.25 on screen and leans blue', () => {
    const d = toDisplay(wallInShade(grey, mood), mood);
    expect(displayLuma(d)).toBeGreaterThan(0.25);
    expect(d[2]).toBeGreaterThan(d[0]);
  });

  it('a red wall in shade is 25-60% as bright as the same wall in the sun and still reads red', () => {
    const shade = toDisplay(wallInShade(red, mood), mood);
    const sun = toDisplay(wallInSun(red, mood), mood);
    const ratio = displayLuma(shade) / displayLuma(sun);
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.6);
    expect(shade[0]).toBeGreaterThan(shade[1] * 1.5);
  });

  it('even a very dark surface in shade is not crushed to black', () => {
    const coal = toDisplay(wallInShade([0.05, 0.05, 0.05], mood), mood);
    expect(displayLuma(coal)).toBeGreaterThan(0.07);
  });
});
