import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  PASS71_HF297_CANONICAL_LEDGER_CLAIM,
  PASS71_HF297_FULL_FIREARM_ACTIONS,
  PASS71_HF297_FULL_LOCAL_ROLES,
  PASS71_HF297_FULL_POSE_STATES,
  PASS71_HF297_FULL_RENDERERS,
  PASS71_HF297_FULL_VIEWPORTS,
  PASS71_HF297_SOURCE_CATALOG_PATHS,
  assertPass71Hf297FullExactSets,
  pass71Hf297ActionTargets,
  pass71Hf297FullExactSetFailures,
  pass71Hf297FullMatrixCounts,
  pass71Hf297FullMatrixKeys,
  pass71Hf297FullVisualKeys,
  pass71Hf297SourceCatalogFromTexts,
} from './pass71-hf297-full-arms-matrix.mjs';

function currentCatalog() {
  return pass71Hf297SourceCatalogFromTexts(Object.fromEntries(
    Object.entries(PASS71_HF297_SOURCE_CATALOG_PATHS).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
  ));
}

describe('Pass 71 HF-297 exact full-arms matrix', () => {
  it('derives the exact weapon, stance, controller-action, authored-action and scope catalogs', () => {
    const catalog = currentCatalog();
    assert.equal(catalog.feedbackClaim, PASS71_HF297_CANONICAL_LEDGER_CLAIM);
    assert.equal(catalog.weaponIds.length, 20);
    assert.deepEqual(new Set(catalog.weaponDefinitionIds), new Set(catalog.weaponIds));
    assert.deepEqual(catalog.stances, ['stand', 'crouch', 'prone']);
    assert.deepEqual(catalog.controllerActions, ['hip', 'ads', 'fire', 'reload', 'melee']);
    assert.deepEqual(catalog.fullscreenOpticWeapons, ['sniper', 'm14-ebr', 'railgun']);
    assert(catalog.firearmAuthoredActions.includes('empty-reload'));
    assert(catalog.knifeAuthoredActions.includes('melee'));
    assert.equal(Object.keys(catalog.sourceSha256).length, Object.keys(PASS71_HF297_SOURCE_CATALOG_PATHS).length);
  });

  it('freezes every required Cartesian dimension and truthful cardinality', () => {
    const catalog = currentCatalog();
    const targets = pass71Hf297ActionTargets(catalog);
    assert.equal(PASS71_HF297_FULL_VIEWPORTS.length, 5);
    assert(PASS71_HF297_FULL_VIEWPORTS.some((entry) => entry.id === 'desktop-4k'));
    assert.equal(PASS71_HF297_FULL_POSE_STATES.length, 4);
    assert.deepEqual(PASS71_HF297_FULL_RENDERERS, ['webgl2', 'webgpu']);
    assert.deepEqual(PASS71_HF297_FULL_LOCAL_ROLES, ['solo', 'host-local', 'guest-local']);
    assert.deepEqual(PASS71_HF297_FULL_FIREARM_ACTIONS, ['hip', 'ads', 'fire', 'reload']);
    assert.equal(targets.length, 81);
    assert.equal(targets.filter((entry) => entry.presentation === 'firearm').length, 80);
    assert.deepEqual(pass71Hf297FullMatrixCounts(catalog), {
      weapons: 20,
      firearmActionTargets: 80,
      knifeActionTargets: 1,
      actionTargets: 81,
      telemetryCells: 9_720,
      embeddedVisualCells: 516,
      runtimeScopes: 6,
    });
  });

  it('accepts exact matrix sets and rejects missing, duplicate and unknown cells', () => {
    const catalog = currentCatalog();
    const telemetryKeys = pass71Hf297FullMatrixKeys(catalog);
    const visualKeys = pass71Hf297FullVisualKeys(catalog);
    assert.equal(assertPass71Hf297FullExactSets({ telemetryKeys, visualKeys }, catalog), true);
    assert(pass71Hf297FullExactSetFailures(telemetryKeys.slice(1), telemetryKeys, 'telemetry').includes('telemetry:missing'));
    assert(pass71Hf297FullExactSetFailures([...telemetryKeys, telemetryKeys[0]], telemetryKeys, 'telemetry').includes('telemetry:duplicate'));
    assert(pass71Hf297FullExactSetFailures([...visualKeys.slice(1), 'unknown'], visualKeys, 'visual').includes('visual:extra'));
  });

  it('fails source mutations instead of retaining a hand-maintained mirror', () => {
    const texts = Object.fromEntries(
      Object.entries(PASS71_HF297_SOURCE_CATALOG_PATHS).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
    );
    const missingDefinition = {
      ...texts,
      weaponCatalog: texts.weaponCatalog.replace("id: 'flare-gun'", "id: 'flare-gun-removed'"),
    };
    assert.throws(() => pass71Hf297SourceCatalogFromTexts(missingDefinition), /weapon definition catalog exact set mismatch/);
    const unsupportedAction = {
      ...texts,
      debugController: texts.debugController.replace(
        "type Hf296ContactAction = 'hip' | 'ads' | 'fire' | 'reload' | 'melee';",
        "type Hf296ContactAction = 'hip' | 'ads' | 'fire' | 'reload' | 'melee' | 'inspect';",
      ),
    };
    assert.throws(() => pass71Hf297SourceCatalogFromTexts(unsupportedAction), /controller action catalog exact set mismatch/);
    assert.throws(() => pass71Hf297SourceCatalogFromTexts({
      ...texts,
      ownerFeedback: texts.ownerFeedback.replace('First-person arms still disappear', 'First-person arms changed'),
    }), /canonical owner-feedback claim drifted/);
    const missingScope = {
      ...texts,
      adsSightProfiles: texts.adsSightProfiles.replace(
        "railgun: Object.freeze({ id: 'railgun', marker: 'scope'",
        "railgun: Object.freeze({ id: 'railgun', marker: 'cross'",
      ),
    };
    const catalog = pass71Hf297SourceCatalogFromTexts(missingScope);
    assert.deepEqual(catalog.fullscreenOpticWeapons, ['sniper', 'm14-ebr']);
  });
});
