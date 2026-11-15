import { CatmullRomCurve3, Vector3 } from 'three';
import type { CameraStop, Ground, PlaceDef, Solid, Vec3 } from '../places/types';

/**
 * The arrival vista: a short cinematic flight over a place before the player gets control.
 * This file is the maths and the timing only. No DOM, no scene, no randomness: the same stops always
 * give the same camera at the same moment.
 */

export const ARRIVAL = {
  /** Stops whose id starts with this are the flight, in declared order, unless the place says otherwise. */
  prefix: 'arrival-',
  /** Flight length when the place does not say. */
  defaultSeconds: 12,
  /** A flight with a single stop is a still hold of this length at most. */
  holdSeconds: 3,
  /** The camera stays at least this far above `ground.heightAt`, in metres. */
  groundMargin: 8,
  /** How softly the ground clamp bends the path, in metres (bigger is smoother and keeps further clear). */
  groundSoftness: 4,
  /** Blend from the last flight frame to the play camera when the flight ends on its own. */
  handoverSeconds: 1.6,
  /** Blend to the play camera when the player skips. */
  skipSeconds: 0.9,
  /** Resolution of the arc-length table. */
  tableSteps: 800,
  /** Fractions of the flight shown as the extra catalog views, in percent. */
  shotPercents: [0, 25, 50, 75, 100],
} as const;

/** A camera placement: where it is, what it looks at, and its vertical field of view in degrees. */
export interface Pose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

/** Ease-in and ease-out over the whole flight (smoothstep: peak speed is 1.5 times the average). */
export const flightEase = smoothstep;

// ---- which stops, how long

type ArrivalSource = Pick<PlaceDef, 'stops' | 'arrival'>;

/** The stops a place flies through. Throws when an explicit list names a stop the place does not have. */
export function arrivalStops(place: ArrivalSource): CameraStop[] {
  if (place.arrival) {
    return place.arrival.stops.map((id) => {
      const stop = place.stops.find((s) => s.id === id);
      if (!stop) throw new Error(`Arrival stop "${id}" is not a stop of the place. Known: ${place.stops.map((s) => s.id).join(', ')}`);
      return stop;
    });
  }
  return place.stops.filter((s) => s.id.startsWith(ARRIVAL.prefix));
}

export function arrivalSeconds(place: ArrivalSource): number {
  const seconds = place.arrival?.seconds;
  return seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : ARRIVAL.defaultSeconds;
}

/** Catalog ids of the frozen flight views: `flight-00`, `flight-25`, ... `flight-100`. */
export function flightStopId(percent: number): string {
  return `flight-${String(percent).padStart(2, '0')}`;
}

/** The flight fraction (0..1) a catalog id such as `flight-25` stands for; undefined for any other id. */
export function parseFlightStopId(id: string | undefined): number | undefined {
  const m = id === undefined ? null : /^flight-(\d{2,3})$/.exec(id);
  if (!m) return undefined;
  const percent = Number(m[1]);
  return percent <= 100 ? percent / 100 : undefined;
}

// ---- keeping clear of buildings

/**
 * The ground, raised smoothly around solids so the flight clears roofs as well as terrain. Over a solid the
 * surface sits `clearance` metres above its top, and eases back down to the plain ground over `reach` metres.
 */
export function groundWithSolids(ground: Ground, solids: readonly Solid[], clearance = 6, reach = 18): Ground {
  return {
    heightAt(x, z) {
      let h = ground.heightAt(x, z);
      for (const s of solids) {
        const dx = Math.max(s.min[0] - x, 0, x - s.max[0]);
        const dz = Math.max(s.min[2] - z, 0, z - s.max[2]);
        const d = Math.hypot(dx, dz);
        if (d >= reach) continue;
        const k = 1 - smoothstep(d / reach);
        h = Math.max(h, (s.max[1] + clearance) * k);
      }
      return h;
    },
  };
}

// ---- the path

export interface Flight {
  /** Length of the flight in seconds. */
  readonly seconds: number;
  /** The camera at fraction `u` (0..1) of the flight. Eased, so `u` is time over duration. */
  sample(u: number): Pose;
}

