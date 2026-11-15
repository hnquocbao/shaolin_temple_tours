import { describe, expect, it } from 'vitest';
import {
  ARRIVAL,
  ArrivalDirector,
  arrivalSeconds,
  arrivalStops,
  blendPose,
  createFlight,
  flightStopId,
  groundWithSolids,
  parseFlightStopId,
  titleOpacity,
  type Pose,
} from '../src/game/arrival';
import { catalog, findPlace, places, validatePlaces } from '../src/places/registry';
import type { CameraStop, Ground, PlaceDef } from '../src/places/types';

const flat: Ground = { heightAt: () => 0 };
const stop = (id: string, position: [number, number, number], target: [number, number, number], fov?: number): CameraStop =>
  fov === undefined ? { id, position, target } : { id, position, target, fov };

/** Unevenly spaced stops on purpose: the pace must not follow the spacing. */
const stops: CameraStop[] = [
  stop('arrival-1', [-175, 105, -215], [10, 24, 120], 45),
  stop('arrival-2', [235, 75, 240], [0, 45, 60], 45),
  stop('arrival-3', [-120, 60, 150], [0, 30, 70], 40),
  stop('arrival-4', [0, 34, -110], [0, 16, 60], 50),
];

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Speeds (metres per second) of position and target, sampled finely over the flight. */
function speeds(flight: NonNullable<ReturnType<typeof createFlight>>, n = 2000): { position: number[]; target: number[] } {
  const position: number[] = [];
  const target: number[] = [];
  let prev = flight.sample(0);
  for (let i = 1; i <= n; i++) {
    const next = flight.sample(i / n);
    const dt = flight.seconds / n;
    position.push(dist(prev.position, next.position) / dt);
    target.push(dist(prev.target, next.target) / dt);
    prev = next;
  }
  return { position, target };
}

describe('arrival stops', () => {
  const base = { stops: [stop('a', [0, 1, 0], [0, 0, 5]), stop('arrival-2', [1, 1, 0], [0, 0, 5]), stop('arrival-1', [2, 1, 0], [0, 0, 5])] };

  it('defaults to every arrival- stop in declared order', () => {
    expect(arrivalStops(base).map((s) => s.id)).toEqual(['arrival-2', 'arrival-1']);
  });

  it('uses the explicit list, in the order given', () => {
    expect(arrivalStops({ ...base, arrival: { stops: ['arrival-1', 'a'] } }).map((s) => s.id)).toEqual(['arrival-1', 'a']);
  });

  it('refuses an explicit stop the place does not have', () => {
    expect(() => arrivalStops({ ...base, arrival: { stops: ['nope'] } })).toThrow(/"nope"/);
  });

  it('has no flight without arrival stops', () => {
    expect(arrivalStops({ stops: [base.stops[0]!] })).toEqual([]);
    expect(createFlight([], flat)).toBeUndefined();
  });

  it('flies 12 s unless the place says otherwise', () => {
    expect(arrivalSeconds(base)).toBe(12);
    expect(arrivalSeconds({ ...base, arrival: { stops: ['a'], seconds: 10 } })).toBe(10);
    expect(ARRIVAL.defaultSeconds).toBeGreaterThanOrEqual(10);
    expect(ARRIVAL.defaultSeconds).toBeLessThanOrEqual(15);
  });
});

