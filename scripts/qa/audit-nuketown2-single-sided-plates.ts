#!/usr/bin/env tsx
/**
 * HF-536 night-defects-2, JOB 3 (see-through assets) — the STATIC half.
 *
 * Owner, 2026-09-06: "textures missing you can see through floors and assets".
 * One mechanical cause of exactly that report is a THIN PLATE whose material
 * is `THREE.FrontSide`: from one side it is a wall, from the other side it is
 * not there at all, and what you see instead is whatever is behind it -
 * usually the sky or the inside of the house. It looks like a missing texture
 * and it is a culling bug.
 *
 * This audit is geometric and needs no renderer. For every opaque BOX mesh in
 * `buildNuketown2` that is a PLATE (one dimension <= PLATE_MAX_THICKNESS_M) it
 * asks whether a player can stand on BOTH broad sides:
 *
 *   - a probe is placed CLEARANCE_M out from each broad face, at the plate's
 *     own centre height and again at eye height where that is inside the plate
 *     span, and
 *   - a side counts as REACHABLE when that probe is not inside any opaque
 *     body, i.e. it is open air a body could occupy.
 *
 * A FrontSide plate reachable from both sides is a FINDING: make it
 * `THREE.DoubleSide`, or close the back with a second face, or make it a solid
 * instead of a plate. A plate reachable from one side only is correct
 * single-sided authoring and is reported as a count.
 *
 * DECLARED LIMITS. This walks `buildNuketown2()` only, so it cannot see the
 * Quality art layer (`loadArenaArt`) - the same limit the coplanar audits
 * carry. Non-box geometry is skipped and counted. Reachability here means
 * "open air next to the face", not "a route exists to it"; the walkable
 * parity audit owns routes.
 *
 * Usage: tsx scripts/qa/audit-nuketown2-single-sided-plates.ts [--out FILE]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import * as THREE from 'three';
import {
  auditNuketown2SingleSidedPlates,
  PLATE_MAX_THICKNESS_M,
  PLATE_CLEARANCE_M,
} from '../../src/nuketown2-single-sided-plate-audit';

const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
const audit = auditNuketown2SingleSidedPlates();
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const lines = [
  `# nuketown2 single-sided plate audit (HF-536, JOB 3 static half)`,
  `# head ${sha} · generated ${new Date().toISOString()}`,
  `# plate = an opaque box whose thinnest dimension <= ${PLATE_MAX_THICKNESS_M} m`,
  `# reachable = open air ${PLATE_CLEARANCE_M} m out from the broad face`,
  `# meshes=${audit.meshes} · plates=${audit.plates} · non-box skipped=${audit.skippedNonBox}`,
  `# FINDINGS (FrontSide, reachable from BOTH sides): ${audit.findings.length}`,
  `# single-sided plates reachable from ONE side (correct): ${audit.oneSided}`,
  `# plates already DoubleSide/BackSide: ${audit.alreadyDoubleSided}`,
  '',
  ...audit.findings.map((finding) => (
    `FINDING ${finding.name} thickness=${finding.thickness.toFixed(3)}m`
    + ` axis=${finding.axis} area=${finding.area.toFixed(2)}m2`
    + ` at=(${finding.centre[0].toFixed(2)},${finding.centre[1].toFixed(2)},${finding.centre[2].toFixed(2)})`
    + ` mat=${finding.materialName} side=${finding.side === THREE.FrontSide ? 'FrontSide' : String(finding.side)}`
  )),
  '',
];
const report = lines.join('\n');
if (outPath !== undefined) {
  const out = resolve(outPath);
  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, report);
  console.log(`written: ${out}`);
}
console.log(report);
process.exitCode = audit.findings.length === 0 ? 0 : 1;
