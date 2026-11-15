import { BackSide, Mesh, ShaderMaterial, SphereGeometry, type PerspectiveCamera } from 'three';
import { SKY_FRAGMENT, SKY_VERTEX } from './shaders';
import type { AtmosphereUniforms } from './uniforms';

/** A dome that follows the camera and paints the sky: gradient, sun disc, glow and thin cloud. It never writes depth. */
export interface Sky {
  mesh: Mesh;
  /** Keep the dome centred on the camera. Call once per frame. */
  follow(camera: PerspectiveCamera): void;
  dispose(): void;
}

export function createSky(uniforms: AtmosphereUniforms): Sky {
  const geometry = new SphereGeometry(1, 48, 24);
  const material = new ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return {
    mesh,
    follow(camera) {
      // The dome only encodes direction, so its size just has to sit inside the far plane.
      const scale = Math.min(camera.far * 0.8, 3000);
      mesh.scale.setScalar(scale);
      mesh.position.copy(camera.position);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
