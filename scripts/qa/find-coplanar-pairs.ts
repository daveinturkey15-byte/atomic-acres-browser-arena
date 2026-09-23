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
//     between them cannot produce a visible artifact, so it was reported as
//     SAME-MATERIAL (benign). HF-497 tightens exactly that class: when BOTH
//     bodies are rendered (neither carries `userData.presentationOnly`) and the
//     race region can actually draw — neither face buried inside the upper body
//     or an opaque third body, plan overlap at least MIN_RACE_AREA_M2 — the
//     pair is a FINDING (`SAME-VISIBLE`), because a same-material coplanar
//     pair still races when both surfaces draw to a player-visible pixel. The
//     scan/classify core lives in `src/nuketown2-coplanar-audit.ts` and is
//     shared with the vitest pin, so the instrument and the gate cannot drift.
//   - A pair with DIFFERENT materials is a FINDING unless the surface that
//     draws on top carries a polygonOffset (factor < 0), which pins the race
//     deterministically at every range on both the WebGPU and WebGL2 backends
//     — the same tiering HF-346 shipped on the Skyline apron. The pass target
//     is zero FINDINGS and zero SAME-VISIBLE findings.
//   - Presentation decals are batched by `batchPresentationOnlyBoxes` into
//     merged meshes whose member boxes lose their names. Each batch member is
//     audited through its hidden SOURCE node instead — the same geometry, the
//     same transform, and the same material object the batch reuses — so every
//     row names a real authored piece, and nothing is counted twice.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import {
  COPLANAR_NEAR_METERS,
  MIN_RACE_AREA_M2,
  ORIENTED_COPLANAR_NEAR_METERS,
  PARALLEL_TOLERANCE_DEGREES,
  auditNuketown2Coplanar,
  type CoplanarRow,
  type OrientedRow,
} from '../../src/nuketown2-coplanar-audit';

const VERDICT_LABEL: Readonly<Record<CoplanarRow['classification'], string>> = Object.freeze({
  'street-finding': 'STREET-FINDING ',
  'house-interior-finding': 'HOUSE-INTERIOR-FINDING ',
  fenced: 'FENCED  ',
  'same-material-visible': 'SAME-VISIBLE ',
  contact: 'CONTACT ',
  benign: 'BENIGN  ',
  finding: 'FINDING ',
});

