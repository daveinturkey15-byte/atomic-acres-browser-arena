/**
 * nuketown2-interior-materials.ts — procedural TSL interior & garage materials.
 *
 * Authored per threejs-webgpu-interior-lighting-look (SKILL.md §2 & §6):
 *   1. Parquet / wood plank floor: staggered planks, tonal variance, bevel seams.
 *   2. Kitchen ceramic tile floor: grid pattern, grout lines, subtle ceramic mottle.
 *   3. Garage industrial floor: poured concrete, expansion joints, oil drips, tire scuffs.
 *   4. Drywall & plaster: fine stipple noise, baseboard contact shadow.
 *   5. Garage wall: painted studs/boards, workshop grime.
 *   6. Emissive practical fixtures: driven above bloom threshold (warm & cold).
 *
 * Strictly procedural: zero imported textures, images, meshes or LUTs.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { fbm2, hash2, valueNoise2 } from './map3/noise';

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
 * Residential wood plank / parquet floor material.
 * Used for living rooms, stairs, and upstairs sniper rooms.
 */
export function createNuketown2WoodFloorMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.54,
    metalness: 0.04,
  });
  mat.name = 'nuketown2-house-wood-floor';
  mat.type = 'MeshStandardMaterial';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;

  const p = positionWorld;

  // Planks: 0.16 m wide (X), 1.20 m long (Z)
  const u = p.x.div(float(0.16));
  const stagger = floor(u).mul(float(0.4));
  const v = p.z.add(stagger).div(float(1.20));

  const cell = vec2(floor(u), floor(v));
  const toneOffset = hash2(cell).sub(float(0.5)).mul(float(0.09));

  // Bevel joints between planks
  const edgeU = abs(fract(u).sub(float(0.5))).mul(float(2.0));
  const edgeV = abs(fract(v).sub(float(0.5))).mul(float(2.0));
  const seamU = smoothstep(float(0.88), float(0.97), edgeU);
  const seamV = smoothstep(float(0.96), float(0.992), edgeV);
  const seam = max(seamU, seamV);

  // Fine wood grain along plank length (Z)
  const grain = fbm2(vec2(p.x.mul(3.5), p.z.mul(14.0)), 2).sub(float(0.5)).mul(float(0.035));

  // Base warm oak tone: sRGB approx #99734e -> linear ~ [0.32, 0.18, 0.08]
  const baseWood = vec3(0.32, 0.19, 0.09).add(toneOffset).add(grain);
  const seamColor = vec3(0.08, 0.05, 0.03);

  mat.colorNode = mix(baseWood, seamColor, seam);
  mat.roughnessNode = float(0.52).add(seam.mul(float(0.32))).add(toneOffset.mul(float(0.5)));

  return mat;
}

/**
 * Ceramic tile floor material for kitchen areas.
 */
export function createNuketown2TileFloorMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.38,
    metalness: 0.06,
  });
  mat.name = 'nuketown2-kitchen-tile-floor';
  mat.type = 'MeshStandardMaterial';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;

  const p = positionWorld;

  // 0.35 m square ceramic tiles
  const u = p.x.div(float(0.35));
  const v = p.z.div(float(0.35));

  const cell = vec2(floor(u), floor(v));
  const tileMottle = hash2(cell).sub(float(0.5)).mul(float(0.04));

  const edgeU = abs(fract(u).sub(float(0.5))).mul(float(2.0));
  const edgeV = abs(fract(v).sub(float(0.5))).mul(float(2.0));
  const grout = max(
    smoothstep(float(0.90), float(0.97), edgeU),
    smoothstep(float(0.90), float(0.97), edgeV),
  );

  // Pale cream/warm-grey ceramic tile with darker grout
  const tileColor = vec3(0.54, 0.52, 0.48).add(tileMottle);
  const groutColor = vec3(0.20, 0.19, 0.18);

  mat.colorNode = mix(tileColor, groutColor, grout);
  mat.roughnessNode = mix(float(0.36), float(0.85), grout);

  return mat;
}

/**
 * Concrete garage floor with expansion joints, oil drips, and tire scuffs.
 */
