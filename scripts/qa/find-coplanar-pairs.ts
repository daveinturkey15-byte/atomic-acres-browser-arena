#!/usr/bin/env tsx
// HF-434 Z-FIGHTING instrument: list every pair of nuketown2 meshes whose
// horizontal TOP faces are within 0.03 m of each other in y AND whose plan
// footprints overlap — the geometry class that z-fights, because two
// up-facing surfaces a few millimetres apart race for the same depth samples.
//
// Depth-precision context (owner complaint "loads of z-fighting all through the
// map", PASS 91): the on-foot camera near plane is
// FIRST_PERSON_CAMERA_NEAR_METERS = 0.02 m with far 180 m, so depth precision is
// roughly 1 cm at 60 m. A 0.02 m authored offset therefore flickers at range,
// and an exact coplanar pair flickers everywhere.
//
// What is counted, and what is not:
//   - TOP-facing horizontal faces only (each mesh's y-max plane). Two solids
//     resting on each other (a roof deck's buried bottom face against a wall's
//     top face) are construction contact, not a depth race: the upper body's
//     bottom face is backface-culled from above and the upper body occludes the
//     contact from every outside view. The decal-on-floor race is the class the
//     owner can see.
//   - Classes. A pair whose two materials are the SAME OBJECT renders identical
//     fragments from identical +y faces under identical lighting: a depth race
//     between them cannot produce a visible artifact, so it is reported as
//     SAME-MATERIAL (benign), never as a finding. A pair with DIFFERENT
//     materials is a FINDING unless the surface that draws on top carries a
//     polygonOffset (factor < 0), which pins the race deterministically at
//     every range on both the WebGPU and WebGL2 backends — the same tiering
//     HF-346 shipped on the Skyline apron. The pass target is zero FINDINGS.
//   - Presentation decals are batched by `batchPresentationOnlyBoxes` into
//     merged meshes whose member boxes lose their names. Each batch member is
//     audited through its hidden SOURCE node instead — the same geometry, the
//     same transform, and the same material object the batch reuses — so every
//     row names a real authored piece, and nothing is counted twice.
// PASS 96 (all-arenas lane, HF-486/503 follow-on): the instrument now takes
// `--arena <id>` (repeatable) and `--all` (the full ARENA_IDS roster, derived
// from the arena catalog - never a hardcoded list). The HOUSE-INTERIOR and
// STREET classes are AUTHORED-footprint classes: their tables exist only for
// nuketown2, so on any other arena they are structurally absent and read 0
// rather than being silently excused. With no arena flags the script measures
// exactly what it always measured - nuketown2 - so the pass-94 acceptance gate
// command is unchanged.

import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
  NUKETOWN2_BUILDING_FOOTPRINTS,
  NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
} from '../../src/nuketown2-arena';
import { nuketown2HandedSpan } from '../../src/nuketown2-layout';
import { ARENA_IDS, isArenaId, type ArenaId } from '../../src/arena-identity';
import { ARENA_BUILDERS } from '../../src/spawn-layout-constraints';
import { prepareMap3 } from '../../src/map3-arena';
import { pathToFileURL } from 'node:url';

const NEAR_METERS = 0.03;

type Box = {
  name: string;
  materialId: string;
  materialName: string;
  polygonOffsetFactor: number;
  x0: number; x1: number; z0: number; z1: number;
  top: number;
};

function offsetFactorOf(mesh: THREE.Mesh): number {
  const material = mesh.material;
  if (Array.isArray(material)) return Math.min(...material.map((entry) => (entry.polygonOffsetFactor ?? 0)));
  return material.polygonOffsetFactor ?? 0;
}

function materialIdOf(mesh: THREE.Mesh): string {
  const material = mesh.material;
  if (Array.isArray(material)) return material.map((entry) => entry.uuid).join('|');
  return material.uuid;
}

function materialNameOf(mesh: THREE.Mesh): string {
  const material = mesh.material as THREE.Material & { name?: string };
  if (Array.isArray(material)) return material.map((entry) => entry.name || entry.type).join('|');
  return material.name || material.type;
}

