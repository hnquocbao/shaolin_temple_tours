import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { ARRIVAL, ArrivalDirector, arrivalSeconds, arrivalStops, createFlight, flightStopId, groundWithSolids, parseFlightStopId, titleOpacity } from '../game/arrival';
import { CAMERA } from '../game/player/camera-rig';
import { createPlay, type Play } from '../game/play';
import { catalog, findPlace, findStop } from '../places/registry';
import type { CameraStop } from '../places/types';
import { showArrivalTitle, showPlaceTitle, type ArrivalTitle } from '../ui/place-title';
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
  /** Play mode: 'arrival' during the opening flight, then 'play'. Undefined in view mode. */
  phase?: 'arrival' | 'play' | undefined;
  /** Camera position in play mode, so checks can see the flight move. */
  camera?: { x: number; y: number; z: number } | undefined;
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
  // `?arrival-t=` and the catalog's `flight-NN` stops are frozen views of the arrival flight.
  // A real stop of the place wins over a synthetic `flight-NN` id.
  const realStop = params.stop !== undefined && place.stops.some((s) => s.id === params.stop);
  const flightU = params.arrivalT ?? (realStop ? undefined : parseFlightStopId(params.stop));
  // Fail before anything is built, so nothing leaks.
  if (flightU !== undefined && arrivalStops(place).length === 0) throw new Error(`Place "${place.id}" has no arrival flight`);
  const mode = params.stop !== undefined || params.freeze || flightU !== undefined ? 'view' : 'play';
  const stop = mode === 'view' && flightU === undefined ? findStop(place, params.stop) : undefined;

  const probe: GameProbe = {
    ready: false,
    error: undefined,
    place: place.id,
    stop: stop?.id ?? (flightU === undefined ? undefined : (params.stop ?? flightStopId(Math.round(flightU * 100)))),
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
  const floor = groundWithSolids(instance.ground, instance.solids);
  const flight = createFlight(arrivalStops(place), floor, arrivalSeconds(place));
  let play: Play | undefined;
  let removeTitle: (() => void) | undefined;
  let bigTitle: ArrivalTitle | undefined;
  const director = mode === 'play' && params.arrival && flight ? new ArrivalDirector(flight, { ...ARRIVAL, floor, ground: instance.ground, playClearance: CAMERA.clearance }) : undefined;
  if (flightU !== undefined) {
    if (!flight) throw new Error(`Place "${place.id}" has no arrival flight`);
    const pose = flight.sample(flightU);
    applyStop(camera, { id: 'flight', position: pose.position, target: pose.target, fov: pose.fov });
    if (params.ui) {
      bigTitle = showArrivalTitle(uiHost, place.name);
      bigTitle.setOpacity(titleOpacity(flightU));
    }
  } else if (stop) {
    applyStop(camera, stop);
  } else {
    play = createPlay({
      canvas,
      scene,
      camera,
      place: instance,
      arrival: director,
      // Control passes to the player: the big name gives way to the small corner one.
      onHandover: () => {
        bigTitle?.dismiss();
        bigTitle = undefined;
        if (params.ui) removeTitle = showPlaceTitle(uiHost, place.name);
      },
    });
  }
  if (director && params.ui && !bigTitle && director.phase === 'flight') bigTitle = showArrivalTitle(uiHost, place.name);
  if (!director && !bigTitle && params.ui && !removeTitle) removeTitle = showPlaceTitle(uiHost, place.name);

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
    probe.phase = play?.phase?.();
    probe.camera = play ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : undefined;
    if (director && bigTitle && director.phase === 'flight') bigTitle.setOpacity(titleOpacity(director.progress));
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
    bigTitle?.remove();
    play?.dispose();
    instance.dispose();
    pipeline.dispose();
    renderer.dispose();
  });

  return probe;
}
