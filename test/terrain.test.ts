import { describe, expect, it } from 'vitest';
import { createRng, seedFrom } from '../src/engine/rng';
import { buildRingGeometry } from '../src/engine/terrain/heightfield';
import { fbm, hash2, ridged, smax, valueNoise } from '../src/engine/terrain/noise';
import {
  PATH_END_Z,
  PATH_START_Z,
  PATH_WIDTH,
  TERRACE_COUNT,
  TERRACE_DEPTH,
  TERRACE_RISE,
  TERRACE_WIDTH,
  TERRAIN_RINGS,
  createShaolinTerrain,
  terraces,
} from '../src/places/shaolin/terrain';

const SEED = seedFrom('shaolin');
const terrain = createShaolinTerrain(SEED);

describe('noise', () => {
  it('is deterministic and stays in range', () => {
    expect(hash2(3, 9, 7)).toBe(hash2(3, 9, 7));
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.91 - 40;
      for (const v of [valueNoise(x, y, 1), fbm(x, y, 2), ridged(x, y, 3)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('smax is never below the larger input', () => {
    expect(smax(3, 10, 4)).toBe(10);
    expect(smax(5, 5, 4)).toBeGreaterThan(5);
  });
});

describe('Shaolin terrain data', () => {
  it('has seven terraces 120 m wide and 44 m deep rising 3.2 m each along +z, centred on x = 0', () => {
    expect(terraces).toHaveLength(TERRACE_COUNT);
    expect(TERRACE_COUNT).toBe(7);
    terraces.forEach((t, i) => {
      expect(t.index).toBe(i);
      expect(t.centerX).toBe(0);
      expect(t.width).toBe(TERRACE_WIDTH);
      expect(t.depth).toBe(TERRACE_DEPTH);
      expect(t.centerZ).toBe(i * TERRACE_DEPTH);
      const previous = terraces[i - 1];
      if (previous) {
        expect(t.top - previous.top).toBeCloseTo(TERRACE_RISE, 9);
        expect(t.centerZ).toBeGreaterThan(previous.centerZ);
      }
      expect(t.flat.minX).toBeLessThan(0);
      expect(t.flat.maxX).toBeGreaterThan(0);
    });
  });
});

describe('heightAt', () => {
  it('is finite everywhere, including far outside the mesh', () => {
    const rng = createRng(5);
    for (let i = 0; i < 4000; i++) {
      const x = (rng() - 0.5) * 12000;
      const z = (rng() - 0.5) * 12000;
      expect(Number.isFinite(terrain.heightAt(x, z))).toBe(true);
    }
    for (const [x, z] of [
      [0, 0],
      [1e6, -1e6],
      [-1e7, 1e7],
      [0.5, -0.25],
    ] as const) {
      expect(Number.isFinite(terrain.heightAt(x, z))).toBe(true);
    }
  });

  it('is repeatable for the same seed and differs for another', () => {
    const again = createShaolinTerrain(SEED);
    const other = createShaolinTerrain(SEED + 1);
    const rng = createRng(9);
    let differs = 0;
    for (let i = 0; i < 500; i++) {
      const x = (rng() - 0.5) * 1600;
      const z = (rng() - 0.5) * 1600;
      expect(again.heightAt(x, z)).toBe(terrain.heightAt(x, z));
      if (other.heightAt(x, z) !== terrain.heightAt(x, z)) differs++;
    }
    expect(differs).toBeGreaterThan(250);
  });

  it('keeps every terrace flat to within 5 cm', () => {
    for (const t of terraces) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let x = t.flat.minX; x <= t.flat.maxX; x += 3) {
        for (let z = t.flat.minZ; z <= t.flat.maxZ; z += 2) {
          const h = terrain.heightAt(x, z);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      expect(hi - lo).toBeLessThan(0.05);
      expect(Math.abs(lo - t.top)).toBeLessThan(0.05);
    }
  });

  it('can be walked along the central axis: no jump larger than a slope', () => {
    let prev = terrain.heightAt(0, -19);
    for (let z = -18.5; z <= 300; z += 0.5) {
      const h = terrain.heightAt(0, z);
      expect(Math.abs(h - prev)).toBeLessThan(0.5);
      prev = h;
    }
  });

  it('climbs the stepped path with no step over 0.5 m between samples 0.5 m apart', () => {
    let biggest = 0;
    let steps = 0;
    // Walk the centre line, and lines 1.5 m either side.
    for (const offset of [0, -1.5, 1.5]) {
      let prev = terrain.heightAt(terrain.pathX(PATH_START_Z + 10) + offset, PATH_START_Z + 10);
      for (let z = PATH_START_Z + 10.5; z <= PATH_END_Z; z += 0.5) {
        const h = terrain.heightAt(terrain.pathX(z) + offset, z);
        const d = Math.abs(h - prev);
        biggest = Math.max(biggest, d);
        if (d > 0.01) steps++;
        prev = h;
      }
    }
    expect(biggest).toBeLessThanOrEqual(0.5);
    expect(steps).toBeGreaterThan(50);
  });

  it('arrives at the first terrace from -z and rises along the way', () => {
    const start = terrain.heightAt(terrain.pathX(PATH_START_Z + 10), PATH_START_Z + 10);
    const end = terrain.heightAt(0, PATH_END_Z + 0.5);
    expect(end).toBeCloseTo(terraces[0]?.top ?? 0, 1);
    expect(end - start).toBeGreaterThan(15);
    expect(terrain.pathSteps.length).toBeGreaterThan(80);
    expect(PATH_WIDTH).toBeGreaterThanOrEqual(4);
  });

  it('is tall: valleys fall far below the first terrace on the east, west and south, and peaks stand above it', () => {
    const top = terraces[0]?.top ?? 0;
    let lowEast = Infinity;
    let lowWest = Infinity;
    let lowSouth = Infinity;
    let highest = -Infinity;
    for (let d = 100; d <= 450; d += 10) {
      lowEast = Math.min(lowEast, terrain.heightAt(d, 100));
      lowWest = Math.min(lowWest, terrain.heightAt(-d, 100));
      lowSouth = Math.min(lowSouth, terrain.heightAt(0, -d - 100));
    }
    for (let x = -1500; x <= 1500; x += 25) {
      for (let z = -500; z <= 2500; z += 25) highest = Math.max(highest, terrain.heightAt(x, z));
    }
    expect(top - lowEast).toBeGreaterThan(100);
    expect(top - lowWest).toBeGreaterThan(100);
    expect(top - lowSouth).toBeGreaterThan(60);
    expect(highest).toBeGreaterThan(250);
  });

  it('has rock spires: columns rising well above the ground around them', () => {
    let spires = 0;
    for (let x = -360; x <= 360; x += 6) {
      for (let z = -200; z <= 480; z += 6) {
        const h = terrain.heightAt(x, z);
        if (h < -20) continue;
        if (Math.abs(x) < 80 && z > -40 && z < 300) continue;
        let around = 0;
        for (let a = 0; a < 8; a++) {
          around += terrain.heightAt(x + Math.cos((a * Math.PI) / 4) * 55, z + Math.sin((a * Math.PI) / 4) * 55);
        }
        if (h - around / 8 > 40) spires++;
      }
    }
    expect(spires).toBeGreaterThan(20);
  });

  it('is cheap: 100k calls take well under a second or two', () => {
    const rng = createRng(3);
    const started = performance.now();
    let sum = 0;
    for (let i = 0; i < 100_000; i++) sum += terrain.heightAt((rng() - 0.5) * 400, (rng() - 0.5) * 700);
    const ms = performance.now() - started;
    expect(Number.isFinite(sum)).toBe(true);
    expect(ms).toBeLessThan(1500);
  });
});

describe('terrain mesh', () => {
  it('agrees with the mesh height function at every vertex and is flat on the terraces', () => {
    const ring = TERRAIN_RINGS[0];
    if (!ring) throw new Error('no rings');
    const geometry = buildRingGeometry(ring, terrain.meshHeightAt);
    const pos = geometry.getAttribute('position');
    let checked = 0;
    for (let i = 0; i < pos.count; i += 97) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const expected = terrain.meshHeightAt(x, z);
      // Skirt vertices hang below their edge; everything else sits on the function.
      if (y < expected - 0.001) continue;
      expect(y).toBeCloseTo(expected, 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const t = terraces.find((tt) => x >= tt.flat.minX && x <= tt.flat.maxX && z >= tt.flat.minZ && z <= tt.flat.maxZ);
      if (t) expect(Math.abs(pos.getY(i) - t.top)).toBeLessThan(0.05);
    }
    geometry.dispose();
  });

  it('stays within the triangle budget', () => {
    let total = 0;
    for (const ring of TERRAIN_RINGS) {
      const g = buildRingGeometry(ring, terrain.meshHeightAt);
      total += (g.getIndex()?.count ?? 0) / 3;
      g.dispose();
    }
    expect(total).toBeLessThanOrEqual(400_000);
    expect(total).toBeGreaterThan(50_000);
  });

  it('treads match heightAt: the surface of every tread is the walkable height', () => {
    for (const step of terrain.pathSteps) {
      expect(terrain.heightAt(step.x, step.z)).toBeCloseTo(step.top, 6);
    }
  });
});
