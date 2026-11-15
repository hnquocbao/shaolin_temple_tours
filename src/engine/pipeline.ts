import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFSoftShadowMap,
  SRGBColorSpace,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { Mood } from './mood';

/** Everything between "the scene exists" and "pixels on screen": lights, sky, fog, post-processing. */
export interface Pipeline {
  /** Draw one frame. `elapsed` is scene time in seconds (constant when frozen). */
  render(elapsed: number): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

/**
 * Baseline pipeline: one shadowed sun, hemisphere ambient, distance fog, tone mapping.
 * ST3T-12 replaces the inside of this function; the signature is the contract with app.ts.
 */
export function createPipeline(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  mood: Mood,
): Pipeline {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = mood.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  scene.background = new Color(mood.horizonColor);
  scene.fog = new Fog(mood.horizonColor, mood.fogNear, mood.fogFar);

  const ambient = new HemisphereLight(mood.skyLight, mood.groundLight, mood.ambientIntensity);
  const sun = new DirectionalLight(mood.sunColor, mood.sunIntensity);
  sun.position.set(...mood.sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  const shadowCam = sun.shadow.camera;
  shadowCam.left = -260;
  shadowCam.right = 260;
  shadowCam.top = 260;
  shadowCam.bottom = -260;
  shadowCam.near = 10;
  shadowCam.far = 1200;
  scene.add(ambient, sun, sun.target);

  return {
    render() {
      renderer.render(scene, camera);
    },
    resize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
    },
    dispose() {
      scene.remove(ambient, sun, sun.target);
      sun.shadow.map?.dispose();
      scene.fog = null;
      scene.background = null;
    },
  };
}
