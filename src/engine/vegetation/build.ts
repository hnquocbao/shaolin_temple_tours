import {
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { TreeInstance } from './scatter';
import { SPECIES, createTreeGeometry, type Lod, type SpeciesId } from './species';

/** Wind and light of the foliage material. */
const VERTEX_PARS = /* glsl */ `
attribute float aLeaf;
attribute float aSway;
uniform float uTime;
varying float vLeaf;
varying vec3 vLeafPos;
`;

const COLOR_VERTEX = /* glsl */ `
vColor = vec4(1.0);
vColor.rgb *= color;
#ifdef USE_INSTANCING_COLOR
  // Foliage takes the instance's colour; wood keeps its own.
  vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aLeaf);
#endif
vLeaf = aLeaf;
`;

const BEGIN_VERTEX = /* glsl */ `
vec3 transformed = vec3( position );
{
  // World-fixed pattern position (before the wind), so leaf texture does not crawl; one phase per tree.
  vec4 treePos = instanceMatrix * vec4( position, 1.0 );
  vLeafPos = ( modelMatrix * treePos ).xyz;
  float ph = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.17;
  float gust = sin( uTime * 1.1 + ph ) + 0.5 * sin( uTime * 2.3 + ph * 1.9 );
  transformed.x += gust * aSway * 0.32;
  transformed.z += cos( uTime * 0.9 + ph * 1.3 ) * aSway * 0.2;
  transformed += aLeaf * 0.05 * vec3( sin( uTime * 3.1 + position.x * 2.3 + ph ), 0.0, cos( uTime * 2.7 + position.z * 2.1 + ph ) );
}
`;

const FRAGMENT_PARS = /* glsl */ `
varying float vLeaf;
varying vec3 vLeafPos;

float vegHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float vegNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( vegHash( i ), vegHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( vegHash( i + vec3( 0.0, 1.0, 0.0 ) ), vegHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
    mix( mix( vegHash( i + vec3( 0.0, 0.0, 1.0 ) ), vegHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( vegHash( i + vec3( 0.0, 1.0, 1.0 ) ), vegHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ),
    f.z );
}
`;

// Leaf clumps: two scales of noise darken and lighten the foliage. Fine detail fades with distance.
const COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
float vegDist = length( vViewPosition );
float vegFine = 1.0 - smoothstep( 80.0, 260.0, vegDist );
float vegClump = vegNoise( vLeafPos * 1.15 );
float vegLeaf = mix( vegNoise( vLeafPos * 5.5 ), vegNoise( vLeafPos * 14.0 + 3.7 ), 0.5 );
// Tufts: dark gaps between lit leaf clusters, so the surface reads as many leaves, not one skin.
float vegTuft = mix( 1.0, mix( 0.5, 1.25, smoothstep( 0.25, 0.75, vegLeaf ) ), vegFine );
float vegTone = ( 0.6 + 0.65 * vegClump ) * vegTuft;
// Bark: streaks running up the trunk.
float vegBark = 0.65 + 0.55 * vegNoise( vLeafPos * vec3( 7.0, 1.3, 7.0 ) );
diffuseColor.rgb *= mix( vegBark, vegTone, vLeaf );
`;

// Ragged outline: where a leaf surface turns edge-on (judged on the true faces, not the smoothed normals), noise
// punches holes so the silhouette is leafy, not smooth. Fades out with distance, where it would only shimmer.
const NORMAL_FRAGMENT = /* glsl */ `
#include <normal_fragment_begin>
{
  // Small bumps in the normal: leaf clusters catch the light one by one.
  vec3 vegBump = vec3( vegNoise( vLeafPos * 4.3 + 1.0 ), vegNoise( vLeafPos * 4.3 + 7.0 ), vegNoise( vLeafPos * 4.3 + 13.0 ) ) - 0.5;
  float vegBumpAmount = vLeaf * ( 1.0 - smoothstep( 60.0, 200.0, length( vViewPosition ) ) );
  normal = normalize( normal + ( viewMatrix * vec4( vegBump, 0.0 ) ).xyz * 0.9 * vegBumpAmount );
}
if ( vLeaf > 0.5 ) {
  vec3 vegFace = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
  float vegRim = 1.0 - abs( dot( vegFace, normalize( vViewPosition ) ) );
  float vegCut = mix( 1.2, 0.3, smoothstep( 0.45, 0.98, vegRim ) );
  vegCut = mix( 1.2, vegCut, 1.0 - smoothstep( 70.0, 240.0, length( vViewPosition ) ) );
  float vegHole = mix( vegNoise( vLeafPos * 8.7 + 11.0 ), vegNoise( vLeafPos * 21.0 ), 0.5 );
  if ( vegHole > vegCut ) discard;
}
`;

// Light that comes through leaves: a floor under the shade so foliage never goes black.
const EMISSIVE_FRAGMENT = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vLeaf * 0.22;
`;

export interface VegetationStats {
  trees: number;
  /** Triangles of one pass over everything built (before culling). */
  triangles: number;
  /** Instanced meshes: draw calls of the main pass. */
  meshes: number;
  /** Meshes that also draw into the sun's shadow map. */
  shadowCasters: number;
  /** meshes + shadowCasters: all passes, the way the building kit counts. */
  drawCalls: number;
}

export interface VegetationOptions {
  /**
   * Distance strategy, fixed at build time: trees within `near` metres of any `focus` point (camera stops, the
   * hero's spawn) get the full shape, all others the cheap far shape. Without it every tree is full detail.
   */
  lod?: { focus: readonly (readonly [number, number, number])[]; near: number };
}

export interface Vegetation {
  root: Group;
  stats: VegetationStats;
  /** Wind. Call with scene time; never call it while frozen and the trees stand still. */
  update(elapsed: number): void;
  /** Idempotent: instanced meshes, geometries and the material are all freed. */
  dispose(): void;
}

function lodOf(tree: TreeInstance, options: VegetationOptions): Lod {
  const lod = options.lod;
  if (!lod || !SPECIES[tree.species].farVariant) return 0;
  const n2 = lod.near * lod.near;
  for (const f of lod.focus) {
    const dx = tree.x - f[0];
    const dy = tree.y - f[1];
    const dz = tree.z - f[2];
    if (dx * dx + dy * dy + dz * dz <= n2) return 0;
  }
  return 1;
}

/** Turn scattered trees into instanced meshes: one per species, shape variant and detail level that is used. */
export function buildVegetation(trees: readonly TreeInstance[], options: VegetationOptions = {}): Vegetation {
  const root = new Group();
  root.name = 'vegetation';

  const time = { value: 0 };
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <color_vertex>', COLOR_VERTEX)
      .replace('#include <begin_vertex>', BEGIN_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', COLOR_FRAGMENT)
      .replace('#include <normal_fragment_begin>', NORMAL_FRAGMENT)
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'vegetation-v1';

  const groups = new Map<string, { species: SpeciesId; variant: number; lod: Lod; trees: TreeInstance[] }>();
  for (const tree of trees) {
    const info = SPECIES[tree.species];
    const lod = lodOf(tree, options);
    // Far detail is one shape per species: a few draw calls matter more than variety nobody can see from there.
    const variant = lod === 1 ? 0 : ((tree.variant % info.variants) + info.variants) % info.variants;
    const key = `${tree.species}:${variant}:${lod}`;
    const g = groups.get(key);
    if (g) g.trees.push(tree);
    else groups.set(key, { species: tree.species, variant, lod, trees: [tree] });
  }

  const meshes: InstancedMesh[] = [];
  const geometries: BufferGeometry[] = [];
  const stats: VegetationStats = { trees: trees.length, triangles: 0, meshes: 0, shadowCasters: 0, drawCalls: 0 };
  const up = new Vector3(0, 1, 0);
  const q = new Quaternion();
  const m = new Matrix4();
  const s = new Vector3();
  const p = new Vector3();
  const color = new Color();

  for (const [key, g] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const geometry = createTreeGeometry(g.species, g.variant, g.lod);
    geometries.push(geometry);
    const mesh = new InstancedMesh(geometry, material, g.trees.length);
    mesh.name = `trees-${key}`;
    g.trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rotation);
      p.set(t.x, t.y, t.z);
      s.set(t.scale, t.scale * t.stretch, t.scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.setHex(t.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = SPECIES[g.species].castShadow && g.lod === 0;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    meshes.push(mesh);
    stats.meshes++;
    if (mesh.castShadow) stats.shadowCasters++;
    stats.triangles += (geometry.getIndex()?.count ?? 0) / 3 * g.trees.length;
  }
  stats.triangles = Math.round(stats.triangles);
  stats.drawCalls = stats.meshes + stats.shadowCasters;

  let disposed = false;
  return {
    root,
    stats,
    update(elapsed) {
      time.value = elapsed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const g of geometries) g.dispose();
      material.dispose();
    },
  };
}