function main(): void {
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  const audit = auditNuketown2Coplanar();
  const { counts, rows } = audit;

  const lines = rows.map((row) => [
    VERDICT_LABEL[row.classification],
    `dy=${row.gap.toFixed(4)}m`,
    `overlap=${row.overlap.toFixed(1)}m2`,
    `[${row.first.name} top=${row.first.top.toFixed(3)} mat=${row.first.materialName} offset=${row.first.polygonOffsetFactor}]`,
    `[${row.second.name} top=${row.second.top.toFixed(3)} mat=${row.second.materialName} offset=${row.second.polygonOffsetFactor}]`,
  ].join(' '));
  lines.sort();

  const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const header = [
    `# nuketown2 coplanar top-face pairs (HF-434 instrument)`,
    `# HOUSE-INTERIOR pairs<=${COPLANAR_NEAR_METERS}m (offsets ignored): ${counts.houseInteriorFindings}`,
    `# STREET pairs<=${COPLANAR_NEAR_METERS}m (offsets ignored): ${counts.streetFindings}`,
    `# HF-497 SAME-MATERIAL-VISIBLE FINDINGS (both rendered, race visible, no offset): ${counts.sameMaterialVisibleFindings}`,
    `# CONTACT (same-material edge/butt contact under the ${MIN_RACE_AREA_M2} m2 race floor): ${counts.contact}`,
    `# COLLISION-ONLY SLOPES (audited by parity/traversal, excluded from horizontal top-face scan): ${audit.collisionOnlySlopes.length}`
      + `${audit.collisionOnlySlopes.length > 0 ? ` - ${audit.collisionOnlySlopes.join(', ')}` : ''}`,
    `# head ${sha} · generated ${new Date().toISOString()}`,
    `# boxes=${audit.boxes.length} · pairs<=${COPLANAR_NEAR_METERS}m: ${counts.pairs}`
      + ` · FINDINGS (different materials, no offset): ${counts.findings}`
      + ` · FENCED (material offset): ${counts.fenced}`
      + ` · SAME-MATERIAL-VISIBLE: ${counts.sameMaterialVisibleFindings}`
      + ` · CONTACT: ${counts.contact}`
      + ` · SAME-MATERIAL (benign): ${counts.benign}`,
    `# UNAUDITED meshes (instanced / rotated / non-parametric geometry, not covered by`
      + ` the top-face test above): ${audit.skipped}${audit.skippedNames.length > 0 ? ` - ${audit.skippedNames.join(', ')}` : ''}`,
    `# HF-536: every one of those is covered by the ORIENTED scan below.`,
    '',
  ];
  // ---- HF-536 ORIENTED SCAN -------------------------------------------------
  // Face-plane vs face-plane, so rotation stops mattering; instances expanded;
  // non-box meshes declared as AABB bounds. See
  // src/nuketown2-oriented-coplanar-audit.ts for the classes and their meaning.
  const oriented = audit.oriented;
  const orientedLine = (row: OrientedRow): string => [
    row.classification.replace('oriented-', 'obb-').toUpperCase().padEnd(22),
    `score=${row.score.toFixed(3)}`,
    `gap=${row.gap.toFixed(4)}m`,
    `area=${row.overlap.toFixed(2)}m2`,
    `n=(${row.first.nx.toFixed(2)},${row.first.ny.toFixed(2)},${row.first.nz.toFixed(2)})`,
    `at=(${row.first.cx.toFixed(2)},${row.first.cy.toFixed(2)},${row.first.cz.toFixed(2)})`,
    `[${row.first.name} ${row.first.kind} mat=${row.first.materialName} offset=${row.first.polygonOffsetFactor}]`,
    `[${row.second.name} ${row.second.kind} mat=${row.second.materialName} offset=${row.second.polygonOffsetFactor}]`,
  ].join(' ');
  const isOrientedFinding = (row: OrientedRow): boolean => (
    row.classification === 'oriented-finding' || row.classification === 'oriented-back-to-back-finding'
  );
  const orientedHeader = [
    '',
    `# ---- ORIENTED FACE SCAN (HF-536) ----`,
    `# meshes=${oriented.meshes} · instances expanded=${oriented.instancesExpanded}`
      + ` · surfels=${oriented.surfels} (exact OBB ${oriented.exactSurfels}, declared AABB ${oriented.approxSurfels})`,
    `# parallel within ${PARALLEL_TOLERANCE_DEGREES} deg · separation ALONG THE SHARED NORMAL <= ${ORIENTED_COPLANAR_NEAR_METERS} m`,
    `# OBB-FINDING: ${oriented.counts['oriented-finding']}`
      + ` · OBB-BACK-TO-BACK-FINDING: ${oriented.counts['oriented-back-to-back-finding']}`
      + ` · OBB-FENCED: ${oriented.counts['oriented-fenced']}`
      + ` · OBB-SAME-MATERIAL: ${oriented.counts['oriented-same-material']}`
      + ` · OBB-CONTACT: ${oriented.counts['oriented-contact']}`
      + ` · OBB-BURIED (coplanar but the shared plane is inside a third opaque body): ${oriented.counts['oriented-buried']}`
      + ` · APPROX-CANDIDATE (an AABB bound on at least one side - never a finding): ${oriented.counts['approx-candidate']}`,
    `# sorted by SCREEN RELEVANCE (shared area x eye-band weight); findings first`,
    '',
  ];
  const report = [
    ...header,
    ...lines,
    ...orientedHeader,
    ...oriented.rows.filter(isOrientedFinding).map(orientedLine),
    '',
    '# --- non-finding oriented rows, top 200 by screen relevance ---',
    ...oriented.rows.filter((row) => !isOrientedFinding(row)).slice(0, 200).map(orientedLine),
    '',
  ].join('\n');
  if (outPath) {
    const out = resolve(outPath);
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, report);
    console.log(`written: ${out}`);
  }
  console.log(report);
  process.exitCode = counts.findings === 0
    && oriented.counts['oriented-finding'] === 0
    && oriented.counts['oriented-back-to-back-finding'] === 0
    && counts.houseInteriorFindings === 0
    && counts.streetFindings === 0
    && counts.sameMaterialVisibleFindings === 0
    ? 0 : 1;
}

main();
