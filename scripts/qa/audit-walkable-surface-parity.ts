#!/usr/bin/env tsx
// HF-411 / PASS 85: walkable-surface parity sweep across every arena.
//
// Direction D - FALL-THROUGH FLOOR. All logic lives in
// ./walkable-surface-parity-core.ts so the same engine also gates vitest via
// src/walkable-surface-parity-gate.test.ts.
//
//   0 = every elevated walkable visual has movement authority under its whole
//       top face
//   1 = at least one fall-through floor found
//   2 = the audit itself failed for an arena (construction threw)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ALL_ARENA_IDS, runWalkableSurfaceParityAudit } from './walkable-surface-parity-core';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const REPORT_ONLY = argv.includes('--report-only');
const JSON_OUT = argv.includes('--json')
  ? resolve(arg('--json', 'artifacts/qa/walkable-surface-parity.json'))
  : null;
const ARENAS = arg('--arenas', ALL_ARENA_IDS.join(','))
  .split(',').map((value) => value.trim()).filter(Boolean);

async function main(): Promise<void> {
  const results = await runWalkableSurfaceParityAudit(ARENAS);

  let exitCode = 0;
  for (const result of results) {
    if (result.error) {
      exitCode = 2;
      console.log(`\n=== ${result.id}: AUDIT ERROR ===\n${result.error}`);
      continue;
    }
    const findings = result.findings ?? [];
    console.log(`\n=== ${result.id}: ${findings.length} fall-through floor(s)`
      + ` [${result.census} walkable visuals censused, ${result.supported} fully supported,`
      + ` ${result.colliderCount} colliders, ${result.visibleMeshes} visible meshes]`);
    for (const finding of findings) {
      console.log(`  FALL-THROUGH ${finding.name} @ ${JSON.stringify(finding.centre)}`
        + ` span ${JSON.stringify(finding.span)} area ${finding.area} m2`
        + ` — ${Math.round(finding.unsupportedShare * 100)}% unsupported`
        + ` (${finding.unsupportedSamples}/${finding.samples} samples),`
        + ` largest contiguous hole ${finding.largestHoleM2} m2 [${finding.trippedBy}],`
        + ` hole ${JSON.stringify(finding.hole)},`
        + ` drop ${finding.dropM} m to ${finding.bestColliderTopUnderHole ?? 'nothing'}`);
    }
    const exclusions = Object.entries(result.excludedByRuleCounts ?? {});
    if (exclusions.length > 0) {
      console.log(`  rule-excluded horizontal meshes: ${exclusions.map(([reason, count]) => `${reason}=${count}`).join(', ')}`);
    }
    if (!REPORT_ONLY && findings.length > 0) exitCode = 1;
  }

  console.log(REPORT_ONLY
    ? '\n[--report-only] findings do not affect exit code.'
    : '\nGate: any elevated walkable visual without movement authority under its top face fails the run (exit 1).');

  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
    console.log(`[walkable-parity] full audit JSON written to ${JSON_OUT}`);
  }
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error('[walkable-parity] audit crashed:', error);
  process.exitCode = 2;
});