function collectBoxes(arenaId: ArenaId): { boxes: Box[]; skipped: number; skippedNames: string[]; collisionOnlySlopes: string[] } {
  const scene = new THREE.Scene();
  const map = ARENA_BUILDERS[arenaId](scene);
  const boxes: Box[] = [];
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
    // An INVISIBLE mesh draws no fragments, so it cannot enter a visible
    // depth race. Authored-invisible geometry - farcrysis boundary walls and
    // collider proxies (the HF-360 idiom) - is therefore excluded and named,
    // exactly like every other unauditable class; left unguarded it paired
    // against visible art as phantom FINDINGS.
    // EXCEPTION: a retired batch SOURCE is also `visible = false`, but
    // `batchPresentationOnlyBoxes` hides it and draws the merged batch in its
    // place, and this instrument's contract is to audit each member THROUGH
    // that hidden source (same geometry, transform and material the batch
    // reuses). Those carry `staticBatchRendered` and stay in the audit -
    // excluding them would silently drop the nuketown2 decal discipline the
    // pass-94 gate records were measured against.
    let hidden = false;
    for (let ancestor: THREE.Object3D | null = mesh; ancestor !== null; ancestor = ancestor.parent) {
      if (ancestor.visible === false) { hidden = true; break; }
    }
    if (hidden && mesh.userData.staticBatchRendered !== true) {
      skipped += 1;
      skippedNames.push(`${label} (invisible)`);
      return;
    }
    if (mesh.userData.collisionOnly === true) { collisionOnlySlopes.push(label); return; }
    if (mesh.rotation.x !== 0 || mesh.rotation.y !== 0 || mesh.rotation.z !== 0) { skipped += 1; skippedNames.push(`${label} (rotated)`); return; }
    const geometry = mesh.geometry as THREE.BoxGeometry;
    if (geometry.parameters === undefined) { skipped += 1; skippedNames.push(`${label} (non-box)`); return; }
    const p = geometry.parameters;
    mesh.getWorldPosition(world);
    // A body that measures non-finite (animated/parametric world matrix or
    // degenerate parameters) cannot be placed. Unguarded, `dy > NEAR_METERS`
    // is false for NaN, so one NaN box pairs with EVERYTHING and floods the
    // report with dy=NaN FINDINGS - measured on map3's shoreline and godrays
    // bodies. Counted and named as UNAUDITED, like the other unmeasurable
    // classes, so a report total is always a finite measurement.
    if (!Number.isFinite(world.x + world.y + world.z + p.width + p.height + p.depth)) {
      skipped += 1;
      skippedNames.push(`${label} (non-finite)`);
      return;
    }
    boxes.push({
      name: mesh.name,
      materialId: materialIdOf(mesh),
      materialName: materialNameOf(mesh),
      polygonOffsetFactor: offsetFactorOf(mesh),
      x0: world.x - p.width / 2,
      x1: world.x + p.width / 2,
      z0: world.z - p.depth / 2,
      z1: world.z + p.depth / 2,
      top: world.y + p.height / 2,
    });
  });
  return { boxes, skipped, skippedNames, collisionOnlySlopes };
}

type PlanRect = Readonly<{ x0: number; x1: number; z0: number; z1: number }>;

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

function overlapInsideBuilding(first: Box, second: Box): boolean {
  return BUILDING_FOOTPRINTS.some((footprint) => (
    Math.min(first.x1, second.x1, footprint.x1) - Math.max(first.x0, second.x0, footprint.x0) > 1e-4
    && Math.min(first.z1, second.z1, footprint.z1) - Math.max(first.z0, second.z0, footprint.z0) > 1e-4
  ));
}

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
const WORLD_CARRIAGEWAY_FOOTPRINTS = NUKETOWN2_CARRIAGEWAY_FOOTPRINTS.map((footprint) => {
  const [x0, x1] = nuketown2HandedSpan(footprint.x0, footprint.x1);
  return { ...footprint, x0, x1 };
});

