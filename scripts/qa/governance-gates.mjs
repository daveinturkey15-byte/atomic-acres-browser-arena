#!/usr/bin/env node
/**
 * governance-gates.mjs — consolidated CI gate for the six orphaned governance
 * and audit layers that were previously enforced only inside their own vitest
 * files. Runs every audit directly against the shipped modules so a silent
 * drift fails a runnable command (`npm run qa:governance`), not just a test
 * file nobody wires into CI.
 *
 * Layers consumed (read-only; this script never mutates them):
 *   1. src/combat/weapon-schema.ts        — schema validation of WEAPON_CATALOG
 *   2. src/combat/weapon-role-distance.ts — near-duplicate shipped-identity rejection
 *   3. src/particles/particle-catalog.ts  — arena coverage, impact projection, opacity ceilings
 *   4. src/sound-event-inventory.ts       — inventory verification + canonical digest pin
 *   5. src/surface-impact-registry.ts     — ballistic material impact coverage
 *   6. scripts/qa/find-unreachable-modules.mjs — dead module detector & test-only allowlist ratchet
 *
 * Output contract: one stable machine-readable summary line per check,
 *   [GOVERNANCE-GATE] check=<id> result=pass|fail key=value...
 * followed by a human-readable failure report. Exit 0 only when all pass.
 *
 * Run with plain node (the tsx loader is registered below for the extensionless
 * TS imports) or under `npx tsx` — both work.
 */
import { createHash } from 'node:crypto';
import { register } from 'tsx/esm/api';
import 'tsx/cjs';
register();

const { WEAPON_CATALOG } = await import('../../src/combat/weapon-catalog.ts');
const {
  WEAPON_SCHEMA_VERSION,
  validateWeaponDefinition,
  validateWeaponDefinitions,
} = await import('../../src/combat/weapon-schema.ts');
const { weaponRoleDistanceMatrix } = await import('../../src/combat/weapon-role-distance.ts');
const {
  auditArenaParticleCoverage,
  auditImpactProjection,
  auditParticleOpacityCeilings,
} = await import('../../src/particles/particle-catalog.ts');
const {
  SOUND_EVENT_INVENTORY,
  SOUND_EVENT_INVENTORY_SHA256,
  canonicalSoundEventInventoryJson,
  verifySoundEventInventory,
} = await import('../../src/sound-event-inventory.ts');
const { auditSurfaceImpactCoverage } = await import('../../src/surface-impact-registry.ts');
const { auditUnreachableModules } = await import('./find-unreachable-modules.mjs');

/** @returns {{ id: string, pass: boolean, fields: Record<string, string|number>, failures: string[] }} */
function checkWeaponSchema() {
  const failures = [];
  const individualIssues = [];
  for (const weapon of WEAPON_CATALOG) {
    const issues = validateWeaponDefinition(weapon);
    if (issues.length > 0) {
      individualIssues.push(...issues.map((issue) => `${weapon.id}: ${issue.code} @ ${issue.path}`));
    }
  }
  if (individualIssues.length > 0) {
    failures.push(`validateWeaponDefinition rejected ${individualIssues.length} field(s):`, ...individualIssues);
  }
  const batchIssues = validateWeaponDefinitions(WEAPON_CATALOG);
  if (batchIssues.length > 0) {
    failures.push(`validateWeaponDefinitions rejected the catalog (${batchIssues.length} issue(s))`);
  }
  if (!Number.isSafeInteger(WEAPON_SCHEMA_VERSION) || WEAPON_SCHEMA_VERSION < 1) {
    failures.push(`WEAPON_SCHEMA_VERSION is not a positive safe integer: ${String(WEAPON_SCHEMA_VERSION)}`);
  }
  return {
    id: 'weapon-schema',
    pass: failures.length === 0,
    fields: {
      schemaVersion: WEAPON_SCHEMA_VERSION,
      weapons: WEAPON_CATALOG.length,
      issues: individualIssues.length + batchIssues.length,
    },
    failures,
  };
}

/** Near-duplicate shipped-identity rejection, thresholds mirrored from weapon-role-distance.test.ts. */
function checkWeaponRoleDistance() {
  const failures = [];
  const matrix = [...weaponRoleDistanceMatrix(WEAPON_CATALOG)];
  const expectedPairs = WEAPON_CATALOG.length * (WEAPON_CATALOG.length - 1) / 2;
  if (matrix.length !== expectedPairs) {
    failures.push(`distance matrix has ${matrix.length} pairs, expected ${expectedPairs}`);
  }
  const closest = [...matrix].sort((left, right) => left.distance - right.distance)[0];
  if (!closest) {
    failures.push('distance matrix is empty');
  } else {
    const pairLabel = `${closest.leftId}/${closest.rightId}`;
    if (!(closest.distance > 0.1)) {
      failures.push(`closest pair ${pairLabel} distance ${closest.distance.toFixed(6)} <= 0.1`);
    }
    if (!(closest.numericDistance > 0.055)) {
      failures.push(`closest pair ${pairLabel} numericDistance ${closest.numericDistance.toFixed(6)} <= 0.055`);
    }
  }
  return {
    id: 'weapon-role-distance',
    pass: failures.length === 0,
    fields: closest
      ? { pairs: matrix.length, closestPair: `${closest.leftId}/${closest.rightId}`, closestDistance: Number(closest.distance.toFixed(6)) }
      : { pairs: matrix.length, closestPair: '<none>', closestDistance: Number.NaN },
    failures,
  };
}

