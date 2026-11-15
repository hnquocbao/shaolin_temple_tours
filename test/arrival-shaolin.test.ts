import { Box3, InstancedMesh, Matrix4, Mesh, Object3D, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ARRIVAL, ArrivalDirector, arrivalSeconds, arrivalStops, createFlight, groundWithSolids, type Pose } from '../src/game/arrival';
import { CAMERA } from '../src/game/player/camera-rig';
import { shaolin } from '../src/places/shaolin';
import type { Solid } from '../src/places/types';

/** The real Shaolin place, built in Node: its ground, its halls and walls, and every tree. */
const scene = new Scene();
const instance = shaolin.build({ scene, rng: () => 0.5 });
const floor = groundWithSolids(instance.ground, instance.solids);
const stops = arrivalStops(shaolin);
const seconds = arrivalSeconds(shaolin);
const flight = createFlight(stops, floor, seconds)!;
const STEPS = 2400;
const dt = seconds / STEPS;

/** World-space boxes of every instance of every instanced mesh (the trees), from the geometry's bounding box. */
function instanceBoxes(root: Object3D): Box3[] {
  const boxes: Box3[] = [];
  root.updateMatrixWorld(true);
  const m = new Matrix4();
  root.traverse((o) => {
    if (!(o instanceof InstancedMesh)) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      boxes.push(bb.clone().applyMatrix4(m).applyMatrix4(o.matrixWorld));
    }
  });
  return boxes;
}
const trees = instanceBoxes(instance.root);

const inSolid = (p: readonly number[], s: Solid, pad = 0): boolean =>
  p[0]! > s.min[0] - pad && p[0]! < s.max[0] + pad && p[1]! > s.min[1] - pad && p[1]! < s.max[1] + pad && p[2]! > s.min[2] - pad && p[2]! < s.max[2] + pad;

const samples: Pose[] = [];
for (let i = 0; i <= STEPS; i++) samples.push(flight.sample(i / STEPS));

describe('the real Shaolin flight', () => {
  it('has the trees and the stops it is judged against', () => {
    expect(trees.length).toBeGreaterThan(500);
    expect(stops.length).toBeGreaterThanOrEqual(3);
  });

  it('is never below the ground plus the margin, never inside a solid, never inside a tree', () => {
    let lowest = Infinity;
    for (const s of samples) {
      const [x, y, z] = s.position;
      lowest = Math.min(lowest, y - instance.ground.heightAt(x, z));
      expect(y).toBeGreaterThanOrEqual(instance.ground.heightAt(x, z) + ARRIVAL.groundMargin - 1e-6);
      for (const solid of instance.solids) expect(inSolid(s.position, solid, 1)).toBe(false);
      for (const b of trees) {
        const dx = Math.max(b.min.x - x, 0, x - b.max.x);
        const dy = Math.max(b.min.y - y, 0, y - b.max.y);
        const dz = Math.max(b.min.z - z, 0, z - b.max.z);
        if (dx * dx + dy * dy + dz * dz < 4) throw new Error(`the lens is within 2 m of foliage at ${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}`);
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(ARRIVAL.groundMargin - 1e-6);
  }, 60000);

  it('has no vertical pops: bounded vertical speed and acceleration', () => {
    // Speeds and accelerations over quarter-second spans: that is what the eye sees; 5 ms slices only measure rounding.
    const k = Math.round(0.25 / dt);
    const y = samples.map((p) => p.position[1]);
    const vy: number[] = [];
    for (let i = 0; i + k < y.length; i++) vy.push((y[i + k]! - y[i]!) / (k * dt));
    const ay: number[] = [];
    for (let i = 0; i + k < vy.length; i++) ay.push((vy[i + k]! - vy[i]!) / (k * dt));
    const maxVy = Math.max(...vy.map(Math.abs));
    const maxAy = Math.max(...ay.map(Math.abs));
    console.log(`vertical speed max ${maxVy.toFixed(1)} m/s, acceleration max ${maxAy.toFixed(1)} m/s2`);
    let biggestStep = 0;
    for (let i = 1; i < samples.length; i++) biggestStep = Math.max(biggestStep, Math.abs(samples[i]!.position[1] - samples[i - 1]!.position[1]));
    console.log(`biggest single-step rise ${biggestStep.toFixed(2)} m`);
    expect(maxVy).toBeLessThan(70);
    expect(maxAy).toBeLessThan(400);
    expect(biggestStep).toBeLessThan(0.5);
  });

  it('keeps the horizon level and the target away from the lens', () => {
    for (const s of samples) {
      const d = new Vector3(s.target[0] - s.position[0], s.target[1] - s.position[1], s.target[2] - s.position[2]);
      expect(d.length()).toBeGreaterThan(8);
      // Looking nearly straight up or down is where a look-at turns the horizon over.
      expect(Math.abs(d.y / d.length())).toBeLessThan(Math.sin((70 * Math.PI) / 180));
    }
  });

  it('ends close to where the play camera starts', () => {
    const [x, , z] = samples[STEPS]!.position;
    const spawn = instance.spawn.position;
    expect(Math.hypot(x - spawn[0], z - spawn[2])).toBeLessThan(120);
  });
});

describe('skipping the real Shaolin flight', () => {
  const [sx, sy, sz] = instance.spawn.position;
  // A play camera behind the hero, as the game places it.
  const live: Pose = { position: [sx, sy + 4, sz - 8], target: [sx, sy + 1.5, sz], fov: 50 };
  const plain = instance.ground;
  const options = { ...ARRIVAL, floor, ground: plain, playClearance: CAMERA.clearance };
  const angle = (a: Pose, b: Pose): number => {
    const d = (p: Pose): Vector3 => new Vector3(p.target[0] - p.position[0], p.target[1] - p.position[1], p.target[2] - p.position[2]).normalize();
    return d(a).angleTo(d(b));
  };

  for (const u of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1.2]) {
    it(`skip at ${u} of the flight stays above ground, outside solids, and pops nowhere`, () => {
      const director = new ArrivalDirector(flight, options);
      let t = 0;
      while (t < u * seconds && director.phase === 'flight') {
        director.step(1 / 30, live);
        t += 1 / 30;
      }
      let prev = director.step(0, live);
      if (director.phase === 'flight') director.skip();
      let frames = 0;
      let lastDist = Infinity;
      let biggestPop = 0;
      while (director.phase !== 'done' && frames < 400) {
        const pose = director.step(1 / 60, live);
        const [x, y, z] = pose.position;
        expect(y).toBeGreaterThanOrEqual(plain.heightAt(x, z) + CAMERA.clearance - 1e-6);
        for (const solid of instance.solids) expect(inSolid(pose.position, solid, 0)).toBe(false);
        biggestPop = Math.max(biggestPop, Math.hypot(x - prev.position[0], y - prev.position[1], z - prev.position[2]), 0);
        expect(angle(prev, pose)).toBeLessThan(0.2);
        const d = Math.hypot(x - live.position[0], y - live.position[1], z - live.position[2]);
        // Never moving away from the play camera by more than the lift over a building.
        expect(d).toBeLessThanOrEqual(lastDist + 1.5);
        lastDist = d;
        prev = pose;
        frames++;
      }
      expect(director.phase).toBe('done');
      expect(frames).toBeLessThan(200);
      expect(Mesh).toBeDefined();
      console.log(`skip at ${u}: ${frames} frames, biggest step ${biggestPop.toFixed(2)} m`);
    });
  }
});
