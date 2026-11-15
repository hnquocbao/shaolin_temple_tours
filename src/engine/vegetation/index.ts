/**
 * Vegetation kit (ST3T-20): trees and foliage for every place. It lives in the engine, next to the terrain tools,
 * because it is made for any ground (a `heightAt` function), not for one building style.
 *
 *   species.ts  four parametric species (pine, cypress, broadleaf in autumn colour, shrub), pure shape generators
 *   scatter.ts  pure scatter: ground function + rules + exclusion zones + explicit placements -> plain tree data
 *   forest.ts   scatterMountainForest: the preset for mountain temples
 *   build.ts    tree data -> instanced meshes (one draw call per species/variant/detail), wind, disposal
 *   solids.ts   trunk collision boxes for hand-placed trees
 *
 * Integration in a place: scatter, build, add `veg.root` to the place root, call `veg.update(elapsed)` from the
 * place's `update`, and `veg.dispose()` from its `dispose`.
 */
export { buildVegetation, type Vegetation, type VegetationOptions, type VegetationStats } from './build';
export { AUTUMN_PALETTE, GREEN_PALETTE, heightRange, mountainForestRules, scatterMountainForest, type MountainForestInput } from './forest';
export {
  inZone,
  scatterTrees,
  siteAt,
  slopeDegrees,
  suitability,
  varyColor,
  type HeightFn,
  type Placement,
  type ScatterInput,
  type Site,
  type SpeciesRule,
  type TreeInstance,
  type Zone,
} from './scatter';
export { trunkSolid, trunkSolids } from './solids';
export { SPECIES, SPECIES_IDS, createTreeGeometry, generateTreeMesh, type Lod, type SpeciesId, type SpeciesInfo } from './species';
