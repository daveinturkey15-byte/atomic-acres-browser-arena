/**
 * nuketown2-coplanar-audit.ts — HF-497: the scan/classify core of the HF-434
 * z-fighting instrument, extracted so the instrument
 * (`scripts/qa/find-coplanar-pairs.ts`) and the vitest pin
 * (`src/nuketown2-fidelity.test.ts`) run the SAME classification instead of
 * two implementations that can drift.
 *
 * WHAT IS NEW UNDER HF-497 (owner: "z fighting" still on the Nuke Town list
 * even with HOUSE-INTERIOR 0 and STREET 0). The instrument's other classes
 * were non-findings, and tearing could hide in both:
 *
 *   - SAME-MATERIAL pairs were dismissed as benign because "identical
 *     fragments cannot visibly fight". The owner's rule is tighter: a
 *     same-material coplanar pair still races when BOTH surfaces draw and
 *     both are player-visible, and every visible race is pinned by a tier or
 *     an offset rather than argued away. So a same-material pair where BOTH
 *     bodies are rendered (neither carries `userData.presentationOnly`), the
 *     race region can actually draw (see `raceRegionVisible` below), and
 *     neither side carries a polygonOffset fence is now a FINDING
 *     (`same-material-visible`).
 *   - FENCED pairs were dismissed whenever either body carried
 *     `polygonOffsetFactor < 0`. That stays the classification (the fence is
 *     the arena's own tier contract), but the audit behind it is honest now:
 *     a fence only prevents tearing where the offset body is opaque between
 *     the two surfaces, and the grime module already documents the one case
 *     the offset cannot order (two transparent films share one plane —
 *     MUSE FINDING 1, separated by family lifts instead).
 *
 * The `same-material-visible` class is decided GEOMETRICALLY, from the built
 * roster — no name lists:
 *
 *   - `MIN_RACE_AREA_M2`: a same-material plan overlap smaller than 0.02 m2
 *     is a butt joint or edge contact of adjoining members (the balcony rail
 *     corners meet at 0.12 m x 0.12 m = 0.0144 m2), not a surface race; every
 *     authored surface race on this arena is >= 0.1 m2. Below the floor a
 *     coplanar pair is `contact`, not a finding.
 *   - `raceRegionVisible` samples the overlap rectangle. A same-material race
 *     needs BOTH top faces to draw at the same sample: the upper face must
 *     not be buried inside a third body, and — when the tops differ — the
 *     lower face must not be buried inside the UPPER body (a face strictly
 *     inside another solid draws on no view ray) nor inside a third body.
 *     See-through bodies (any transparent material — window glass, grime
 *     films) never occlude a race. This is the mechanical form of "the fence
 *     is actually opaque between them": a sill nose outside a wall and its
 *     stool inside it never class as a visible race, while a balcony cap
 *     lying flush on its rails does.
 */

import * as THREE from 'three';
import {
  buildNuketown2,
  NUKETOWN2_BUILDING_FOOTPRINTS,
  NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
} from './nuketown2-arena';
import { nuketown2HandedSpan, nuketown2HandedX } from './nuketown2-layout';

/** Two top faces this close race for the same depth samples. */
export const COPLANAR_NEAR_METERS = 0.03;

/**
 * Below this plan-overlap area a same-material pair is construction contact
 * (butt joint / edge contact), not a visible race. 0.02 m2 sits in the measured
 * gap between the arena's largest member-to-member contact (0.0144 m2, the
 * balcony rail corners) and its smallest authored surface race (0.1 m2).
 */
export const MIN_RACE_AREA_M2 = 0.02;

export type CoplanarBox = {
  name: string;
  materialId: string;
  materialName: string;
  polygonOffsetFactor: number;
  /** `userData.presentationOnly` — decorative trim the owner's rule excludes. */
  presentationOnly: boolean;
  /** Any transparent material: the box shows its background, so it cannot occlude a race. */
  seeThrough: boolean;
  x0: number; x1: number; z0: number; z1: number;
  top: number;
  bottom: number;
};

export type CoplanarVerdict =
  | 'street-finding'
  | 'house-interior-finding'
  | 'fenced'
  | 'same-material-visible'
  | 'contact'
  | 'benign'
  | 'finding';

export type CoplanarRow = {
  verdict: CoplanarVerdict;
  /** |topA - topB| in metres. */
  gap: number;
  /** Plan-overlap area in m2. */
  overlap: number;
  first: CoplanarBox;
  second: CoplanarBox;
};

export type CoplanarCounts = {
  pairs: number;
  findings: number;
  houseInteriorFindings: number;
  streetFindings: number;
  sameMaterialVisibleFindings: number;
  fenced: number;
  contact: number;
  benign: number;
};