function checkParticleCatalog() {
  const failures = [];
  const arenaCoverage = auditArenaParticleCoverage();
  if (!arenaCoverage.pass || arenaCoverage.missing.length || arenaCoverage.extra.length || arenaCoverage.invalid.length) {
    failures.push(
      `arena particle coverage failed — missing=[${arenaCoverage.missing.join(',')}]`
      + ` extra=[${arenaCoverage.extra.join(',')}] invalid=[${arenaCoverage.invalid.join(',')}]`,
    );
  }
  const projection = auditImpactProjection();
  if (!projection.pass || projection.offenders.length) {
    failures.push(`impact projection produced no usable recipe for: ${projection.offenders.join(', ')}`);
  }
  const opacity = auditParticleOpacityCeilings();
  if (!opacity.pass || opacity.offenders.length) {
    failures.push(`opacity ceilings exceeded by: ${opacity.offenders.join(', ')}`);
  }
  return {
    id: 'particle-catalog',
    pass: failures.length === 0,
    fields: {
      arenasCovered: Number.isSafeInteger(arenaCoverage.missing.length) ? 'all-canonical' : '?',
      arenaMissing: arenaCoverage.missing.length,
      arenaExtra: arenaCoverage.extra.length,
      arenaInvalid: arenaCoverage.invalid.length,
      projectionOffenders: projection.offenders.length,
      opacityOffenders: opacity.offenders.length,
    },
    failures,
  };
}

function checkSoundEventInventory() {
  const failures = [];
  const errors = verifySoundEventInventory(SOUND_EVENT_INVENTORY);
  if (errors.length > 0) {
    failures.push(`verifySoundEventInventory reported ${errors.length} error(s):`, ...errors);
  }
  const computedSha = createHash('sha256').update(canonicalSoundEventInventoryJson()).digest('hex');
  if (computedSha !== SOUND_EVENT_INVENTORY_SHA256) {
    failures.push(
      `canonical inventory digest drifted: computed sha256=${computedSha}`
      + ` but SOUND_EVENT_INVENTORY_SHA256 pins ${SOUND_EVENT_INVENTORY_SHA256}`,
    );
  }
  return {
    id: 'sound-event-inventory',
    pass: failures.length === 0,
    fields: {
      events: SOUND_EVENT_INVENTORY.length,
      verifyErrors: errors.length,
      sha256: computedSha,
    },
    failures,
  };
}

function checkSurfaceImpactRegistry() {
  const failures = [];
  const coverage = auditSurfaceImpactCoverage();
  if (!coverage.pass || coverage.missing.length || coverage.extra.length || coverage.invalid.length) {
    failures.push(
      `surface impact coverage failed — missing=[${coverage.missing.join(',')}]`
      + ` extra=[${coverage.extra.join(',')}] invalid=[${coverage.invalid.join(',')}]`,
    );
  }
  return {
    id: 'surface-impact-registry',
    pass: failures.length === 0,
    fields: {
      missing: coverage.missing.length,
      extra: coverage.extra.length,
      invalid: coverage.invalid.length,
    },
    failures,
  };
}

function checkUnreachableModules() {
  const failures = [];
  const audit = auditUnreachableModules();
  if (audit.dead.length > 0) {
    failures.push(
      `found ${audit.dead.length} unreachable module(s) (not even reachable from tests): `
      + audit.dead.map((row) => row.file).join(', '),
    );
  }
  if (audit.unallowlistedTestOnly.length > 0) {
    failures.push(
      `test-only reachability set grew beyond allowlist (${audit.unallowlistedTestOnly.length} unallowlisted): `
      + audit.unallowlistedTestOnly.map((row) => row.file).join(', '),
    );
  }
  return {
    id: 'unreachable-modules',
    pass: failures.length === 0,
    fields: {
      totalModules: audit.summary.totalModules,
      unreachable: audit.summary.unreachableFromProduction,
      dead: audit.dead.length,
      testOnly: audit.testOnly.length,
      unallowlisted: audit.unallowlistedTestOnly.length,
    },
    failures,
  };
}

const CHECKS = [
  checkWeaponSchema,
  checkWeaponRoleDistance,
  checkParticleCatalog,
  checkSoundEventInventory,
  checkSurfaceImpactRegistry,
  checkUnreachableModules,
];

const results = [];
for (const run of CHECKS) {
  let result;
  try {
    result = run();
  } catch (error) {
    result = {
      id: run.name.replace(/^check/, '').toLowerCase(),
      pass: false,
      fields: {},
      failures: [`audit threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}`],
    };
  }
  results.push(result);
  const fields = Object.entries(result.fields)
    .map(([key, value]) => `${key}=${typeof value === 'number' && !Number.isFinite(value) ? 'NaN' : String(value)}`)
    .join(' ');
  console.log(`[GOVERNANCE-GATE] check=${result.id} result=${result.pass ? 'pass' : 'fail'}${fields ? ` ${fields}` : ''}`);
}

console.log(`[GOVERNANCE-GATE] summary total=${results.length} passed=${results.filter((r) => r.pass).length} failed=${results.filter((r) => !r.pass).length}`);

if (results.some((result) => !result.pass)) {
  console.error('\ngovernance gate FAILED:');
  for (const result of results.filter((candidate) => !candidate.pass)) {
    console.error(`\n  check=${result.id}`);
    for (const failure of result.failures) {
      console.error(`    - ${failure}`);
    }
  }
  process.exitCode = 1;
} else {
  console.log('governance gate PASSED: all six governance layers hold on the current tree.');
}
