import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Mood } from '../../engine/mood';
import type { PlaceDef, PlaceInstance, Solid } from '../types';
import { TERRACE_COUNT, buildShaolinTerrainMesh, createShaolinTerrain, terraces } from './terrain';

/** Golden hour: low warm sun from the south-west, cool shade, warm haze. */
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
 * Shaolin Temple on Mount Shaoshi.
 *
 * ST3T-11 gave it its ground (`terrain.ts`). Atmosphere (ST3T-12), the building kit (ST3T-13)
 * and the real layout (ST3T-14) replace the gray placeholder halls while keeping the stop ids.
 */
export const shaolin: PlaceDef = {
  id: 'shaolin',
  name: { zh: '少室山少林寺', vi: 'Thiếu Lâm Tự, núi Thiếu Thất', en: 'Shaolin Temple, Mount Shaoshi' },
  mood: goldenHour,
  stops: [
    { id: 'arrival-1', position: [-220, 150, -260], target: [0, 20, 120], fov: 45 },
    { id: 'arrival-2', position: [160, 90, -120], target: [0, 15, 140], fov: 45 },
    { id: 'arrival-3', position: [0, 34, -110], target: [0, 16, 60], fov: 50 },
    { id: 'gate-front', position: [0, 3, -42], target: [0, 6, 0], fov: 55 },
  ],
  build({ scene, rng }): PlaceInstance {
    const root = new Group();
    root.name = 'shaolin';

    const terrain = createShaolinTerrain(Math.floor(rng() * 4294967296));
    const land = buildShaolinTerrainMesh(terrain, terrain.seed);
    root.add(land.root);

    const wall = new MeshStandardMaterial({ color: 0x9a4a3a, roughness: 0.85 });
    const roof = new MeshStandardMaterial({ color: 0x4d4a46, roughness: 0.8 });
    const materials = [wall, roof];
    const geometries: (BoxGeometry | ConeGeometry)[] = [];

    // One placeholder hall per terrace, standing on its flat top: a stand-in for the central axis.
    const solids: Solid[] = [];
    for (let i = 0; i < TERRACE_COUNT; i++) {
      const terrace = terraces[i];
      if (!terrace) continue;
      const height = terrace.top;
      const z = terrace.centerZ;
      const hallWidth = 20 + (i % 3) * 6;
      const hallHeight = 7 + (i % 2) * 3;
      const body = new Mesh(new BoxGeometry(hallWidth, hallHeight, 14), wall);
      body.position.set(0, height + hallHeight / 2, z);
      body.castShadow = true;
      body.receiveShadow = true;

      const cap = new Mesh(new ConeGeometry(hallWidth * 0.82, 5.5, 4), roof);
      cap.rotation.y = Math.PI / 4;
      cap.scale.z = 0.72;
      cap.position.set(0, height + hallHeight + 2.75, z);
      cap.castShadow = true;

      solids.push({
        min: [-hallWidth / 2, height, z - 7],
        max: [hallWidth / 2, height + hallHeight, z + 7],
      });
      geometries.push(body.geometry, cap.geometry);
      root.add(body, cap);
    }

    scene.add(root);

    return {
      root,
      ground: { heightAt: terrain.heightAt },
      solids,
      spawn: { position: [0, terrain.heightAt(0, -40), -40], facing: 0 },
      dispose() {
        scene.remove(root);
        land.dispose();
        for (const g of geometries) g.dispose();
        for (const m of materials) m.dispose();
      },
    };
  },
};
