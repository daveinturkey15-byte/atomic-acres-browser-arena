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
import { materialReference } from 'three/tsl';
import { lutFbm } from './nuketown2-materials/noise-lut';

const {
  float,
  fract,
  positionWorld,
  smoothstep,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/**
 * Coach and truck paint use the same world-space flake family.  Keep the
 * authored swatch, roughness and flake recipe in material properties so the
 * two bodies bind one node topology instead of compiling one pipeline each.
 */
const VEHICLE_PAINT_UNIFORMS = Object.freeze({
  baseColor: materialReference('nuketown2VehiclePaintBaseColor', 'color'),
  roughness: materialReference('nuketown2VehiclePaintRoughness', 'float'),
  flakeFrequency: materialReference('nuketown2VehiclePaintFlakeFrequency', 'float'),
  flakeStrength: materialReference('nuketown2VehiclePaintFlakeStrength', 'float'),
});

function bindVehiclePaintUniforms(
  material: MeshStandardNodeMaterial,
  color: THREE.Color,
  roughness: number,
  flakeFrequency: number,
  flakeStrength: number,
): void {
  const slots = material as unknown as Record<string, unknown>;
  slots.nuketown2VehiclePaintBaseColor = color;
  slots.nuketown2VehiclePaintRoughness = roughness;
  slots.nuketown2VehiclePaintFlakeFrequency = flakeFrequency;
  slots.nuketown2VehiclePaintFlakeStrength = flakeStrength;
}

function createSharedVehiclePaintMaterial(
  name: string,
  color: THREE.Color,
  roughness: number,
  metalness: number,
  flakeFrequency: number,
  flakeStrength: number,
): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ roughness, metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  bindVehiclePaintUniforms(mat, color, roughness, flakeFrequency, flakeStrength);
  const p = positionWorld;
  const flake = lutFbm(vec2(
    p.x.mul(VEHICLE_PAINT_UNIFORMS.flakeFrequency),
    p.y.mul(VEHICLE_PAINT_UNIFORMS.flakeFrequency),
  ), 1).sub(float(0.5)).mul(VEHICLE_PAINT_UNIFORMS.flakeStrength);
  mat.colorNode = (VEHICLE_PAINT_UNIFORMS.baseColor as any).add(flake);
  mat.roughnessNode = VEHICLE_PAINT_UNIFORMS.roughness;
  return mat;
}

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
  const flake = lutFbm(vec2(p.x.mul(32.0), p.z.mul(32.0)), 1)
    .sub(float(0.5))
    .mul(float(0.04));

  const base = vec3(baseColor.r, baseColor.g, baseColor.b).add(flake);
  mat.colorNode = base;
  mat.roughnessNode = float(0.20).add(flake.mul(float(0.25)));

  return mat;
}

/**
 * Retro coach cream body material.
 */
export function createNuketown2CoachMaterial(): MeshStandardNodeMaterial {
  return createSharedVehiclePaintMaterial('nuketown2-coach-shell', new THREE.Color(0.82, 0.76, 0.64), 0.32, 0.38, 24, 0.02);
}

/**
 * Truck cab painted metal material.
 */
export function createNuketown2TruckCabMaterial(): MeshStandardNodeMaterial {
  return createSharedVehiclePaintMaterial('nuketown2-truck-cab', new THREE.Color(0.74, 0.72, 0.66), 0.38, 0.45, 20, 0.025);
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
  const sheen = lutFbm(vec2(p.x.mul(1.2), p.z.mul(1.2)), 2).sub(float(0.5)).mul(float(0.03));
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
  const tread = lutFbm(vec2(p.x.mul(12.0), p.z.mul(12.0)), 2).sub(float(0.5)).mul(float(0.025));
  mat.colorNode = vec3(0.08, 0.09, 0.10).add(tread);
  mat.roughnessNode = float(0.88);

  return mat;
}
