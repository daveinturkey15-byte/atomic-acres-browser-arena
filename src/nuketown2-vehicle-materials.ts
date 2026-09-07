/**
 * nuketown2-vehicle-materials.ts — procedural TSL automotive materials.
 *
 * DAY-2 NIGHT lane MATERIALS-HOUSE-VEHICLES: every opaque surface here is now
 * routed through the spec/wear/relief library (`src/nuketown2-materials/`).
 * Each factory authors a `Nuketown2MaterialSpec`, composes it with `buildWear`
 * (ONE shared noise LUT, zero new samplers) and shades with `reliefNormal`.
 * Dielectrics fixed in place: glass is metalness 0, and `createNuketown2CarPaintMaterial`
 * is now a `MeshPhysicalNodeMaterial` with metalness 0 + clearcoat (mirroring
 * `createForgePaintMaterial`'s physics), keeping the base colour a per-material
 * UNIFORM so the three paints still share ONE pipeline (HF-477 deploy fence).
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshPhysicalNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { assertSpec, type Nuketown2MaterialSpec } from './nuketown2-materials';
import { buildWear, boxUv } from './nuketown2-materials/wear';
import { reliefNormal } from './nuketown2-materials/relief';
import { createNuketown2Uniforms } from './nuketown2-materials/material-uniforms';
import { lutFbm } from './nuketown2-materials/noise-lut';

const {
  abs,
  clamp,
  float,
  fract,
  positionWorld,
  smoothstep,
  uniform,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/** 0.06 mm sprayed-film orange peel, metres. */
const PAINT_PEEL_M = 0.00006;
/** 0.3 mm pressed moulding edge on chrome trim, metres. */
const CHROME_EDGE_M = 0.0003;
/** 0.4 mm chrome pit relief, metres. */
const CHROME_PIT_M = -0.0004;
/** 6 mm tyre tread groove, metres. */
const TYRE_GROOVE_M = -0.006;
/** 0.1 mm tyre moulding grain, metres: slope ~0.4 on its 1.5 mm period. */
const TYRE_GRAIN_M = 0.0001;
/** 2 mm pressed truck-box rib relief, metres. */
const RIB_RELIEF_M = 0.002;

function carPaintSpec(name: string, baseSrgb: number, roughness: number): Nuketown2MaterialSpec {
  return assertSpec({
    name, family: 'painted-metal', baseSrgb, roughness, metalness: 0,
    grain: { sizeM: 0.0014, albedo: 0.020, roughness: 0.04 },
    scuff: { sizeM: 0.050, albedo: 0.045, roughness: 0.09 },
    traffic: { sizeM: 1.5, albedo: 0.035, roughness: 0.06 },
    soil: 0.055, readDistanceM: 1.0,
  });
}

function chromeSpec(): Nuketown2MaterialSpec {
  return assertSpec({
    name: 'nuketown2-automotive-chrome', family: 'painted-metal', baseSrgb: 0xe9eef2,
    roughness: 0.12, metalness: 0.94,
    grain: { sizeM: 0.0015, albedo: 0.012, roughness: 0.03 },
    scuff: { sizeM: 0.035, albedo: 0.035, roughness: 0.10 },
    traffic: { sizeM: 1.8, albedo: 0.025, roughness: 0.06 },
    soil: 0.060, readDistanceM: 1.0,
  });
}

function tireSpec(): Nuketown2MaterialSpec {
  return assertSpec({
    name: 'nuketown2-tire-rubber', family: 'painted-metal', baseSrgb: 0x232426,
    roughness: 0.88, metalness: 0.04,
    grain: { sizeM: 0.0015, albedo: 0.030, roughness: 0.07 },
    scuff: { sizeM: 0.040, albedo: 0.060, roughness: 0.10 },
    traffic: { sizeM: 1.5, albedo: 0.050, roughness: 0.08 },
    soil: 0.085, readDistanceM: 1.0,
  });
}

function truckBoxSpec(): Nuketown2MaterialSpec {
  return assertSpec({
    name: 'nuketown2-truck-box-ribbed', family: 'painted-metal', baseSrgb: 0xcfc8b8,
    roughness: 0.68, metalness: 0.12,
    grain: { sizeM: 0.0013, albedo: 0.025, roughness: 0.05 },
    scuff: { sizeM: 0.060, albedo: 0.050, roughness: 0.09 },
    traffic: { sizeM: 2.0, albedo: 0.040, roughness: 0.07 },
    soil: 0.070, readDistanceM: 1.0,
  });
}

/**
 * Coach and truck paint use the same world-space flake family.  Keep the
 * authored swatch, roughness and flake recipe in material properties so the
 * two bodies bind one node topology instead of compiling one pipeline each.
 */