/** Smooth maximum: never below either input, bends instead of kinking where they cross, exact when they are `k` or more apart. */
function softMax(a: number, b: number, k: number): number {
  const d = Math.abs(a - b);
  return Math.max(a, b) + (d >= k ? 0 : ((k - d) * (k - d)) / (4 * k));
}

/**
 * A flight through `stops`. Position and look-at target each follow a centripetal Catmull-Rom spline.
 * The spline is walked at an even pace over both paths together, so the camera never speeds up or slows
 * down because stops happen to be spaced unevenly; only the ease at the two ends changes the speed.
 * Returns undefined when there are no stops.
 */
export function createFlight(stops: readonly CameraStop[], ground: Ground, seconds: number = ARRIVAL.defaultSeconds): Flight | undefined {
  const first = stops[0];
  if (!first) return undefined;
  const lift = (position: Vec3): Vec3 => [
    position[0],
    softMax(position[1], ground.heightAt(position[0], position[2]) + ARRIVAL.groundMargin, ARRIVAL.groundSoftness),
    position[2],
  ];

  if (stops.length === 1) {
    const pose: Pose = { position: lift(first.position), target: first.target, fov: first.fov ?? 50 };
    return { seconds: Math.min(seconds, ARRIVAL.holdSeconds), sample: () => pose };
  }

  const toVectors = (list: readonly Vec3[]): Vector3[] => list.map((p) => new Vector3(p[0], p[1], p[2]));
  const positions = new CatmullRomCurve3(toVectors(stops.map((s) => s.position)), false, 'centripetal');
  const targets = new CatmullRomCurve3(toVectors(stops.map((s) => s.target)), false, 'centripetal');
  const fovs = stops.map((s) => s.fov ?? 50);

  // Arc-length table over the curve parameter. Each path counts by its share of its own length, so a
  // sweep of the look-at point counts as much as a sweep of the camera.
  const steps: number = ARRIVAL.tableSteps;
  const pointsP: Vector3[] = [];
  const pointsT: Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    pointsP.push(positions.getPoint(i / steps));
    pointsT.push(targets.getPoint(i / steps));
  }
  const lengthP: number[] = [0];
  const lengthT: number[] = [0];
  for (let i = 1; i <= steps; i++) {
    lengthP.push(lengthP[i - 1]! + pointsP[i]!.distanceTo(pointsP[i - 1]!));
    lengthT.push(lengthT[i - 1]! + pointsT[i]!.distanceTo(pointsT[i - 1]!));
  }
  const totalP = lengthP[steps]!;
  const totalT = lengthT[steps]!;
  const weights = (totalP > 0 ? 1 : 0) + (totalT > 0 ? 1 : 0);
  const cumulative = lengthP.map((p, i) => (totalP > 0 ? p / totalP : 0) + (totalT > 0 ? lengthT[i]! / totalT : 0));

  /** Curve parameter at a given share (0..1) of the combined path. */
  const parameterAt = (share: number): number => {
    if (weights === 0) return share;
    const s = share * weights;
    let lo = 0;
    let hi = steps;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! <= s) lo = mid;
      else hi = mid;
    }
    const span = cumulative[hi]! - cumulative[lo]!;
    const f = span > 0 ? (s - cumulative[lo]!) / span : 0;
    return (lo + clamp01(f)) / steps;
  };

  const fovAt = (t: number): number => {
    const p = t * (fovs.length - 1);
    const i = Math.min(fovs.length - 2, Math.floor(p));
    return lerp(fovs[i]!, fovs[i + 1]!, smoothstep(p - i));
  };

  return {
    seconds,
    sample(u) {
      const t = parameterAt(flightEase(u));
      const p = positions.getPoint(t);
      const q = targets.getPoint(t);
      return { position: lift([p.x, p.y, p.z]), target: [q.x, q.y, q.z], fov: fovAt(t) };
    },
  };
}

// ---- hand-over to the play camera

