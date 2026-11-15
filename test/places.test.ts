import { describe, expect, it } from 'vitest';
import { heroes } from '../src/game/heroes';
import { catalog, defaultPlaceId, findPlace, findStop, places, validatePlaces } from '../src/places/registry';
import type { PlaceDef } from '../src/places/types';

describe('place registry', () => {
  it('has valid data for every place', () => {
    expect(validatePlaces(places)).toEqual([]);
  });

  it('opens the default place and its first stop when nothing is asked for', () => {
    const place = findPlace(undefined);
    expect(place.id).toBe(defaultPlaceId);
    expect(findStop(place, undefined)).toBe(place.stops[0]);
  });

  it('names what exists when asked for something unknown', () => {
    expect(() => findPlace('atlantis')).toThrow(/Unknown place "atlantis".*shaolin/);
    expect(() => findStop(findPlace('shaolin'), 'nowhere')).toThrow(/Unknown stop "nowhere".*arrival-1/);
  });

  it('lists every stop in the catalog', () => {
    const total = places.reduce((n, p) => n + p.stops.length, 0);
    const flightViews = catalog().reduce((n, c) => n + c.stops.filter((s) => s.startsWith('flight-')).length, 0);
    expect(catalog().reduce((n, c) => n + c.stops.length, 0)).toBe(total + flightViews);
    for (const c of catalog()) {
      const place = places.find((p) => p.id === c.place)!;
      expect(c.stops.slice(0, place.stops.length)).toEqual(place.stops.map((s) => s.id));
    }
  });

  it('Shaolin keeps the stops other tickets rely on', () => {
    const ids = findPlace('shaolin').stops.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['arrival-1', 'arrival-2', 'arrival-3', 'gate-front']));
  });
});

describe('validatePlaces', () => {
  const base: PlaceDef = {
    id: 'test-place',
    name: { zh: '测', vi: 'Thử', en: 'Test' },
    mood: findPlace('shaolin').mood,
    stops: [{ id: 'a', position: [0, 1, 0], target: [0, 0, 5] }],
    build: () => {
      throw new Error('not built in tests');
    },
  };

  it('accepts a good place', () => {
    expect(validatePlaces([base])).toEqual([]);
  });

  it('reports each kind of bad data', () => {
    const problems = validatePlaces([
      base,
      { ...base },
      { ...base, id: 'Bad Id', name: { zh: '', vi: 'x', en: 'x' }, stops: [] },
      {
        ...base,
        id: 'stops',
        stops: [
          { id: 'a', position: [0, 0, 0], target: [0, 0, 0] },
          { id: 'a', position: [Number.NaN, 0, 0], target: [1, 0, 0], fov: 120 },
        ],
      },
    ]).join('\n');
    expect(problems).toMatch(/duplicate place id "test-place"/);
    expect(problems).toMatch(/not lower-case kebab/);
    expect(problems).toMatch(/needs zh, vi and en names/);
    expect(problems).toMatch(/has no camera stops/);
    expect(problems).toMatch(/looks at its own position/);
    expect(problems).toMatch(/duplicate stop "a"/);
    expect(problems).toMatch(/non-finite number/);
    expect(problems).toMatch(/fov outside/);
  });
});

describe('heroes', () => {
  it('are the three sworn brothers, each with a distinct style', () => {
    expect(heroes.map((h) => h.id)).toEqual(['qiao-feng', 'duan-yu', 'xuzhu']);
    expect(new Set(heroes.map((h) => h.style)).size).toBe(3);
    for (const h of heroes) expect(h.name.zh && h.name.vi && h.name.en).toBeTruthy();
  });
});
