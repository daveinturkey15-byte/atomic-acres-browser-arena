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
 * two lamp colours - costs at most nine draw calls no matter how many parts
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
  surfaceBandAtHeights,
  stripAtHeight,
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
/** The buckets every vehicle shares: no colour of its own, so one material serves the whole street. */
export type ForgeSharedBucket = 'glass' | 'lining' | 'groove' | 'chrome' | 'tyre' | 'headLamp' | 'tailLamp';
export type ForgeSharedMaterials = Readonly<Pick<ForgedVehicleMaterials, ForgeSharedBucket>>;

/**
 * PERF (HITL 5, HF-491). One instance of each colourless bucket material. A
 * material set used to build all nine per vehicle, so three sets on the street
 * carried three tyre, three chrome, three glass ... materials with identical
 * graphs - each a separate draw per vehicle and a separate pipeline to
 * compile inside the fenced first submission. Sharing them is what lets
 * `mergeForgedPlacements` fold every vehicle's tyres into ONE draw.
 */
export function createForgeSharedMaterials(): ForgeSharedMaterials {
  return {
    glass: createForgeGlassMaterial('vehicle-forge-glass'),
    lining: createForgeLiningMaterial(),
    groove: createForgeGrooveMaterial(),
    chrome: createForgeChromeMaterial(),
    tyre: createForgeTyreMaterial(),
    headLamp: createForgeLampMaterial('head'),
    tailLamp: createForgeLampMaterial('tail'),
  };
}

export function createForgeMaterialSet(
  paintHex: number,
  paintName: string,
  accentHex = paintHex,
  /** See `PaintOptions.roughness`: 0.20 keeps a body SSR-eligible. */
  baseRoughness = 0.2,
  shared: ForgeSharedMaterials = createForgeSharedMaterials(),
): ForgedVehicleMaterials {
  return {
    paint: createForgePaintMaterial({ color: paintHex, name: paintName, roughness: baseRoughness }),
    accent: createForgePaintMaterial({ color: accentHex, name: `${paintName}-accent`, roughness: baseRoughness }),
    ...shared,
  };
}

export interface ForgedPlacement {
  readonly built: ForgedVehicle;
  /** World position of the vehicle group. */
  readonly x: number;
  readonly z: number;
  /** World yaw of the vehicle group, radians about +y. */
  readonly yaw: number;
}

export interface ForgedSkinPlacement {
  /** The source group's name, e.g. `vehicle-forge nuketown2-coach`. */
  readonly name: string;
  /** Plan centre of the vehicle's BAKED world-space geometry (all of its parts). */
  readonly centre: Readonly<{ x: number; z: number }>;
}

export interface MergedForgedPlacements {
  /** One presentation-only mesh per distinct material, world-space geometry. */
  readonly meshes: readonly THREE.Mesh[];
  readonly drawCalls: number;
  readonly triangles: number;
  /**
   * Where each vehicle actually landed, measured from the transformed
   * geometry - the fidelity mirror gate (HF-473) reads these instead of the
   * per-vehicle groups the merge no longer adds to the scene.
   */
  readonly skins: readonly ForgedSkinPlacement[];
}

/**
 * PERF (HITL 5, HF-491). Fold every placed vehicle into ONE mesh per material.
 *
 * The street vehicles are static scenery. Built one group per vehicle they
 * cost a draw per bucket per vehicle - six placements on Nuke Town Rebuild
 * were ~40 draws, most of the +42 draws/frame the HITL 4 candidate carried
 * over PASS 93. With the colourless buckets shared (`createForgeSharedMaterials`)
 * the same street is one draw per material: three paints, up to three
 * accents, and seven shared buckets.
 *
 * Each vehicle's world transform (position + yaw, exactly what the caller
 * would have set on the group) is baked into its geometry, geometries are
 * merged per material, and the per-vehicle groups are never added to the
 * scene. Shadow flags, `renderOrder` and `presentationOnly` come from the
 * source meshes, so a merged mesh casts and sorts exactly as its parts did.
 * Source geometries are disposed here - they are copied, not referenced.
 */
export function mergeForgedPlacements(
  placements: readonly ForgedPlacement[],
  namePrefix = 'vehicle-forge merged',
): MergedForgedPlacements {
  const byMaterial = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; source: THREE.Mesh; label: string }>();
  const transform = new THREE.Matrix4();
  const groupMatrix = new THREE.Matrix4();
  const skins: ForgedSkinPlacement[] = [];
  const bounds = new THREE.Box3();
  const skinBounds = new THREE.Box3();
  for (const { built, x, z, yaw } of placements) {
    built.group.position.set(x, 0, z);
    built.group.rotation.set(0, yaw, 0);
    built.group.updateMatrix();
    groupMatrix.copy(built.group.matrix);
    bounds.makeEmpty();
    skinBounds.makeEmpty();
    let hasPaintBody = false;
    for (const child of built.group.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.updateMatrix();
      transform.multiplyMatrices(groupMatrix, child.matrix);
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(transform);
      geometry.computeBoundingBox();
      if (geometry.boundingBox) bounds.union(geometry.boundingBox);
      const material = child.material as THREE.Material;
      const bucketLabel = child.name.split(' ').pop() ?? material.name;
      if (bucketLabel === 'paint' && geometry.boundingBox) {
        skinBounds.union(geometry.boundingBox);
        hasPaintBody = true;
      }
      const entry = byMaterial.get(material);
      if (entry) entry.geometries.push(geometry);
      else byMaterial.set(material, { geometries: [geometry], source: child, label: bucketLabel });
      child.geometry.dispose();
    }
    skins.push({
      name: built.group.name,
      // Panel seams can continue from a cab into the authored cargo box. The
      // fidelity mirror is about the forged body it dresses, not those detail
      // bars, so anchor it to the paint body when present.
      centre: {
        x: ((hasPaintBody ? skinBounds : bounds).min.x + (hasPaintBody ? skinBounds : bounds).max.x) / 2,
        z: ((hasPaintBody ? skinBounds : bounds).min.z + (hasPaintBody ? skinBounds : bounds).max.z) / 2,
      },
    });
  }
  const meshes: THREE.Mesh[] = [];
  let triangles = 0;
  for (const [material, { geometries, source, label }] of byMaterial) {
    const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
    if (geometries.length > 1) for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `${namePrefix} ${label}`;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.renderOrder = source.renderOrder;
    mesh.userData.presentationOnly = true;
    // Static scenery: nothing moves it after this, so three need not recompose
    // its matrix every frame (r185 recomposes every auto-updating node).
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
    triangles += (merged.getAttribute('position')?.count ?? 0) / 3;
  }
  return { meshes, drawCalls: meshes.length, triangles, skins };
}

