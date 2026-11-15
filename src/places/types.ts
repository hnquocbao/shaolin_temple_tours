import type { Object3D, Scene } from 'three';
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

export interface PlaceInstance {
  root: Object3D;
  /** Advance animation. Not called when the scene is frozen. */
  update?(elapsed: number, delta: number): void;
  /** Free GPU resources. */
  dispose(): void;
}

/** One self-contained chapter location: its data, its views and how to build it. */
export interface PlaceDef {
  id: string;
  name: PlaceName;
  /** At least one. The first is the default view. */
  stops: readonly CameraStop[];
  build(ctx: PlaceContext): PlaceInstance;
}
