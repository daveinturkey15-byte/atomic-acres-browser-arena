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

/**
 * The node type implied by a default value.
 *
 * This MUST be pinned explicitly. `uniform(value)` with no type argument leaves
 * `nodeType === null`, so every program re-derives the declared type at
 * graph-build time from whatever `node.value` happens to hold at that moment.
 * Because these nodes are shared across all Nuke Town families, the derivation
 * is order-dependent: the nuketown2-roof-shingles program declared the shared
 * `baseColor` slot as `nodeUniform0 : f32` while nuketown2-asphalt-road and
 * nuketown2-siding-cream declared the same node as `vec3<f32>`. A scalar slot
 * fed a THREE.Color goes through UniformsGroup.updateNumber(), which does
 * `Float32Array[offset] = <Color object>` -> NaN every frame (the
 * `a[offset] !== v` guard never settles), which is the black-roof defect.
 *
 * 'color' — not 'vec3' — is the correct pin for a THREE.Color value: it still
 * declares `vec3<f32>` in WGSL (NodeBuilder.getVectorType('color') === 'vec3'),
 * but NodeBuilder.getNodeUniform() maps it to ColorNodeUniform, whose update
 * path reads `.r/.g/.b`. Pinning 'vec3' would allocate a Vector3NodeUniform,
 * which reads `.x/.y/.z` off a Color and writes undefined -> NaN again.
 *
 * The declared type is only half of it. The VALUE arriving here must also be a
 * THREE.Color, and `Material.clone()` breaks that: three r185
 * `Material.copy()` (materials/Material.js:1172) does
 * `this.userData = JSON.parse( JSON.stringify( source.userData ) )`, and
 * `Color.toJSON()` returns `getHex()` - a raw NUMBER. So every arena material
 * built by cloning a Nuke Town family material for its own polygon-offset
 * decal tier (`nuketown2-balcony-rail-cap`, `nuketown2-yard-butt-pad`,
 * `nuketown2-perimeter-wall-end`, `nuketown2-exterior-stair-riser`) carries
 * `userData.nuketown2Uniforms.baseColor` as a hex number. Feeding that to the
 * shared node makes `UniformsGroup.updateColor()` read `v.r` off a Number,
 * write `undefined` into the Float32Array (NaN), and - because the
 * `a[offset] !== v.r` guard compares NaN with undefined - re-write NaN on
 * every frame forever. Measured 2026-09-06: the timber/trim object uniform
 * buffer held NaN in slots 0-2 (nodeUniform0 = baseColor) while every other
 * nuketown2 program's buffer was finite. Hence the type check below.
 */
function materialUniform(name: string): any {
  const value = DEFAULTS[name];
  const wantsColor = value instanceof THREE.Color;
  const node = (wantsColor ? uniform(value, 'color') : uniform(value, 'float')) as any;
  node.onObjectUpdate((frame: { material?: THREE.Material | null }) => {
    const values = (frame.material as (THREE.Material & { userData?: Record<string, any> }) | null | undefined)
      ?.userData?.nuketown2Uniforms;
    const raw = values?.[name];
    if (raw === undefined) return;
    if (!wantsColor) {
      if (typeof raw === 'number' && Number.isFinite(raw)) node.value = raw;
      return;
    }
    if (raw instanceof THREE.Color) { node.value = raw; return; }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      // Repair a JSON-degraded clone in place (see the block comment above), so
      // the cost is paid once per cloned material rather than once per draw.
      const repaired = new THREE.Color().setHex(raw, THREE.SRGBColorSpace);
      values[name] = repaired;
      node.value = repaired;
    }
    // Anything else (null, string, plain object) is dropped: a colour slot must
    // never be handed a value whose .r/.g/.b are undefined.
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