const VEHICLE_PAINT_UNIFORMS = Object.freeze({
  baseColor: (TSL.uniform(new THREE.Color(0.82, 0.76, 0.64)) as any).onObjectUpdate((frame: any) => {
    frame.material?.userData?.nuketown2VehiclePaintUniforms &&
      VEHICLE_PAINT_UNIFORMS.baseColor.value.copy(frame.material.userData.nuketown2VehiclePaintUniforms.baseColor);
  }),
  roughness: (TSL.uniform(0.32) as any).onObjectUpdate((frame: any) => {
    const values = frame.material?.userData?.nuketown2VehiclePaintUniforms;
    if (values) VEHICLE_PAINT_UNIFORMS.roughness.value = values.roughness;
  }),
  flakeFrequency: (TSL.uniform(24) as any).onObjectUpdate((frame: any) => {
    const values = frame.material?.userData?.nuketown2VehiclePaintUniforms;
    if (values) VEHICLE_PAINT_UNIFORMS.flakeFrequency.value = values.flakeFrequency;
  }),
  flakeStrength: (TSL.uniform(0.02) as any).onObjectUpdate((frame: any) => {
    const values = frame.material?.userData?.nuketown2VehiclePaintUniforms;
    if (values) VEHICLE_PAINT_UNIFORMS.flakeStrength.value = values.flakeStrength;
  }),
});
function bindVehiclePaintUniforms(
  material: MeshStandardNodeMaterial,
  color: THREE.Color,
  roughness: number,
  flakeFrequency: number,
  flakeStrength: number,
): void {
  material.userData.nuketown2VehiclePaintUniforms = {
    baseColor: color,
    roughness,
    flakeFrequency,
    flakeStrength,
  };
}

let sharedVehiclePaintGraph: { colorNode: any; roughnessNode: any; normalNode: any } | null = null;

function createSharedVehiclePaintMaterial(
  name: string,
  color: THREE.Color,
  roughness: number,
  metalness: number,
  flakeFrequency: number,
  flakeStrength: number,
): MeshStandardNodeMaterial {
  const spec = carPaintSpec(name, 0xe7dec6, roughness);
  const mat = new MeshStandardNodeMaterial({ roughness, metalness });
  mat.name = name;
  mat.type = 'MeshStandardMaterial';
  bindVehiclePaintUniforms(mat, color, roughness, flakeFrequency, flakeStrength);
  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, mat);
  mat.userData.nuketown2Spec = spec;
  if (!sharedVehiclePaintGraph) {
    const p = positionWorld;
    const wear = buildWear(spec, boxUv(), undefined, uniforms);
    const flake = lutFbm(vec2(
      p.x.mul(VEHICLE_PAINT_UNIFORMS.flakeFrequency),
      p.y.mul(VEHICLE_PAINT_UNIFORMS.flakeFrequency),
    ), 1).sub(float(0.5)).mul(VEHICLE_PAINT_UNIFORMS.flakeStrength);
    sharedVehiclePaintGraph = {
      colorNode: (VEHICLE_PAINT_UNIFORMS.baseColor as any).add(flake).mul(wear.albedoMul),
      // `wear.roughness` already carries this material's base roughness via
      // its bound uniforms — baking the first caller's constant here would
      // double-count the base on every later caller sharing this graph.
      roughnessNode: clamp(wear.roughness, float(0.05), float(1.0)),
      normalNode: reliefNormal(flake.mul(float(PAINT_PEEL_M)).add(wear.grain.mul(float(PAINT_PEEL_M)))),
    };
  }
  mat.colorNode = sharedVehiclePaintGraph.colorNode;
  mat.roughnessNode = sharedVehiclePaintGraph.roughnessNode;
  mat.normalNode = sharedVehiclePaintGraph.normalNode;
  return mat;
}

/**
 * Procedural physical car paint: pigment under a clear coat (dielectric,
 * metalness 0), NOT coloured chrome. Mirrors `createForgePaintMaterial`'s
 * physics (clearcoat lobe, low specularIntensity, swatch mirrored onto
 * `material.color` for the static batcher and the WebGL2 route).
 *
 * HF-477: THE BASE COLOUR IS A UNIFORM, NOT BAKED CONSTANTS. A baked colour
 * puts every paint inside its own node graph — the third and fourth pipeline
 * compiles pushed the arena's first submission past its own 12,000 ms deploy
 * fence and Nuke Town Rebuild would not deploy at all. As a uniform the graph
 * is IDENTICAL for every colour, so all of them share one compiled pipeline.
 */
