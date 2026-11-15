import type { Object3D } from 'three';
import type { Solid } from '../places/types';

/** What every kit factory returns. Frame: origin at the centre of the platform footprint at ground level, front faces -z, +y up, metres. */
export interface Building {
  /** Add this to the scene (position and rotate it to place the building). */
  object: Object3D;
  /** Platform footprint in metres. Roof eaves may overhang it. */
  footprint: { width: number; depth: number };
  /** Highest point above the ground, including roof ornaments and finials. */
  height: number;
  /** Axis-aligned collision boxes in the building's local frame. Doors and passages are left open. */
  solids: Solid[];
  /** Walkable height of the platform and its steps at a local point; 0 outside the platform. */
  heightAt(x: number, z: number): number;
  /** Cost of the building as built: triangles, meshes, and draw calls per frame (main pass plus shadow pass). */
  stats: BuildingStats;
  /** Free GPU resources (geometries, materials, textures). */
  dispose(): void;
}

export interface BuildingStats {
  triangles: number;
  meshes: number;
  /** Meshes drawn in the main pass plus meshes that cast shadows. */
  drawCalls: number;
}
