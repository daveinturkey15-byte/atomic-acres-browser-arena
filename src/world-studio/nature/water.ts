/**
 * water.ts — the coastal sector's sea: one bounded plane, four declared
 * directional wave bands with analytic normals, Beer-Lambert colour over an
 * AUTHORED depth mask, Schlick Fresnel toward the sky, crest and shoreline
 * foam. No FFT, no reflection pass, no swimming, no buoyancy: distant set
 * dressing for the -Z third of the panorama.
 *
 * Method: threejs-webgpu-water skill (absorption before palette, foam from
 * slope, bounded Fresnel) and the project's ocean-tsl.ts band transcription
 * idiom — reimplemented, not copied; this water shares no spectrum with the
 * gameplay ocean and must never be sampled for physics.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { WATER_LEVEL_Y } from './layout';
import { type NatureUniforms, webgl2CompatRoute } from './materials';
import {
  DEPTH_MASK_DEEP_M,
  WATER_RECT,
  createWaterDepthMask,
} from './terrain';

const {
  cos,
  dot,
  exp,
  float,
  mix,
  positionLocal,
  positionViewDirection,
  positionWorld,
  sin,
  smoothstep,
  texture,
  transformNormalToView,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/** Declared wave bands: direction (unit XZ), wavelength m, amplitude m. */
export const COAST_WAVE_BANDS: ReadonlyArray<Readonly<{ dx: number; dz: number; lambda: number; amp: number }>> = Object.freeze([
  Object.freeze({ dx: 0.28, dz: -0.96, lambda: 38, amp: 0.34 }),
  Object.freeze({ dx: -0.62, dz: -0.78, lambda: 19, amp: 0.15 }),
  Object.freeze({ dx: 0.9, dz: -0.44, lambda: 9.5, amp: 0.07 }),
  Object.freeze({ dx: 0.18, dz: -0.98, lambda: 4.6, amp: 0.03 }),
]);

/** Per-channel extinction (1/m) — coastal, slightly green water. */
export const COAST_EXTINCTION: readonly [number, number, number] = Object.freeze([0.42, 0.13, 0.07]);

export const WATER_SEGMENTS_X = 96;
export const WATER_SEGMENTS_Z = 48;

export type CoastalWater = Readonly<{
  mesh: THREE.Mesh;
  triangles: number;
  drawGroups: number;
  dispose: () => void;
}>;

/** Total band amplitude, for normalising crest foam. */
export function coastWaveTotalAmplitude(): number {
  return COAST_WAVE_BANDS.reduce((sum, band) => sum + band.amp, 0);
}

