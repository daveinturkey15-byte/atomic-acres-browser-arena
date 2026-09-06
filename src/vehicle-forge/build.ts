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
  crownSurfaceY,
  flankHalfWidth,
  loftBody,
  roofRail,
  surfaceBandAtHeights,
  stripAtHeight,
} from './geometry';
import { type WheelStyle, hubcapDome, lampParts, wheelParts } from './wheels';
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
      const bucketLabel = child.userData.forgeBucket as string | undefined;
      if (bucketLabel === undefined) throw new Error(`Forged mesh is missing its material bucket: ${child.name}`);
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

export interface RoofRails {
  /** Plan offsets of the rail pair from the centre plane, metres. */
  readonly x: readonly number[];
  /** Roof run the rails follow, in vehicle-frame z. */
  readonly z0: number;
  readonly z1: number;
  /** Bar half-width across x. Defaults to 0.03. */
  readonly halfWidth?: number;
  /** Bar height above its bedded base. Defaults to 0.045. */
  readonly height?: number;
  /** Which existing bucket the rails merge into - paint or chrome. */
  readonly bucket: 'paint' | 'chrome';
}

export interface PanelSeam {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly width?: number;
  readonly depth?: number;
}

/** One door-handle row: small chrome pulls at the given height and door z list. */
export interface DoorHandleRow {
  readonly y: number;
  readonly z: readonly number[];
}

/** Window-run pillars dividing a continuous side-glass band (groove bucket). */
export interface PillarDressing {
  readonly z: readonly number[];
  readonly y0: number;
  readonly y1: number;
}

/** Roof vents riding the crowned roof at plan offset ±x (chrome bucket). */
export interface VentDressing {
  readonly x: number;
  readonly z: readonly number[];
}

/** A single centred exhaust stack behind the cab (chrome bucket). */
export interface StackDressing {
  readonly z: number;
  readonly y0: number;
  readonly y1: number;
}

/** Roof-gutter bars along both roof side edges (chrome bucket). */
export interface GutterDressing {
  readonly x: number;
  readonly y: number;
  readonly z0: number;
  readonly z1: number;
}

/** A horizontal boot-lid shut line across the deck (groove bucket). */
export interface BootSeam {
  readonly y: number;
  readonly z: number;
  readonly halfWidth: number;
}

/** Front indicator pair (headLamp bucket) plus tail-cluster pair (tailLamp). */
export interface IndicatorDressing {
  readonly y: number;
  readonly x: number;
}

/** Number plates: 2-triangle quads, nose and tail, centred (accent bucket). */
export interface PlateDressing {
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
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
  /** Longitudinal roof rails riding the crowned roof surface (see roofRail). */
  readonly roofRails?: RoofRails;
  /** Chrome door pulls on both flanks (HF-536 detail pass, Muse). */
  readonly doorHandles?: DoorHandleRow;
  /** 12-gon hubcap domes on dished steel faces; covers already have one. */
  readonly hubcaps?: boolean;
  /** Saloon hub-nut hint: small hex centres on full-cover faces. */
  readonly wheelNuts?: boolean;
  /** Nose and tail number-plate quads (accent bucket). */
  readonly plates?: PlateDressing;
  /** Front indicators (headLamp) and tail-cluster extras (tailLamp). */
  readonly indicators?: IndicatorDressing;
  /** Window-run pillars across the side-glass band (groove bucket). */
  readonly pillars?: PillarDressing;
  /** Roof vents riding the crown (chrome bucket). */
  readonly vents?: VentDressing;
  /** Centred exhaust stack (chrome bucket). */
  readonly stack?: StackDressing;
  /** Roof-gutter bars on both roof edges (chrome bucket). */
  readonly gutters?: GutterDressing;
  /** Horizontal boot-lid shut line (groove bucket). */
  readonly bootSeam?: BootSeam;
  /**
   * HF-536 (R14). The dark mass BETWEEN the wheels. Without it a lofted body
   * on four wheels reads as a shell hovering over the road: the sun reaches
   * straight under the sill, the far kerb shows through the gap, and the
   * silhouette has a bright stripe where a chassis should be.
   */
  readonly underbody?: UnderbodyBlock;
  /**
   * HF-536 (R14). Contact darkening under the vehicle - the ambient-occlusion
   * pool every grounded object owes the ground. Kept INSIDE the vehicle's own
   * plan footprint so it never reads as a painted shadow from above.
   */
  readonly contactShadow?: boolean;
}

