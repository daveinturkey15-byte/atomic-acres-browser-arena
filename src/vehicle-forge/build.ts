/**
 * vehicle-forge/build.ts - assemble one forged vehicle into a merged group.
 *
 * PRESENTATION ONLY. The returned group carries `userData.presentationOnly`
 * on every mesh, registers nothing with any builder, and is meant to be added
 * to an arena root ALONGSIDE the authored boxes that own that vehicle's
 * colliders and shot surfaces - never in place of their authority.
 *
 * BUDGET. Every part is merged into one mesh per material bucket, so a whole
 * vehicle - body, shut lines, glass, lining, chrome, tyres, wheel faces and
 * two lamp colours - costs at most eight draw calls no matter how many parts
 * it is made of. Merging is per VEHICLE, deliberately, not across vehicles:
 * one merged mesh spanning the whole street would have an axis-aligned bounds
 * that no single collider explains, and the collider/visual parity audit would
 * correctly report it as a walk-through prop.
 *
 * No per-frame allocation happens here at all; this runs once, at arena
 * construction, and returns static geometry.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  type VehicleSpec,
  chamferedBar,
  loftBody,
  stripAlongRing,
} from './geometry';
import { type WheelStyle, lampParts, wheelParts } from './wheels';
import {
  createForgeChromeMaterial,
  createForgeGlassMaterial,
  createForgeGrooveMaterial,
  createForgeLampMaterial,
  createForgeLiningMaterial,
  createForgePaintMaterial,
  createForgeTyreMaterial,
} from './materials';

export interface ForgedVehicleMaterials {
  readonly paint: THREE.Material;
  readonly glass: THREE.Material;
  readonly lining: THREE.Material;
  readonly groove: THREE.Material;
  readonly chrome: THREE.Material;
  /** A second body colour for a waist stripe or a contrast panel. */
  readonly accent: THREE.Material;
  readonly tyre: THREE.Material;
  readonly headLamp: THREE.Material;
  readonly tailLamp: THREE.Material;
}

/**
 * Materials are shared across every vehicle that wants the same finish, so a
 * street of forged bodies compiles one paint program per colour rather than
 * one per body.
 */
export function createForgeMaterialSet(
  paintHex: number,
  paintName: string,
  accentHex = paintHex,
  /** See `PaintOptions.roughness`: 0.20 keeps a body SSR-eligible. */
  baseRoughness = 0.2,
): ForgedVehicleMaterials {
  return {
    paint: createForgePaintMaterial({ color: paintHex, name: paintName, roughness: baseRoughness }),
    accent: createForgePaintMaterial({ color: accentHex, name: `${paintName}-accent`, roughness: baseRoughness }),
    glass: createForgeGlassMaterial('vehicle-forge-glass'),
    lining: createForgeLiningMaterial(),
    groove: createForgeGrooveMaterial(),
    chrome: createForgeChromeMaterial(),
    tyre: createForgeTyreMaterial(),
    headLamp: createForgeLampMaterial('head'),
    tailLamp: createForgeLampMaterial('tail'),
  };
}

export interface LampPlacement {
  /** Distance of each lamp pair from the centre plane. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface WaistStripe {
  /** Ring index the stripe rides. 7 is the belt line, 3 the sill shoulder. */
  readonly ringIndex: number;
  /** `accent` for a painted waistline, `chrome` for a bright moulding. */
  readonly bucket: 'accent' | 'chrome';
  readonly z0: number;
  readonly z1: number;
  readonly height: number;
  readonly proud: number;
}

export interface VehicleDressing {
  readonly wheelStyle: WheelStyle;
  /**
   * Extra axles that belong to this vehicle's presentation but not to its
   * loft - the moving truck's rear bogie lives under an authored cargo box
   * that keeps its own boxy shape, so its wheels are dressed without an arch.
   */
  readonly extraWheelZ?: readonly number[];
  readonly headLamps?: LampPlacement;
  readonly tailLamps?: LampPlacement;
  /** Front and rear bumper bars, at the given height and depth from each end. */
  readonly bumperY?: number;
  readonly stripe?: WaistStripe;
}

export interface ForgedVehicle {
  readonly group: THREE.Group;
  /** One per merged material bucket - this vehicle's draw-call cost. */
  readonly drawCalls: number;
  readonly triangles: number;
  readonly stations: number;
}

type Bucket = 'paint' | 'accent' | 'glass' | 'lining' | 'groove' | 'chrome' | 'tyre' | 'headLamp' | 'tailLamp';

const BUCKET_ORDER: readonly Bucket[] = [
  'paint', 'accent', 'groove', 'chrome', 'tyre', 'lining', 'glass', 'headLamp', 'tailLamp',
];

function translated(geometry: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
  return geometry;
}

/**
 * Mirror a part to the vehicle's left by ROTATING it half a turn about y, not
 * by scaling x by -1. A negative scale reverses triangle winding, and every
 * mirrored part then culls to black on the side of the car a player walks past.
 */
function mirroredToLeft(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
  return geometry;
}

/**
 * Wheels with no body: the axles that belong to a vehicle's presentation but
 * not to any loft.
 *
 * The moving truck is the case this exists for. Its cargo box is authored
 * geometry with three walk-through mouths that gameplay depends on, so it
 * keeps its boxy shape and only the CAB is lofted - but its rear axles still
 * have to stop being full-width slabs. Keeping them in their own group also
 * keeps them SHORT: folded into the cab's buckets they would stretch one
 * merged mesh over ten metres of street, and a bounds that long stops being
 * explainable by the collider it belongs to.
 */
