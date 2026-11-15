import type { Solid, Vec3 } from '../places/types';

/**
 * Moves solids from a building's local frame into the world: turn by `yaw` about the vertical
 * axis (three.js `rotation.y`, radians), then translate. The result is the axis-aligned box that
 * encloses each turned box, so a quarter turn stays exact.
 */
export function placeSolids(solids: readonly Solid[], position: Vec3, yaw = 0): Solid[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return solids.map((box) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const x of [box.min[0], box.max[0]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const wx = x * c + z * s;
        const wz = -x * s + z * c;
        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minZ = Math.min(minZ, wz);
        maxZ = Math.max(maxZ, wz);
      }
    }
    const round = (v: number): number => Math.round(v * 1e6) / 1e6;
    return {
      min: [round(minX + position[0]), box.min[1] + position[1], round(minZ + position[2])],
      max: [round(maxX + position[0]), box.max[1] + position[1], round(maxZ + position[2])],
    };
  });
}

/** Local point to world, with the same turn and shift as `placeSolids`. */
export function toWorld(x: number, z: number, position: Vec3, yaw = 0): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s + position[0], -x * s + z * c + position[2]];
}

/** World point to a building's local frame; the inverse of `toWorld`. */
export function toLocal(wx: number, wz: number, position: Vec3, yaw = 0): [number, number] {
  const dx = wx - position[0];
  const dz = wz - position[2];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}
