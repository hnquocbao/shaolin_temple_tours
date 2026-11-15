import { describe, expect, it } from 'vitest';
import { createRng, range, seedFrom } from '../src/engine/rng';

describe('rng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
  });

  it('gives different sequences for different seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it('stays in [0, 1) and spreads out', () => {
    const rng = createRng(seedFrom('shaolin'));
    const values = Array.from({ length: 5000 }, rng);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it('seeds differ by text and are stable', () => {
    expect(seedFrom('shaolin')).toBe(seedFrom('shaolin'));
    expect(seedFrom('shaolin')).not.toBe(seedFrom('wuliang'));
  });

  it('range maps into the interval', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = range(rng, -5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });
});