/**
 * The dark block slung between the axles: `y0` to `y1` in the vehicle frame,
 * `insetM` in from the sill half-width on each side so it can never escape the
 * body it hides under (and so it stays inside the collider envelope the arena
 * owns - `specs.ts:7-21`).
 */
export interface UnderbodyBlock {
  readonly y0: number;
  readonly y1: number;
  readonly insetM: number;
}

/** Plan fraction of (track, wheelbase) the contact pool covers. */
export const CONTACT_SHADOW_PLAN_FRACTION = 0.55;
/**
 * 12 mm proud of the carriageway. The road decals this sits over are tiered
 * below 0.02, so the pool sorts above them without a `renderOrder` of its own;
 * raise it to 0.02 only if a station shows z-fighting (recorded in the report).
 */
export const CONTACT_SHADOW_Y = 0.012;
/** Sides of the contact pool's 12-gon: 12 triangles, once per vehicle. */
const CONTACT_SHADOW_SEGMENTS = 12;

/** Options for the axle-only wheel sets (the truck's bogie under its cargo box). */
export interface WheelSetDressing {
  readonly underbody?: UnderbodyBlock;
  readonly contactShadow?: boolean;
  /**
   * Explicit vehicle-frame z range for the contact pool. The truck is ONE
   * vehicle built as two placements (a lofted cab plus this bogie), and two
   * coplanar pools at the same height would hatch where they overlap - so the
   * bogie draws the truck's whole pool and the cab draws none.
   */
  readonly contactSpan?: Readonly<{ z0: number; z1: number }>;
}

/**
 * The z run a grounded dressing spans: between the wheel arches, or - when a
 * vehicle has a single axle (the cab-over truck) - from that arch to the tail.
 */
function groundedSpan(
  axles: readonly number[],
  wheelRadius: number,
  archGap: number,
  length: number,
): { z0: number; z1: number } {
  const archHalfSpan = wheelRadius + archGap;
  const z0 = Math.min(...axles) + archHalfSpan;
  const z1 = Math.max(...axles) - archHalfSpan;
  if (z1 - z0 >= 0.4) return { z0, z1 };
  return { z0, z1: length - wheelRadius };
}

/**
 * EVERY GEOMETRY IN A BUCKET MUST AGREE ABOUT ITS INDEX BUFFER.
 * `mergeGeometries` refuses a mix and returns null - which does not throw, does
 * not fail a build, and simply DELETES the bucket: the first cut of this pass
 * dropped every tyre on the street and only the R24 wheel gate noticed. The
 * lofted wheels are non-indexed, so these primitives are converted to match.
 */
function nonIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** One box, 12 triangles, in the LINING bucket (matte dark grey, no new material): the tyre albedo
 * renders exact black on the camera-facing underbody face in the vehicle's own shadow (HF-536 forge-2
 * measurement), and an exact-black block reads as a hole, not as an underbody. */
function underbodyBox(
  halfWidth: number,
  block: UnderbodyBlock,
  span: { z0: number; z1: number },
): THREE.BufferGeometry {
  return translated(
    nonIndexed(new THREE.BoxGeometry(halfWidth * 2, Math.max(0.02, block.y1 - block.y0), span.z1 - span.z0)),
    0,
    (block.y0 + block.y1) / 2,
    (span.z0 + span.z1) / 2,
  );
}

/** One 12-gon, 12 triangles, in the tyre bucket. */
function contactPool(semiX: number, semiZ: number, centreZ: number): THREE.BufferGeometry {
  const disc = nonIndexed(new THREE.CircleGeometry(1, CONTACT_SHADOW_SEGMENTS));
  disc.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  disc.applyMatrix4(new THREE.Matrix4().makeScale(semiX, 1, semiZ));
  return translated(disc, 0, CONTACT_SHADOW_Y, centreZ);
}