export function createNuketown2CarPaintMaterial(colorHex: number, name: string): MeshPhysicalNodeMaterial {
  const baseColor = new THREE.Color(colorHex);
  const spec = carPaintSpec(name, colorHex, 0.20);
  const mat = new MeshPhysicalNodeMaterial({
    roughness: 0.20,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });
  mat.name = name;
  mat.specularIntensity = 0.5;
  mat.color.copy(baseColor);
  mat.type = 'MeshPhysicalMaterial';
  const uniforms = createNuketown2Uniforms(spec, colorHex, 0x6b5741, mat);
  mat.userData.nuketown2Spec = spec;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);

  const p = positionWorld;

  // Metallic flake sparkle, 31 mm world-space field (scuff band).
  const flake = lutFbm(vec2(p.x.mul(32.0), p.z.mul(32.0)), 1)
    .sub(float(0.5))
    .mul(float(0.04));

  const base = uniform(new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b)).add(flake);
  mat.colorNode = base.mul(wear.albedoMul);
  mat.roughnessNode = clamp(
    float(0.20).add(flake.mul(float(0.25))).add(wear.roughness).sub(float(spec.roughness)),
    float(0.05), float(1.0),
  );
  // RELIEF. Sprayed-film orange peel from the distance-faded grain field.
  mat.normalNode = reliefNormal(wear.grain.mul(float(PAINT_PEEL_M)));

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
  const spec = truckBoxSpec();
  const mat = new MeshStandardNodeMaterial({
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
  mat.name = spec.name;
  mat.type = 'MeshStandardMaterial';

  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x6b5741, mat);
  mat.userData.nuketown2Spec = spec;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);
  const p = positionWorld;
  // Vertical corrugation ribs every 0.30 m along X
  const ribV = p.x.div(float(0.30));
  const ribShade = smoothstep(float(0.85), float(0.98), fract(ribV)).mul(float(0.12));
  const ribProfile = smoothstep(float(0.85), float(0.98), fract(ribV));

  const basePanel = vec3(0.70, 0.68, 0.62).sub(ribShade);
  mat.colorNode = basePanel.mul(wear.albedoMul);
  mat.roughnessNode = clamp(
    wear.roughness.add(ribShade.mul(float(0.5))),
    float(0.05), float(1.0),
  );
  // RELIEF. Pressed rib profile plus the faded grain tooth.
  mat.normalNode = reliefNormal(
    ribProfile.mul(float(RIB_RELIEF_M)).add(wear.grain.mul(float(PAINT_PEEL_M))),
  );

  return mat;
}

/**
 * Dark tinted automotive glass. Dielectric: metalness 0, the tint lives in
 * the colour. A flat pane is flat — exempt from relief by lane brief §3.1.
 */
export function createNuketown2VehicleGlassMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.10,
    metalness: 0,
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
 * Polished automotive chrome for bumpers, grilles, and hubcaps. A real bumper
 * carries road film, pitting gone dull grey and rust weep at the fixings —
 * the soil and scuff terms carry that 10%+ swing; the mirror story stays in
 * roughness.
 */
export function createNuketown2ChromeMaterial(): MeshStandardNodeMaterial {
  const spec = chromeSpec();
  const mat = new MeshStandardNodeMaterial({
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
  mat.name = spec.name;
  mat.type = 'MeshStandardMaterial';

  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x4a4238, mat);
  mat.userData.nuketown2Spec = spec;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);

  // Pitting that has gone dull grey lives in the scuff field; the moulding
  // edge is a fixed 0.3 mm press line.
  const pit = smoothstep(float(0.30), float(0.80), wear.scuff);
  mat.colorNode = vec3(0.92, 0.94, 0.96).mul(wear.albedoMul);
  mat.roughnessNode = clamp(
    wear.roughness.add(pit.mul(float(0.23))),
    float(0.05), float(1.0),
  );
  // RELIEF. Pit mouths plus polish-direction grain, in metres.
  mat.normalNode = reliefNormal(
    pit.mul(float(CHROME_PIT_M))
      .add(wear.grain.mul(float(CHROME_EDGE_M).div(float(6)))),
  );

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
 * Textured tire rubber with radial tread: 6 mm tread grooves on the plan
 * diagonal, 0.4 mm moulding grain, soot-darkened soil in the tread field.
 */
export function createNuketown2TireMaterial(): MeshStandardNodeMaterial {
  const spec = tireSpec();
  const mat = new MeshStandardNodeMaterial({
    roughness: spec.roughness,
    metalness: spec.metalness,
  });
  mat.name = spec.name;
  mat.type = 'MeshStandardMaterial';

  const uniforms = createNuketown2Uniforms(spec, spec.baseSrgb, 0x0e0d0c, mat);
  mat.userData.nuketown2Spec = spec;
  const wear = buildWear(spec, boxUv(), undefined, uniforms);
  const p = positionWorld;
  const treadG = abs(fract(p.x.add(p.z).div(float(0.045))).sub(float(0.5))).mul(float(2.0));
  const groove = smoothstep(float(0.75), float(0.95), treadG);
  const treadTone = lutFbm(vec2(p.x.mul(12.0), p.z.mul(12.0)), 2).sub(float(0.5)).mul(float(0.025));

  mat.colorNode = vec3(0.08, 0.09, 0.10).add(treadTone).mul(wear.albedoMul);
  mat.roughnessNode = clamp(wear.roughness, float(0.05), float(1.0));
  // RELIEF. Tread groove plus moulding grain, in metres.
  mat.normalNode = reliefNormal(
    groove.mul(float(TYRE_GROOVE_M)).add(wear.grain.mul(float(TYRE_GRAIN_M))),
  );

  return mat;
}