export type CoplanarAudit = {
  boxes: CoplanarBox[];
  rows: CoplanarRow[];
  skipped: number;
  skippedNames: string[];
  collisionOnlySlopes: string[];
  counts: CoplanarCounts;
};


export function collectBoxes(): { boxes: CoplanarBox[]; skipped: number; skippedNames: string[]; collisionOnlySlopes: string[] } {
  const scene = new THREE.Scene();
  const map = buildNuketown2(scene);
  const boxes: CoplanarBox[] = [];
  let skipped = 0;
  const skippedNames: string[] = [];
  const collisionOnlySlopes: string[] = [];
  // REVIEW FIX (Opus, PASS 92): TRAVERSE, do not iterate the direct children.
  // The arena root also carries three art GROUPS - the instanced lawn field,
  // the forest ring and the mountain backdrop - and iterating `children` walked
  // straight past all sixteen of their meshes WITHOUT COUNTING THEM, so the
  // report's own "skipped: 0" line claimed a complete audit it had not done.
  // They are still not auditable here (instanced or non-parametric geometry
  // rather than authored axis-aligned boxes), but they are now COUNTED and
  // NAMED, so "0 FINDINGS" is a scoped claim and the unaudited classes are
  // visible to whoever reads the evidence.
  map.root.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  map.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    // Batch meshes are skipped: their members are audited through the hidden
    // source nodes, which carry the names and the exact same material objects.
    // The test is `sourceMeshes`, the marker `batchPresentationOnlyBoxes` puts
    // on a MERGED mesh - NOT `presentationOnly`, which the lawn field, the
    // forest ring and the mountain backdrop also set, and which therefore
    // dropped all sixteen of their meshes out of the audit with no trace.
    if (mesh.userData.sourceMeshes !== undefined) return;
    const label = mesh.name || mesh.type;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) { skipped += 1; skippedNames.push(`${label} (instanced)`); return; }
    if (mesh.userData.collisionOnly === true) { collisionOnlySlopes.push(label); return; }
    if (mesh.rotation.x !== 0 || mesh.rotation.y !== 0 || mesh.rotation.z !== 0) { skipped += 1; skippedNames.push(`${label} (rotated)`); return; }
    const geometry = mesh.geometry as THREE.BoxGeometry;
    // GEOMETRY-2 MERGE (HF-477 turning head x HF-497 shared core): `parameters`
    // being DEFINED is not enough. The circular turning head is a
    // CylinderGeometry, whose `parameters` object exists but carries
    // radiusTop/radiusBottom/height and NO width or depth. Read as a box it
    // produced NaN half-extents, which compare false against everything, so the
    // disc silently vanished from the audit while `skipped` still said 0. The
    // turning-head lane hardened exactly this in the instrument; the check moves
    // here with the scan so the vitest pin inherits it.
    const p = geometry.parameters as { width?: number; height?: number; depth?: number } | undefined;
    if (p?.width === undefined || p.height === undefined || p.depth === undefined) {
      skipped += 1;
      skippedNames.push(`${label} (non-box)`);
      return;
    }
    mesh.getWorldPosition(world);
    const halfHeight = p.height / 2;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    boxes.push({
      name: mesh.name,
      // Batched meshes reuse the exact material OBJECTS of their hidden
      // source nodes, so the joined uuid string is the same-material test
      // both for plain meshes and for batch members.
      materialId: materials.map((entry) => entry.uuid).join('|'),
      materialName: materials.map((entry) => (entry as THREE.Material & { name?: string }).name || entry.type).join('|'),
      polygonOffsetFactor: Math.min(...materials.map((entry) => (entry.polygonOffsetFactor ?? 0))),
      presentationOnly: mesh.userData.presentationOnly === true,
      seeThrough: materials.some((entry) => entry.transparent === true),
      x0: world.x - p.width / 2,
      x1: world.x + p.width / 2,
      z0: world.z - p.depth / 2,
      z1: world.z + p.depth / 2,
      top: world.y + halfHeight,
      bottom: world.y - halfHeight,
    });
  });
  return { boxes, skipped, skippedNames, collisionOnlySlopes };
}

type PlanRect = Readonly<{ x0: number; x1: number; z0: number; z1: number }>;
type PlanCircle = Readonly<{
  shape: 'circle';
  centreX: number;
  centreZ: number;
  radius: number;
  x0: number; x1: number; z0: number; z1: number;
}>;
type PlanRectFootprint = PlanRect & Readonly<{ shape: 'rect' }>;
// The DISCRIMINANT is carried through from `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS`,
// whose rect entries already declare `shape: 'rect'`. The turning-head lane
// dropped it while mirroring, which type-checks only because `scripts/` is
// outside the app tsconfig; inside `src/` the union has to keep its tag.
type CarriagewayFootprint = PlanRectFootprint | PlanCircle;

