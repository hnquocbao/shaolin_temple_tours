import type { PerspectiveCamera, Scene } from 'three';
import { parseRunParams } from '../engine/params';
import type { PlaceInstance } from '../places/types';
import { showControlsHint } from '../ui/controls-hint';
import { createHeroFigure } from './hero/figure';
import { CAMERA, orbitOffset, solveCamera } from './player/camera-rig';
import { NO_INPUT, type HeroInput } from './player/motion';
import { advance, blend, createSim } from './player/sim';
import { worldFromPlace } from './player/world';

/** Live play in a place: the hero, the camera that follows, and input. */
export interface Play {
  /** Advance by `delta` seconds. Not called when the scene is frozen. */
  update(elapsed: number, delta: number): void;
  /** Where the hero is, for the probe and for tests. */
  /** `respawns` counts how often the hero was put back; the play check asserts it stays 0. */
  heroPosition(): { x: number; y: number; z: number; respawns?: number };
  dispose(): void;
}

export interface PlayContext {
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: PerspectiveCamera;
  place: PlaceInstance;
}

/** Height of the point the camera orbits, above the hero's feet. */
const EYE_HEIGHT = 1.45;
const MOUSE_SENSITIVITY = 0.0024;
/** Camera orbit speed from the arrow keys, for when the mouse is not captured. */
const KEY_ORBIT = 1.9;

const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Third-person play: the hero (placeholder figure, ST3T-17), movement and the lightness skill (ST3T-15),
 * and an orbit camera. The signature is the contract with app.ts.
 */
export function createPlay({ canvas, scene, camera, place }: PlayContext): Play {
  const world = worldFromPlace(place);
  const sim = createSim(world);
  const figure = createHeroFigure('xuzhu');
  scene.add(figure.object);

  const params = parseRunParams(window.location.search);
  const uiHost = document.getElementById('ui');
  const removeHint = uiHost && params.ui ? showControlsHint(uiHost) : undefined;

  // ---- input
  const keys = new Set<string>();
  let jumpLatch = false;
  let yaw = place.spawn.facing;
  let pitch: number = CAMERA.defaultPitch;
  let wantedDistance: number = CAMERA.defaultDistance;

  /** Keys typed into a text field are not game input. */
  const typing = (e: KeyboardEvent): boolean => {
    const t = e.target;
    return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'Space' && !keys.has('Space')) jumpLatch = true;
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (!typing(e)) keys.delete(e.code);
  };
  const onBlur = (): void => keys.clear();
  const onVisibility = (): void => {
    if (document.hidden) keys.clear();
  };
  const locked = (): boolean => document.pointerLockElement === canvas;
  let wasLocked = false;
  const onLockChange = (): void => {
    // Losing the lock (Esc, alt-tab) can swallow key-ups: forget held keys.
    if (wasLocked && !locked()) keys.clear();
    wasLocked = locked();
  };
  const onMouseMove = (e: MouseEvent): void => {
    if (!locked()) return;
    yaw -= e.movementX * MOUSE_SENSITIVITY;
    pitch = clamp(pitch + e.movementY * MOUSE_SENSITIVITY, CAMERA.minPitch, CAMERA.maxPitch);
  };
  const onClick = (): void => {
    if (locked()) return;
    try {
      // Rejected or missing in some browsers and headless runs; movement works without it.
      void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
    } catch {
      // ignore
    }
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    wantedDistance = clamp(wantedDistance * Math.exp(e.deltaY * 0.0011), CAMERA.minDistance, CAMERA.maxDistance);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const readInput = (): HeroInput => ({
    ...NO_INPUT,
    moveX: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    moveZ: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    cameraYaw: yaw,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    jump: keys.has('Space'),
  });

  // ---- camera
  const baseFov = camera.fov;
  const baseNear = camera.near;
  camera.near = 0.25;
  const eye = { x: sim.state.x, y: sim.state.y + EYE_HEIGHT, z: sim.state.z };
  let shown: number = wantedDistance;
  let fov = baseFov;

  const placeCamera = (hx: number, hy: number, hz: number, speed: number, dt: number, snap: boolean): void => {
    if (snap || Math.hypot(eye.x - hx, eye.y - hy - EYE_HEIGHT, eye.z - hz) > 8) {
      eye.x = hx;
      eye.y = hy + EYE_HEIGHT;
      eye.z = hz;
    } else {
      eye.x = damp(eye.x, hx, 20, dt);
      eye.z = damp(eye.z, hz, 20, dt);
      eye.y = damp(eye.y, hy + EYE_HEIGHT, 8, dt);
    }
    // Solve from the hero's true eye outwards through the lagging eye, so the camera never starts inside a wall.
    const solved = solveCamera(world, [eye.x, eye.y, eye.z], yaw, pitch, wantedDistance, [hx, hy + EYE_HEIGHT, hz]);
    shown = snap || solved.distance < shown ? solved.distance : damp(shown, solved.distance, 4, dt);
    const [ox, oy, oz] = orbitOffset(yaw, pitch, shown);
    const cx = solved.originX + ox;
    const cz = solved.originZ + oz;
    const cy = Math.max(solved.originY + oy, world.heightAt(cx, cz) + CAMERA.clearance);
    camera.position.set(cx, cy, cz);
    camera.lookAt(solved.originX, solved.originY, solved.originZ);
    // A little widening with speed sells the leap.
    fov = damp(fov, baseFov + 9 * clamp((speed - 6.5) / 6, 0, 1), 3, dt);
    if (Math.abs(camera.fov - fov) > 0.02) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    figure.object.visible = shown > 1.1;
  };

  const drawHero = (delta: number, snap: boolean): void => {
    const { state, previous } = sim;
    const a = previous.respawns === state.respawns ? blend(sim) : 1;
    const x = previous.x + (state.x - previous.x) * a;
    const y = previous.y + (state.y - previous.y) * a;
    const z = previous.z + (state.z - previous.z) * a;
    figure.object.position.set(x, y, z);
    figure.object.rotation.y = state.heading;
    const speed = Math.hypot(state.vx, state.vz);
    figure.setPose({ speed, vy: state.vy, grounded: state.grounded, leaping: state.leaping, dt: delta });
    placeCamera(x, y, z, speed, delta, snap);
  };
  drawHero(0, true);

  let lastRespawns = sim.state.respawns;
  return {
    update(_elapsed, delta) {
      if (keys.has('ArrowLeft')) yaw += KEY_ORBIT * delta;
      if (keys.has('ArrowRight')) yaw -= KEY_ORBIT * delta;
      if (keys.has('ArrowUp')) pitch = clamp(pitch - KEY_ORBIT * 0.5 * delta, CAMERA.minPitch, CAMERA.maxPitch);
      if (keys.has('ArrowDown')) pitch = clamp(pitch + KEY_ORBIT * 0.5 * delta, CAMERA.minPitch, CAMERA.maxPitch);
      // A tap counts for the first step of the next frame that runs one, and only that step.
      if (advance(sim, readInput(), delta, world, jumpLatch) > 0) jumpLatch = false;
      const respawned = sim.state.respawns !== lastRespawns;
      lastRespawns = sim.state.respawns;
      drawHero(delta, respawned);
    },
    heroPosition: () => ({ x: sim.state.x, y: sim.state.y, z: sim.state.z, respawns: sim.state.respawns }),
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('wheel', onWheel);
      if (locked()) document.exitPointerLock();
      removeHint?.();
      scene.remove(figure.object);
      figure.dispose();
      camera.near = baseNear;
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
    },
  };
}
