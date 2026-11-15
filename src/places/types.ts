import type { Object3D, Scene } from 'three';
import type { Mood } from '../engine/mood';
import type { Rng } from '../engine/rng';

export type Vec3 = readonly [x: number, y: number, z: number];

/** A named view of a place. The arrival flight, the guided views and the screenshot tool share these. */
export interface CameraStop {
  id: string;
  position: Vec3;
  target: Vec3;
  /** Vertical field of view in degrees. Default 50. */
  fov?: number;
}

export interface PlaceName {
  zh: string;
  vi: string;
  en: string;
}

export interface PlaceContext {
  scene: Scene;
  /** Seeded for this place. Use it for every random choice. */
  rng: Rng;
}

/** Height of walkable ground at a point, in metres. Must be defined everywhere, cheap, and deterministic. */
export interface Ground {
  heightAt(x: number, z: number): number;
}

/**
 * An axis-aligned box the hero cannot walk through and can stand on (hall bodies, walls, terraces' sides).
 * Walkable slopes and stairs belong in `Ground`, not here.
 */
export interface Solid {
  min: Vec3;
  max: Vec3;
}

export interface Spawn {
  position: Vec3;
  /** Heading in radians: 0 faces +z, positive turns towards +x. */
  facing: number;
}

export interface PlaceInstance {
  root: Object3D;
  ground: Ground;
  solids: readonly Solid[];
  /** Where the hero appears, and the last-resort respawn point. */
  spawn: Spawn;
  /** Advance animation. Not called when the scene is frozen. */
  update?(elapsed: number, delta: number): void;
  /** Free GPU resources. */
  dispose(): void;
}

/** One self-contained chapter location: its data, its views and how to build it. */
export interface PlaceDef {
  id: string;
  name: PlaceName;
  /** A workshop scene for developing and checking parts. Never shown to players. */
  dev?: boolean;
  /** The place's one time of day. */
  mood: Mood;
  /** At least one. The first is the default view. */
  stops: readonly CameraStop[];
  build(ctx: PlaceContext): PlaceInstance;
}