const sub = (a: Vec3, b: Vec3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

/** Unit vector from `a` to `b`, or +z when they coincide. */
function direction(a: Vec3, b: Vec3): [number, number, number] {
  const d = sub(b, a);
  const l = length(d);
  return l > 1e-9 ? [d[0] / l, d[1] / l, d[2] / l] : [0, 0, 1];
}

function slerp(a: Vec3, b: Vec3, w: number): [number, number, number] {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const theta = Math.acos(dot);
  let r: [number, number, number];
  if (theta < 1e-5 || Math.PI - theta < 1e-5) {
    r = [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];
  } else {
    const s = Math.sin(theta);
    const ka = Math.sin((1 - w) * theta) / s;
    const kb = Math.sin(w * theta) / s;
    r = [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
  }
  const l = length(r) || 1;
  return [r[0] / l, r[1] / l, r[2] / l];
}

/**
 * A pose `w` (0..1) of the way from `from` to `to`: position and field of view blend linearly, and the
 * viewing direction turns along the shortest arc, so there is no pop in position, direction or field of view.
 * `w` of 1 returns `to` exactly.
 */
export function blendPose(from: Pose, to: Pose, w: number): Pose {
  if (w <= 0) return from;
  if (w >= 1) return to;
  const position: Vec3 = [lerp(from.position[0], to.position[0], w), lerp(from.position[1], to.position[1], w), lerp(from.position[2], to.position[2], w)];
  const dir = slerp(direction(from.position, from.target), direction(to.position, to.target), w);
  const reach = lerp(length(sub(from.target, from.position)), length(sub(to.target, to.position)), w) || 1;
  return {
    position,
    target: [position[0] + dir[0] * reach, position[1] + dir[1] * reach, position[2] + dir[2] * reach],
    fov: lerp(from.fov, to.fov, w),
  };
}

/** How far a blend has got, easing in and out. */
export const blendWeight = (elapsed: number, duration: number): number => smoothstep(duration > 0 ? elapsed / duration : 1);

export type ArrivalPhase = 'flight' | 'handover' | 'done';

/**
 * Runs the flight and then the blend to the play camera. Call `step` once per frame with the live play
 * camera; it returns the camera to show. The player has control from the moment the phase leaves 'flight'.
 */
export class ArrivalDirector {
  phase: ArrivalPhase = 'flight';
  private elapsed = 0;
  private blendElapsed = 0;
  private blendSeconds: number = ARRIVAL.handoverSeconds;
  private from: Pose;
  private shown: Pose;

  constructor(
    readonly flight: Flight,
    private readonly timing: { handoverSeconds: number; skipSeconds: number } = ARRIVAL,
  ) {
    this.from = flight.sample(0);
    this.shown = this.from;
  }

  /** How far through the flight, 0..1. Stays at 1 once it is over. */
  get progress(): number {
    return this.phase === 'flight' ? clamp01(this.elapsed / this.flight.seconds) : 1;
  }

  /** Cut the flight short: blend from where the camera is to the play camera. No effect after the flight. */
  skip(): void {
    if (this.phase !== 'flight') return;
    this.beginHandover(this.shown, this.timing.skipSeconds);
  }

  private beginHandover(from: Pose, seconds: number): void {
    this.phase = 'handover';
    this.from = from;
    this.blendSeconds = seconds;
    this.blendElapsed = 0;
  }

  step(delta: number, live: Pose): Pose {
    if (this.phase === 'done') return live;
    if (this.phase === 'flight') {
      this.elapsed += delta;
      if (this.elapsed < this.flight.seconds) {
        this.shown = this.flight.sample(this.elapsed / this.flight.seconds);
        return this.shown;
      }
      this.shown = this.flight.sample(1);
      this.beginHandover(this.shown, this.timing.handoverSeconds);
      return this.shown;
    }
    this.blendElapsed += delta;
    if (this.blendElapsed >= this.blendSeconds) {
      this.phase = 'done';
      return live;
    }
    this.shown = blendPose(this.from, live, blendWeight(this.blendElapsed, this.blendSeconds));
    return this.shown;
  }
}

// ---- the title during the flight

/** Opacity of the place title over the flight: in near the start, out before the hand-over. */
export function titleOpacity(u: number): number {
  return smoothstep((u - 0.04) / 0.1) * (1 - smoothstep((u - 0.84) / 0.1));
}
