import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS71_HF297_FULL_ARMS_EVIDENCE,
  PASS71_HF297_FULL_ARMS_EVIDENCE_DESCRIPTOR,
  PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES,
} from '../scripts/qa/pass71-hf297-full-arms-evidence-contract.mjs';
import {
  PASS71_HF297_CANONICAL_LEDGER_CLAIM,
  PASS71_HF297_FULL_LOCAL_ROLES,
  PASS71_HF297_FULL_POSE_STATES,
  PASS71_HF297_FULL_RENDERERS,
  PASS71_HF297_FULL_VIEWPORTS,
  PASS71_HF297_SOURCE_CATALOG_PATHS,
  pass71Hf297ActionTargets,
  pass71Hf297FullMatrixCounts,
  pass71Hf297SourceCatalogFromTexts,
} from '../scripts/qa/pass71-hf297-full-arms-matrix.mjs';
import { createPass71Hf297EvidenceFixture } from '../scripts/qa/pass71-hf297-arms-evidence-contract.mjs';
import { WEAPON_IDS } from './protocol';

const source = (path: string): string => readFileSync(path, 'utf8');
const catalog = pass71Hf297SourceCatalogFromTexts(Object.fromEntries(
  Object.entries(PASS71_HF297_SOURCE_CATALOG_PATHS).map(([key, path]) => [key, source(path)]),
));

