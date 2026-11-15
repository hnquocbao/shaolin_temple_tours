import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Mood } from '../../engine/mood';
import type { PlaceDef, PlaceInstance, Solid } from '../types';
import { TERRACE_COUNT, buildShaolinTerrainMesh, createShaolinTerrain, terraces } from './terrain';

/**
 * Golden hour: a low warm sun from the north-west, cool blue shade, warm haze, and a sea of cloud
 * filling the valleys about 80 m below the first terrace. Everything else is in the air, not in the geometry.
 */
const goldenHour: Mood = {
  sunPosition: [-757, 156, 635],
  sunColor: 0xffbf80,
  sunIntensity: 3.4,
  skyLight: 0x8aa4d6,
  groundLight: 0x7a5f4a,
  ambientIntensity: 0.9,
  horizonColor: 0xf2c394,
  fogNear: 180,
  fogFar: 900,
  exposure: 1,
  sky: {
    zenith: 0x4f77b3,
    mid: 0xa7b7d6,
    horizonWarm: 0xffc58a,
    horizonCool: 0xcdb4c6,
    glow: 0xffae62,
    sunDisc: 28,
    sunRadius: 1.4,
    cloudiness: 0.55,
  },
  haze: {
    shade: 0x7b8fbe,
    density: 0.0009,
    heightScale: 300,
    baseY: 0,
    lowDensity: 0.0005,
    lowHeightScale: 55,
    lowBaseY: 0,
    floorY: -60,
  },
  cloudSea: {
    topY: -38,
    topVariation: 14,
    bottomY: -150,
    density: 0.05,
    scale: 1500,
    drift: [1.8, 0.7],
    litColor: 0xfff0dc,
    shadeColor: 0x7d92c6,
  },
  shafts: { strength: 0.3, decay: 0.945, color: 0xffc27f },
  bloom: { strength: 0.28, threshold: 1.15 },
  grade: { shadowTint: 0xc4d2f2, highlightTint: 0xfff0d6, saturation: 1.12, contrast: 1.06, vignette: 0.28 },
  shadow: { min: [-75, -35, -35], max: [75, 70, 300], mapSize: 4096 },
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
    { id: 'arrival-1', position: [-175, 105, -215], target: [10, 24, 120], fov: 45 },
    { id: 'arrival-2', position: [170, 70, -100], target: [-155, 38, 230], fov: 45 },
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
