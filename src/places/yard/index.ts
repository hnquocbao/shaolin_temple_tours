import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  type Material,
} from 'three';
import type { Mood } from '../../engine/mood';
import type { PlaceDef, PlaceInstance, Solid } from '../types';

/** Golden hour, copied from Shaolin so the dev yard is lit the same way. */
const goldenHour: Mood = {
  sunPosition: [-300, 140, -200],
  sunColor: 0xffc98f,
  sunIntensity: 2.6,
  skyLight: 0xffe2bd,
  groundLight: 0x4a5568,
  ambientIntensity: 0.9,
  horizonColor: 0xe9b98a,
  fogNear: 180,
  fogFar: 900,
  exposure: 1,
};

/**
 * Layout (metres). The hero spawns at (0, 0, -40) facing +z.
 *
 *   z -32..-14  a stepped mound (0.5 m steps), centred on x = 0
 *   x 18..30    a 40 degree ramp up to a 2.5 m plateau, z -30..-20
 *   x 22..23, z -8..12  a 5 m high wall to slide along
 *   x -17..-7, z 5..32  4 m house (long roof)    x 4..16, z 16..28  8 m hall    x -20..-8, z 40..52  12 m tower
 *   z 54..66    two 6 m platforms with a 15 m gap between them (x -20 .. -5)
 */
const MOUND = { halfWidth: 14, centreZ: -23, step: 0.5 };
const RAMP = { x0: 18, x1: 30, z0: -30, z1: -20, slope: Math.tan((40 * Math.PI) / 180), top: 2.5 };

function moundHeight(x: number, z: number): number {
  if (Math.abs(x) > MOUND.halfWidth) return 0;
  const d = Math.abs(z - MOUND.centreZ);
  if (d < 3) return 3 * MOUND.step;
  if (d < 6) return 2 * MOUND.step;
  if (d < 9) return MOUND.step;
  return 0;
}

function rampHeight(x: number, z: number): number {
  if (x < RAMP.x0 || x > RAMP.x1 || z < RAMP.z0 || z > RAMP.z1) return 0;
  return Math.min((x - RAMP.x0) * RAMP.slope, RAMP.top);
}

const heightAt = (x: number, z: number): number => Math.max(moundHeight(x, z), rampHeight(x, z));

const BUILDINGS: readonly { name: string; solid: Solid; color: number; eave: boolean }[] = [
  { name: 'house-4m', solid: { min: [-17, 0, 5], max: [-7, 4, 32] }, color: 0x9a4a3a, eave: true },
  { name: 'hall-8m', solid: { min: [4, 0, 16], max: [16, 8, 28] }, color: 0x8a5a44, eave: true },
  { name: 'tower-12m', solid: { min: [-20, 0, 40], max: [-8, 12, 52] }, color: 0x7a463a, eave: true },
  { name: 'platform-west', solid: { min: [-34, 0, 54], max: [-20, 6, 66] }, color: 0x8d8a84, eave: false },
  { name: 'platform-east', solid: { min: [-5, 0, 54], max: [9, 6, 66] }, color: 0x8d8a84, eave: false },
  { name: 'wall', solid: { min: [22, 0, -8], max: [23, 5, 12] }, color: 0xa39d92, eave: false },
];

export const yard: PlaceDef = {
  id: 'yard',
  name: { zh: '练武场', vi: 'Sân luyện võ', en: 'Training yard' },
  dev: true,
  mood: goldenHour,
  stops: [
    { id: 'overview', position: [-80, 50, -75], target: [0, 4, 25], fov: 50 },
    { id: 'spawn', position: [0, 4.2, -49], target: [0, 1.6, -40], fov: 50 },
    // The opening flight (ST3T-16): high over the yard, then low past the east side, then in behind the hero.
    { id: 'arrival-1', position: [-90, 46, -88], target: [0, 4, 20], fov: 48 },
    { id: 'arrival-2', position: [52, 17, -14], target: [-4, 4, 22], fov: 52 },
    { id: 'arrival-3', position: [0, 11, -62], target: [0, 2.5, -34], fov: 50 },
  ],
  build({ scene }): PlaceInstance {
    const root = new Group();
    root.name = 'yard';
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const material = (color: number): MeshStandardMaterial => {
      const m = new MeshStandardMaterial({ color, roughness: 0.92 });
      materials.push(m);
      return m;
    };
    const stone = material(0x8d8a84);
    const earth = material(0x55604a);
    const roofCap = material(0x4d4a46);

    const add = (geometry: BufferGeometry, m: MeshStandardMaterial, x: number, y: number, z: number): Mesh => {
      geometries.push(geometry);
      const mesh = new Mesh(geometry, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };

    const ground = add(new PlaneGeometry(1200, 1200), earth, 0, 0, 0);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;

    // A faint 10 m grid so speed and distance can be read.
    const grid = new GridHelper(400, 40, 0x6b7560, 0x636c58);
    grid.position.y = 0.03;
    for (const m of Array.isArray(grid.material) ? grid.material : [grid.material]) materials.push(m);
    geometries.push(grid.geometry);
    root.add(grid);

    // The stepped mound: three stacked slabs matching moundHeight.
    for (let i = 0; i < 3; i++) {
      const depth = 18 - i * 6;
      const h = (i + 1) * MOUND.step;
      add(new BoxGeometry(MOUND.halfWidth * 2, h, depth), stone, 0, h / 2, MOUND.centreZ);
    }

    // The ramp: a triangular prism, then the plateau.
    const run = RAMP.top / RAMP.slope;
    const wedge = new Shape();
    wedge.moveTo(0, 0);
    wedge.lineTo(run, 0);
    wedge.lineTo(run, RAMP.top);
    wedge.closePath();
    const wedgeGeo = new ExtrudeGeometry(wedge, { depth: RAMP.z1 - RAMP.z0, bevelEnabled: false });
    add(wedgeGeo, stone, RAMP.x0, 0, RAMP.z0);
    add(new BoxGeometry(RAMP.x1 - RAMP.x0 - run, RAMP.top, RAMP.z1 - RAMP.z0), stone, RAMP.x0 + run + (RAMP.x1 - RAMP.x0 - run) / 2, RAMP.top / 2, (RAMP.z0 + RAMP.z1) / 2);

    const solids: Solid[] = [];
    for (const b of BUILDINGS) {
      const [x0, y0, z0] = b.solid.min;
      const [x1, y1, z1] = b.solid.max;
      solids.push(b.solid);
      add(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material(b.color), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      // A thin dark eave slab makes each roof edge readable from a distance. Visual only.
      if (b.eave) add(new BoxGeometry(x1 - x0 + 1.2, 0.3, z1 - z0 + 1.2), roofCap, (x0 + x1) / 2, y1 - 0.16, (z0 + z1) / 2);
    }

    scene.add(root);
    return {
      root,
      ground: { heightAt },
      solids,
      spawn: { position: [0, 0, -40], facing: 0 },
      dispose() {
        scene.remove(root);
        for (const g of geometries) g.dispose();
        for (const m of materials) m.dispose();
      },
    };
  },
};
