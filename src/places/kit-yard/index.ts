import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import type { Mood } from '../../engine/mood';
import { createGate, createHall, createPagoda, placeSolids, toLocal, type Building } from '../../kit';
import { createPavingTexture } from '../../kit/textures';
import type { PlaceDef, PlaceInstance, Solid, Vec3 } from '../types';

/** Golden hour, copied from Shaolin: low warm sun from the south-west, cool shade, warm haze. */
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

interface Placed {
  building: Building;
  position: Vec3;
  yaw: number;
}

/**
 * Dev place for the building kit (ST3T-13): every factory on flat stone, with stops for checking
 * the roofs from far, from below a corner and from 15 m. Never shown to players.
 */
export const kitYard: PlaceDef = {
  id: 'kit-yard',
  name: { zh: '营造试验场', vi: 'Sân thử bộ kiến trúc', en: 'Building kit yard' },
  dev: true,
  mood: goldenHour,
  stops: [
    { id: 'overview', position: [-92, 42, -92], target: [12, 10, 52], fov: 52 },
    { id: 'hall-front', position: [0, 3.4, -4], target: [0, 11, 56], fov: 46 },
    { id: 'hall-corner', position: [-19.5, 1.7, 39.5], target: [-12.5, 8.6, 49], fov: 66 },
    { id: 'roof-close', position: [6, 17, 28], target: [4, 14.5, 51], fov: 50 },
    { id: 'pagoda', position: [88, 17, 58], target: [46, 22, 92], fov: 46 },
    { id: 'wall-gate', position: [-72, 3.2, -62], target: [-72, 5.5, -22], fov: 52 },
  ],
  build({ scene, rng }): PlaceInstance {
    const root = new Group();
    root.name = 'kit-yard';

    const paving = createPavingTexture();
    paving.repeat.set(100, 100);
    const groundMat = new MeshStandardMaterial({ map: paving, color: 0xd9cfbd, roughness: 0.95 });
    const groundGeo = new PlaneGeometry(800, 800);
    const ground = new Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);

    const placed: Placed[] = [];
    const put = (building: Building, x: number, z: number, yaw = 0): void => {
      building.object.position.set(x, 0, z);
      building.object.rotation.y = yaw;
      root.add(building.object);
      placed.push({ building, position: [x, 0, z], yaw });
    };

    // Wall with a gate on the near side of the yard.
    put(createGate({ rng }), -72, -22);
    // 3x2-bay single-eave gate hall.
    put(createHall({ widthBays: 3, depthBays: 2, bayWidth: 4.2, bayDepth: 3.8, columnHeight: 4.8, rng }), -48, 30);
    // 5x3-bay double-eave hall, the main building.
    put(createHall({ widthBays: 5, depthBays: 3, eaves: 2, rng }), 0, 56);
    // Small 3x3 hip-roof pavilion.
    put(createHall({ widthBays: 3, depthBays: 3, bayWidth: 3, bayDepth: 3, roof: 'hip', columnHeight: 3.8, platformHeight: 0.8, overhang: 2, windows: true, rng }), 50, 24);
    // Seven-tier pagoda.
    put(createPagoda({ tiers: 7, rng }), 46, 92);

    scene.add(root);

    const solids: Solid[] = placed.flatMap((p) => placeSolids(p.building.solids, p.position, p.yaw));
    return {
      root,
      ground: {
        heightAt(x, z) {
          let h = 0;
          for (const p of placed) {
            const [lx, lz] = toLocal(x, z, p.position, p.yaw);
            const w = p.building.footprint.width / 2 + 6;
            const d = p.building.footprint.depth / 2 + 6;
            if (Math.abs(lx) <= w && Math.abs(lz) <= d) h = Math.max(h, p.building.heightAt(lx, lz));
          }
          return h;
        },
      },
      solids,
      spawn: { position: [0, 0, 8], facing: 0 },
      dispose() {
        scene.remove(root);
        for (const p of placed) p.building.dispose();
        groundGeo.dispose();
        groundMat.dispose();
        paving.dispose();
      },
    };
  },
};
