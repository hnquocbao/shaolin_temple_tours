import type { Solid } from '../../places/types';
import type { TreeInstance } from './scatter';
import { SPECIES } from './species';

/** A thin box around one trunk, for trees the hero can bump into (courtyard trees). Forest trees have none. */
export function trunkSolid(tree: TreeInstance): Solid {
  const info = SPECIES[tree.species];
  const r = Math.max(0.2, info.trunkRadius * tree.scale * 0.8);
  const h = Math.max(1.2, info.trunkHeight * tree.scale * tree.stretch);
  return { min: [tree.x - r, tree.y - 0.5, tree.z - r], max: [tree.x + r, tree.y + h, tree.z + r] };
}

export function trunkSolids(trees: readonly TreeInstance[]): Solid[] {
  return trees.map(trunkSolid);
}
