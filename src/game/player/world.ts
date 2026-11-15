import type { PlaceInstance } from '../../places/types';
import { SolidGrid } from './grid';
import { MOVE, type World } from './motion';

/** What the movement code sees of a place. */
export function worldFromPlace(place: PlaceInstance): World {
  const [x, y, z] = place.spawn.position;
  return {
    heightAt: (px, pz) => place.ground.heightAt(px, pz),
    solids: place.solids,
    grid: new SolidGrid(place.solids),
    spawn: { x, y, z, facing: place.spawn.facing },
    killY: MOVE.killY,
  };
}
