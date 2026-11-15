import { OrthographicCamera, Vector3, type DirectionalLight } from 'three';
import type { ShadowMood } from '../mood';

/**
 * Aim the sun at the middle of `region` and fit its shadow camera tightly around the region's
 * eight corners, so the shadow map's resolution goes where the buildings are.
 * `direction` is the unit vector from the region towards the sun.
 */
export function fitSunShadow(sun: DirectionalLight, direction: Vector3, region: ShadowMood): void {
  const min = new Vector3(...region.min);
  const max = new Vector3(...region.max);
  const center = min.clone().add(max).multiplyScalar(0.5);
  const distance = 1500;

  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(direction, distance);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();

  // A camera placed like the shadow camera will be, used only to express the corners in light space.
  const probe = new OrthographicCamera();
  probe.position.copy(sun.position);
  probe.lookAt(center);
  probe.updateMatrixWorld();

  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  let nearest = Infinity;
  let farthest = -Infinity;
  const corner = new Vector3();
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        corner.set(x, y, z).applyMatrix4(probe.matrixWorldInverse);
        left = Math.min(left, corner.x);
        right = Math.max(right, corner.x);
        bottom = Math.min(bottom, corner.y);
        top = Math.max(top, corner.y);
        nearest = Math.min(nearest, -corner.z);
        farthest = Math.max(farthest, -corner.z);
      }
    }
  }

  const margin = 6;
  const cam = sun.shadow.camera;
  cam.left = left - margin;
  cam.right = right + margin;
  cam.bottom = bottom - margin;
  cam.top = top + margin;
  // Casters can stand between the sun and the region (a spire, a roof): let the near plane reach back.
  cam.near = Math.max(1, nearest - 500);
  cam.far = farthest + 40;
  cam.updateProjectionMatrix();
}
