/**
 * nuketown2-interior-materials.ts — procedural TSL interior & garage materials.
 *
 * DAY-2 NIGHT lane MATERIALS-HOUSE-VEHICLES: every opaque surface here is now
 * routed through the spec/wear/relief library (`src/nuketown2-materials/`).
 * Each factory authors a `Nuketown2MaterialSpec` (grain 0.5-1.5 mm, scuff
 * 20-80 mm, traffic 0.5-3 m, soil, read distance), composes it with
 * `buildWear` (ONE shared noise LUT, per-scale distance falloff, zero new
 * samplers) and perturbs the shading normal with `reliefNormal` (metre-space
 * height, `MAX_RELIEF_SLOPE`-clamped, zero new textures). Deleted on this
 * pass per the standing streamline directive: `createNuketown2TileFloorMaterial`,
 * `createNuketown2GarageWallMaterial` (both zero live call sites) and the dead
 * same-named `createNuketown2PoolWaterMaterial` (live one is
 * `src/nuketown2-pool-water.ts`, untouched).
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { hash2 } from './map3/noise';
import { assertSpec, type Nuketown2MaterialSpec } from './nuketown2-materials';
import { buildWear, boxUv, groundUv, wallUv } from './nuketown2-materials/wear';
import { reliefNormal } from './nuketown2-materials/relief';
import { createNuketown2Uniforms } from './nuketown2-materials/material-uniforms';
import { lutFbm } from './nuketown2-materials/noise-lut';

/** Cast boundary for TSL DSL runtime helpers */
const {
  abs,
  clamp,
  float,
  floor,
  fract,
  max,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  uniform,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/** 1.2 mm plank bevel at the seam, metres. Positive is out of the surface. */
const WOOD_BEVEL_M = -0.0012;
/** 0.06 mm grain ridge along the plank, metres: slope ~0.3 on its 1.1 mm period. */
const WOOD_GRAIN_RIDGE_M = 0.00006;
/** 4 mm sawn expansion joint, metres. */
const GARAGE_JOINT_M = -0.004;
/** 0.12 mm concrete float tooth, metres: slope ~0.5 on its 1.5 mm period. */
const GARAGE_FLOAT_M = 0.00012;
/** 0.15 mm trowel-swirl skim carried by the scuff field, metres. */
const GARAGE_SWIRL_M = 0.00015;
/** 0.06 mm drywall orange-peel roll texture, metres: slope ~0.5 on 0.8 mm. */
const DRYWALL_PEEL_M = 0.00006;
/** 1.5 mm taped-joint crown every 1.2 m, metres. */
const DRYWALL_JOINT_CROWN_M = 0.0015;

function drywallSpec(name: string, baseSrgb: number): Nuketown2MaterialSpec {
  return assertSpec({
    name, family: 'concrete', baseSrgb, roughness: 0.94, metalness: 0.01,
    grain: { sizeM: 0.0008, albedo: 0.030, roughness: 0.06 },
    scuff: { sizeM: 0.045, albedo: 0.055, roughness: 0.09 },
    traffic: { sizeM: 1.2, albedo: 0.060, roughness: 0.07 },
    soil: 0.075, readDistanceM: 0.5,
  });
}

function woodFloorSpec(): Nuketown2MaterialSpec {
  return assertSpec({
    name: 'nuketown2-house-wood-floor', family: 'timber', baseSrgb: 0xb26a24,
    roughness: 0.54, metalness: 0.04,
    grain: { sizeM: 0.0011, albedo: 0.035, roughness: 0.07 },
    scuff: { sizeM: 0.060, albedo: 0.070, roughness: 0.10 },
    traffic: { sizeM: 1.5, albedo: 0.050, roughness: 0.08 },
    soil: 0.080, readDistanceM: 0.5,
  });
}
function garageFloorSpec(): Nuketown2MaterialSpec {
  return assertSpec({
    name: 'nuketown2-garage-floor-concrete', family: 'concrete', baseSrgb: 0x86817a,
    roughness: 0.92, metalness: 0.02,
    grain: { sizeM: 0.0015, albedo: 0.030, roughness: 0.06 },
    scuff: { sizeM: 0.055, albedo: 0.065, roughness: 0.10 },
    traffic: { sizeM: 2.5, albedo: 0.060, roughness: 0.08 },
    soil: 0.095, readDistanceM: 1.0,
  });
}

/**
 * Residential wood plank / parquet floor material.
 * Used for living rooms, stairs, and upstairs sniper rooms.
 */
export function createNuketown2WoodFloorMaterial(): MeshStandardNodeMaterial {
  const spec = woodFloorSpec();
  const mat = new MeshStandardNodeMaterial({
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
  mat.name = spec.name;
  mat.type = 'MeshStandardMaterial';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;

  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, mat);
  mat.userData.nuketown2Spec = spec;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);
  const p = positionWorld;

  // Planks: 0.16 m wide (X), 1.20 m long (Z)
  const u = p.x.div(float(0.16));
  const stagger = floor(u).mul(float(0.4));
  const v = p.z.add(stagger).div(float(1.20));

  const cell = vec2(floor(u), floor(v));
  const toneOffset = hash2(cell).sub(float(0.5)).mul(float(0.09));

  // Bevel joints between planks, widened to read at room distance.
  const edgeU = abs(fract(u).sub(float(0.5))).mul(float(2.0));
  const edgeV = abs(fract(v).sub(float(0.5))).mul(float(2.0));
  const seamU = smoothstep(float(0.82), float(0.96), edgeU);
  const seamV = smoothstep(float(0.94), float(0.99), edgeV);
  const seam = max(seamU, seamV);

  // Base vivid orange floor: the authored spec baseSrgb carried as a uniform
  // (HF-477 pattern), so the accent tint is data, not a literal.
  const baseWood = uniforms.baseColor.add(toneOffset);
  const seamColor = vec3(0.06, 0.035, 0.02);

  mat.colorNode = mix(baseWood, seamColor, seam).mul(wear.albedoMul);
  mat.roughnessNode = clamp(
    wear.roughness.add(seam.mul(float(0.32))).add(toneOffset.mul(float(0.5))),
    float(0.05), float(1.0),
  );
  // RELIEF. Plank bevel at the seam, grain ridge along the plank from the
  // distance-faded grain field (never a fresh noise call).
  mat.normalNode = reliefNormal(
    seam.mul(float(WOOD_BEVEL_M)).add(wear.grain.mul(float(WOOD_GRAIN_RIDGE_M))),
  );

  return mat;
}

/**
 * Concrete garage floor with expansion joints, oil drips, and tire scuffs.
 */
export function createNuketown2GarageFloorMaterial(): MeshStandardNodeMaterial {
  const spec = garageFloorSpec();
  const mat = new MeshStandardNodeMaterial({
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
  mat.name = spec.name;
  mat.type = 'MeshStandardMaterial';
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;

  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x4a4238, mat);
  mat.userData.nuketown2Spec = spec;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);
  const p = positionWorld;

  // Expansion joint grid: 2.5 m in X, 3.5 m in Z
  const edgeX = abs(fract(p.x.div(float(2.5))).sub(float(0.5))).mul(float(2.0));
  const edgeZ = abs(fract(p.z.div(float(3.5))).sub(float(0.5))).mul(float(2.0));
  const joint = max(
    smoothstep(float(0.965), float(0.992), edgeX),
    smoothstep(float(0.965), float(0.992), edgeZ),
  );

  // Oil stain puddles where workbench and vehicles sit
  const oilField = lutFbm(vec2(p.x.mul(1.2).add(23.4), p.z.mul(1.2).add(11.8)), 3);
  const oilStain = smoothstep(float(0.68), float(0.82), oilField).mul(float(0.65));

  const baseConcrete = vec3(0.24, 0.23, 0.22);
  const jointColor = vec3(0.08, 0.08, 0.08);

  const colored = mix(baseConcrete, jointColor, joint).sub(oilStain.mul(vec3(0.14, 0.13, 0.12)));
  // Damp mottle: the board's floor is patchy-wet, not uniformly dry. The
  // metre-scale soil field carries it (no new noise), darkening slightly and
  // dropping to a sheen where damp, with the tooth flattened as under oil.
  const damp = smoothstep(float(0.30), float(0.75), wear.soilMask);
  const damped = colored.mul(float(1).sub(damp.mul(float(0.15))));
  mat.colorNode = damped.mul(wear.albedoMul);
  mat.roughnessNode = clamp(
    wear.roughness.sub(oilStain.mul(float(0.45))).sub(damp.mul(float(0.35))),
    float(0.05), float(1.0),
  );
  // RELIEF. Sawn joint, float tooth and trowel swirl, in metres. Liquid
  // fills the tooth, so the relief flattens where oil or damp sits — that is
  // what keeps the wet reflection read instead of breaking it into matte.
  const dryTooth = float(1).sub(oilStain).mul(float(1).sub(damp));
  mat.normalNode = reliefNormal(
    joint.mul(float(GARAGE_JOINT_M))
      .add(wear.grain.mul(float(GARAGE_FLOAT_M)).mul(dryTooth))
      .add(wear.scuff.mul(float(GARAGE_SWIRL_M)).mul(dryTooth)),
  );

  return mat;
}

/**
 * Interior drywall plaster material with fine stipple texture.
 */
export function createNuketown2DrywallMaterial(colorHex: number): MeshStandardNodeMaterial {
  const baseColor = new THREE.Color(colorHex);
  const spec = drywallSpec(`nuketown2-drywall-${colorHex.toString(16)}`, colorHex);
  const mat = new MeshStandardNodeMaterial({
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
  mat.name = spec.name;
  mat.type = 'MeshStandardMaterial';

  const uniforms = createNuketown2Uniforms(spec, colorHex, 0x6b5741, mat);
  mat.userData.nuketown2Spec = spec;
  // Orientation-correct wear coordinate: boxUv() shears with world Y, which
  // turns isotropic wear into a diagonal stripe on large flat walls
  // (coherence 0.713 vs the board's 0.040). Walls read wallUv() (exact for
  // axis-aligned runs); the ceiling this same material covers reads groundUv().
  const drywallUv = abs(normalWorld.y).greaterThan(float(0.5)).select(groundUv(), wallUv());
  const wear = buildWear(spec, drywallUv, undefined, uniforms);
  const p = positionWorld;

  // Taped-joint crown every 1.2 m of wall run: peaks ON the joint line.
  const run = p.x.add(p.z).div(float(1.2));
  const jointDist = float(0.5).sub(abs(fract(run).sub(float(0.5))));
  const crown = float(1).sub(smoothstep(float(0.0), float(0.06), jointDist));

  // The base colour is a per-material UNIFORM, not baked constants, so every
  // drywall tint shares one compiled pipeline (HF-477 pattern).
  const base = uniform(new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b));
  // Rising damp: the board shows a scuffed grey band climbing the lower wall.
  // A 1 m world-Y gradient gated by the metre-scale soil field, concrete.ts
  // weather-band precedent. One-sided (dirt subtracts), tinted to soil.
  const dampBand = float(1).sub(smoothstep(float(0.05), float(1.0), p.y));
  const damp = dampBand.mul(wear.soilMask.mul(float(0.6)).add(float(0.4)));
  const damped = base.mul(float(1).sub(damp.mul(float(0.18))));
  mat.colorNode = damped.mul(wear.albedoMul);
  mat.roughnessNode = clamp(wear.roughness.add(damp.mul(float(0.10))), float(0.05), float(1.0));
  // RELIEF. Joint crown plus the distance-faded orange-peel roll texture.
  mat.normalNode = reliefNormal(
    crown.mul(float(DRYWALL_JOINT_CROWN_M)).add(wear.grain.mul(float(DRYWALL_PEEL_M))),
  );

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
 * Dielectric: metalness 0, the tint lives in the colour, the reflection is
 * Fresnel. A flat pane is flat — exempt from relief by lane brief §3.1.
 */
export function createNuketown2GlassMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
  });
  mat.name = 'nuketown2-window-glass';
  mat.type = 'MeshStandardMaterial';

  const p = positionWorld;
  const baseTint = vec3(0.60, 0.72, 0.78);
  const shimmer = lutFbm(vec2(p.x.mul(1.5), p.y.mul(1.5)), 2).sub(float(0.5)).mul(float(0.035));
  mat.colorNode = baseTint.add(shimmer);

  return mat;
}
