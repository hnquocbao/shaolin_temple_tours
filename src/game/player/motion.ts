import type { Solid } from '../../places/types';

/**
 * Hero movement as a pure function: no graphics, no DOM, no clock.
 * `stepHero` advances one fixed step; `advance` (sim.ts) runs it from a frame accumulator.
 *
 * Conventions: metres, seconds, y up. Heading 0 faces +z and positive turns towards +x.
 * The hero is a vertical cylinder: radius HERO_RADIUS, height HERO_HEIGHT, origin at the feet.
 */

/** Fixed simulation step. Frame rate never changes the result beyond one step of remainder. */
export const FIXED_DT = 1 / 120;

export const HERO_RADIUS = 0.35;
export const HERO_HEIGHT = 1.7;

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
  /** Highest ledge stepped onto in one go: solids, and ground steps (together with the slope rule). */
  stepUp: 0.55,
  /** Walking down steps and slopes keeps the feet on the ground up to this drop. */
  snapDown: 0.6,
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
  spawn: { x: number; y: number; z: number; facing: number };
  killY: number;
}

export const NO_INPUT: HeroInput = { moveX: 0, moveZ: 0, cameraYaw: 0, sprint: false, jump: false };

function insideFootprint(s: Solid, x: number, z: number): boolean {
  return x > s.min[0] - HERO_RADIUS && x < s.max[0] + HERO_RADIUS && z > s.min[2] - HERO_RADIUS && z < s.max[2] + HERO_RADIUS;
}

/** Highest surface under (x, z) the feet can be on, given where they are. */
export function floorAt(world: World, x: number, z: number, y: number): number {
  let floor = world.heightAt(x, z);
  for (const s of world.solids) {
    const top = s.max[1];
    if (top > floor && top <= y + MOVE.stepUp && insideFootprint(s, x, z)) floor = top;
  }
  return floor;
}

/** Is a hero with feet at y, standing at (x, z), inside a solid's body? */
function embedded(world: World, x: number, y: number, z: number): boolean {
  for (const s of world.solids) {
    if (insideFootprint(s, x, z) && y + MOVE.stepUp < s.max[1] && y + HERO_HEIGHT > s.min[1]) return true;
  }
  return false;
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
  const useSafe = Number.isFinite(safe.x + safe.y + safe.z) && safe.y > world.killY && !embedded(world, safe.x, safe.y, safe.z);
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

/** Can the hero move horizontally to (nx, nz)? (dirX, dirZ) is the unit direction of travel. */
function canMove(world: World, s: HeroState, grounded: boolean, nx: number, nz: number, dirX: number, dirZ: number): boolean {
  const { y } = s;
  for (const b of world.solids) {
    if (insideFootprint(b, nx, nz) && y + MOVE.stepUp < b.max[1] && y + HERO_HEIGHT > b.min[1]) {
      // Already overlapping: moving out is fine, so the hero is never pinned.
      if (!insideFootprint(b, s.x, s.z)) return false;
      const depth = (px: number, pz: number): number =>
        Math.min(px - (b.min[0] - HERO_RADIUS), b.max[0] + HERO_RADIUS - px, pz - (b.min[2] - HERO_RADIUS), b.max[2] + HERO_RADIUS - pz);
      if (depth(nx, nz) >= depth(s.x, s.z)) return false;
    }
  }
  const g = world.heightAt(nx, nz);
  if (!grounded) return g <= y + AIR_STEP;
  if (g > y + MOVE.stepUp) return false;
  // Look ahead: slopes up to 50 degrees and stairs of normal height pass, cliffs and steeper ground block.
  const ahead = world.heightAt(nx + dirX * MOVE.slopeLook, nz + dirZ * MOVE.slopeLook);
  return ahead - y <= MOVE.slopeLook * MOVE.maxSlopeTan + 1e-6;
}

function turnTowards(heading: number, target: number, maxDelta: number): number {
  let d = (target - heading) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return heading + Math.max(-maxDelta, Math.min(maxDelta, d));
}

/** Move (vx, vz) towards a target velocity by at most `max`. */
function steer(vx: number, vz: number, tx: number, tz: number, max: number): [number, number] {
  const dx = tx - vx;
  const dz = tz - vz;
  const d = Math.hypot(dx, dz);
  if (d <= max) return [tx, tz];
  return [vx + (dx / d) * max, vz + (dz / d) * max];
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

  let { vx, vy, vz, leaping, grounded } = state;
  let { airTime, groundTime } = state;
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
    [vx, vz] = steer(vx, vz, wantX * inputMag * top, wantZ * inputMag * top, rate * dt);
  } else if (inputMag > 0.01) {
    const top = leaping
      ? MOVE.leapSpeed
      : Math.max(input.sprint ? MOVE.sprintSpeed : MOVE.runSpeed, Math.min(speedNow, MOVE.sprintSpeed));
    const rate = leaping ? MOVE.leapAirAccel : MOVE.airAccel;
    [vx, vz] = steer(vx, vz, wantX * inputMag * top, wantZ * inputMag * top, rate * dt);
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

  // ---- horizontal move, one axis at a time so walls are slid along
  let { x, y, z } = state;
  const speed = Math.hypot(vx, vz);
  const dirX = speed > 1e-6 ? vx / speed : 0;
  const dirZ = speed > 1e-6 ? vz / speed : 0;
  const nx = x + vx * dt;
  if (canMove(world, { ...state, x, z }, grounded, nx, z, dirX, dirZ)) x = nx;
  else vx = 0;
  const nz = z + vz * dt;
  if (canMove(world, { ...state, x, z }, grounded, x, nz, dirX, dirZ)) z = nz;
  else vz = 0;

  // ---- vertical move
  const wasGrounded = grounded;
  let ny = y + vy * dt;
  if (vy > 0) {
    for (const b of world.solids) {
      if (insideFootprint(b, x, z) && y + HERO_HEIGHT <= b.min[1] + 1e-6 && ny + HERO_HEIGHT > b.min[1]) {
        ny = b.min[1] - HERO_HEIGHT;
        vy = 0;
      }
    }
  }
  const floor = floorAt(world, x, z, y);
  grounded = false;
  if (vy <= 0) {
    if (ny <= floor + 1e-6 || (wasGrounded && ny - floor <= MOVE.snapDown)) {
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

  const inside = embedded(world, x, y, z);
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
    safe: grounded && groundTime >= MOVE.safeAfter && !inside ? { x, y, z } : state.safe,
    stuck: inside ? state.stuck + dt : 0,
    respawns: state.respawns,
  };

  // ---- out of the world, or stuck inside something
  if (y < world.killY || next.stuck > MOVE.stuckAfter) next = respawn(next, world);
  return next;
}
