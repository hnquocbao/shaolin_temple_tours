import { ACESFilmicToneMapping, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { catalog, findPlace, findStop } from '../places/registry';
import type { CameraStop } from '../places/types';
import { showPlaceTitle } from '../ui/place-title';
import { SceneClock } from './clock';
import type { RunParams } from './params';
import { createRng, seedFrom } from './rng';

/** What the page exposes for the screenshot tool and for debugging. */
export interface GameProbe {
  /** True once the requested view has been drawn and is safe to capture. */
  ready: boolean;
  error: string | undefined;
  place: string;
  stop: string;
  frozen: boolean;
  catalog: { place: string; stops: string[] }[];
  /** Cost of the last frame. Budgets are checked against these. */
  stats: { drawCalls: number; triangles: number; geometries: number; textures: number };
}

declare global {
  interface Window {
    __game?: GameProbe;
  }
}

/** Frames to draw before a frozen view counts as settled (shadow maps, shader compile). */
const SETTLE_FRAMES = 3;

function applyStop(camera: PerspectiveCamera, stop: CameraStop): void {
  camera.fov = stop.fov ?? 50;
  camera.position.set(...stop.position);
  camera.lookAt(...stop.target);
  camera.updateProjectionMatrix();
}

export function startApp(canvas: HTMLCanvasElement, uiHost: HTMLElement, params: RunParams): GameProbe {
  const place = findPlace(params.place);
  const stop = findStop(place, params.stop);

  const probe: GameProbe = {
    ready: false,
    error: undefined,
    place: place.id,
    stop: stop.id,
    frozen: params.freeze,
    catalog: catalog(),
    stats: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  };
  window.__game = probe;

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.5, 4000);
  applyStop(camera, stop);

  const instance = place.build({ scene, rng: createRng(seedFrom(place.id)) });
  const removeTitle = params.ui ? showPlaceTitle(uiHost, place.name) : undefined;

  const resize = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    // Frozen views render at exactly one device pixel per CSS pixel so shots are comparable.
    renderer.setPixelRatio(params.freeze ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const clock = new SceneClock(params.freeze);
  let frames = 0;
  let handle = 0;

  const frame = (now: number): void => {
    clock.tick(now);
    if (!clock.frozen) instance.update?.(clock.elapsed, clock.delta);
    renderer.render(scene, camera);
    frames++;
    probe.stats = {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
    if (frames >= SETTLE_FRAMES) probe.ready = true;
    // A frozen view is a still picture: stop drawing once it has settled.
    if (clock.frozen && probe.ready) return;
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(handle);
    window.removeEventListener('resize', resize);
    removeTitle?.();
    instance.dispose();
    renderer.dispose();
  });

  return probe;
}
