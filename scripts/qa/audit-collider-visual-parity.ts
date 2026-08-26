#!/usr/bin/env tsx
// Mechanical collider/visual parity audit CLI across ALL SIX arenas.
//
// All audit logic lives in ./collider-visual-parity-core.ts so the same code
// also gates the full vitest suite via src/collider-visual-parity-gate.test.ts.
// This wrapper only parses argv, prints findings, and maps them to exit codes:
//   0 = within gate
//   1 = unexplained collider(s) found
//   2 = the audit itself failed for an arena (construction threw)
//   3 = --gate-walkthrough and walk-through mesh(es) found
import { ALL_ARENA_IDS, runColliderVisualParityAudit } from './collider-visual-parity-core';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const REPORT_ONLY = argv.includes('--report-only');
const GATE_WALKTHROUGH = argv.includes('--gate-walkthrough');
const ARENAS = arg('--arenas', ALL_ARENA_IDS.join(','))
  .split(',').map((value) => value.trim()).filter(Boolean);

async function main(): Promise<void> {
  const results = await runColliderVisualParityAudit(ARENAS);

  let exitCode = 0;
  for (const result of results) {
    if (result.error) {
      exitCode = 2;
      console.log(`\n=== ${result.id}: AUDIT ERROR ===\n${result.error}`);
      continue;
    }
    const invisible = result.invisibleColliders ?? [];
    const walkThrough = result.walkThroughMeshes ?? [];
    console.log(`\n=== ${result.id}: ${invisible.length} invisible collider(s), ${walkThrough.length} walk-through mesh(es)`
      + ` [${result.colliderCount} colliders, ${result.boundaryColliders} boundary,`
      + ` ${result.runtimeReplacedStaticColliders} runtime-replaced statics, ${result.visibleMeshes} visible meshes]`);
    for (const finding of invisible) console.log(`  INVISIBLE COLLIDER ${JSON.stringify(finding)}`);
    for (const finding of walkThrough) console.log(`  WALK-THROUGH MESH ${JSON.stringify(finding)}`);
    const exclusions = Object.entries(result.excludedByRuleCounts ?? {});
    if (exclusions.length > 0) {
      console.log(`  rule-excluded substantial meshes: ${exclusions.map(([reason, count]) => `${reason}=${count}`).join(', ')}`);
    }
    if (!REPORT_ONLY && invisible.length > 0) exitCode = 1;
    if (!REPORT_ONLY && GATE_WALKTHROUGH && walkThrough.length > 0 && exitCode === 0) exitCode = 3;
  }

  console.log(REPORT_ONLY
    ? '\n[--report-only] findings do not affect exit code.'
    : GATE_WALKTHROUGH
      ? '\nGate: unexplained colliders exit 1; walk-through meshes exit 3.'
      : '\nGate: any unexplained collider fails the run (exit 1). Walk-through meshes are reported for triage (--gate-walkthrough hardens this); src/collider-visual-parity-gate.test.ts hardens both directions in vitest.');
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error('[collider-parity] audit crashed:', error);
  process.exitCode = 2;
});
