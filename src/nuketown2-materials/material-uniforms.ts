import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { readDistance, scaleResolvable } from './spec';
import type { Nuketown2MaterialSpec } from './spec';

/**
 * Values kept out of the shared family graph topology. The node objects are
 * shared so the renderer admits one pipeline; their object-update callbacks
 * load the current material's values immediately before each draw.
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
  readonly values: Record<string, unknown>;
}

type UniformValue = number | THREE.Color;

const DEFAULTS: Record<string, UniformValue> = {
  baseColor: new THREE.Color(0xffffff),
  soilColor: new THREE.Color(0x6b5741),
  backdrop: 0,
  grainEnabled: 0,
  scuffEnabled: 0,
  grainFrequency: 1,
  scuffFrequency: 1,
  trafficFrequency: 1,
  grainAlbedo: 0,
  scuffAlbedo: 0,
  trafficAlbedo: 0,
  grainRoughness: 0,
  scuffRoughness: 0,
  trafficRoughness: 0,
  soil: 0,
  baseRoughness: 0.5,
  concreteVariant: 0,
  concreteFootY: 0,
  lawnVariant: 0,
  paintedPanelled: 0,
  timberVariant: 0,
  sidingWainscot: 0,
  sidingWainscotColor: new THREE.Color(0xffffff),
  sidingWainscotTop: 2.76,
  asphaltMarking: 0,
};

function materialUniform(name: string): any {
  const node = uniform(DEFAULTS[name] as any) as any;
  node.onObjectUpdate((frame: { material?: THREE.Material | null }) => {
    const values = (frame.material as (THREE.Material & { userData?: Record<string, any> }) | null | undefined)
      ?.userData?.nuketown2Uniforms;
    if (values?.[name] !== undefined) node.value = values[name];
  });
  return node;
}

/** One node object per value, reused by every Nuke Town family graph. */
const SHARED_NODES = Object.freeze({
  baseColor: materialUniform('baseColor'),
  soilColor: materialUniform('soilColor'),
  backdrop: materialUniform('backdrop'),
  grainEnabled: materialUniform('grainEnabled'),
  scuffEnabled: materialUniform('scuffEnabled'),
  grainFrequency: materialUniform('grainFrequency'),
  scuffFrequency: materialUniform('scuffFrequency'),
  trafficFrequency: materialUniform('trafficFrequency'),
  grainAlbedo: materialUniform('grainAlbedo'),
  scuffAlbedo: materialUniform('scuffAlbedo'),
  trafficAlbedo: materialUniform('trafficAlbedo'),
  grainRoughness: materialUniform('grainRoughness'),
  scuffRoughness: materialUniform('scuffRoughness'),
  trafficRoughness: materialUniform('trafficRoughness'),
  soil: materialUniform('soil'),
  baseRoughness: materialUniform('baseRoughness'),
  concreteVariant: materialUniform('concreteVariant'),
  concreteFootY: materialUniform('concreteFootY'),
  lawnVariant: materialUniform('lawnVariant'),
  paintedPanelled: materialUniform('paintedPanelled'),
  timberVariant: materialUniform('timberVariant'),
  sidingWainscot: materialUniform('sidingWainscot'),
  sidingWainscotColor: materialUniform('sidingWainscotColor'),
  sidingWainscotTop: materialUniform('sidingWainscotTop'),
  asphaltMarking: materialUniform('asphaltMarking'),
});

function color(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

/** Bind one material's authored values while retaining shared node identity. */
export function createNuketown2Uniforms(
  spec: Nuketown2MaterialSpec,
  baseSrgb: number,
  soilSrgb = 0x6b5741,
  material?: THREE.Material,
): Nuketown2Uniforms {
  const readM = spec.readDistanceM ?? 0.5;
  const values: Record<string, UniformValue> = {
    baseColor: color(baseSrgb),
    soilColor: color(soilSrgb),
    backdrop: readDistance(spec) >= 30 ? 1 : 0,
    grainEnabled: scaleResolvable(spec.grain.sizeM, readM) ? 1 : 0,
    scuffEnabled: scaleResolvable(spec.scuff.sizeM, readM) ? 1 : 0,
    grainFrequency: 1 / spec.grain.sizeM,
    scuffFrequency: 1 / spec.scuff.sizeM,
    trafficFrequency: 1 / spec.traffic.sizeM,
    grainAlbedo: spec.grain.albedo,
    scuffAlbedo: spec.scuff.albedo,
    trafficAlbedo: spec.traffic.albedo,
    grainRoughness: spec.grain.roughness,
    scuffRoughness: spec.scuff.roughness,
    trafficRoughness: spec.traffic.roughness,
    soil: spec.soil,
    baseRoughness: spec.roughness,
    concreteVariant: 0,
    concreteFootY: 0,
    lawnVariant: 0,
    paintedPanelled: 0,
    timberVariant: 0,
    sidingWainscot: 0,
    sidingWainscotColor: color(baseSrgb),
    sidingWainscotTop: 2.76,
    asphaltMarking: 0,
  };
  if (material) material.userData.nuketown2Uniforms = values;
  return { ...SHARED_NODES, values } as Nuketown2Uniforms;
}

/** Set a family discriminator without changing the shared graph shape. */
export function setNuketown2FamilyUniform(
  uniforms: Nuketown2Uniforms,
  name: keyof Omit<Nuketown2Uniforms, 'values'>,
  value: unknown,
): void {
  uniforms.values[name] = value as UniformValue;
}
