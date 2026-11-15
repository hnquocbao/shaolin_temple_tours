import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import type { Mood } from '../../engine/mood';
import { range } from '../../engine/rng';
import type { PlaceDef, PlaceInstance, Solid } from '../types';

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

const TERRACES = 7;
const TERRACE_DEPTH = 44;
const TERRACE_HALF_WIDTH = 60;
const terraceHeight = (i: number): number => 3 + i * 3.2;

/**
 * Shaolin Temple on Mount Shaoshi.
 *
 * ST3T-9/10 placeholder: gray boxes on rising terraces with a low warm sun, enough to prove the
 * pipeline and the camera stops. Terrain (ST3T-11), atmosphere (ST3T-12), the building kit (ST3T-13)
 * and the real layout (ST3T-14) replace everything in `build` while keeping the stop ids.
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

    const stone = new MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.95 });
    const wall = new MeshStandardMaterial({ color: 0x9a4a3a, roughness: 0.85 });
    const roof = new MeshStandardMaterial({ color: 0x4d4a46, roughness: 0.8 });
    const hill = new MeshStandardMaterial({ color: 0x55604a, roughness: 1 });
    const materials = [stone, wall, roof, hill];
    const geometries: (BoxGeometry | ConeGeometry | PlaneGeometry)[] = [];

    const ground = new Mesh(new PlaneGeometry(2400, 2400), hill);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    geometries.push(ground.geometry);
    root.add(ground);

    // Seven terraces rising along +z, each with one hall: a stand-in for the central axis.
    const solids: Solid[] = [];
    for (let i = 0; i < TERRACES; i++) {
      const height = terraceHeight(i);
      const depth = TERRACE_DEPTH;
      const z = i * depth;
      const terrace = new Mesh(new BoxGeometry(TERRACE_HALF_WIDTH * 2, height, depth), stone);
      terrace.position.set(0, height / 2, z);
      terrace.receiveShadow = true;
      terrace.castShadow = true;

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
      geometries.push(terrace.geometry, body.geometry, cap.geometry);
      root.add(terrace, body, cap);
    }

    // Distant peaks so depth and haze are visible in the placeholder.
    for (let i = 0; i < 26; i++) {
      const radius = range(rng, 90, 240);
      const tall = range(rng, 160, 460);
      const peak = new Mesh(new ConeGeometry(radius, tall, 7), hill);
      const angle = range(rng, 0, Math.PI * 2);
      const distance = range(rng, 520, 1050);
      peak.position.set(Math.cos(angle) * distance, tall / 2 - 10, 150 + Math.sin(angle) * distance);
      peak.rotation.y = range(rng, 0, Math.PI);
      geometries.push(peak.geometry);
      root.add(peak);
    }

    scene.add(root);

    return {
      root,
      // Placeholder ground: flat outside, stepped terraces along the axis.
      ground: {
        heightAt(x, z) {
          if (Math.abs(x) > TERRACE_HALF_WIDTH) return 0;
          const i = Math.floor((z + TERRACE_DEPTH / 2) / TERRACE_DEPTH);
          return i < 0 || i >= TERRACES ? 0 : terraceHeight(i);
        },
      },
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
