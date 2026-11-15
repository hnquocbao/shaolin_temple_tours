import type { Solid } from '../../places/types';
import type { SolidGrid } from './grid';

/**
 * Hero movement as a pure function: no graphics, no DOM, no clock.
 * `stepHero` advances one fixed step; `advance` (sim.ts) runs it from a frame accumulator.
 *
 * Conventions: metres, seconds, y up. Heading 0 faces +z and positive turns towards +x.
 * The hero is a vertical cylinder: radius HERO_RADIUS, height HERO_HEIGHT, origin at the feet.
 *
 * Collision rules for place authors:
 * - Solids block the hero's body: every solid is padded by HERO_RADIUS on the XZ plane. So a DOORWAY
 *   or gap between two solids must be wider than 2 * HERO_RADIUS = 0.7 m to admit the hero; use 0.9 m or more
 *   so a moving hero does not snag. Its clear height must be at least HERO_HEIGHT = 1.7 m (use 1.8 m or more).
 * - The hero STANDS on a solid's top only while its centre is within TOP_OUTSET (0.08 m) of the top's footprint,
 *   so it walks off a roof at the true edge and is not lifted onto thin walls beside it.
 * - Ground (heightAt) is sampled at the centre and on a ring of HERO_RADIUS around it. A ledge higher than
 *   stepUp (0.55 m) or ground steeper than 50 degrees stops the body at its radius, and the hero slides along it.
 * - Ground stairs (0.2 m treads) climb as slopes; ground drops are followed only as far as a 50 degree slope plus
 *   0.15 m per step, so steeper faces are fallen down, not stuck to.
 */

/** Fixed simulation step. Frame rate never changes the result beyond one step of remainder. */
export const FIXED_DT = 1 / 120;

export const HERO_RADIUS = 0.35;
export const HERO_HEIGHT = 1.7;
/** How far past a solid's top footprint the hero's centre may be and still stand on it. */
export const TOP_OUTSET = 0.08;

export const MOVE = {
  /** Plain run, W. */
  runSpeed: 6.5,
  /** Sprint, W + Shift. */
  sprintSpeed: 10.5,
  groundAccel: 60,
  groundDecel: 50,
  /** Air steering for a normal jump and for a leap. */
  airAccel: 16,
  leapAirAccel: 12,
  /** Normal jump: takeoff speed and gravity (held / released while rising / falling). */
  jumpSpeed: 9.4,
  gravityHeld: 26,
  gravityCut: 46,
  gravityFall: 30,
  /** Lightness skill: sprint + Space. Floaty arc while Space is held. */
  leapUpSpeed: 14,
  leapSpeed: 10.5,
  leapGravityHeld: 11.5,
  leapGravityCut: 34,
  leapGravityFall: 26,
  /** While floating, the fall is capped so the landing is gentle. */
  leapFloatFall: 8,
  maxFall: 45,
  /** Forgiveness: jump just after leaving a ledge, or just before landing. */
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  /** Steepest walkable slope (50 degrees) and how far ahead it is measured. */
  maxSlopeTan: Math.tan((50 * Math.PI) / 180),
  slopeLook: 0.5,
  /** Highest ledge stepped onto in one go (grounded only): solids, and ground steps with the slope rule. */
  stepUp: 0.55,
  /** Most a grounded hero follows ground down in one step: this plus the 50 degree slope allowance. */
  snapDown: 0.6,
  snapSlack: 0.15,
  /** Speed at which a hero overlapping a solid's padding is pushed out. */
  pushOut: 4,
  turnRate: 14,
  /** Below this the hero is out of the world. */
  killY: -40,
  /** Time grounded before a spot counts as safe to respawn at. */
  safeAfter: 0.35,
  /** Time inside a solid before the hero is put back. */
  stuckAfter: 0.75,
} as const;

/** How far above the feet ground may rise before it blocks a hero who is in the air. */
const AIR_STEP = 0.12;
/** An airborne hero is never lifted onto a ledge higher than this. */
const AIR_LAND = 0.1;

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface HeroState extends Vec {
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  grounded: boolean;
  /** True from a lightness leap until landing. */
  leaping: boolean;
  /** Space was held on the previous step (for edge detection). */
  jumpHeld: boolean;
  /** Seconds since the feet last touched the ground. */
  airTime: number;
  /** Seconds the feet have been on the ground. */
  groundTime: number;
  /** Seconds since Space was pressed. Infinity when it was used or never pressed. */
  buffer: number;
  safe: Vec;
  /** Seconds spent inside a solid. */
  stuck: number;
  /** How many times the hero was put back. */
  respawns: number;
}

