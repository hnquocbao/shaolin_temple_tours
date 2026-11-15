import {
  Color,
  DirectionalLight,
  HemisphereLight,
  NoToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { resolveMood } from './atmosphere/defaults';
import { PostChain } from './atmosphere/post';
import { fitSunShadow } from './atmosphere/shadow';
import { createSky } from './atmosphere/sky';
import { createAtmosphereUniforms, sunDirection } from './atmosphere/uniforms';
import type { Mood } from './mood';
import { createNoiseTexture } from './terrain/noise-texture';

/** Everything between "the scene exists" and "pixels on screen": lights, sky, haze, post-processing. */
export interface Pipeline {
  /** Draw one frame. `elapsed` is scene time in seconds (constant when frozen). */
  render(elapsed: number): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

/**
 * Golden-hour pipeline: one warm shadowed sun, cool ambient light from the sky, a painted sky with a sun glow,
 * layered aerial haze, a drifting cloud sea, light shafts, bloom, tone mapping and a colour grade.
 * Everything is driven by `Mood` (see `mood.ts`); the signature is the contract with app.ts.
 *
 * Fog is done in post from the depth buffer, so `scene.fog` stays unused; every material gets the same air.
 */
export function createPipeline(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  mood: Mood,
): Pipeline {
  const resolved = resolveMood(mood);

  renderer.outputColorSpace = SRGBColorSpace;
  // Tone mapping happens in the final pass, once, on the whole picture.
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(new Color(mood.horizonColor), 1);
  // One frame is several draw passes; count them all together so budgets mean the whole frame.
  renderer.info.autoReset = false;

  scene.fog = null;
  scene.background = null;

  const noise = createNoiseTexture();
  const uniforms = createAtmosphereUniforms(resolved, noise);
  const sky = createSky(uniforms);

  const ambient = new HemisphereLight(mood.skyLight, mood.groundLight, mood.ambientIntensity);
  const sun = new DirectionalLight(mood.sunColor, mood.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(resolved.shadow.mapSize, resolved.shadow.mapSize);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.35;
  fitSunShadow(sun, sunDirection(resolved), resolved.shadow);
  scene.add(ambient, sun, sun.target, sky.mesh);

  const post = new PostChain(renderer, uniforms, resolved, sunDirection(resolved));

  return {
    render(elapsed) {
      renderer.info.reset();
      sky.follow(camera);
      post.render(scene, camera, elapsed);
    },
    resize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      post.resize(width * pixelRatio, height * pixelRatio);
    },
    dispose() {
      scene.remove(ambient, sun, sun.target, sky.mesh);
      sun.shadow.map?.dispose();
      sky.dispose();
      post.dispose();
      noise.dispose();
      renderer.info.autoReset = true;
    },
  };
}
