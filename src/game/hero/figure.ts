import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import type { HeroId } from '../heroes';

/**
 * Hero figure contract (a real rigged model must keep it, so movement and camera code never change):
 *
 * - `object` is a Group whose origin is at the FEET, on the ground, centred between them.
 * - It faces +z when `object.rotation.y` is 0; positive rotation.y turns towards +x (the same as heading).
 * - Standing height is HERO_FIGURE_HEIGHT metres (top of the head), about 1.7.
 * - The caller sets position and rotation.y every frame; the figure animates only itself, through setPose.
 * - `dispose` frees every geometry and material the figure created.
 */
export const HERO_FIGURE_HEIGHT = 1.7;

/** What the figure needs to know to pick a motion. All speeds in m/s. */
export interface HeroPose {
  /** Horizontal speed. */
  speed: number;
  /** Vertical speed, positive up. */
  vy: number;
  grounded: boolean;
  /** In a lightness leap (arms spread, robe trailing). */
  leaping: boolean;
  /** Seconds since the previous call. */
  dt: number;
}

export interface HeroFigure {
  object: Group;
  setPose(pose: HeroPose): void;
  dispose(): void;
}

interface Palette {
  robe: number;
  sash: number;
  inner: number;
  skin: number;
  hair: number | undefined;
}

const palettes: Record<HeroId, Palette> = {
  // Xuzhu: a plain young monk in grey, shaved head.
  xuzhu: { robe: 0x9c9fa0, sash: 0x4a3f36, inner: 0xe0dacb, skin: 0xd8a47f, hair: undefined },
  'qiao-feng': { robe: 0x3f566b, sash: 0x2a2623, inner: 0xcfc6b2, skin: 0xcf9a74, hair: 0x1d1a18 },
  'duan-yu': { robe: 0xe3dccb, sash: 0x6b7f8c, inner: 0xf3efe4, skin: 0xe0b08c, hair: 0x1d1a18 },
};

const SMOOTH = 10;
const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The joint angles one pose asks for, in radians. */
interface Joints {
  legL: number;
  legR: number;
  armLx: number;
  armRx: number;
  armLz: number;
  armRz: number;
  lean: number;
  skirtX: number;
  skirtFlare: number;
  bob: number;
}

/**
 * A grey-robed placeholder, built from primitives. Not final art: replace the body of this factory
 * with a loaded model that keeps the contract above.
 */
