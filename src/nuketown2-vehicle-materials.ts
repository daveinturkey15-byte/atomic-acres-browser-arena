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
import { lutFbm } from './nuketown2-materials/noise-lut';
import { centredLutField } from './nuketown2-materials/wear';

const {
  clamp,
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
/** Panel-scale drift, metres. One body panel between two shut lines. */
export const VEHICLE_PAINT_PANEL_M = 1.6;
/** Peak hue-stable luminance swing at that scale. Paint is the tightest family here. */
export const VEHICLE_PAINT_PANEL_ALBEDO = 0.022;
/** Peak roughness swing at that scale - the term that actually makes a flank read. */
export const VEHICLE_PAINT_PANEL_ROUGHNESS = 0.055;

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
  // HF-503. The flake above is a 4 cm field and the roughness below was a
  // CONSTANT, so a coach flank read as one value across five metres of paint -
  // which is what the reference critic recorded as "identical flat chalk white"
  // and "untextured vehicle hulls". A real painted panel is not flat at panel
  // scale: the roller and the polisher both leave a 1-2 m drift, and the drift
  // shows in the ROUGHNESS more than in the colour, because a clearcoat varies
  // in how it reflects long before it varies in what it is.
  panelFrequency: (TSL.uniform(1 / VEHICLE_PAINT_PANEL_M) as any).onObjectUpdate((frame: any) => {
    const values = frame.material?.userData?.nuketown2VehiclePaintUniforms;
    if (values) VEHICLE_PAINT_UNIFORMS.panelFrequency.value = values.panelFrequency;
  }),
  panelAlbedo: (TSL.uniform(VEHICLE_PAINT_PANEL_ALBEDO) as any).onObjectUpdate((frame: any) => {
    const values = frame.material?.userData?.nuketown2VehiclePaintUniforms;
    if (values) VEHICLE_PAINT_UNIFORMS.panelAlbedo.value = values.panelAlbedo;
  }),
  panelRoughness: (TSL.uniform(VEHICLE_PAINT_PANEL_ROUGHNESS) as any).onObjectUpdate((frame: any) => {
    const values = frame.material?.userData?.nuketown2VehiclePaintUniforms;
    if (values) VEHICLE_PAINT_UNIFORMS.panelRoughness.value = values.panelRoughness;
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
    panelFrequency: 1 / VEHICLE_PAINT_PANEL_M,
    panelAlbedo: VEHICLE_PAINT_PANEL_ALBEDO,
    panelRoughness: VEHICLE_PAINT_PANEL_ROUGHNESS,
  };
}

let sharedVehiclePaintGraph: { colorNode: any; roughnessNode: any } | null = null;

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
  if (!sharedVehiclePaintGraph) {
    const p = positionWorld;
    const flake = lutFbm(vec2(
      p.x.mul(VEHICLE_PAINT_UNIFORMS.flakeFrequency),
      p.y.mul(VEHICLE_PAINT_UNIFORMS.flakeFrequency),
    ), 1).sub(float(0.5)).mul(VEHICLE_PAINT_UNIFORMS.flakeStrength);
    // ONE shared field drives both the luminance and the roughness, and that
    // correlation is the point: paint that is a shade lighter is paint the
    // polisher reached, and paint the polisher reached is smoother. Two
    // independent noises here would read as two textures fighting.
    const panel = centredLutField(vec2(
      p.x.add(p.z).mul(VEHICLE_PAINT_UNIFORMS.panelFrequency),
      p.y.mul(VEHICLE_PAINT_UNIFORMS.panelFrequency),
    ), 2);
    sharedVehiclePaintGraph = {
      colorNode: (VEHICLE_PAINT_UNIFORMS.baseColor as any)
        .add(flake)
        .mul(float(1).add(panel.mul(VEHICLE_PAINT_UNIFORMS.panelAlbedo))),
      roughnessNode: clamp(
        (VEHICLE_PAINT_UNIFORMS.roughness as any).add(panel.mul(VEHICLE_PAINT_UNIFORMS.panelRoughness)),
        float(0.05),
        float(1.0),
      ),
    };
  }
  mat.colorNode = sharedVehiclePaintGraph.colorNode;
  mat.roughnessNode = sharedVehiclePaintGraph.roughnessNode;
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
