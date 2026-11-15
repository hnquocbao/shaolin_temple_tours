import {
  BoxGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { range } from '../../engine/rng';
import type { PlaceDef, PlaceInstance } from '../types';

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
  stops: [
    { id: 'arrival-1', position: [-220, 150, -260], target: [0, 20, 120], fov: 45 },
    { id: 'arrival-2', position: [160, 90, -120], target: [0, 15, 140], fov: 45 },
    { id: 'arrival-3', position: [0, 34, -110], target: [0, 16, 60], fov: 50 },
    { id: 'gate-front', position: [0, 3, -42], target: [0, 6, 0], fov: 55 },
  ],
  build({ scene, rng }): PlaceInstance {
    const root = new Group();
    root.name = 'shaolin';

    scene.background = new Color(0xe9b98a);
    scene.fog = new Fog(0xe9b98a, 180, 900);

    const hemi = new HemisphereLight(0xffe2bd, 0x4a5568, 0.9);
    const sun = new DirectionalLight(0xffc98f, 2.6);
    sun.position.set(-300, 140, -200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    const cam = sun.shadow.camera;
    cam.left = -260;
    cam.right = 260;
    cam.top = 260;
    cam.bottom = -260;
    cam.near = 10;
    cam.far = 900;
    root.add(hemi, sun, sun.target);

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
    const terraces = 7;
    for (let i = 0; i < terraces; i++) {
      const height = 3 + i * 3.2;
      const depth = 44;
      const z = i * depth;
      const terrace = new Mesh(new BoxGeometry(120, height, depth), stone);
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
      dispose() {
        scene.remove(root);
        for (const g of geometries) g.dispose();
        for (const m of materials) m.dispose();
        scene.fog = null;
        scene.background = null;
      },
    };
  },
};
