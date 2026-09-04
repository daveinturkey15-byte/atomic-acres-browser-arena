/**
 * nuketown2-facade-materials.ts — procedural TSL lap siding, roof shingles, and timber fence.
 *
 * Authored per atomic-acres-procedural-art-authoring and webgpu-tsl-arena-forging:
 *   1. Lap siding: horizontal weatherboard courses (0.18 m pitch), stepped lap shadow,
 *      fine grain, and contact ground grime gradient.
 *   2. Roof shingles: staggered tab courses, lap shadow, mineral granule speckle.
 *   3. Timber fence: vertical pickets with gap seams, per-slat tone variance, wood grain.
 *
 * Strictly procedural: zero imported textures, images, meshes or LUTs.
 */
import * as THREE from 'three';
import type { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { fbm2, hash2 } from './map3/noise';
import { createNuketown2IndirectMaterial } from './rendering/lighting/indirect-term';
/** Cast boundary for TSL DSL runtime helpers */
const {
  abs,
  float,
  floor,
  fract,
  max,
  mix,
  positionWorld,
  smoothstep,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/**
 * Procedural residential roof shingle material.
 * Staggered shingle courses with lap shadows and mineral granule aggregate.
 */
export function createNuketown2RoofMaterial(): MeshStandardNodeMaterial {
  const mat = createNuketown2IndirectMaterial({
    roughness: 0.88,
    metalness: 0.02,
  });
  mat.name = 'nuketown2-roof-shingles';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;

  // Shingle courses: 0.22 m pitch along Z
  const courseV = p.z.div(float(0.22));
  const courseIdx = floor(courseV);
  // Stagger tabs by 0.20 m every course
  const tabU = p.x.add(courseIdx.mul(float(0.20))).div(float(0.38));
  const tabIdx = floor(tabU);

  // Lap shadow: dark band at the top/bottom overlap of each shingle course
  const lapEdge = fract(courseV);
  const lapShadow = smoothstep(float(0.84), float(0.98), lapEdge);

  // Tab gap seam between side-by-side shingles
  const tabEdge = abs(fract(tabU).sub(float(0.5))).mul(float(2.0));
  const tabSeam = smoothstep(float(0.93), float(0.98), tabEdge).mul(smoothstep(float(0.0), float(0.25), lapEdge));

  // Per-shingle tonal variation
  const tabCell = vec2(tabIdx, courseIdx);
  const tabVariation = hash2(tabCell).sub(float(0.5)).mul(float(0.06));

  // Mineral granule aggregate
  const granules = fbm2(vec2(p.x.mul(14.0), p.z.mul(14.0)), 2).sub(float(0.5)).mul(float(0.035));

  // Base dark charcoal shingle color #444c4d -> linear ~ [0.06, 0.08, 0.08]
  const baseShingle = vec3(0.062, 0.076, 0.078).add(tabVariation).add(granules);
  const shadowColor = vec3(0.022, 0.024, 0.025);

  const shadowMask = max(lapShadow, tabSeam);
  mat.colorNode = mix(baseShingle, shadowColor, shadowMask);
  mat.roughnessNode = float(0.88).add(granules.mul(float(0.5))).sub(shadowMask.mul(float(0.08)));

  return mat;
}

/**
 * Procedural lap-siding (horizontal weatherboard) material.
 * @param baseColorHex Exterior wall color (e.g. 0x46809f for blue house, 0xd9a43b for yellow house)
 * @param name Material identifier
 */
export function createNuketown2LapSidingMaterial(baseColorHex: number, name: string): MeshStandardNodeMaterial {
  const baseColor = new THREE.Color(baseColorHex);
  const mat = createNuketown2IndirectMaterial({
    roughness: 0.76,
    metalness: 0.02,
  });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  mat.color.setHex(baseColorHex);

  const p = positionWorld;

  // Horizontal board courses: 0.18 m board height
  const boardV = p.y.div(float(0.18));
  const boardEdge = fract(boardV);

  // Stepped lap shadow under bottom drip edge of each horizontal board
  const lapShadow = smoothstep(float(0.86), float(0.98), boardEdge);

  // Wood grain / paint texture along the horizontal run
  const boardRun = p.x.add(p.z);
  const grain = fbm2(vec2(boardRun.mul(3.5), p.y.mul(0.6)), 2).sub(float(0.5)).mul(float(0.03));

  // Per-board subtle tonal modulation
  const boardIdx = floor(boardV);
  const boardTone = hash2(vec2(boardIdx, float(13.7))).sub(float(0.5)).mul(float(0.04));

  // Lower contact grime near ground (y < 0.6 m)
  const groundGrime = smoothstep(float(0.85), float(0.0), p.y).mul(float(0.18));

  const base = vec3(baseColor.r, baseColor.g, baseColor.b).add(boardTone).add(grain);
  // Warm shadow color preserving the base hue rather than desaturating under cool sky ambient
  const shadowCol = vec3(baseColor.r * 0.55, baseColor.g * 0.52, baseColor.b * 0.40);

  const finalColor = mix(base, shadowCol, lapShadow).sub(groundGrime.mul(vec3(0.08, 0.07, 0.05)));
  mat.colorNode = finalColor;
  mat.roughnessNode = float(0.76).add(lapShadow.mul(float(0.12)));

  return mat;
}

/**
 * Procedural timber fence material.
 * Vertical picket slats with dark gaps, wood grain, and per-slat tone variance.
 */
export function createNuketown2FenceMaterial(): MeshStandardNodeMaterial {
  const mat = createNuketown2IndirectMaterial({
    roughness: 0.90,
    metalness: 0.02,
  });
  mat.name = 'nuketown2-timber-fence';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;

  // Vertical slats along X or Z: 0.16 m picket width
  const picketU = p.x.add(p.z).div(float(0.16));
  const slatIdx = floor(picketU);
  const slatEdge = abs(fract(picketU).sub(float(0.5))).mul(float(2.0));
  const slatGap = smoothstep(float(0.88), float(0.97), slatEdge);

  // Per-slat timber variation
  const slatTone = hash2(vec2(slatIdx, float(41.3))).sub(float(0.5)).mul(float(0.08));

  // Vertical wood grain along Y
  const grain = fbm2(vec2(picketU.mul(0.5), p.y.mul(5.0)), 2).sub(float(0.5)).mul(float(0.04));

  // Base timber brown #673b24 -> linear ~ [0.14, 0.05, 0.02]
  const baseWood = vec3(0.14, 0.05, 0.022).add(slatTone).add(grain);
  const gapColor = vec3(0.03, 0.015, 0.01);

  mat.colorNode = mix(baseWood, gapColor, slatGap);
  mat.roughnessNode = float(0.90).add(slatGap.mul(float(0.08)));

  return mat;
}