export interface HeroInput {
  /** Strafe, -1 (left) to 1 (right). */
  moveX: number;
  /** Forward, -1 (back) to 1 (forward). */
  moveZ: number;
  /** Camera heading in radians; movement is relative to it. */
  cameraYaw: number;
  sprint: boolean;
  /** Space held down. */
  jump: boolean;
}

export interface World {
  heightAt(x: number, z: number): number;
  solids: readonly Solid[];
  /** Optional broad phase over `solids`. Without it every solid is tested. */
  grid?: SolidGrid;
  spawn: { x: number; y: number; z: number; facing: number };
  killY: number;
}

export const NO_INPUT: HeroInput = { moveX: 0, moveZ: 0, cameraYaw: 0, sprint: false, jump: false };

const RING_N = 8;
const RING_COS = new Float64Array(RING_N);
const RING_SIN = new Float64Array(RING_N);
for (let i = 0; i < RING_N; i++) {
  RING_COS[i] = Math.cos((i / RING_N) * Math.PI * 2);
  RING_SIN[i] = Math.sin((i / RING_N) * Math.PI * 2);
}

/** Scratch results, so the inner loop allocates nothing. */
const nearBuf: Solid[] = [];
const floorBuf: Solid[] = [];
const respawnBuf: Solid[] = [];
const sv = { x: 0, z: 0 };
let ringNx = 0;
let ringNz = 0;

/** Solids that may touch the box. Returns a shared array: use it before the next query with the same buffer. */
export function nearSolids(world: World, x0: number, z0: number, x1: number, z1: number, buf: Solid[]): readonly Solid[] {
  return world.grid ? world.grid.query(x0, z0, x1, z1, buf) : world.solids;
}

/** Inside a solid's footprint padded by the hero's radius: the hero's centre may not enter this. */
function inPad(s: Solid, x: number, z: number): boolean {
  return x > s.min[0] - HERO_RADIUS && x < s.max[0] + HERO_RADIUS && z > s.min[2] - HERO_RADIUS && z < s.max[2] + HERO_RADIUS;
}

/** Over a solid's top, for standing on it: only slightly outset. */
function onTop(s: Solid, x: number, z: number): boolean {
  return x > s.min[0] - TOP_OUTSET && x < s.max[0] + TOP_OUTSET && z > s.min[2] - TOP_OUTSET && z < s.max[2] + TOP_OUTSET;
}

function floorWith(world: World, near: readonly Solid[], x: number, z: number, y: number, tol: number): number {
  let floor = world.heightAt(x, z);
  for (let i = 0; i < near.length; i++) {
    const s = near[i]!;
    const top = s.max[1];
    if (top > floor && top <= y + tol && onTop(s, x, z)) floor = top;
  }
  return floor;
}

/** Highest surface under (x, z) the feet can be on, given where they are. */
export function floorAt(world: World, x: number, z: number, y: number, tol: number = MOVE.stepUp): number {
  return floorWith(world, nearSolids(world, x - 1, z - 1, x + 1, z + 1, floorBuf), x, z, y, tol);
}

/** Does a hero with feet at y, centred at (x, z), overlap a solid's padded body? */
function overlapsAny(world: World, x: number, y: number, z: number): boolean {
  const near = nearSolids(world, x - 1, z - 1, x + 1, z + 1, respawnBuf);
  for (let i = 0; i < near.length; i++) {
    const s = near[i]!;
    if (inPad(s, x, z) && y + MOVE.stepUp < s.max[1] && y + HERO_HEIGHT > s.min[1]) return true;
  }
  return false;
}

/** Is the ground at (x, z), under feet at y, no steeper than the walkable limit? (Always true on a solid's top.) */
function walkableSlope(world: World, x: number, y: number, z: number): boolean {
  const h = world.heightAt(x, z);
  if (y - h > 0.05) return true;
  const d = 0.3;
  const limit = (MOVE.maxSlopeTan + 0.05) * d;
  return (
    Math.abs(world.heightAt(x + d, z) - h) <= limit &&
    Math.abs(world.heightAt(x - d, z) - h) <= limit &&
    Math.abs(world.heightAt(x, z + d) - h) <= limit &&
    Math.abs(world.heightAt(x, z - d) - h) <= limit
  );
}