function overlapInsideCarriageway(first: Box, second: Box): boolean {
  return WORLD_CARRIAGEWAY_FOOTPRINTS.some((footprint) => (
    Math.min(first.x1, second.x1, footprint.x1) - Math.max(first.x0, second.x0, footprint.x0) > 1e-4
    && Math.min(first.z1, second.z1, footprint.z1) - Math.max(first.z0, second.z0, footprint.z0) > 1e-4
  ));
}

export type CoplanarCounts = Readonly<{
  pairs: number;
  findings: number;
  fenced: number;
  sameMaterial: number;
  houseInterior: number;
  street: number;
}>;

export type CoplanarScan = Readonly<{
  boxes: number;
  skipped: number;
  skippedNames: readonly string[];
  collisionOnlySlopes: readonly string[];
  counts: CoplanarCounts;
  rows: readonly string[];
}>;

/**
 * The full horizontal-top-face audit for one arena, shared by the CLI and the
 * roster-derived pinning test. `scopeFootprints` gates the two AUTHORED
 * footprint classes: they exist only where authored footprint tables exist
 * (nuketown2). On another arena the tables were never written, and reporting
 * HOUSE-INTERIOR/STREET findings against nothing would be inventing a failure
 * just as surely as reporting 0 against hidden geometry would be hiding one -
 * so the classes simply do not fire there.
 */
export function scanArena(arenaId: ArenaId): CoplanarScan {
  const { boxes, skipped, skippedNames, collisionOnlySlopes } = collectBoxes(arenaId);
  const scopeFootprints = arenaId === 'nuketown2';
  const rows: string[] = [];
  let findings = 0;
  let fenced = 0;
  let sameMaterial = 0;
  let houseInterior = 0;
  let street = 0;
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const first = boxes[a]!;
      const second = boxes[b]!;
      const overlapX = Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0);
      const overlapZ = Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0);
      if (overlapX <= 1e-4 || overlapZ <= 1e-4) continue;
      const gap = Math.abs(first.top - second.top);
      if (gap > NEAR_METERS) continue;
      const matchedMaterial = first.materialId === second.materialId;
      const fencedByOffset = first.polygonOffsetFactor < 0 || second.polygonOffsetFactor < 0;
      const houseInteriorPair = scopeFootprints && overlapInsideBuilding(first, second);
      const streetPair = scopeFootprints && overlapInsideCarriageway(first, second);
      const verdict = streetPair ? 'STREET-FINDING '
        : houseInteriorPair ? 'HOUSE-INTERIOR-FINDING '
        : fencedByOffset ? 'FENCED  ' : matchedMaterial ? 'BENIGN  ' : 'FINDING ';
      if (streetPair) street += 1;
      else if (houseInteriorPair) houseInterior += 1;
      else if (fencedByOffset) fenced += 1;
      else if (matchedMaterial) sameMaterial += 1;
      else findings += 1;
      rows.push([
        verdict,
        `dy=${gap.toFixed(4)}m`,
        `overlap=${(overlapX * overlapZ).toFixed(1)}m2`,
        `[${first.name} top=${first.top.toFixed(3)} mat=${first.materialName} offset=${first.polygonOffsetFactor}]`,
        `[${second.name} top=${second.top.toFixed(3)} mat=${second.materialName} offset=${second.polygonOffsetFactor}]`,
      ].join(' '));
    }
  }
  rows.sort();
  return {
    boxes: boxes.length,
    skipped,
    skippedNames,
    collisionOnlySlopes,
    counts: { pairs: rows.length, findings, fenced, sameMaterial, houseInterior, street },
    rows,
  };
}

