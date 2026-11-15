import { Box3, Vector3, type Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createHeroFigure, HERO_FIGURE_HEIGHT, type HeroPose } from '../src/game/hero/figure';
import { heroes } from '../src/game/heroes';

const standing: HeroPose = { speed: 0, vy: 0, grounded: true, leaping: false, dt: 1 / 60 };

/** Centres of the meshes that sit at ground level: the shoes. */
function shoeCentres(object: Object3D): Vector3[] {
  object.updateMatrixWorld(true);
  const out: Vector3[] = [];
  object.traverse((o) => {
    if (!(o as Mesh).isMesh) return;
    const c = new Box3().setFromObject(o).getCenter(new Vector3());
    if (c.y < 0.06) out.push(c);
  });
  return out;
}

function box(object: Object3D): Box3 {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
}

describe('hero figure contract', () => {
  it('stands about 1.7 m tall with its origin at the feet', () => {
    for (const hero of heroes) {
      const figure = createHeroFigure(hero.id);
      for (let i = 0; i < 30; i++) figure.setPose(standing);
      const b = box(figure.object);
      expect(HERO_FIGURE_HEIGHT).toBe(1.7);
      expect(b.min.y).toBeGreaterThan(-0.03);
      expect(b.min.y).toBeLessThan(0.03);
      expect(b.max.y).toBeGreaterThan(1.62);
      expect(b.max.y).toBeLessThan(1.78);
      // Centred on the origin from the side, not offset.
      expect(Math.abs(b.getCenter(new Vector3()).x)).toBeLessThan(0.05);
      figure.dispose();
    }
  });

  it('faces +z at rotation 0: the shoes point forward from the origin', () => {
    const figure = createHeroFigure('xuzhu');
    for (let i = 0; i < 30; i++) figure.setPose(standing);
    const shoes = shoeCentres(figure.object);
    expect(shoes).toHaveLength(2);
    for (const c of shoes) expect(c.z).toBeGreaterThan(0.03);
    figure.dispose();
  });

  it('turns towards +x when rotation.y is positive', () => {
    const figure = createHeroFigure('xuzhu');
    figure.object.rotation.y = Math.PI / 2;
    for (let i = 0; i < 30; i++) figure.setPose(standing);
    for (const c of shoeCentres(figure.object)) expect(c.x).toBeGreaterThan(0.03);
    figure.dispose();
  });

  it('moves in every state without breaking its height or producing NaN', () => {
    const figure = createHeroFigure('xuzhu');
    const poses: HeroPose[] = [
      { speed: 6.5, vy: 0, grounded: true, leaping: false, dt: 1 / 60 },
      { speed: 11, vy: 0, grounded: true, leaping: false, dt: 1 / 144 },
      { speed: 11, vy: 9, grounded: false, leaping: false, dt: 1 / 30 },
      { speed: 12, vy: 10, grounded: false, leaping: true, dt: 1 / 60 },
      { speed: 12, vy: -6, grounded: false, leaping: true, dt: 1 / 60 },
      { speed: 0, vy: 0, grounded: true, leaping: false, dt: 1 / 60 },
    ];
    for (const pose of poses) {
      for (let i = 0; i < 90; i++) figure.setPose(pose);
      const b = box(figure.object);
      expect(Number.isFinite(b.min.y + b.max.y + b.min.x + b.max.x)).toBe(true);
      expect(b.max.y).toBeLessThan(1.85);
      expect(b.min.y).toBeGreaterThan(-0.1);
    }
    figure.dispose();
  });

  it('shows different poses for idle, run and leap', () => {
    const figure = createHeroFigure('xuzhu');
    const snapshot = (pose: HeroPose, frames: number): string => {
      for (let i = 0; i < frames; i++) figure.setPose(pose);
      const parts: string[] = [];
      figure.object.traverse((o) => parts.push(`${o.rotation.x.toFixed(2)}/${o.rotation.z.toFixed(2)}`));
      return parts.join(',');
    };
    const idle = snapshot(standing, 60);
    const run = snapshot({ speed: 11, vy: 0, grounded: true, leaping: false, dt: 1 / 60 }, 37);
    const leap = snapshot({ speed: 12, vy: 8, grounded: false, leaping: true, dt: 1 / 60 }, 60);
    expect(new Set([idle, run, leap]).size).toBe(3);
    figure.dispose();
  });
});
