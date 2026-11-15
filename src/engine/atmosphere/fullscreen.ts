import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  type IUniform,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { FULLSCREEN_VERTEX } from './shaders';

/** One big triangle covering the screen, shared by every pass. */
let sharedGeometry: BufferGeometry | undefined;
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

function triangle(): BufferGeometry {
  if (!sharedGeometry) {
    sharedGeometry = new BufferGeometry();
    sharedGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  }
  return sharedGeometry;
}

/** A fragment shader run over the whole screen into a render target (or the canvas when `target` is null). */
export class FullscreenPass {
  readonly material: ShaderMaterial;
  private readonly scene = new Scene();

  constructor(fragmentShader: string, uniforms: Record<string, IUniform>) {
    this.material = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
      blending: 0,
    });
    const mesh = new Mesh(triangle(), this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  render(renderer: WebGLRenderer, target: WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, camera);
  }

  dispose(): void {
    this.material.dispose();
  }
}

export function disposeSharedGeometry(): void {
  sharedGeometry?.dispose();
  sharedGeometry = undefined;
}