function renderReport(arenaId: ArenaId, scan: CoplanarScan, sha: string): string {
  const { counts } = scan;
  const scopeNote = arenaId === 'nuketown2' ? [] : [
    `# HOUSE-INTERIOR and STREET are AUTHORED-footprint classes (nuketown2 tables);`,
    `# on ${arenaId} they are structurally absent and read 0.`,
  ];
  const header = [
    `# ${arenaId} coplanar top-face pairs (HF-434 instrument)`,
    `# HOUSE-INTERIOR pairs<=${NEAR_METERS}m (offsets ignored): ${counts.houseInterior}`,
    `# STREET pairs<=${NEAR_METERS}m (offsets ignored): ${counts.street}`,
    ...scopeNote,
    `# COLLISION-ONLY SLOPES (audited by parity/traversal, excluded from horizontal top-face scan): ${scan.collisionOnlySlopes.length}`
      + `${scan.collisionOnlySlopes.length > 0 ? ` - ${scan.collisionOnlySlopes.join(', ')}` : ''}`,
    `# head ${sha} · generated ${new Date().toISOString()}`,
    `# boxes=${scan.boxes} · pairs<=${NEAR_METERS}m: ${counts.pairs}`
      + ` · FINDINGS (different materials, no offset): ${counts.findings}`
      + ` · FENCED (material offset): ${counts.fenced}`
      + ` · SAME-MATERIAL (benign): ${counts.sameMaterial}`,
    `# UNAUDITED meshes (instanced / rotated / non-parametric geometry, not covered by`
      + ` the top-face test above): ${scan.skipped}${scan.skippedNames.length > 0 ? ` - ${scan.skippedNames.join(', ')}` : ''}`,
    '',
  ];
  return [...header, ...scan.rows, ''].join('\n');
}

function requestedArenas(argv: readonly string[]): ArenaId[] {
  if (argv.includes('--all')) return [...ARENA_IDS];
  const arenas: ArenaId[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--arena') continue;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('--arena requires an arena id');
    }
    arenas.push(value as ArenaId);
  }
  return arenas.length > 0 ? arenas : ['nuketown2'];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex >= 0 ? argv[outIndex + 1] : undefined;
  let requested: ArenaId[];
  try {
    requested = requestedArenas(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`known arena ids (src/arena-identity.ts): ${ARENA_IDS.join(', ')}`);
    process.exitCode = 2;
    return;
  }
  const unknown = requested.filter((id) => !isArenaId(id));
  if (unknown.length > 0) {
    console.error(`unknown arena id(s): ${unknown.join(', ')}`);
    console.error(`known arena ids (src/arena-identity.ts): ${ARENA_IDS.join(', ')}`);
    process.exitCode = 2;
    return;
  }
  // MAP3 (HF-409): the eighth corridor's wasm must be resolved before the
  // synchronous build; every other arena builds as-is.
  if (requested.includes('map3')) await prepareMap3();

  const scanByArena: Record<string, CoplanarScan> = {};
  for (const arenaId of requested) scanByArena[arenaId] = scanArena(arenaId);
  const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

  let findings = 0;
  let houseInterior = 0;
  let street = 0;
  const summary: string[] = [];
  const sections: string[] = [];
  for (const arenaId of requested) {
    const scan = scanByArena[arenaId]!;
    const counts = scan.counts;
    findings += counts.findings;
    houseInterior += counts.houseInterior;
    street += counts.street;
    summary.push(
      `# ${arenaId}: boxes=${scan.boxes} · FINDINGS ${counts.findings} · FENCED ${counts.fenced}`
        + ` · SAME-MATERIAL ${counts.sameMaterial} · HOUSE-INTERIOR ${counts.houseInterior}`
        + ` · STREET ${counts.street} · UNAUDITED ${scan.skipped}`,
    );
    sections.push(renderReport(arenaId, scan, sha));
  }
  const report = sections.length === 1 ? sections[0]! : [...summary, '', ...sections].join('\n');
  if (outPath) {
    const out = resolve(outPath);
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, report);
    console.log(`written: ${out}`);
  }
  console.log(report);
  process.exitCode = findings === 0 && houseInterior === 0 && street === 0 ? 0 : 1;
}

// Run only when invoked as the CLI. The roster-derived pinning test imports
// scanArena and must not trigger a full sweep on import.
const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) void main();