export interface ForgedPartBound {
  readonly bucket: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface ForgedVehicle {
  readonly group: THREE.Group;
  /** One per merged material bucket - this vehicle's draw-call cost. */
  readonly drawCalls: number;
  readonly triangles: number;
  readonly stations: number;
  /** Pre-merge part counts per bucket - the detail-pass audit trail. */
  readonly partCounts: Readonly<Record<string, number>>;
  /** Pre-merge AABB of every part, vehicle frame - the envelope audit trail. */
  readonly partBounds: readonly ForgedPartBound[];
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
 * HF-536 detail pass (Muse): the pre-merge audit trail. Counts and AABBs are
 * read off the placed, vehicle-frame geometries before they merge, so the
 * gates can assert per-bucket part counts and per-part envelope containment
 * without unmerging anything. Build-time only; no per-frame cost.
 */
function summarizeParts(parts: Readonly<Record<string, THREE.BufferGeometry[]>>): {
  partCounts: Record<string, number>;
  partBounds: ForgedPartBound[];
} {
  const partCounts: Record<string, number> = {};
  const partBounds: ForgedPartBound[] = [];
  for (const [bucket, geometries] of Object.entries(parts)) {
    partCounts[bucket] = geometries.length;
    for (const geometry of geometries) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) continue;
      partBounds.push({
        bucket,
        min: [box.min.x, box.min.y, box.min.z],
        max: [box.max.x, box.max.y, box.max.z],
      });
    }
  }
  return { partCounts, partBounds };
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
  dressing: WheelSetDressing = {},
): ForgedVehicle {
  const parts = { tyre: [] as THREE.BufferGeometry[], chrome: [] as THREE.BufferGeometry[], lining: [] as THREE.BufferGeometry[] };
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
  // HF-536 (R14): the same grounded dressing a lofted body gets. The bogie
  // carries the truck's, because the truck is one vehicle in two placements.
  const wheelSetSpan = { z0: Math.min(...axleZ), z1: Math.max(...axleZ) };
  if (dressing.underbody) {
    parts.lining.push(underbodyBox(
      Math.max(0.05, trackHalfWidth - dressing.underbody.insetM),
      dressing.underbody,
      { z0: wheelSetSpan.z0 + radius, z1: wheelSetSpan.z1 - radius },
    ));
  }
  if (dressing.contactShadow) {
    const span = dressing.contactSpan ?? wheelSetSpan;
    parts.tyre.push(contactPool(
      CONTACT_SHADOW_PLAN_FRACTION * trackHalfWidth * 2,
      Math.max(0.2, (span.z1 - span.z0) / 2),
      (span.z0 + span.z1) / 2,
    ));
  }
  const group = new THREE.Group();
  group.name = `vehicle-forge ${id}`;
  group.userData.presentationOnly = true;
  let drawCalls = 0;
  let triangles = 0;
  for (const bucket of ['tyre', 'chrome', 'lining'] as const) {
    if (parts[bucket].length === 0) continue;
    const merged = mergeGeometries(parts[bucket], false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, materials[bucket]);
    mesh.name = `vehicle-forge ${id} ${bucket}`;
    mesh.castShadow = bucket === 'tyre';
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
    mesh.userData.forgeBucket = bucket;
    group.add(mesh);
    drawCalls += 1;
    triangles += (merged.getAttribute('position')?.count ?? 0) / 3;
  }
  return { group, drawCalls, triangles, stations: 0, ...summarizeParts(parts) };
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

  // HF-536 (R14). GROUNDED DRESSING, before any trim, so it merges into the
  // tyre bucket with the wheels and costs no extra draw.
  if (dressing.underbody) {
    parts.lining.push(underbodyBox(
      Math.max(0.05, spec.sillHalfWidth - dressing.underbody.insetM),
      dressing.underbody,
      groundedSpan(axles, spec.wheelRadius, spec.archGap, spec.length),
    ));
  }
  if (dressing.contactShadow) {
    const wheelbase = Math.max(...axles) - Math.min(...axles);
    const poolZ = wheelbase >= 0.5
      ? { length: wheelbase, centre: (Math.min(...axles) + Math.max(...axles)) / 2 }
      : { length: spec.length - spec.wheelRadius * 2, centre: spec.length / 2 };
    parts.tyre.push(contactPool(
      CONTACT_SHADOW_PLAN_FRACTION * spec.trackHalfWidth * 2,
      CONTACT_SHADOW_PLAN_FRACTION * poolZ.length,
      poolZ.centre,
    ));
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

  if (dressing.doorHandles) {
    const { y, z } = dressing.doorHandles;
    const flankX = flankHalfWidth(spec, y);
    for (const handleZ of z) {
      for (const side of [1, -1] as const) {
        // The pull lies ALONG the door (z), standing 20 mm proud of the flank:
        // extruded along x it would be a 14 cm spike out of the panel.
        const pull = chamferedBar(0.07, 0.012, 0.012, 0.004);
        pull.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
        parts.chrome.push(translated(pull, side * (flankX + 0.008), y, handleZ));
      }
    }
  }
  // Full-cover and whitewall faces already carry a domed centre in their lathe
  // profile; a dome on a dome is triangle moss, so hubcaps dress steel only.
  if (dressing.hubcaps && dressing.wheelStyle === 'steel') {
    const rim = spec.wheelRadius * 0.62;
    const faceX = spec.tyreHalfWidth * 0.72 - 0.018;
    for (const z of axles) {
      for (const side of [1, -1] as const) {
        const dome = hubcapDome(rim, faceX);
        parts.chrome.push(translated(
          side === 1 ? dome : mirroredToLeft(dome),
          side * spec.trackHalfWidth,
          spec.wheelRadius,
          z,
        ));
      }
    }
  }
  // The hub-nut hint for covered faces: a small hex centre on the dome they
  // already carry. Steel faces read their hub from the cap and dome instead.
  if (dressing.wheelNuts && dressing.wheelStyle !== 'steel') {
    const faceX = spec.tyreHalfWidth * 0.72 + 0.012;
    for (const z of axles) {
      for (const side of [1, -1] as const) {
        const nut = nonIndexed(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 6));
        nut.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
        parts.chrome.push(translated(
          side === 1 ? nut : mirroredToLeft(nut),
          side * (spec.trackHalfWidth + faceX + 0.004),
          spec.wheelRadius,
          z,
        ));
      }
    }
  }
  if (dressing.indicators) {
    const { y, x } = dressing.indicators;
    for (const side of [1, -1] as const) {
      parts.headLamp.push(translated(chamferedBar(0.035, 0.03, 0.02, 0.006), side * x, y, 0.005));
      parts.tailLamp.push(translated(chamferedBar(0.035, 0.03, 0.02, 0.006), side * x, y, spec.length - 0.005));
    }
  }
  if (dressing.plates) {
    const plateW = dressing.plates.width ?? 0.32;
    const plateH = dressing.plates.height ?? 0.09;
    const rear = nonIndexed(new THREE.PlaneGeometry(plateW, plateH));
    parts.accent.push(translated(rear, 0, dressing.plates.y, spec.length + 0.004));
    const front = nonIndexed(new THREE.PlaneGeometry(plateW, plateH));
    front.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
    parts.accent.push(translated(front, 0, dressing.plates.y, -0.004));
  }
  if (dressing.pillars) {
    const { z, y0, y1 } = dressing.pillars;
    const midY = (y0 + y1) / 2;
    const glassX = flankHalfWidth(spec, midY) - 0.005;
    for (const pillarZ of z) {
      for (const side of [1, -1] as const) {
        parts.groove.push(translated(chamferedBar(0.012, (y1 - y0) / 2, 0.014, 0.004), side * glassX, midY, pillarZ));
      }
    }
  }
  if (dressing.vents) {
    for (const z of dressing.vents.z) {
      for (const side of [1, -1] as const) {
        const ventY = crownSurfaceY(spec, z, dressing.vents.x) + 0.005;
        parts.chrome.push(translated(chamferedBar(0.09, 0.025, 0.06, 0.008), side * dressing.vents.x, ventY, z));
      }
    }
  }
  if (dressing.stack) {
    const { z, y0, y1 } = dressing.stack;
    parts.chrome.push(translated(chamferedBar(0.035, (y1 - y0) / 2, 0.035, 0.008), 0, (y0 + y1) / 2, z));
    parts.chrome.push(translated(chamferedBar(0.045, 0.03, 0.045, 0.008), 0, y1 + 0.02, z));
  }
  if (dressing.gutters) {
    const { x, y, z0, z1 } = dressing.gutters;
    const midZ = (z0 + z1) / 2;
    const half = (z1 - z0) / 4;
    for (const side of [1, -1] as const) {
      for (const gutterZ of [midZ - half, midZ + half]) {
        const bar = chamferedBar(half - 0.01, 0.012, 0.012, 0.004);
        bar.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
        parts.chrome.push(translated(bar, side * x, y, gutterZ));
      }
    }
  }
  if (dressing.bootSeam) {
    const { y, z, halfWidth } = dressing.bootSeam;
    parts.groove.push(translated(chamferedBar(halfWidth, 0.009, 0.009, 0.003), 0, y, z));
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
  if (dressing.roofRails) {
    const rails = dressing.roofRails;
    for (const x of rails.x) {
      const rail = roofRail(
        spec,
        loft.rings,
        x,
        rails.z0,
        rails.z1,
        rails.halfWidth ?? 0.03,
        rails.height ?? 0.045,
      );
      if (rail) parts[rails.bucket].push(rail);
    }
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
    mesh.userData.forgeBucket = bucket;
    if (bucket === 'glass') mesh.renderOrder = 3;
    group.add(mesh);
    drawCalls += 1;
    triangles += (merged.getAttribute('position')?.count ?? 0) / 3;
  }

  return { group, drawCalls, triangles, stations: loft.rings.length, ...summarizeParts(parts) };
}