export function createCoastalWater(uniforms: NatureUniforms): CoastalWater {
  const width = WATER_RECT.maxX - WATER_RECT.minX;
  const depthZ = WATER_RECT.maxZ - WATER_RECT.minZ;
  const geometry = new THREE.PlaneGeometry(width, depthZ, WATER_SEGMENTS_X, WATER_SEGMENTS_Z);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((WATER_RECT.minX + WATER_RECT.maxX) / 2, WATER_LEVEL_Y, (WATER_RECT.minZ + WATER_RECT.maxZ) / 2);
  geometry.name = 'ws-nature-coastal-water';
  const depthMask = createWaterDepthMask();

  let material: THREE.Material;
  if (webgl2CompatRoute()) {
    material = new THREE.MeshStandardMaterial({ color: 0x1d4a5a, roughness: 0.18, metalness: 0 });
    material.name = 'ws-nature-coastal-water';
  } else {
    const mat = new MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0, side: THREE.FrontSide });
    mat.name = 'ws-nature-coastal-water';
    mat.type = 'MeshStandardMaterial';
    const t = uniforms.time;

    // Depth mask in world XZ (matches WATER_RECT / createWaterDepthMaskData).
    const maskUv = vec2(
      positionWorld.x.sub(WATER_RECT.minX).div(width),
      positionWorld.z.sub(WATER_RECT.minZ).div(depthZ),
    );
    const mask = texture(depthMask, maskUv);
    const depthM = mask.r.mul(DEPTH_MASK_DEEP_M);
    const shallow = mask.g; // 0 at the waterline .. 1 past 2.5 m
    // Waves die on the beach: amplitude fades to zero over the last metre.
    const shoal = smoothstep(0.05, 0.6, shallow);

    let height = float(0);
    let slopeX = float(0);
    let slopeZ = float(0);
    for (const band of COAST_WAVE_BANDS) {
      const k = (Math.PI * 2) / band.lambda;
      const omega = Math.sqrt(9.81 * k);
      const phase = positionLocal.x.mul(band.dx * k).add(positionLocal.z.mul(band.dz * k)).sub(t.mul(omega));
      const amp = shoal.mul(band.amp).mul(uniforms.wind.mul(0.6).add(0.7));
      height = height.add(sin(phase).mul(amp));
      const c = cos(phase).mul(amp).mul(k);
      slopeX = slopeX.add(c.mul(band.dx));
      slopeZ = slopeZ.add(c.mul(band.dz));
    }
    mat.positionNode = positionLocal.add(vec3(float(0), height, float(0)));
    const normalLocal = vec3(slopeX.negate(), float(1), slopeZ.negate()).normalize();
    const normalView = transformNormalToView(normalLocal);
    mat.normalNode = normalView;
    const slope = vec2(slopeX, slopeZ).length();

    // Beer-Lambert over a vertical path in and back out (~1.6 x depth).
    const sigma = vec3(COAST_EXTINCTION[0], COAST_EXTINCTION[1], COAST_EXTINCTION[2]);
    const path = depthM.mul(1.6).add(0.25);
    const transmitted = exp(sigma.mul(path).negate());
    const seabed = mix(vec3(0.56, 0.50, 0.38), vec3(0.16, 0.20, 0.16), smoothstep(0.0, 6.0, depthM));
    const scatter = vec3(0.03, 0.17, 0.22).mul(float(1).sub(exp(depthM.mul(-0.32))));
    const body = seabed.mul(transmitted).add(scatter);

    // Foam: crest (slope + normalised height) and shoreline (shallow band).
    const crest = smoothstep(0.35, 0.95, height.div(coastWaveTotalAmplitude()).mul(0.5).add(0.5))
      .mul(smoothstep(0.05, 0.22, slope));
    const breakup = sin(positionWorld.x.mul(0.37).add(positionWorld.z.mul(0.53)).add(t.mul(0.7))).mul(0.5).add(0.5);
    const shoreline = float(1).sub(smoothstep(0.08, 0.55, shallow))
      .mul(sin(positionWorld.z.mul(1.3).add(t.mul(1.1)).add(breakup.mul(3))).mul(0.5).add(0.5));
    const foam = crest.mul(smoothstep(0.45, 0.85, breakup)).add(shoreline.mul(0.8)).clamp(0, 1);
    const foamColour = vec3(0.90, 0.93, 0.95);

    // Schlick Fresnel toward a cool sky term; the PBR specular lobe and the
    // root environment map carry the actual reflection.
    const nv = dot(normalView, positionViewDirection).clamp(0, 1);
    const fresnel = float(1).sub(nv).pow(5).mul(0.9).add(0.04);
    const sky = vec3(0.50, 0.64, 0.80);
    let colour = mix(body, sky, fresnel.mul(0.75));
    colour = mix(colour, foamColour, foam.mul(0.85));
    // Snow uniform: the sea does not whiten, but a snowy sky dims the water.
    colour = colour.mul(float(1).sub(uniforms.snow.clamp(0, 1).mul(0.25)));
    mat.colorNode = colour;
    mat.emissiveNode = body.mul(0.12);
    mat.roughnessNode = float(0.10).add(slope.mul(0.9).clamp(0, 0.45)).add(foam.mul(0.4));
    mat.metalnessNode = float(0);
    material = mat;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ws-nature-coastal-water';
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = -4;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  mesh.userData.swimmable = false;
  mesh.userData.waterLevel = WATER_LEVEL_Y;
  mesh.userData.waveBands = COAST_WAVE_BANDS.length;
  mesh.userData.depthMaskSize = depthMask.image.width;

  return Object.freeze({
    mesh,
    triangles: WATER_SEGMENTS_X * WATER_SEGMENTS_Z * 2,
    drawGroups: 1,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      depthMask.dispose();
    },
  });
}
