import { describe, expect, it } from 'vitest';
import { SceneClock } from '../src/engine/clock';

describe('SceneClock', () => {
  it('advances by the time between ticks', () => {
    const clock = new SceneClock(false);
    clock.tick(1000);
    expect(clock.elapsed).toBe(0);
    clock.tick(1016);
    expect(clock.delta).toBeCloseTo(0.016);
    expect(clock.elapsed).toBeCloseTo(0.016);
  });

  it('never advances when frozen', () => {
    const clock = new SceneClock(true, 12);
    clock.tick(0);
    clock.tick(5000);
    expect(clock.delta).toBe(0);
    expect(clock.elapsed).toBe(12);
  });

  it('caps a long gap and ignores time going backwards', () => {
    const clock = new SceneClock(false);
    clock.tick(0);
    clock.tick(60_000);
    expect(clock.delta).toBe(0.1);
    clock.tick(59_000);
    expect(clock.delta).toBe(0);
  });
});
