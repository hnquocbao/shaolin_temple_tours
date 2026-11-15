/**
 * Building kit v1 (ST3T-13): parametric Chinese timber buildings for every place.
 *
 * Every factory returns a `Building`: `object`, `footprint`, `height`, `solids`, `heightAt`,
 * `stats` and `dispose()`. Frame: origin at the centre of the platform footprint at ground level,
 * front faces -z, +y up, metres. See each factory's doc comment for its contract.
 */
export { createHall, type HallParams } from './hall';
export { createPagoda, type PagodaParams } from './pagoda';
export { createWall, type WallParams } from './wall';
export { createGate, type GateParams } from './gate';
export { darkTilePalette, templePalette, type Palette } from './palette';
export { placeSolids, toLocal, toWorld } from './solids';
export { createRoofShape, type RoofShape, type RoofShapeParams } from './roof-shape';
export type { Building, BuildingStats } from './types';
