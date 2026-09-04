import * as THREE from 'three';
import { materialReference } from 'three/tsl';
import { readDistance, scaleResolvable } from './spec';
import type { Nuketown2MaterialSpec } from './spec';

/** Stable r185 material-reference nodes. Values are read from the rendered
 * material, so one node graph can serve every authored instance. */
export const NUKETOWN2_UNIFORMS = Object.freeze({
  baseColor: materialReference('nuketown2BaseColor', 'color'),
  soilColor: materialReference('nuketown2SoilColor', 'color'),
  backdrop: materialReference('nuketown2WearBackdrop', 'float'),
  grainEnabled: materialReference('nuketown2WearGrainEnabled', 'float'),
  scuffEnabled: materialReference('nuketown2WearScuffEnabled', 'float'),
  grainFrequency: materialReference('nuketown2WearGrainFrequency', 'float'),
  scuffFrequency: materialReference('nuketown2WearScuffFrequency', 'float'),
  trafficFrequency: materialReference('nuketown2WearTrafficFrequency', 'float'),
  grainAlbedo: materialReference('nuketown2WearGrainAlbedo', 'float'),
  scuffAlbedo: materialReference('nuketown2WearScuffAlbedo', 'float'),
  trafficAlbedo: materialReference('nuketown2WearTrafficAlbedo', 'float'),
  grainRoughness: materialReference('nuketown2WearGrainRoughness', 'float'),
  scuffRoughness: materialReference('nuketown2WearScuffRoughness', 'float'),
  trafficRoughness: materialReference('nuketown2WearTrafficRoughness', 'float'),
  soil: materialReference('nuketown2WearSoil', 'float'),
  baseRoughness: materialReference('nuketown2WearBaseRoughness', 'float'),
  concreteVariant: materialReference('nuketown2ConcreteVariant', 'float'),
  concreteFootY: materialReference('nuketown2ConcreteFootY', 'float'),
  lawnVariant: materialReference('nuketown2LawnVariant', 'float'),
  paintedPanelled: materialReference('nuketown2PaintedPanelled', 'float'),
  timberVariant: materialReference('nuketown2TimberVariant', 'float'),
  sidingWainscot: materialReference('nuketown2SidingWainscot', 'float'),
  sidingWainscotColor: materialReference('nuketown2SidingWainscotColor', 'color'),
  sidingWainscotTop: materialReference('nuketown2SidingWainscotTop', 'float'),
  asphaltMarking: materialReference('nuketown2AsphaltMarking', 'float'),
}) as any;

type UniformMaterial = THREE.Material & Record<string, unknown>;

function setMaterialValue(material: THREE.Material, name: string, value: unknown): void {
  (material as UniformMaterial)[name] = value;
}

/** Bind the spec data without changing the shared wear graph identity. */
export function bindNuketown2WearUniforms(
  material: THREE.Material,
  spec: Nuketown2MaterialSpec,
  baseSrgb: number,
  soilSrgb = 0x6b5741,
): void {
  const readM = spec.readDistanceM ?? 0.5;
  setMaterialValue(material, 'nuketown2BaseColor', new THREE.Color(baseSrgb));
  setMaterialValue(material, 'nuketown2SoilColor', new THREE.Color(soilSrgb));
  setMaterialValue(material, 'nuketown2WearBackdrop', readDistance(spec) >= 30 ? 1 : 0);
  setMaterialValue(material, 'nuketown2WearGrainEnabled', scaleResolvable(spec.grain.sizeM, readM) ? 1 : 0);
  setMaterialValue(material, 'nuketown2WearScuffEnabled', scaleResolvable(spec.scuff.sizeM, readM) ? 1 : 0);
  setMaterialValue(material, 'nuketown2WearGrainFrequency', 1 / spec.grain.sizeM);
  setMaterialValue(material, 'nuketown2WearScuffFrequency', 1 / spec.scuff.sizeM);
  setMaterialValue(material, 'nuketown2WearTrafficFrequency', 1 / spec.traffic.sizeM);
  setMaterialValue(material, 'nuketown2WearGrainAlbedo', spec.grain.albedo);
  setMaterialValue(material, 'nuketown2WearScuffAlbedo', spec.scuff.albedo);
  setMaterialValue(material, 'nuketown2WearTrafficAlbedo', spec.traffic.albedo);
  setMaterialValue(material, 'nuketown2WearGrainRoughness', spec.grain.roughness);
  setMaterialValue(material, 'nuketown2WearScuffRoughness', spec.scuff.roughness);
  setMaterialValue(material, 'nuketown2WearTrafficRoughness', spec.traffic.roughness);
  setMaterialValue(material, 'nuketown2WearSoil', spec.soil);
  setMaterialValue(material, 'nuketown2WearBaseRoughness', spec.roughness);
}

export function setNuketown2FamilyUniform(material: THREE.Material, name: string, value: unknown): void {
  setMaterialValue(material, name, value);
}
