import type { CameraStop, PlaceDef } from './types';
import { kitYard } from './kit-yard';
import { shaolin } from './shaolin';
import { yard } from './yard';

export const places: readonly PlaceDef[] = [shaolin, kitYard, yard];

export const defaultPlaceId = shaolin.id;

export function findPlace(id: string | undefined): PlaceDef {
  const place = places.find((p) => p.id === (id ?? defaultPlaceId));
  if (!place) throw new Error(`Unknown place "${id}". Known: ${places.map((p) => p.id).join(', ')}`);
  return place;
}

export function findStop(place: PlaceDef, id: string | undefined): CameraStop {
  const stop = id === undefined ? place.stops[0] : place.stops.find((s) => s.id === id);
  if (!stop) {
    throw new Error(`Unknown stop "${id}" in place "${place.id}". Known: ${place.stops.map((s) => s.id).join(', ')}`);
  }
  return stop;
}

/** What the screenshot tool reads to know every view that exists. */
export function catalog(): { place: string; dev: boolean; stops: string[] }[] {
  return places.map((p) => ({ place: p.id, dev: p.dev === true, stops: p.stops.map((s) => s.id) }));
}

/** Problems in the place data. Empty means valid. Used by tests. */
export function validatePlaces(list: readonly PlaceDef[]): string[] {
  const problems: string[] = [];
  const idPattern = /^[a-z0-9][a-z0-9-]*$/;
  const seenPlaces = new Set<string>();
  for (const p of list) {
    if (!idPattern.test(p.id)) problems.push(`place id "${p.id}" is not lower-case kebab`);
    if (seenPlaces.has(p.id)) problems.push(`duplicate place id "${p.id}"`);
    seenPlaces.add(p.id);
    if (!p.name.zh || !p.name.vi || !p.name.en) problems.push(`place "${p.id}" needs zh, vi and en names`);
    if (p.stops.length === 0) problems.push(`place "${p.id}" has no camera stops`);
    const seenStops = new Set<string>();
    for (const s of p.stops) {
      if (!idPattern.test(s.id)) problems.push(`stop id "${s.id}" in "${p.id}" is not lower-case kebab`);
      if (seenStops.has(s.id)) problems.push(`duplicate stop "${s.id}" in "${p.id}"`);
      seenStops.add(s.id);
      const numbers = [...s.position, ...s.target, s.fov ?? 50];
      if (!numbers.every(Number.isFinite)) problems.push(`stop "${s.id}" in "${p.id}" has a non-finite number`);
      if (s.position.every((v, i) => v === s.target[i])) {
        problems.push(`stop "${s.id}" in "${p.id}" looks at its own position`);
      }
      if (s.fov !== undefined && (s.fov < 15 || s.fov > 90)) {
        problems.push(`stop "${s.id}" in "${p.id}" has fov outside 15–90`);
      }
    }
  }
  return problems;
}