describe('flight path', () => {
  const flight = createFlight(stops, flat, 12)!;

  it('starts exactly at the first stop and ends exactly at the last', () => {
    const start = flight.sample(0);
    const end = flight.sample(1);
    for (let i = 0; i < 3; i++) {
      expect(start.position[i]).toBeCloseTo(stops[0]!.position[i]!, 6);
      expect(start.target[i]).toBeCloseTo(stops[0]!.target[i]!, 6);
      expect(end.position[i]).toBeCloseTo(stops[3]!.position[i]!, 6);
      expect(end.target[i]).toBeCloseTo(stops[3]!.target[i]!, 6);
    }
    expect(start.fov).toBeCloseTo(45, 9);
    expect(end.fov).toBeCloseTo(50, 9);
  });

  it('passes through every stop', () => {
    const near = (s: CameraStop): number => {
      let best = Infinity;
      for (let i = 0; i <= 4000; i++) best = Math.min(best, dist(flight.sample(i / 4000).position, s.position));
      return best;
    };
    for (const s of stops) expect(near(s)).toBeLessThan(1);
  });

  it('is continuous and has no speed spikes', () => {
    const { position, target } = speeds(flight);
    for (const series of [position, target]) {
      const m = mean(series);
      expect(Math.max(...series) / m).toBeLessThan(3);
    }
  });

  it('eases in and out over the whole flight', () => {
    const { position } = speeds(flight);
    expect(position[0]!).toBeLessThan(mean(position) * 0.1);
    expect(position[position.length - 1]!).toBeLessThan(mean(position) * 0.1);
  });

  it('is deterministic', () => {
    const again = createFlight(stops, flat, 12)!;
    for (const u of [0, 0.13, 0.5, 0.77, 1]) expect(again.sample(u)).toEqual(flight.sample(u));
  });

  it('keeps its field of view between the stops values', () => {
    for (let i = 0; i <= 100; i++) {
      const fov = flight.sample(i / 100).fov;
      expect(fov).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(fov).toBeLessThanOrEqual(50 + 1e-9);
    }
  });

  it('never dips below the ground plus a margin', () => {
    const hill: Ground = { heightAt: (x, z) => 130 * Math.exp(-(x ** 2 + (z + 40) ** 2) / 3000) };
    const over = createFlight(stops, hill, 12)!;
    let lifted = false;
    for (let i = 0; i <= 1000; i++) {
      const p = over.sample(i / 1000).position;
      expect(p[1]).toBeGreaterThanOrEqual(hill.heightAt(p[0], p[2]) + ARRIVAL.groundMargin - 1e-9);
      if (p[1] > flight.sample(i / 1000).position[1] + 1) lifted = true;
    }
    expect(lifted).toBe(true);
    // And it stays smooth where the ground pushes it up.
    const { position } = speeds(over);
    expect(Math.max(...position) / mean(position)).toBeLessThan(3.5);
  });

  it('holds still, briefly, with a single stop', () => {
    const one = createFlight([stops[0]!], flat, 12)!;
    expect(one.seconds).toBeLessThanOrEqual(ARRIVAL.holdSeconds);
    expect(one.sample(0)).toEqual(one.sample(1));
    expect(one.sample(0.5).position[0]).toBeCloseTo(-175, 6);
  });

  it('copes with identical stops', () => {
    const same = createFlight([stops[0]!, { ...stops[0]!, id: 'b' }], flat, 12)!;
    const p = same.sample(0.5);
    expect(p.position.every(Number.isFinite)).toBe(true);
  });
});

describe('clearing buildings', () => {
  const hall = { min: [0, 0, 0] as const, max: [10, 12, 10] as const };
  const raised = groundWithSolids(flat, [hall]);

  it('rises over a solid and falls away smoothly', () => {
    expect(raised.heightAt(5, 5)).toBeGreaterThanOrEqual(12 + 6 - 1e-9);
    expect(raised.heightAt(200, 200)).toBe(0);
    let last = raised.heightAt(10, 5);
    for (let d = 0.1; d < 25; d += 0.1) {
      const h = raised.heightAt(10 + d, 5);
      expect(h).toBeLessThanOrEqual(last + 1e-9);
      expect(last - h).toBeLessThan(0.6);
      last = h;
    }
  });

  it('never lowers the ground', () => {
    const hill: Ground = { heightAt: () => 40 };
    expect(groundWithSolids(hill, [hall]).heightAt(5, 5)).toBeGreaterThanOrEqual(40);
  });
});

