import { FIXED_DT, spawnState, stepHero, type HeroInput, type HeroState, type World } from './motion';

/** Fixed-timestep driver: feed it frame times, it steps the hero in FIXED_DT slices. */
export interface Sim {
  state: HeroState;
  /** State one step ago, for smooth drawing between steps. */
  previous: HeroState;
  /** Time not yet simulated, in seconds. */
  accumulator: number;
}

/** Never simulate more than this many steps for one frame; the rest is dropped. */
const MAX_STEPS = 24;

export function createSim(world: World): Sim {
  const state = spawnState(world);
  return { state, previous: state, accumulator: 0 };
}

/**
 * Run the steps this frame's time pays for. `pressed` marks a Space tap seen since the last frame that ran a step:
 * it counts as held for the first step only, so a tap is neither lost nor turned into a hold. Returns the steps run.
 */
export function advance(sim: Sim, input: HeroInput, frameDt: number, world: World, pressed = false): number {
  sim.accumulator += Math.max(0, frameDt);
  let steps = 0;
  const tap: HeroInput = pressed && !input.jump ? { ...input, jump: true } : input;
  while (sim.accumulator >= FIXED_DT - 1e-9 && steps < MAX_STEPS) {
    sim.previous = sim.state;
    sim.state = stepHero(sim.state, steps === 0 ? tap : input, FIXED_DT, world);
    sim.accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS) sim.accumulator = 0;
  if (sim.accumulator < 0) sim.accumulator = 0;
  return steps;
}

/** How far between `previous` and `state` the picture should be, 0..1. */
export function blend(sim: Sim): number {
  return Math.min(1, Math.max(0, sim.accumulator / FIXED_DT));
}
