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

export function advance(sim: Sim, input: HeroInput, frameDt: number, world: World): void {
  sim.accumulator += Math.max(0, frameDt);
  let steps = 0;
  while (sim.accumulator >= FIXED_DT - 1e-9 && steps < MAX_STEPS) {
    sim.previous = sim.state;
    sim.state = stepHero(sim.state, input, FIXED_DT, world);
    sim.accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_STEPS) sim.accumulator = 0;
  if (sim.accumulator < 0) sim.accumulator = 0;
}

/** How far between `previous` and `state` the picture should be, 0..1. */
export function blend(sim: Sim): number {
  return Math.min(1, Math.max(0, sim.accumulator / FIXED_DT));
}