// HF-473: NUKETOWN2_BUILDING_FOOTPRINTS is an AUTHORED table and the boxes
// collected above are WORLD, so the mirror is applied before the two are
// compared. Left unconverted, the driveway apron fell inside what this script
// believed was the house interior and reported two findings against geometry
// that had not moved relative to anything.
const WORLD_FOOTPRINTS: readonly PlanRect[] = Object.freeze(
  NUKETOWN2_BUILDING_FOOTPRINTS.map((footprint) => {
    const [x0, x1] = nuketown2HandedSpan(footprint.x0, footprint.x1);
    return Object.freeze({ x0, x1, z0: footprint.z0, z1: footprint.z1 });
  }),
);

const BUILDING_FOOTPRINTS: readonly PlanRect[] = Object.freeze([
  ...WORLD_FOOTPRINTS,
  ...WORLD_FOOTPRINTS.map((footprint) => Object.freeze({
    x0: -footprint.x1,
    x1: -footprint.x0,
    z0: -footprint.z1,
    z1: -footprint.z0,
  })),
]);

/**
 * HF-477. `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS` is AUTHORED and the boxes measured
 * above are WORLD, and until the lollipop that difference could not bite: the
 * old carriageway was a full-width street plus a turning head centred on the
 * origin, so it was its own mirror image and the two frames agreed. A
 * cul-de-sac at one end is not, so the rects are put through the same mirror
 * every solid is. Without this the instrument reported nine STREET findings on
 * verge decals that are nowhere near the road - the road it was comparing them
 * against was the reflection of the real one.
 */
const WORLD_CARRIAGEWAY_FOOTPRINTS: readonly CarriagewayFootprint[] = NUKETOWN2_CARRIAGEWAY_FOOTPRINTS.map((footprint) => {
  const [x0, x1] = nuketown2HandedSpan(footprint.x0, footprint.x1);
  return footprint.shape === 'circle'
    ? { ...footprint, centreX: nuketown2HandedX(footprint.centreX), x0, x1 }
    : { shape: 'rect' as const, x0, x1, z0: footprint.z0, z1: footprint.z1 };
});

// GEOMETRY-2 MERGE: the turning head is a DISC, so its authored footprint is a
// circle. Testing the overlap rectangle against the circle's bounding box would
// call the four corner pockets carriageway and hide any street race that lands
// in them; the nearest-point test is the same one the arena's own paved cut and
// grass keep-out use, so instrument and geometry agree on where the road is.
function circleOverlapsPlanRect(circle: PlanCircle, rect: PlanRect): boolean {
  const nearestX = Math.max(rect.x0, Math.min(circle.centreX, rect.x1));
  const nearestZ = Math.max(rect.z0, Math.min(circle.centreZ, rect.z1));
  return (nearestX - circle.centreX) ** 2 + (nearestZ - circle.centreZ) ** 2 < circle.radius ** 2;
}

function overlapInsideBuilding(first: CoplanarBox, second: CoplanarBox): boolean {
  return BUILDING_FOOTPRINTS.some((footprint) => (
    Math.min(first.x1, second.x1, footprint.x1) - Math.max(first.x0, second.x0, footprint.x0) > 1e-4
    && Math.min(first.z1, second.z1, footprint.z1) - Math.max(first.z0, second.z0, footprint.z0) > 1e-4
  ));
}

function overlapInsideCarriageway(first: CoplanarBox, second: CoplanarBox): boolean {
  const overlap: PlanRect = {
    x0: Math.max(first.x0, second.x0),
    x1: Math.min(first.x1, second.x1),
    z0: Math.max(first.z0, second.z0),
    z1: Math.min(first.z1, second.z1),
  };
  return WORLD_CARRIAGEWAY_FOOTPRINTS.some((footprint) => (
    footprint.shape === 'circle'
      ? circleOverlapsPlanRect(footprint, overlap)
      : Math.min(overlap.x1, footprint.x1) - Math.max(overlap.x0, footprint.x0) > 1e-4
        && Math.min(overlap.z1, footprint.z1) - Math.max(overlap.z0, footprint.z0) > 1e-4
  ));
}

function strictlyInside(box: CoplanarBox, x: number, y: number, z: number): boolean {
  return x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1 && y > box.bottom && y < box.top;
}

