import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createPlay, type Play } from '../game/play';
import { catalog, findPlace, findStop } from '../places/registry';
import type { CameraStop } from '../places/types';
import { showPlaceTitle } from '../ui/place-title';
import { SceneClock } from './clock';
import type { RunParams } from './params';
import { createPipeline } from './pipeline';
import { createRng, seedFrom } from './rng';

/** What the page exposes for the screenshot tool, the play check and debugging. */
export interface GameProbe {
  /** True once the requested view has been drawn and is safe to capture. */
  ready: boolean;
  error: string | undefined;
  place: string;
  /** The camera stop shown, or undefined in play mode. */
  stop: string | undefined;
  /** 'view' shows a fixed camera stop; 'play' gives control of the hero. */
  mode: 'view' | 'play';
  frozen: boolean;
  catalog: { place: string; dev: boolean; stops: string[] }[];
  /** Cost of the last frame. Budgets are checked against these. */
  stats: { drawCalls: number; triangles: number; geometries: number; textures: number };
  /** Hero position in play mode. */
  hero: { x: number; y: number; z: number } | undefined;
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
  // A named stop or a frozen frame is a fixed view; otherwise the player is in control.
  const mode = params.stop !== undefined || params.freeze ? 'view' : 'play';
  const stop = mode === 'view' ? findStop(place, params.stop) : undefined;

  const probe: GameProbe = {
    ready: false,
    error: undefined,
    place: place.id,
    stop: stop?.id,
    mode,
    frozen: params.freeze,
    catalog: catalog(),
    stats: { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
    hero: undefined,
  };
  window.__game = probe;

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.5, 4000);
  const pipeline = createPipeline(renderer, scene, camera, place.mood);

  const instance = place.build({ scene, rng: createRng(seedFrom(place.id)) });
  let play: Play | undefined;
  if (stop) applyStop(camera, stop);
  else play = createPlay({ canvas, scene, camera, place: instance });
  const removeTitle = params.ui ? showPlaceTitle(uiHost, place.name) : undefined;

  const resize = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    // Frozen views render at exactly one device pixel per CSS pixel so shots are comparable.
    pipeline.resize(width, height, params.freeze ? 1 : Math.min(window.devicePixelRatio, 2));
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
    if (!clock.frozen) {
      instance.update?.(clock.elapsed, clock.delta);
      play?.update(clock.elapsed, clock.delta);
    }
    pipeline.render(clock.elapsed);
    frames++;
    probe.stats = {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
    probe.hero = play?.heroPosition();
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
    play?.dispose();
    instance.dispose();
    pipeline.dispose();
    renderer.dispose();
  });

  return probe;
}
