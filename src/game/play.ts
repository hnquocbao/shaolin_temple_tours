import type { PerspectiveCamera, Scene } from 'three';
import type { PlaceInstance } from '../places/types';

/** Live play in a place: the hero, the camera that follows, and input. */
export interface Play {
  /** Advance by `delta` seconds. Not called when the scene is frozen. */
  update(elapsed: number, delta: number): void;
  /** Where the hero is, for the probe and for tests. */
  heroPosition(): { x: number; y: number; z: number };
  dispose(): void;
}

export interface PlayContext {
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: PerspectiveCamera;
  place: PlaceInstance;
}

/**
 * Stub until ST3T-15 (movement) and ST3T-17 (placeholder hero): stands at the place's spawn
 * and looks along its facing. The signature is the contract with app.ts.
 */
export function createPlay({ camera, place }: PlayContext): Play {
  const [x, , z] = place.spawn.position;
  const y = place.ground.heightAt(x, z);
  camera.position.set(x - Math.sin(place.spawn.facing) * 9, y + 4.2, z - Math.cos(place.spawn.facing) * 9);
  camera.lookAt(x, y + 1.6, z);
  return {
    update() {},
    heroPosition: () => ({ x, y, z }),
    dispose() {},
  };
}