describe('hand-over', () => {
  const live: Pose = { position: [0, 3, -48], target: [0, 1.5, -20], fov: 50 };
  const flight = createFlight(stops, flat, 12)!;

  const angleTo = (a: Pose, b: Pose): number => {
    const d = (p: Pose): number[] => {
      const v = [p.target[0] - p.position[0], p.target[1] - p.position[1], p.target[2] - p.position[2]];
      const l = Math.hypot(v[0]!, v[1]!, v[2]!);
      return v.map((c) => c / l);
    };
    const da = d(a);
    const db = d(b);
    return Math.acos(Math.min(1, da[0]! * db[0]! + da[1]! * db[1]! + da[2]! * db[2]!));
  };

  it('blends position, direction and field of view without a pop', () => {
    const from = flight.sample(1);
    expect(blendPose(from, live, 0)).toEqual(from);
    expect(blendPose(from, live, 1)).toEqual(live);
    let prev = from;
    for (let i = 1; i <= 200; i++) {
      const next = blendPose(from, live, i / 200);
      expect(dist(prev.position, next.position)).toBeLessThan(dist(from.position, live.position) * 0.03);
      expect(angleTo(prev, next)).toBeLessThan(0.1);
      expect(Math.abs(next.fov - prev.fov)).toBeLessThan(2);
      prev = next;
    }
  });

  it('turns smoothly, never to a zero vector, when the two views are opposite', () => {
    const behind: Pose = { position: [0, 3, 0], target: [0, 3, -10], fov: 50 };
    const ahead: Pose = { position: [0, 3, 0], target: [0, 3, 10], fov: 50 };
    for (const w of [0.1, 0.5, 0.9, 0.999]) {
      const p = blendPose(behind, ahead, w);
      const d = [p.target[0] - p.position[0], p.target[1] - p.position[1], p.target[2] - p.position[2]];
      expect(Math.hypot(d[0]!, d[1]!, d[2]!)).toBeGreaterThan(5);
      expect(d.every(Number.isFinite)).toBe(true);
    }
    const nearly: Pose = { position: [0, 3, 0], target: [1e-4, 3, 10], fov: 50 };
    expect(blendPose(behind, nearly, 0.5).target.every(Number.isFinite)).toBe(true);
  });

  it('runs the whole flight, then blends, then hands the camera back', () => {
    const director = new ArrivalDirector(flight);
    expect(director.phase).toBe('flight');
    let t = 0;
    const phases = new Set<string>();
    while (director.phase !== 'done' && t < 40) {
      director.step(1 / 30, live);
      phases.add(director.phase);
      t += 1 / 30;
    }
    expect([...phases]).toEqual(['flight', 'handover', 'done']);
    expect(t).toBeGreaterThan(flight.seconds);
    expect(t).toBeLessThan(flight.seconds + ARRIVAL.handoverSeconds + 0.2);
    expect(director.step(1 / 30, live)).toEqual(live);
  });

  it('skip blends monotonically to the play camera within about a second', () => {
    const director = new ArrivalDirector(flight);
    for (let i = 0; i < 100; i++) director.step(1 / 30, live); // about 3.3 s in
    expect(director.phase).toBe('flight');
    const before = director.step(0, live);
    director.skip();
    expect(director.phase).toBe('handover');
    let lastDistance = dist(before.position, live.position);
    let lastAngle = angleTo(before, live);
    let lastFov = Math.abs(before.fov - live.fov);
    let t = 0;
    while (director.phase !== 'done') {
      const pose = director.step(1 / 60, live);
      t += 1 / 60;
      // Never moving away from the play camera.
      expect(dist(pose.position, live.position)).toBeLessThanOrEqual(lastDistance + 1e-9);
      expect(angleTo(pose, live)).toBeLessThanOrEqual(lastAngle + 1e-9);
      expect(Math.abs(pose.fov - live.fov)).toBeLessThanOrEqual(lastFov + 1e-9);
      lastDistance = dist(pose.position, live.position);
      lastAngle = angleTo(pose, live);
      lastFov = Math.abs(pose.fov - live.fov);
      expect(t).toBeLessThan(1.2);
    }
    expect(t).toBeGreaterThan(0.5);
    expect(director.step(1 / 60, live)).toEqual(live);
  });

  it('the first blended frame stays next to the last flight frame', () => {
    const director = new ArrivalDirector(flight);
    director.step(0, live);
    const before = director.step(1 / 30, live);
    director.skip();
    const first = director.step(1 / 60, live);
    expect(dist(before.position, first.position)).toBeLessThan(dist(before.position, live.position) * 0.01);
  });

  it('ignores skip once the flight is over', () => {
    const director = new ArrivalDirector(flight);
    director.step(100, live);
    expect(director.phase).toBe('handover');
    director.skip();
    expect(director.phase).toBe('handover');
  });
});

describe('flight views', () => {
  it('names the frozen views and reads the names back', () => {
    expect(ARRIVAL.shotPercents.map(flightStopId)).toEqual(['flight-00', 'flight-25', 'flight-50', 'flight-75', 'flight-100']);
    expect(parseFlightStopId('flight-25')).toBe(0.25);
    expect(parseFlightStopId('flight-100')).toBe(1);
    expect(parseFlightStopId('flight-00')).toBe(0);
    expect(parseFlightStopId('flight-101')).toBeUndefined();
    expect(parseFlightStopId('arrival-1')).toBeUndefined();
    expect(parseFlightStopId(undefined)).toBeUndefined();
  });

  it('lists them in the catalog only for places with a flight', () => {
    for (const entry of catalog()) {
      const place = places.find((p) => p.id === entry.place)!;
      expect(entry.stops.includes('flight-50')).toBe(arrivalStops(place).length > 0);
    }
    expect(catalog().find((c) => c.place === 'shaolin')!.stops).toContain('flight-100');
    expect(catalog().find((c) => c.place === 'yard')!.stops).toContain('flight-00');
  });

  it('the title is hidden at both ends of the flight and shown in the middle', () => {
    expect(titleOpacity(0)).toBe(0);
    expect(titleOpacity(1)).toBe(0);
    expect(titleOpacity(0.5)).toBe(1);
    expect(titleOpacity(0.15)).toBeGreaterThan(0.9);
    expect(titleOpacity(0.9)).toBeLessThan(0.5);
  });

  it('validates an explicit arrival list', () => {
    const base: PlaceDef = { ...findPlace('yard'), id: 'x' };
    expect(validatePlaces([{ ...base, arrival: { stops: ['overview', 'spawn'], seconds: 10 } }])).toEqual([]);
    expect(validatePlaces([{ ...base, arrival: { stops: ['ghost'] } }]).join()).toMatch(/arrival stop "ghost"/);
  });

  it('every real flight keeps an even pace', () => {
    for (const place of places) {
      const chosen = arrivalStops(place);
      if (chosen.length === 0) continue;
      const { position } = speeds(createFlight(chosen, flat, arrivalSeconds(place))!, 600);
      expect(Math.max(...position) / mean(position)).toBeLessThan(3);
    }
  });
});