describe('Pass 71 HF-297 literal full-arms release evidence wiring', () => {
  it('derives all 20 weapons, applicable actions and fullscreen exceptions from source catalogs', () => {
    expect(catalog.feedbackClaim).toBe(PASS71_HF297_CANONICAL_LEDGER_CLAIM);
    expect(catalog.weaponIds).toEqual(WEAPON_IDS);
    expect(new Set(catalog.weaponDefinitionIds)).toEqual(new Set(WEAPON_IDS));
    expect(catalog.controllerActions).toEqual(['hip', 'ads', 'fire', 'reload', 'melee']);
    expect(catalog.fullscreenOpticWeapons).toEqual(['sniper', 'm14-ebr', 'railgun']);
    expect(pass71Hf297ActionTargets(catalog)).toHaveLength(81);
    expect(pass71Hf297FullMatrixCounts(catalog)).toEqual({
      weapons: 20,
      firearmActionTargets: 80,
      knifeActionTargets: 1,
      actionTargets: 81,
      telemetryCells: 9_720,
      embeddedVisualCells: 516,
      runtimeScopes: 6,
    });
  });

  it('freezes every literal viewport, stance/contact, renderer and local-role dimension', () => {
    expect(PASS71_HF297_FULL_VIEWPORTS).toEqual([
      { id: 'desktop-1440p', width: 2560, height: 1440, mobile: false },
      { id: 'desktop-4k', width: 3840, height: 2160, mobile: false },
      { id: 'ultrawide-1440p', width: 3440, height: 1440, mobile: false },
      { id: 'iphone-15-landscape', width: 844, height: 390, mobile: true },
      { id: 'iphone-15-portrait', width: 390, height: 844, mobile: true },
    ]);
    expect(PASS71_HF297_FULL_POSE_STATES).toEqual([
      { id: 'stand-open', stance: 'stand', contact: false },
      { id: 'crouch-open', stance: 'crouch', contact: false },
      { id: 'prone-open', stance: 'prone', contact: false },
      { id: 'prone-contact', stance: 'prone', contact: true },
    ]);
    expect(PASS71_HF297_FULL_RENDERERS).toEqual(['webgl2', 'webgpu']);
    expect(PASS71_HF297_FULL_LOCAL_ROLES).toEqual(['solo', 'host-local', 'guest-local']);
  });

  it('ships a separate strict closing registry entry without upgrading the representative component', () => {
    expect(PASS71_HF297_FULL_ARMS_EVIDENCE).toMatchObject({
      evidenceId: 'HF-297',
      kind: 'pass71-hf297-first-person-arms-full-closure',
      closesFeedback: true,
      closingAuthority: true,
      coverageDisposition: 'literal-source-derived-cartesian-closure',
    });
    expect(PASS71_HF297_FULL_ARMS_EVIDENCE_DESCRIPTOR).toEqual({
      evidenceId: 'HF-297',
      kind: 'pass71-hf297-first-person-arms-full-closure',
      minimumCount: 0,
      maximumCount: 1,
    });
    expect(PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY.closesFeedback).toBe(true);
    expect(PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY.closingAuthority).toBe(true);
    expect(createPass71Hf297EvidenceFixture()).toMatchObject({
      kind: 'pass71-hf297-first-person-arms-component',
      closesFeedback: false,
      closingAuthority: false,
    });
  });

  it('runs page-side matrices on the staged candidate and retains Node for exact lossless captures', () => {
    const spec = source('tests/e2e/pass71-hf297-full-arms-matrix.spec.ts');
    for (const token of [
      'return page.evaluate(async',
      'for (const poseState of poseStates',
      'for (const target of targets)',
      'samplesByAction[target.action]',
      "runViewportMatrix(solo, renderer, 'solo'",
      "runViewportMatrix(page, renderer, role",
      'assertPass71Hf297FullExactSets({ telemetryKeys, visualKeys }',
      "api.stageHf296ContactAction(target.action)",
      'api.sampleHf296ContactEvidence()',
      'api.samplePresentationTelemetry()',
      'api.awaitCommittedCameraCompletion()',
      'completedSequence: completed.completedSequence',
      'await page.screenshot({',
      'pass71Hf297FullVisualCrop(viewport)',
    ]) expect(spec).toContain(token);
    expect(spec).not.toContain('chromium.launch(');
  });

  it('owns a clean exact Candidate A, signed Edge, exact staging and embedded attribution bytes', () => {
    const runner = source('scripts/qa/run-pass71-hf297-full-arms-evidence.mjs');
    const contract = source('scripts/qa/pass71-hf297-full-arms-evidence-contract.mjs');
    const config = source('playwright.config.ts');
    for (const token of [
      "if (checkoutSourceSha !== expectedSourceSha || !clean())",
      'assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable))',
      "QA_INSTALLED_EDGE: '1'",
      'PASS71_HF297_FULL_EDGE_EXECUTABLE: edgeExecutable',
      "VITE_MATCH_BUILD_ID: expectedSourceSha",
      'createPass71Hf297FullArmsEmbeddedMatrix(component.cells, sourceCatalog)',
      "encoding: 'lossless-png-embedded-base64'",
      'telemetryCellSha256: pass71Hf297FullArmsTelemetryCellSha256(cell)',
      'encodedRecordBytes > PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES',
      'assertPass71Hf297FullArmsEvidence(record',
    ]) expect(runner).toContain(token);
    for (const token of [
      'pass71Hf297FullExactSetFailures(decodedKeys, expectedKeys',
      'validateFirearmArms(rig.arms)',
      'validateKnifeArms(rig.arms, progress)',
      'elbowFlex >= 0.36',
      'value.ndcMin[1] <= minimumNdcY',
      'validateFireIdentity(sample.fireIdentityBefore',
      "fullscreenOpticException: 'source-derived-ads-only-structural-suppression",
      "policy: 'deterministic-128x72-centre-lower-lossless-attribution-control-crops",
      'attachment.completedSequence >= attachment.submissionSequence',
    ]) expect(contract).toContain(token);
    expect(PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES).toBe(32 * 1024 * 1024);
    expect(config).toContain('const pass71Hf297FullEdgeExecutable = process.env.PASS71_HF297_FULL_EDGE_EXECUTABLE;');
    expect(config).toContain('?? pass71Hf297FullEdgeExecutable');
    expect(source('package.json')).not.toContain('qa:pass71:hf297-full-arms');
  });
});