export function createHeroFigure(heroId: HeroId): HeroFigure {
  const pal = palettes[heroId];
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const geo = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mat = (color: number, doubleSided = false): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ color, roughness: 0.9, side: doubleSided ? DoubleSide : FrontSide });
    materials.push(m);
    return m;
  };
  const robe = mat(pal.robe, true);
  const robeSolid = mat(pal.robe);
  const sash = mat(pal.sash);
  const inner = mat(pal.inner);
  const skin = mat(pal.skin);
  const wrap = mat(0xcfc8b6);
  const shoe = mat(0x2b2724);
  const dark = mat(0x1c1a19);

  const part = (parent: Object3D, g: BufferGeometry, m: Material, x = 0, y = 0, z = 0): Mesh => {
    const mesh = new Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const root = new Group();
  root.name = `hero-${heroId}`;

  // ---- legs: pivot at the hip (0.92 m), straight down to the soles at y = 0
  const hipY = 0.92;
  const makeLeg = (side: number): Group => {
    const leg = new Group();
    leg.position.set(side * 0.1, hipY, 0);
    const shin = geo(new CylinderGeometry(0.058, 0.048, 0.85, 10));
    shin.translate(0, -0.425, 0);
    part(leg, shin, wrap);
    part(leg, geo(new BoxGeometry(0.1, 0.07, 0.27)), shoe, 0, -hipY + 0.035, 0.06);
    root.add(leg);
    return leg;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ---- body: pivot at the hips so it can lean
  const body = new Group();
  body.position.set(0, hipY + 0.03, 0);
  root.add(body);

  const skirtPivot = new Group();
  body.add(skirtPivot);
  const skirtGeo = geo(new CylinderGeometry(0.19, 0.31, 0.64, 20, 1, true));
  skirtGeo.translate(0, -0.32, 0);
  const skirt = part(skirtPivot, skirtGeo, robe);
  skirt.scale.set(1, 1, 0.9);

  const torsoGeo = geo(new CylinderGeometry(0.185, 0.2, 0.5, 18));
  torsoGeo.translate(0, 0.25, 0);
  const torso = part(body, torsoGeo, robeSolid);
  torso.scale.z = 0.66;

  // crossed collar and sash
  for (const side of [1, -1]) {
    const lapel = part(body, geo(new BoxGeometry(0.05, 0.3, 0.012)), inner, side * 0.045, 0.36, 0.137);
    lapel.rotation.z = side * -0.42;
  }
  const sashGeo = geo(new CylinderGeometry(0.208, 0.208, 0.1, 18));
  const sashMesh = part(body, sashGeo, sash, 0, 0.1, 0);
  sashMesh.scale.z = 0.68;
  part(body, geo(new BoxGeometry(0.09, 0.09, 0.05)), sash, 0.03, 0.1, 0.15);
  const tail = part(skirtPivot, geo(new BoxGeometry(0.045, 0.3, 0.015)), sash, 0.05, -0.14, 0.17);
  tail.rotation.x = 0.1;

  // prayer beads, a collar ring, neck and head
  const beads = part(body, geo(new TorusGeometry(0.115, 0.014, 6, 24)), dark, 0, 0.42, 0.045);
  beads.rotation.x = Math.PI / 2 - 0.35;
  const collar = part(body, geo(new TorusGeometry(0.1, 0.022, 6, 20)), inner, 0, 0.505, 0);
  collar.rotation.x = Math.PI / 2;
  part(body, geo(new CylinderGeometry(0.045, 0.05, 0.1, 10)), skin, 0, 0.53, 0);

  const head = new Group();
  head.position.set(0, 0.62, 0.005);
  body.add(head);
  const headMesh = part(head, geo(new SphereGeometry(0.115, 24, 16)), skin);
  headMesh.scale.y = 1.1;
  for (const side of [1, -1]) {
    part(head, geo(new SphereGeometry(0.025, 8, 6)), skin, side * 0.113, -0.005, -0.005);
    part(head, geo(new SphereGeometry(0.012, 6, 5)), dark, side * 0.04, 0.015, 0.103);
  }
  if (pal.hair !== undefined) {
    const hair = part(head, geo(new SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)), mat(pal.hair), 0, 0.01, -0.01);
    hair.scale.y = 1.1;
  }

  // ---- arms: wide sleeves hanging from the shoulder pivots
  const makeArm = (side: number): Group => {
    const arm = new Group();
    arm.position.set(side * 0.225, 0.47, 0);
    const sleeve = geo(new CylinderGeometry(0.058, 0.098, 0.5, 12));
    sleeve.translate(0, -0.25, 0);
    part(arm, sleeve, robeSolid);
    part(arm, geo(new SphereGeometry(0.045, 10, 8)), skin, 0, -0.56, 0);
    body.add(arm);
    return arm;
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // ---- motion
  let phase = 0;
  let clock = 0;
  let wRun = 0;
  let wAir = 0;
  let wLeap = 0;
  let wUp = 0;
  let landDip = 0;
  let lastVy = 0;
  let wasAir = false;
  const j: Joints = { legL: 0, legR: 0, armLx: 0, armRx: 0, armLz: 0.06, armRz: -0.06, lean: 0, skirtX: 0, skirtFlare: 1, bob: 0 };

  const setPose = (pose: HeroPose): void => {
    const dt = Math.min(Math.max(pose.dt, 0), 0.1);
    clock += dt;
    const sprint = clamp01((pose.speed - 6.5) / 4.5);
    wRun = damp(wRun, clamp01(pose.speed / 2), SMOOTH, dt);
    const air = !pose.grounded;
    wAir = damp(wAir, air ? 1 : 0, 14, dt);
    wLeap = damp(wLeap, pose.leaping ? 1 : 0, 8, dt);
    wUp = damp(wUp, pose.vy > 0.5 ? 1 : 0, 8, dt);

    // Landing: remember the impact, dip the body, let it recover.
    if (air) lastVy = pose.vy;
    if (wasAir && !air) landDip = clamp01(-lastVy / 14) * 0.16;
    wasAir = air;
    landDip = damp(landDip, 0, 9, dt);

    // The stride follows ground speed, so feet do not skate.
    phase += (pose.speed / 1.35) * Math.PI * dt * (pose.grounded ? 1 : 0.15);
    const s = Math.sin(phase);
    const amp = mix(0.55, 0.95, sprint);

    // Idle breathing is always on, quiet.
    const breathe = Math.sin(clock * 1.7);

    // ground: idle -> run
    const groundArm = amp * 0.95 * s;
    const ground: Joints = {
      legL: amp * s,
      legR: -amp * s,
      armLx: mix(0.02 * breathe, -groundArm, wRun),
      armRx: mix(0.02 * breathe, groundArm, wRun),
      armLz: mix(0.07 + 0.02 * breathe, 0.12, wRun),
      armRz: mix(-0.07 - 0.02 * breathe, -0.12, wRun),
      lean: mix(0, 0.1 + 0.2 * sprint, wRun),
      skirtX: mix(0, 0.1 + 0.16 * sprint, wRun),
      skirtFlare: mix(1, 1.04 + 0.05 * Math.abs(s), wRun),
      bob: mix(0, 0.035 * Math.abs(Math.cos(phase)) * (0.6 + 0.4 * sprint), wRun),
    };
    ground.legL = mix(0, ground.legL, wRun);
    ground.legR = mix(0, ground.legR, wRun);

    // air: ascending / floating, for a jump and for a leap
    const jumpUp: Joints = { legL: -0.7, legR: 0.25, armLx: -0.4, armRx: -0.4, armLz: 0.7, armRz: -0.7, lean: 0.1, skirtX: 0.3, skirtFlare: 1.1, bob: 0 };
    const jumpDown: Joints = { legL: -0.25, legR: 0.05, armLx: -0.2, armRx: -0.2, armLz: 0.9, armRz: -0.9, lean: 0.04, skirtX: -0.1, skirtFlare: 1.25, bob: 0 };
    const leapUp: Joints = { legL: -1.15, legR: 0.45, armLx: -0.25, armRx: -0.25, armLz: 1.35, armRz: -1.35, lean: 0.4, skirtX: 0.65, skirtFlare: 1.08, bob: 0 };
    const leapDown: Joints = { legL: -0.55, legR: 0.3, armLx: -0.1, armRx: -0.1, armLz: 1.9, armRz: -1.9, lean: 0.18, skirtX: 0.2, skirtFlare: 1.25, bob: 0 };
    const jumpAir = lerpJoints(jumpDown, jumpUp, wUp);
    const leapAir = lerpJoints(leapDown, leapUp, wUp);
    const airJ = lerpJoints(jumpAir, leapAir, wLeap);

    const target = lerpJoints(ground, airJ, wAir);
    // A little sway on top, so the robe is never dead still.
    target.skirtX += 0.015 * breathe;
    for (const key of Object.keys(j) as (keyof Joints)[]) j[key] = damp(j[key], target[key], 18, dt);

    legL.rotation.x = j.legL;
    legR.rotation.x = j.legR;
    armL.rotation.set(j.armLx, 0, j.armLz);
    armR.rotation.set(j.armRx, 0, j.armRz);
    body.rotation.x = j.lean;
    body.position.y = hipY + 0.03 + j.bob - landDip;
    skirtPivot.rotation.x = j.skirtX;
    skirtPivot.rotation.z = 0.05 * s * wRun;
    skirtPivot.scale.set(j.skirtFlare, 1, mix(1, j.skirtFlare, 0.6) + 0.12 * Math.abs(j.legL - j.legR));
    torso.scale.y = 1 + 0.014 * breathe;
    head.position.y = 0.62 + 0.004 * breathe;
  };

  return {
    object: root,
    setPose,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

function lerpJoints(a: Joints, b: Joints, t: number): Joints {
  return {
    legL: mix(a.legL, b.legL, t),
    legR: mix(a.legR, b.legR, t),
    armLx: mix(a.armLx, b.armLx, t),
    armRx: mix(a.armRx, b.armRx, t),
    armLz: mix(a.armLz, b.armLz, t),
    armRz: mix(a.armRz, b.armRz, t),
    lean: mix(a.lean, b.lean, t),
    skirtX: mix(a.skirtX, b.skirtX, t),
    skirtFlare: mix(a.skirtFlare, b.skirtFlare, t),
    bob: mix(a.bob, b.bob, t),
  };
}