/** Any third body (opaque, not one of the racing pair) burying the point. */
function buriedInThird(first: CoplanarBox, second: CoplanarBox, boxes: readonly CoplanarBox[], x: number, y: number, z: number): boolean {
  for (const other of boxes) {
    if (other === first || other === second || other.seeThrough) continue;
    if (strictlyInside(other, x, y, z)) return true;
  }
  return false;
}

/**
 * Can BOTH top faces of the pair actually draw somewhere over the plan
 * overlap? Sample the overlap rectangle; a same-material race needs one
 * sample where the upper face is not buried in a third body and the lower
 * face (when the tops differ) is not buried inside the upper body or a third
 * body. Equal tops race wherever either face draws.
 */
function raceRegionVisible(first: CoplanarBox, second: CoplanarBox, boxes: readonly CoplanarBox[]): boolean {
  const low = first.top <= second.top ? first : second;
  const high = first.top <= second.top ? second : first;
  const x0 = Math.max(first.x0, second.x0);
  const x1 = Math.min(first.x1, second.x1);
  const z0 = Math.max(first.z0, second.z0);
  const z1 = Math.min(first.z1, second.z1);
  const sameTop = high.top - low.top < 1e-9;
  // Cell-centre sampling at <= 5 cm pitch, bounded so huge rects stay cheap.
  const nx = Math.max(2, Math.min(9, Math.ceil((x1 - x0) / 0.05)));
  const nz = Math.max(2, Math.min(9, Math.ceil((z1 - z0) / 0.05)));
  for (let ix = 0; ix < nx; ix += 1) {
    const x = x0 + ((ix + 0.5) / nx) * (x1 - x0);
    for (let iz = 0; iz < nz; iz += 1) {
      const z = z0 + ((iz + 0.5) / nz) * (z1 - z0);
      if (buriedInThird(first, second, boxes, x, high.top, z)) continue;
      if (sameTop) return true;
      if (strictlyInside(high, x, low.top, z)) continue;
      if (buriedInThird(first, second, boxes, x, low.top, z)) continue;
      return true;
    }
  }
  return false;
}

export function classifyPair(
  first: CoplanarBox,
  second: CoplanarBox,
  boxes: readonly CoplanarBox[],
): Omit<CoplanarRow, 'first' | 'second'> {
  const overlapX = Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0);
  const overlapZ = Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0);
  const gap = Math.abs(first.top - second.top);
  const overlap = overlapX * overlapZ;
  const sameMaterial = first.materialId === second.materialId;
  const fencedByOffset = first.polygonOffsetFactor < 0 || second.polygonOffsetFactor < 0;
  const base = { gap, overlap };
  if (overlapInsideCarriageway(first, second)) return { ...base, verdict: 'street-finding' };
  if (overlapInsideBuilding(first, second)) return { ...base, verdict: 'house-interior-finding' };
  if (fencedByOffset) return { ...base, verdict: 'fenced' };
  if (sameMaterial) {
    if (first.presentationOnly || second.presentationOnly) return { ...base, verdict: 'benign' };
    if (overlap < MIN_RACE_AREA_M2) return { ...base, verdict: 'contact' };
    if (!raceRegionVisible(first, second, boxes)) return { ...base, verdict: 'benign' };
    return { ...base, verdict: 'same-material-visible' };
  }
  return { ...base, verdict: 'finding' };
}

export function auditNuketown2Coplanar(): CoplanarAudit {
  const { boxes, skipped, skippedNames, collisionOnlySlopes } = collectBoxes();
  const rows: CoplanarRow[] = [];
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const first = boxes[a]!;
      const second = boxes[b]!;
      const overlapX = Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0);
      const overlapZ = Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0);
      if (overlapX <= 1e-4 || overlapZ <= 1e-4) continue;
      if (Math.abs(first.top - second.top) > COPLANAR_NEAR_METERS) continue;
      rows.push({ ...classifyPair(first, second, boxes), first, second });
    }
  }
  const counts: CoplanarCounts = {
    pairs: rows.length,
    findings: 0,
    houseInteriorFindings: 0,
    streetFindings: 0,
    sameMaterialVisibleFindings: 0,
    fenced: 0,
    contact: 0,
    benign: 0,
  };
  for (const row of rows) {
    switch (row.verdict) {
      case 'street-finding': counts.streetFindings += 1; break;
      case 'house-interior-finding': counts.houseInteriorFindings += 1; break;
      case 'same-material-visible': counts.sameMaterialVisibleFindings += 1; break;
      case 'fenced': counts.fenced += 1; break;
      case 'contact': counts.contact += 1; break;
      case 'benign': counts.benign += 1; break;
      case 'finding': counts.findings += 1; break;
    }
  }
  return { boxes, rows, skipped, skippedNames, collisionOnlySlopes, counts };
}
