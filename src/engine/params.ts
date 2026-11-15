/** Options read from the page URL. They make any view reproducible by link. */
export interface RunParams {
  /** Place id to open. Undefined means the default place. */
  place: string | undefined;
  /** Camera stop id inside the place. Undefined means the place's first stop. */
  stop: string | undefined;
  /** Fixed time, no animation, seeded randomness: two runs give the same frame. */
  freeze: boolean;
  /** Show the DOM interface. Off for clean screenshots with `?ui=0`. */
  ui: boolean;
}

const TRUE = new Set(['1', 'true', 'yes', 'on', '']);

function flag(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return TRUE.has(value.toLowerCase());
}

function id(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(trimmed) ? trimmed : undefined;
}

export function parseRunParams(search: string): RunParams {
  const q = new URLSearchParams(search);
  return {
    place: id(q.get('place')),
    stop: id(q.get('stop')),
    freeze: flag(q.get('freeze'), false),
    ui: flag(q.get('ui'), true),
  };
}