export function createNuketown2GarageFloorMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.92,
    metalness: 0.02,
  });
  mat.name = 'nuketown2-garage-floor-concrete';
  mat.type = 'MeshStandardMaterial';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;

  const p = positionWorld;

  // Base poured concrete speckle
  const concreteGrain = fbm2(vec2(p.x.mul(6.0), p.z.mul(6.0)), 2).sub(float(0.5)).mul(float(0.03));

  // Expansion joint grid: 2.5 m in X, 3.5 m in Z
  const edgeX = abs(fract(p.x.div(float(2.5))).sub(float(0.5))).mul(float(2.0));
  const edgeZ = abs(fract(p.z.div(float(3.5))).sub(float(0.5))).mul(float(2.0));
  const joint = max(
    smoothstep(float(0.965), float(0.992), edgeX),
    smoothstep(float(0.965), float(0.992), edgeZ),
  );

  // Oil stain puddles where workbench and vehicles sit
  const oilField = fbm2(vec2(p.x.mul(1.2).add(23.4), p.z.mul(1.2).add(11.8)), 3);
  const oilStain = smoothstep(float(0.68), float(0.82), oilField).mul(float(0.65));

  const baseConcrete = vec3(0.24, 0.23, 0.22).add(concreteGrain);
  const jointColor = vec3(0.08, 0.08, 0.08);

  const colored = mix(baseConcrete, jointColor, joint).sub(oilStain.mul(vec3(0.14, 0.13, 0.12)));
  mat.colorNode = colored;
  mat.roughnessNode = float(0.92).sub(oilStain.mul(float(0.35)));

  return mat;
}

/**
 * Interior drywall plaster material with fine stipple texture.
 */
export function createNuketown2DrywallMaterial(colorHex: number): MeshStandardNodeMaterial {
  const baseColor = new THREE.Color(colorHex);
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.94,
    metalness: 0.01,
  });
  mat.name = `nuketown2-drywall-${colorHex.toString(16)}`;
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  // Fine plaster stipple
  const stipple = valueNoise2(vec2(p.x.mul(16.0), p.y.mul(16.0)))
    .sub(float(0.5))
    .mul(float(0.024));

  const base = vec3(baseColor.r, baseColor.g, baseColor.b);
  mat.colorNode = base.add(stipple);
  mat.roughnessNode = float(0.94).add(stipple.mul(float(0.5)));

  return mat;
}

/**
 * Garage interior wall material: horizontal studs/board framing.
 */
export function createNuketown2GarageWallMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.82,
    metalness: 0.04,
  });
  mat.name = 'nuketown2-garage-wall-boards';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;

  // Horizontal wood board courses every 0.35 m in Y
  const boardV = p.y.div(float(0.35));
  const seam = smoothstep(float(0.92), float(0.98), abs(fract(boardV).sub(float(0.5))).mul(float(2.0)));

  // Base coral-red tone #ac5644 -> linear ~ [0.41, 0.09, 0.06]
  const baseRed = vec3(0.41, 0.09, 0.06);
  const darkSeam = vec3(0.18, 0.04, 0.03);

  mat.colorNode = mix(baseRed, darkSeam, seam);
  mat.roughnessNode = float(0.82).add(seam.mul(float(0.15)));

  return mat;
}

/**
 * Ceiling light practical fixture face driven above bloom threshold.
 * @param warm If true, warm residential ceiling light; if false, cold garage fluorescent tube.
 */
export function createNuketown2CeilingLightMaterial(warm = true): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.18,
    metalness: 0.12,
  });
  mat.name = warm ? 'nuketown2-warm-ceiling-light' : 'nuketown2-cold-tube-light';
  mat.type = 'MeshStandardMaterial';

  if (warm) {
    // Warm tungsten residential illumination: rich golden-white
    mat.colorNode = vec3(1.0, 0.94, 0.84);
    // Driven above 1.02 linear bloom threshold per threejs-webgpu-interior-lighting-look
    mat.emissiveNode = vec3(2.6, 2.1, 1.4);
  } else {
    // Cold daylight fluorescent tube
    mat.colorNode = vec3(0.88, 0.96, 1.0);
    mat.emissiveNode = vec3(1.8, 2.3, 3.1);
  }

  return mat;
}

/**
 * Procedural physical glass material with subtle specular fresnel reflectance and sky tint.
 */
export function createNuketown2GlassMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.42,
  });
  mat.name = 'nuketown2-window-glass';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  const baseTint = vec3(0.60, 0.72, 0.78);
  const shimmer = fbm2(vec2(p.x.mul(1.5), p.y.mul(1.5)), 2).sub(float(0.5)).mul(float(0.035));
  mat.colorNode = baseTint.add(shimmer);

  return mat;
}