export function spawnState(world: World): HeroState {
  const { x, z, facing } = world.spawn;
  const y = Math.max(world.spawn.y, floorAt(world, x, z, world.spawn.y));
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: facing,
    grounded: true,
    leaping: false,
    jumpHeld: false,
    airTime: 0,
    groundTime: 0,
    buffer: Number.POSITIVE_INFINITY,
    safe: { x, y, z },
    stuck: 0,
    respawns: 0,
  };
}

/** Put the hero back at the last safe grounded position, or the place spawn. */
function respawn(state: HeroState, world: World): HeroState {
  const fresh = spawnState(world);
  const safe = state.safe;
  const useSafe = Number.isFinite(safe.x + safe.y + safe.z) && safe.y > world.killY && !overlapsAny(world, safe.x, safe.y, safe.z);
  const at = useSafe ? safe : fresh;
  return {
    ...fresh,
    x: at.x,
    y: at.y,
    z: at.z,
    heading: Number.isFinite(state.heading) ? state.heading : fresh.heading,
    safe: { x: at.x, y: at.y, z: at.z },
    respawns: state.respawns + 1,
  };
}

/** How many of the centre and ring points around (x, z) have ground more than `limit` above the feet. Sets ringNx/Nz. */
function probeGround(world: World, x: number, z: number, y: number, limit: number): number {
  let count = 0;
  let sx = 0;
  let sz = 0;
  if (world.heightAt(x, z) - y > limit) count++;
  for (let i = 0; i < RING_N; i++) {
    if (world.heightAt(x + RING_COS[i]! * HERO_RADIUS, z + RING_SIN[i]! * HERO_RADIUS) - y > limit) {
      count++;
      sx += RING_COS[i]!;
      sz += RING_SIN[i]!;
    }
  }
  ringNx = sx;
  ringNz = sz;
  return count;
}

const OK = 0;
const SOLID = 1;
const GROUND = 2;

/**
 * Can the hero move horizontally from (cx, cz) to (nx, nz)? (dx, dz) is the unit direction of travel.
 * Returns OK, SOLID (blocked by a solid) or GROUND (blocked by terrain; ringNx/Nz then hold the obstacle direction).
 */
function canMove(
  world: World,
  near: readonly Solid[],
  grounded: boolean,
  y: number,
  cx: number,
  cz: number,
  nx: number,
  nz: number,
  dx: number,
  dz: number,
  curViol: number,
): number {
  // Only a grounded hero steps up onto a ledge; one in the air must clear it.
  const tol = grounded ? MOVE.stepUp : AIR_LAND;
  for (let i = 0; i < near.length; i++) {
    const b = near[i]!;
    if (inPad(b, nx, nz) && y + tol < b.max[1] && y + HERO_HEIGHT > b.min[1]) {
      // Already overlapping: moving out is fine, so the hero is never pinned.
      if (!inPad(b, cx, cz)) return SOLID;
      const dNew = Math.min(nx - (b.min[0] - HERO_RADIUS), b.max[0] + HERO_RADIUS - nx, nz - (b.min[2] - HERO_RADIUS), b.max[2] + HERO_RADIUS - nz);
      const dNow = Math.min(cx - (b.min[0] - HERO_RADIUS), b.max[0] + HERO_RADIUS - cx, cz - (b.min[2] - HERO_RADIUS), b.max[2] + HERO_RADIUS - cz);
      if (dNew >= dNow) return SOLID;
    }
  }
  const limit = grounded ? MOVE.stepUp : AIR_STEP;
  const count = probeGround(world, nx, nz, y, limit);
  if (count > 0 && count > curViol) return GROUND;
  if (grounded && curViol === 0) {
    // Look ahead so steep slopes block while stairs of normal height and 50 degree slopes pass.
    const ahead = world.heightAt(nx + dx * MOVE.slopeLook, nz + dz * MOVE.slopeLook);
    if (ahead - y > MOVE.slopeLook * MOVE.maxSlopeTan + 1e-6) {
      ringNx = dx;
      ringNz = dz;
      return GROUND;
    }
  }
  return OK;
}

function turnTowards(heading: number, target: number, maxDelta: number): number {
  let d = (target - heading) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return heading + Math.max(-maxDelta, Math.min(maxDelta, d));
}

/** Move (vx, vz) towards a target velocity by at most `max`. The result is left in `sv`. */
function steer(vx: number, vz: number, tx: number, tz: number, max: number): void {
  const dx = tx - vx;
  const dz = tz - vz;
  const d = Math.hypot(dx, dz);
  if (d <= max) {
    sv.x = tx;
    sv.z = tz;
  } else {
    sv.x = vx + (dx / d) * max;
    sv.z = vz + (dz / d) * max;
  }
}

