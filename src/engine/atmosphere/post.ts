import {
  Color,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  NoToneMapping,
  RGBAFormat,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { ResolvedMood } from './defaults';
import { FullscreenPass, disposeSharedGeometry } from './fullscreen';
import { BLUR_FRAGMENT, BRIGHT_FRAGMENT, COMPOSE_FRAGMENT, FINAL_FRAGMENT, SHAFT_FRAGMENT } from './shaders';
import type { AtmosphereUniforms } from './uniforms';

const BLOOM_LEVELS = 4;

function targetOf(width: number, height: number): WebGLRenderTarget {
  return new WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
}

/**
 * Scene to screen: the scene is drawn into a floating-point target with a depth texture,
 * then haze and cloud sea are laid over it using that depth, light shafts and bloom are added,
 * and the result is tone-mapped and graded onto the canvas.
 */
export class PostChain {
  private scene: WebGLRenderTarget | undefined;
  private comp: WebGLRenderTarget | undefined;
  private shaft: WebGLRenderTarget | undefined;
  private bloomA: WebGLRenderTarget[] = [];
  private bloomB: WebGLRenderTarget[] = [];

  private readonly compose: FullscreenPass;
  private readonly shaftPass: FullscreenPass;
  private readonly bright: FullscreenPass;
  private readonly blur: FullscreenPass;
  private readonly final: FullscreenPass;

  private readonly sunUv = new Vector2();
  private readonly tmp = new Vector3();
  private width = 1;
  private height = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly uniforms: AtmosphereUniforms,
    private readonly mood: ResolvedMood,
    private readonly sunDir: Vector3,
  ) {
    const u = uniforms;
    this.compose = new FullscreenPass(COMPOSE_FRAGMENT, {
      ...u,
      tColor: { value: null },
      tDepth: { value: null },
    });
    this.shaftPass = new FullscreenPass(SHAFT_FRAGMENT, {
      tDepth: { value: null },
      uSunUv: { value: this.sunUv },
      uSunVisible: { value: 0 },
      uShaftColor: { value: new Color(mood.shafts.color) },
      uStrength: { value: mood.shafts.strength },
      uDecay: { value: mood.shafts.decay },
    });
    this.bright = new FullscreenPass(BRIGHT_FRAGMENT, {
      tSource: { value: null },
      uThreshold: { value: mood.bloom.threshold },
    });
    this.blur = new FullscreenPass(BLUR_FRAGMENT, { tSource: { value: null }, uStep: { value: new Vector2() } });
    const g = mood.grade;
    this.final = new FullscreenPass(FINAL_FRAGMENT, {
      tComp: { value: null },
      tBloom0: { value: null },
      tBloom1: { value: null },
      tBloom2: { value: null },
      tBloom3: { value: null },
      tShaft: { value: null },
      uExposure: { value: mood.base.exposure },
      uBloom: { value: mood.bloom.strength },
      uShadowTint: { value: new Color(g.shadowTint) },
      uHighlightTint: { value: new Color(g.highlightTint) },
      uSaturation: { value: g.saturation },
      uContrast: { value: g.contrast },
      uVignette: { value: g.vignette },
    });
  }

  /** (Re)create the targets for a drawing buffer of `width` x `height` pixels. */
  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.disposeTargets();
    const depth = new DepthTexture(this.width, this.height, UnsignedIntType);
    this.scene = new WebGLRenderTarget(this.width, this.height, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      depthTexture: depth,
      samples: 4,
      generateMipmaps: false,
    });
    this.comp = targetOf(this.width, this.height);
    this.shaft = targetOf(Math.ceil(this.width / 2), Math.ceil(this.height / 2));
    this.bloomA = [];
    this.bloomB = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const w = Math.ceil(this.width / 2 ** (i + 1));
      const h = Math.ceil(this.height / 2 ** (i + 1));
      this.bloomA.push(targetOf(w, h));
      this.bloomB.push(targetOf(w, h));
    }
  }

  render(scene: Scene, camera: PerspectiveCamera, elapsed: number): void {
    const { renderer, uniforms } = this;
    if (!this.scene || !this.comp || !this.shaft) return;

    const previousTone = renderer.toneMapping;
    renderer.toneMapping = NoToneMapping;

    // Time-dependent inputs. Only `elapsed` moves them, so a frozen scene repeats exactly.
    const cloud = this.mood.cloudSea;
    (uniforms['uCloudDrift']?.value as Vector2).set((cloud?.drift[0] ?? 0) * elapsed, (cloud?.drift[1] ?? 0) * elapsed);
    (uniforms['uSkyDrift']?.value as Vector2).set(elapsed * 0.0004, elapsed * 0.0002);
    uniforms['uFar']!.value = camera.far;
    (uniforms['uCamPos']!.value as Vector3).copy(camera.position);

    // 1. The scene, with depth.
    renderer.setRenderTarget(this.scene);
    renderer.clear();
    renderer.render(scene, camera);

    // The camera matrices are now current.
    (uniforms['uProjInv']!.value as { copy(m: unknown): void }).copy(camera.projectionMatrixInverse);
    (uniforms['uCamWorld']!.value as { copy(m: unknown): void }).copy(camera.matrixWorld);

    // 2. Light shafts at half resolution.
    const shaftUniforms = this.shaftPass.material.uniforms;
    this.tmp.copy(camera.position).addScaledVector(this.sunDir, 1000).project(camera);
    const inFront = this.tmp.z < 1 && this.mood.shafts.strength > 0;
    this.sunUv.set(this.tmp.x * 0.5 + 0.5, this.tmp.y * 0.5 + 0.5);
    (shaftUniforms['uSunVisible'] as { value: number }).value = inFront ? 1 : 0;
    (shaftUniforms['tDepth'] as { value: unknown }).value = this.scene.depthTexture;
    this.shaftPass.render(renderer, this.shaft);

    // 3. Haze and cloud sea.
    const composeUniforms = this.compose.material.uniforms;
    (composeUniforms['tColor'] as { value: unknown }).value = this.scene.texture;
    (composeUniforms['tDepth'] as { value: unknown }).value = this.scene.depthTexture;
    this.compose.render(renderer, this.comp);

    // 4. Bloom: bright pass, then blur down a chain of smaller targets.
    (this.bright.material.uniforms['tSource'] as { value: unknown }).value = this.comp.texture;
    this.bright.render(renderer, this.bloomA[0] ?? null);
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const a = this.bloomA[i];
      const b = this.bloomB[i];
      if (!a || !b) continue;
      if (i > 0) {
        // Downsample the previous level by drawing it through the blur at this level's size.
        const prev = this.bloomA[i - 1];
        if (prev) {
          this.blurInto(prev, a, 1 / prev.width, 0);
        }
      }
      this.blurInto(a, b, 1 / a.width, 0);
      this.blurInto(b, a, 0, 1 / a.height);
    }

    // 5. To the screen.
    const finalUniforms = this.final.material.uniforms;
    (finalUniforms['tComp'] as { value: unknown }).value = this.comp.texture;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      (finalUniforms[`tBloom${i}`] as { value: unknown }).value = this.bloomA[i]?.texture ?? null;
    }
    (finalUniforms['tShaft'] as { value: unknown }).value = this.shaft.texture;
    this.final.render(renderer, null);

    renderer.toneMapping = previousTone;
  }

  private blurInto(from: WebGLRenderTarget, to: WebGLRenderTarget, dx: number, dy: number): void {
    const u = this.blur.material.uniforms;
    (u['tSource'] as { value: unknown }).value = from.texture;
    (u['uStep'] as { value: Vector2 }).value.set(dx, dy);
    this.blur.render(this.renderer, to);
  }

  private disposeTargets(): void {
    this.scene?.depthTexture?.dispose();
    this.scene?.dispose();
    this.comp?.dispose();
    this.shaft?.dispose();
    for (const t of [...this.bloomA, ...this.bloomB]) t.dispose();
    this.scene = undefined;
    this.comp = undefined;
    this.shaft = undefined;
    this.bloomA = [];
    this.bloomB = [];
  }

  dispose(): void {
    this.disposeTargets();
    for (const pass of [this.compose, this.shaftPass, this.bright, this.blur, this.final]) pass.dispose();
    disposeSharedGeometry();
  }
}