export interface LampPlacement {
  /** Distance of each lamp pair from the centre plane. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface WaistStripe {
  /** World height the stripe rides. A waistline is level, not a ring index. */
  readonly y: number;
  /** `accent` for a painted waistline, `chrome` for a bright moulding. */
  readonly bucket: 'accent' | 'chrome';
  readonly z0: number;
  readonly z1: number;
  readonly height: number;
  readonly proud: number;
}

export interface SurfaceBand {
  /** Lower and upper heights of a body-colour panel. */
  readonly y0: number;
  readonly y1: number;
  readonly bucket: 'accent' | 'chrome';
  readonly z0: number;
  readonly z1: number;
  readonly proud: number;
}

export interface GrilleDetail {
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly barCount?: number;
}

export interface MirrorDetail {
  readonly y: number;
  readonly z: number;
  readonly x: number;
}

export interface PanelSeam {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly width?: number;
  readonly depth?: number;
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
  readonly surfaceBands?: readonly SurfaceBand[];
  readonly grille?: GrilleDetail;
  readonly mirrors?: readonly MirrorDetail[];
  readonly panelSeams?: readonly PanelSeam[];
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
      if (wheel.whitewall) parts.chrome.push(place(wheel.whitewall));
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
      if (wheel.whitewall) parts.chrome.push(place(wheel.whitewall));
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
    // 20 mm PROUD of each end, not flush with it. Flush puts the bar's back
    // face exactly on the end cap's plane, the two race for the same depth
    // samples, and the nose grows a hatched grey band that reads as damage.
    // 20 mm also keeps the whole bar inside the collider's own footprint
    // tolerance, so no visible mass escapes the authority that owns it.
    const halfLength = spec.halfWidth * 0.96;
    const halfDepth = 0.075;
    const proud = 0.02;
    for (const z of [halfDepth - proud, spec.length - halfDepth + proud]) {
      parts.chrome.push(translated(chamferedBar(halfLength, 0.11, halfDepth, 0.02), 0, dressing.bumperY, z));
    }
  }

  if (dressing.grille) {
    const { y, width, height, depth, barCount = 5 } = dressing.grille;
    const grilleDepth = depth / 2;
    parts.chrome.push(translated(
      chamferedBar(width / 2, height / 2, grilleDepth, Math.min(0.03, height * 0.18, grilleDepth * 0.45)),
      0, y, grilleDepth + 0.008,
    ));
    const count = Math.max(1, Math.floor(barCount));
    for (let index = 0; index < count; index += 1) {
      const x = count === 1 ? 0 : -width * 0.38 + (width * 0.76 * index) / (count - 1);
      const bar = chamferedBar(height / 2, 0.018, grilleDepth * 0.92, 0.006);
      bar.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      parts.chrome.push(translated(bar, x, y, grilleDepth + 0.018));
    }
  }

  if (dressing.mirrors) {
    for (const mirror of dressing.mirrors) {
      for (const side of [1, -1] as const) {
        const stem = chamferedBar(0.018, 0.14, 0.018, 0.006);
        stem.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
        parts.chrome.push(translated(stem, side * mirror.x, mirror.y - 0.14, mirror.z));
        parts.chrome.push(translated(
          chamferedBar(0.12, 0.075, 0.035, 0.012),
          side * (mirror.x + 0.06), mirror.y, mirror.z,
        ));
      }
    }
  }

  if (dressing.panelSeams) {
    for (const seam of dressing.panelSeams) {
      const seamGeometry = chamferedBar(
        seam.height / 2,
        (seam.width ?? 0.018) / 2,
        (seam.depth ?? 0.014) / 2,
        0.004,
      );
      seamGeometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
      parts.groove.push(translated(seamGeometry, seam.x, seam.y, seam.z));
    }
  }

  if (dressing.surfaceBands) {
    for (const band of dressing.surfaceBands) {
      const surface = surfaceBandAtHeights(
        spec, loft.rings, band.y0, band.y1, band.z0, band.z1, band.proud,
      );
      if (surface) parts[band.bucket].push(surface);
    }
  }

  if (dressing.stripe) {
    const strip = stripAtHeight(
      loft.rings,
      dressing.stripe.y,
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