/** Advance the hero by one step of `dt` seconds (use FIXED_DT). Returns a new state. */
export function stepHero(state: HeroState, input: HeroInput, dt: number, world: World): HeroState {
  if (!Number.isFinite(state.x + state.y + state.z + state.vx + state.vy + state.vz)) return respawn(state, world);

  // ---- wanted direction, relative to the camera
  let ix = input.moveX;
  let iz = input.moveZ;
  const mag = Math.hypot(ix, iz);
  if (mag > 1) {
    ix /= mag;
    iz /= mag;
  }
  const inputMag = Math.min(mag, 1);
  const sinY = Math.sin(input.cameraYaw);
  const cosY = Math.cos(input.cameraYaw);
  // forward = (sin, cos); right = (-cos, sin)
  const wantX = sinY * iz - cosY * ix;
  const wantZ = cosY * iz + sinY * ix;

  let vx = state.vx;
  let vy = state.vy;
  let vz = state.vz;
  let leaping = state.leaping;
  let grounded = state.grounded;
  let airTime = state.airTime;
  let groundTime = state.groundTime;
  let buffer = state.buffer + dt;
  if (input.jump && !state.jumpHeld) buffer = 0;
  const speedNow = Math.hypot(vx, vz);

  // ---- jump or leap
  const canJump = grounded || airTime <= MOVE.coyoteTime;
  if (canJump && vy <= 0.5 && buffer <= MOVE.jumpBuffer && input.jump) {
    if (input.sprint && inputMag > 0.1 && speedNow > MOVE.sprintSpeed * 0.6) {
      // Lightness skill: the launch keeps the direction of travel.
      vx = (vx / speedNow) * MOVE.leapSpeed;
      vz = (vz / speedNow) * MOVE.leapSpeed;
      vy = MOVE.leapUpSpeed;
      leaping = true;
    } else {
      vy = MOVE.jumpSpeed;
    }
    grounded = false;
    airTime = MOVE.coyoteTime + 1;
    groundTime = 0;
    buffer = Number.POSITIVE_INFINITY;
  }

  // ---- horizontal velocity
  if (grounded) {
    const top = input.sprint ? MOVE.sprintSpeed : MOVE.runSpeed;
    const rate = inputMag > 0.01 ? MOVE.groundAccel : MOVE.groundDecel;
    steer(vx, vz, wantX * inputMag * top, wantZ * inputMag * top, rate * dt);
    vx = sv.x;
    vz = sv.z;
  } else if (inputMag > 0.01) {
    const top = leaping
      ? MOVE.leapSpeed
      : Math.max(input.sprint ? MOVE.sprintSpeed : MOVE.runSpeed, Math.min(speedNow, MOVE.sprintSpeed));
    const rate = leaping ? MOVE.leapAirAccel : MOVE.airAccel;
    steer(vx, vz, wantX * inputMag * top, wantZ * inputMag * top, rate * dt);
    vx = sv.x;
    vz = sv.z;
  }

  // ---- gravity
  const held = input.jump;
  let g: number;
  if (grounded) g = MOVE.gravityFall;
  else if (leaping) g = held ? MOVE.leapGravityHeld : vy > 0 ? MOVE.leapGravityCut : MOVE.leapGravityFall;
  else g = vy > 0 ? (held ? MOVE.gravityHeld : MOVE.gravityCut) : MOVE.gravityFall;
  vy -= g * dt;
  if (leaping && held && vy < -MOVE.leapFloatFall) vy = -MOVE.leapFloatFall;
  vy = Math.max(vy, -MOVE.maxFall);

  let x = state.x;
  let y = state.y;
  let z = state.z;
  const reach = HERO_RADIUS + MOVE.slopeLook + 2.5;
  const near = nearSolids(world, x - reach, z - reach, x + reach, z + reach, nearBuf);

  // ---- push the hero out of any solid's padding (after landing beside a wall, or a respawn)
  let overlap = false;
  let inside = false;
  for (let i = 0; i < near.length; i++) {
    const b = near[i]!;
    if (!(y + (grounded ? MOVE.stepUp : AIR_LAND) < b.max[1] && y + HERO_HEIGHT > b.min[1]) || !inPad(b, x, z)) continue;
    overlap = true;
    if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]) inside = true;
    const dMinX = x - (b.min[0] - HERO_RADIUS);
    const dMaxX = b.max[0] + HERO_RADIUS - x;
    const dMinZ = z - (b.min[2] - HERO_RADIUS);
    const dMaxZ = b.max[2] + HERO_RADIUS - z;
    const m = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);
    const push = Math.min(m, MOVE.pushOut * dt);
    if (m === dMinX) x -= push;
    else if (m === dMaxX) x += push;
    else if (m === dMinZ) z -= push;
    else z += push;
  }

  // ---- horizontal move: try the whole step, slide along terrain, or go one axis at a time past solids
  const limit = grounded ? MOVE.stepUp : AIR_STEP;
  const curViol = probeGround(world, x, z, y, limit);
  const speed = Math.hypot(vx, vz);
  if (speed > 1e-6) {
    const nx = x + vx * dt;
    const nz = z + vz * dt;
    let code = canMove(world, near, grounded, y, x, z, nx, nz, vx / speed, vz / speed, curViol);
    if (code === OK) {
      x = nx;
      z = nz;
    } else if (code === GROUND) {
      // Slide: remove the part of the velocity that points into the obstacle.
      const nl = Math.hypot(ringNx, ringNz);
      const nX = nl > 1e-9 ? ringNx / nl : vx / speed;
      const nZ = nl > 1e-9 ? ringNz / nl : vz / speed;
      const into = vx * nX + vz * nZ;
      if (into > 0) {
        vx -= into * nX;
        vz -= into * nZ;
      }
      const s2 = Math.hypot(vx, vz);
      const tx = x + vx * dt;
      const tz = z + vz * dt;
      if (s2 > 1e-6 && canMove(world, near, grounded, y, x, z, tx, tz, vx / s2, vz / s2, curViol) === OK) {
        x = tx;
        z = tz;
      } else {
        vx = 0;
        vz = 0;
      }
    } else {
      code = canMove(world, near, grounded, y, x, z, nx, z, vx / speed, vz / speed, curViol);
      if (code === OK) x = nx;
      else vx = 0;
      // The look-ahead direction follows what is left of the velocity.
      const s2 = Math.hypot(vx, vz);
      if (s2 > 1e-6 && canMove(world, near, grounded, y, x, z, x, nz, vx / s2, vz / s2, curViol) === OK) z = nz;
      else vz = 0;
    }
  }

  // ---- vertical move
  const wasGrounded = grounded;
  let ny = y + vy * dt;
  if (vy > 0) {
    for (let i = 0; i < near.length; i++) {
      const b = near[i]!;
      if (inPad(b, x, z) && y + HERO_HEIGHT <= b.min[1] + 1e-6 && ny + HERO_HEIGHT > b.min[1]) {
        ny = b.min[1] - HERO_HEIGHT;
        vy = 0;
      }
    }
  }
  const floor = floorWith(world, near, x, z, y, wasGrounded ? MOVE.stepUp : AIR_LAND);
  grounded = false;
  if (vy <= 0) {
    const follow = Math.min(MOVE.snapDown, Math.hypot(x - state.x, z - state.z) * MOVE.maxSlopeTan + MOVE.snapSlack);
    if (ny <= floor + 1e-6 || (wasGrounded && ny - floor <= follow)) {
      ny = floor;
      vy = 0;
      grounded = true;
    }
  }
  y = ny;

  if (grounded) leaping = false;
  airTime = grounded ? 0 : airTime + dt;
  groundTime = grounded ? groundTime + dt : 0;

  // ---- heading follows travel
  let heading = state.heading;
  const hs = Math.hypot(vx, vz);
  if (hs > 0.4 || inputMag > 0.1) {
    const tx = hs > 0.4 ? vx : wantX;
    const tz = hs > 0.4 ? vz : wantZ;
    heading = turnTowards(heading, Math.atan2(tx, tz), MOVE.turnRate * dt);
  }

  let safe = state.safe;
  if (grounded && groundTime >= MOVE.safeAfter && !overlap && walkableSlope(world, x, y, z)) {
    if (Math.abs(x - safe.x) > 0.25 || Math.abs(z - safe.z) > 0.25 || Math.abs(y - safe.y) > 0.05) safe = { x, y, z };
  }

  let next: HeroState = {
    x,
    y,
    z,
    vx,
    vy,
    vz,
    heading,
    grounded,
    leaping,
    jumpHeld: input.jump,
    airTime,
    groundTime,
    buffer,
    safe,
    stuck: inside ? state.stuck + dt : 0,
    respawns: state.respawns,
  };

  // ---- out of the world, or stuck inside something
  if (y < world.killY || next.stuck > MOVE.stuckAfter) next = respawn(next, world);
  return next;
}
