import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { readDistance, scaleResolvable } from './spec';
import type { Nuketown2MaterialSpec } from './spec';

/**
 * Per-material values kept out of the shared family graph topology. These are
 * ordinary TSL uniforms, rather than custom material references: renderer
 * shadow/depth clones do not copy arbitrary custom properties, while a uniform
 * belongs to the material graph that owns it.
 */
export interface Nuketown2Uniforms {
  readonly baseColor: any;
  readonly soilColor: any;
  readonly backdrop: any;
  readonly grainEnabled: any;
  readonly scuffEnabled: any;
  readonly grainFrequency: any;
  readonly scuffFrequency: any;
  readonly trafficFrequency: any;
  readonly grainAlbedo: any;
  readonly scuffAlbedo: any;
  readonly trafficAlbedo: any;
  readonly grainRoughness: any;
  readonly scuffRoughness: any;
  readonly trafficRoughness: any;
  readonly soil: any;
  readonly baseRoughness: any;
  readonly concreteVariant: any;
  readonly concreteFootY: any;
  readonly lawnVariant: any;
  readonly paintedPanelled: any;
  readonly timberVariant: any;
  readonly sidingWainscot: any;
  readonly sidingWainscotColor: any;
  readonly sidingWainscotTop: any;
  readonly asphaltMarking: any;
}

function color(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

/** Build one uniform set for one material instance with a shared topology. */
export function createNuketown2Uniforms(
  spec: Nuketown2MaterialSpec,
  baseSrgb: number,
  soilSrgb = 0x6b5741,
): Nuketown2Uniforms {
  const readM = spec.readDistanceM ?? 0.5;
  return {
    baseColor: uniform(color(baseSrgb)),
    soilColor: uniform(color(soilSrgb)),
    backdrop: uniform(readDistance(spec) >= 30 ? 1 : 0),
    grainEnabled: uniform(scaleResolvable(spec.grain.sizeM, readM) ? 1 : 0),
    scuffEnabled: uniform(scaleResolvable(spec.scuff.sizeM, readM) ? 1 : 0),
    grainFrequency: uniform(1 / spec.grain.sizeM),
    scuffFrequency: uniform(1 / spec.scuff.sizeM),
    trafficFrequency: uniform(1 / spec.traffic.sizeM),
    grainAlbedo: uniform(spec.grain.albedo),
    scuffAlbedo: uniform(spec.scuff.albedo),
    trafficAlbedo: uniform(spec.traffic.albedo),
    grainRoughness: uniform(spec.grain.roughness),
    scuffRoughness: uniform(spec.scuff.roughness),
    trafficRoughness: uniform(spec.traffic.roughness),
    soil: uniform(spec.soil),
    baseRoughness: uniform(spec.roughness),
    concreteVariant: uniform(0),
    concreteFootY: uniform(0),
    lawnVariant: uniform(0),
    paintedPanelled: uniform(0),
    timberVariant: uniform(0),
    sidingWainscot: uniform(0),
    sidingWainscotColor: uniform(color(baseSrgb)),
    sidingWainscotTop: uniform(2.76),
    asphaltMarking: uniform(0),
  };
}

/** Set a family discriminator without changing the node graph shape. */
export function setNuketown2FamilyUniform(
  uniforms: Nuketown2Uniforms,
  name: keyof Nuketown2Uniforms,
  value: unknown,
): void {
  uniforms[name].value = value;
}
