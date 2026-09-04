/**
 * nuketown2-vehicle-materials.ts — procedural TSL automotive materials.
 *
 * Authored per img2threejs & open-world-city-art-loop:
 *   1. Car paint: metallic sheen, clearcoat specular response, subtle flake sparkle.
 *   2. Retro coach lacquer: polished streamlined body, cream/red paint specs.
 *   3. Truck materials: painted cab, corrugated cargo box ribs.
 *   4. Automotive glass: dark tinted reflective glass with specular highlights.
 *   5. Chrome & trim: mirror specular highlights on bumpers and grilles.
 *   6. Headlights & taillights: emissive practical lenses (warm white & red).
 *   7. Rubber tires: textured tread with subtle road dust.
 *
 * Strictly procedural: zero imported textures, images, meshes or LUTs.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { fbm2, valueNoise2 } from './map3/noise';

const {
  float,
  fract,
  positionWorld,
  smoothstep,
  uniform,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/**
 * Procedural metallic car paint material.
 * High specular response, low roughness, subtle metallic flake.
 */
export function createNuketown2CarPaintMaterial(colorHex: number, name: string): MeshStandardNodeMaterial {
  const baseColor = new THREE.Color(colorHex);
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.20,
    metalness: 0.72,
  });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;

  // Metallic flake sparkle
  const flake = valueNoise2(vec2(p.x.mul(32.0), p.z.mul(32.0)))
    .sub(float(0.5))
    .mul(float(0.04));

  // HF-477: THE BASE COLOUR IS A UNIFORM, NOT THREE BAKED CONSTANTS.
  //
  // It used to be `vec3(baseColor.r, baseColor.g, baseColor.b)`, which puts the
  // colour INSIDE the node graph - so every colour this factory is asked for is
  // a different shader and a different WebGPU pipeline. That cost nothing while
  // the arena wanted one car paint. FINDINGS Q4 puts three coloured cars in the
  // reference's street (the driveway pair, a dark saloon and a green classic),
  // and the third and fourth pipeline compiles pushed the arena's first
  // submission past its own 12,000 ms deploy fence: measured on installed
  // Chrome headless with a real hardware WebGPU device (nvidia, blackwell), the
  // build reported "WebGPU queue completion exceeded 12000 ms for submission 1
  // ... fenced draws 511" and Nuke Town Rebuild would not deploy at all, while
  // every other arena still did and the same build with plain
  // MeshStandardMaterial cars deployed fine.
  //
  // As a uniform the graph is IDENTICAL for every colour, so all of them share
  // one compiled pipeline and the arena pays for one car paint no matter how
  // many are parked in it - which is fewer pipelines than before this pass, not
  // more. Nothing about the look changes: the flake, the roughness modulation
  // and the metalness are untouched, and the value fed in is the same colour.
  const base = uniform(new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b)).add(flake);
  mat.colorNode = base;
  mat.roughnessNode = float(0.20).add(flake.mul(float(0.25)));

  return mat;
}

/**
 * Retro coach cream body material.
 */
export function createNuketown2CoachMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.32,
    metalness: 0.38,
  });
  mat.name = 'nuketown2-coach-shell';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  const flake = valueNoise2(vec2(p.x.mul(24.0), p.y.mul(24.0))).sub(float(0.5)).mul(float(0.02));
  // Cream body: linear ~ [0.82, 0.76, 0.64]
  mat.colorNode = vec3(0.82, 0.76, 0.64).add(flake);
  mat.roughnessNode = float(0.32);

  return mat;
}

/**
 * Truck cab painted metal material.
 */
export function createNuketown2TruckCabMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.38,
    metalness: 0.45,
  });
  mat.name = 'nuketown2-truck-cab';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  const flake = valueNoise2(vec2(p.x.mul(20.0), p.y.mul(20.0))).sub(float(0.5)).mul(float(0.025));
  mat.colorNode = vec3(0.74, 0.72, 0.66).add(flake);
  mat.roughnessNode = float(0.38);

  return mat;
}

/**
 * Truck cargo box with vertical corrugation ribs.
 */
export function createNuketown2TruckBoxMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.68,
    metalness: 0.12,
  });
  mat.name = 'nuketown2-truck-box-ribbed';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  // Vertical corrugation ribs every 0.30 m along X
  const ribV = p.x.div(float(0.30));
  const ribShade = smoothstep(float(0.85), float(0.98), fract(ribV)).mul(float(0.12));

  const basePanel = vec3(0.70, 0.68, 0.62).sub(ribShade);
  mat.colorNode = basePanel;
  mat.roughnessNode = float(0.68).add(ribShade.mul(float(0.5)));

  return mat;
}

/**
 * Dark tinted automotive glass.
 */
export function createNuketown2VehicleGlassMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.10,
    metalness: 0.35,
    transparent: true,
    opacity: 0.65,
  });
  mat.name = 'nuketown2-vehicle-glass';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  const sheen = fbm2(vec2(p.x.mul(1.2), p.z.mul(1.2)), 2).sub(float(0.5)).mul(float(0.03));
  mat.colorNode = vec3(0.12, 0.18, 0.22).add(sheen);

  return mat;
}

/**
 * Polished automotive chrome for bumpers, grilles, and hubcaps.
 */
export function createNuketown2ChromeMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.12,
    metalness: 0.94,
  });
  mat.name = 'nuketown2-automotive-chrome';
  mat.type = 'MeshStandardMaterial';

  mat.colorNode = vec3(0.92, 0.94, 0.96);
  mat.roughnessNode = float(0.12);

  return mat;
}

/**
 * Emissive vehicle headlight material.
 */
export function createNuketown2HeadlightMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.15,
    metalness: 0.10,
  });
  mat.name = 'nuketown2-headlight-lens';
  mat.type = 'MeshStandardMaterial';

  mat.colorNode = vec3(1.0, 0.96, 0.88);
  mat.emissiveNode = vec3(2.8, 2.6, 1.8);

  return mat;
}

/**
 * Emissive vehicle taillight material.
 */
export function createNuketown2TaillightMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.20,
    metalness: 0.10,
  });
  mat.name = 'nuketown2-taillight-lens';
  mat.type = 'MeshStandardMaterial';

  mat.colorNode = vec3(0.85, 0.08, 0.05);
  // Subtle ruby-red taillight glow without over-blooming into a magenta artifact
  mat.emissiveNode = vec3(0.45, 0.04, 0.02);

  return mat;
}

/**
 * Textured tire rubber with radial tread.
 */
export function createNuketown2TireMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.88,
    metalness: 0.04,
  });
  mat.name = 'nuketown2-tire-rubber';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  const tread = fbm2(vec2(p.x.mul(12.0), p.z.mul(12.0)), 2).sub(float(0.5)).mul(float(0.025));
  mat.colorNode = vec3(0.08, 0.09, 0.10).add(tread);
  mat.roughnessNode = float(0.88);

  return mat;
}
