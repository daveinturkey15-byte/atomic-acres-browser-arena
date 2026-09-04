#!/usr/bin/env tsx
// Mechanical collider/visual parity audit CLI across ALL SIX arenas.
//
// All audit logic lives in ./collider-visual-parity-core.ts so the same code
// also gates the full vitest suite via src/collider-visual-parity-gate.test.ts.
// This wrapper only parses argv, prints findings, maps them to exit codes, and
// (--json) persists the full per-arena result — including the deterministic
// colliderSamples the live CDP leg (verify-collider-parity-live-cdp.mjs)
// probes through the game's own collision authority:
//   0 = within gate
//   1 = unexplained collider(s) found
//   2 = the audit itself failed for an arena (construction threw)
//   3 = --gate-walkthrough and walk-through mesh(es) found
//   4 = an authored mesh has a NaN world box (invisible in the engine)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_ARENA_IDS, runColliderVisualParityAudit } from './collider-visual-parity-core';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const REPORT_ONLY = argv.includes('--report-only');
const GATE_WALKTHROUGH = argv.includes('--gate-walkthrough');
const JSON_OUT = argv.includes('--json')
  ? resolve('artifacts/qa/collider-parity-audit.json')
  : null;
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
    const nanBounded = result.nanBoundedMeshes ?? [];
    console.log(`\n=== ${result.id}: ${invisible.length} invisible collider(s), ${walkThrough.length} walk-through mesh(es)`
      + ` [${result.colliderCount} colliders, ${result.boundaryColliders} boundary,`
      + ` ${result.runtimeReplacedStaticColliders} runtime-replaced statics, ${result.visibleMeshes} visible meshes]`);
    for (const name of nanBounded) console.log(`  NaN-BOUNDED MESH ${JSON.stringify(name)}`);
    for (const finding of invisible) console.log(`  INVISIBLE COLLIDER ${JSON.stringify(finding)}`);
    for (const finding of walkThrough) console.log(`  WALK-THROUGH MESH ${JSON.stringify(finding)}`);
    const exclusions = Object.entries(result.excludedByRuleCounts ?? {});
    if (exclusions.length > 0) {
      console.log(`  rule-excluded substantial meshes: ${exclusions.map(([reason, count]) => `${reason}=${count}`).join(', ')}`);
    }
    // A NaN-bounded authored mesh is invisible in the engine and was, until
    // this gate existed, dropped from the census without a word. It fails the
    // run outright, and it does so BEFORE the invisible-collider check so the
    // exit code names the defect that hides every other one.
    if (!REPORT_ONLY && nanBounded.length > 0) exitCode = 4;
    if (!REPORT_ONLY && invisible.length > 0 && exitCode === 0) exitCode = 1;
    if (!REPORT_ONLY && GATE_WALKTHROUGH && walkThrough.length > 0 && exitCode === 0) exitCode = 3;
  }

  console.log(REPORT_ONLY
    ? '\n[--report-only] findings do not affect exit code.'
    : GATE_WALKTHROUGH
      ? '\nGate: unexplained colliders exit 1; walk-through meshes exit 3.'
      : '\nGate: any unexplained collider fails the run (exit 1). Walk-through meshes are reported for triage (--gate-walkthrough hardens this); src/collider-visual-parity-gate.test.ts hardens both directions in vitest.');

if (JSON_OUT) {
  mkdirSync(resolve('artifacts/qa'), { recursive: true });
  writeFileSync(JSON_OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`[collider-parity] full audit JSON written to ${JSON_OUT}`);
}
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error('[collider-parity] audit crashed:', error);
  process.exitCode = 2;
});