export function buildForgedWheelSet(
  id: string,
  radius: number,
  tyreHalfWidth: number,
  trackHalfWidth: number,
  axleZ: readonly number[],
  style: WheelStyle,
  materials: ForgedVehicleMaterials,
): ForgedVehicle {
  const parts = { tyre: [] as THREE.BufferGeometry[], chrome: [] as THREE.BufferGeometry[] };
  for (const z of axleZ) {
    for (const side of [1, -1] as const) {
      const wheel = wheelParts(radius, tyreHalfWidth, style);
      const place = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => translated(
        side === 1 ? geometry : mirroredToLeft(geometry), side * trackHalfWidth, radius, z,
      );
      parts.tyre.push(place(wheel.tyre));
      parts.chrome.push(place(wheel.face));
      parts.tyre.push(place(wheel.dark));
    }
  }
  const group = new THREE.Group();
  group.name = `vehicle-forge ${id}`;
  group.userData.presentationOnly = true;
  let drawCalls = 0;
  let triangles = 0;
  for (const bucket of ['tyre', 'chrome'] as const) {
    const merged = mergeGeometries(parts[bucket], false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, materials[bucket]);
    mesh.name = `vehicle-forge ${id} ${bucket}`;
    mesh.castShadow = bucket === 'tyre';
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
    group.add(mesh);
    drawCalls += 1;
    triangles += (merged.getAttribute('position')?.count ?? 0) / 3;
  }
  return { group, drawCalls, triangles, stations: 0 };
}

export function buildForgedVehicle(
  spec: VehicleSpec,
  dressing: VehicleDressing,
  materials: ForgedVehicleMaterials,
): ForgedVehicle {
  const loft = loftBody(spec);
  const parts: Record<Bucket, THREE.BufferGeometry[]> = {
    paint: [loft.body], accent: [], glass: [], lining: [], groove: [], chrome: [], tyre: [], headLamp: [], tailLamp: [],
  };
  if (loft.glass) parts.glass.push(loft.glass);
  if (loft.lining) parts.lining.push(loft.lining);
  if (loft.groove) parts.groove.push(loft.groove);

  const axles = [...spec.wheelZ, ...(dressing.extraWheelZ ?? [])];
  for (const z of axles) {
    for (const side of [1, -1] as const) {
      const wheel = wheelParts(spec.wheelRadius, spec.tyreHalfWidth, dressing.wheelStyle);
      const place = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => translated(
        side === 1 ? geometry : mirroredToLeft(geometry),
        side * spec.trackHalfWidth,
        spec.wheelRadius,
        z,
      );
      parts.tyre.push(place(wheel.tyre));
      parts.chrome.push(place(wheel.face));
      // The inboard disc and the bead gap go in the TYRE bucket, not the
      // lining's. They are matte dark either way, but the lining is a cabin
      // backdrop that lives at greenhouse height, and folding four knee-high
      // discs into it drags its bounds down past the sill - which defeats the
      // ballistic audit's combat-height coverage test and reports the car's
      // own interior as unrated ghost cover over its own shot surface.
      parts.tyre.push(place(wheel.dark));
    }
  }

  if (dressing.headLamps) {
    const { x, y, radius } = dressing.headLamps;
    for (const side of [1, -1] as const) {
      const lamp = lampParts(radius, 0.06);
      const nose = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => translated(
        mirroredToLeft(geometry), side * -x, y, -0.006,
      );
      parts.chrome.push(nose(lamp.bezel));
      parts.headLamp.push(nose(lamp.lens));
    }
  }
  if (dressing.tailLamps) {
    const { x, y, radius } = dressing.tailLamps;
    for (const side of [1, -1] as const) {
      const lamp = lampParts(radius, 0.06);
      const tail = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => translated(
        geometry, side * x, y, spec.length + 0.006,
      );
      parts.chrome.push(tail(lamp.bezel));
      parts.tailLamp.push(tail(lamp.lens));
    }
  }

  if (dressing.bumperY !== undefined) {
    // Tucked INSIDE the loft's own z envelope at both ends. A bumper hung
    // proud of the nose is visible mass outside the collider that owns this
    // vehicle, which is an authority change wearing an art costume.
    const halfLength = spec.halfWidth * 0.96;
    const halfDepth = 0.075;
    for (const z of [halfDepth, spec.length - halfDepth]) {
      parts.chrome.push(translated(chamferedBar(halfLength, 0.11, halfDepth, 0.02), 0, dressing.bumperY, z));
    }
  }

  if (dressing.stripe) {
    const strip = stripAlongRing(
      loft.rings,
      dressing.stripe.ringIndex,
      dressing.stripe.z0,
      dressing.stripe.z1,
      dressing.stripe.height,
      dressing.stripe.proud,
    );
    if (strip) parts[dressing.stripe.bucket].push(strip);
  }

  const group = new THREE.Group();
  group.name = `vehicle-forge ${spec.id}`;
  group.userData.presentationOnly = true;
  let drawCalls = 0;
  let triangles = 0;
  for (const bucket of BUCKET_ORDER) {
    const geometries = parts[bucket];
    if (geometries.length === 0) continue;
    const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, materials[bucket]);
    mesh.name = `vehicle-forge ${spec.id} ${bucket}`;
    // ONLY THE BODY AND THE TYRES CAST. Every caster is one depth draw per
    // shadow map per frame, and trim, lamps, wheel faces, shut-line floors,
    // lining and glass all sit inside or on a silhouette the body already
    // casts - so their depth passes buy a shadow nobody can distinguish.
    mesh.castShadow = bucket === 'paint' || bucket === 'tyre';
    mesh.receiveShadow = bucket !== 'groove';
    mesh.userData.presentationOnly = true;
    if (bucket === 'glass') mesh.renderOrder = 3;
    group.add(mesh);
    drawCalls += 1;
    triangles += (merged.getAttribute('position')?.count ?? 0) / 3;
  }

  return { group, drawCalls, triangles, stations: loft.rings.length };
}
