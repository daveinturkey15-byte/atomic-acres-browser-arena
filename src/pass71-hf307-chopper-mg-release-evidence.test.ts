import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS71_HF307_CHOPPER_MG_DESCRIPTOR,
  PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF307_REQUIRED_ASSERTIONS,
  PASS71_HF307_SCOPES,
  PASS71_HF307_TOOLING_PATHS,
  createPass71Hf307EvidenceFixture,
  pass71Hf307EvidenceFailures,
} from '../scripts/qa/pass71-hf307-chopper-mg-evidence-contract.mjs';
import {
  CHOPPER_GUNNER_SPLASH_POLICY,
  CHOPPER_GUN_PROFILE,
} from './killstreak-support-catalog';

const runtime = readFileSync(new URL('./killstreak-runtime.ts', import.meta.url), 'utf8');
const nativeEvidence = readFileSync(new URL('../tests/e2e/pass71-hf307-chopper-mg.spec.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../scripts/qa/run-pass71-hf307-chopper-mg-evidence.mjs', import.meta.url), 'utf8');
const network = readFileSync(new URL('./network.ts', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');

describe('Pass 71 HF-307 exact Chopper MG splash release evidence', () => {
  it('exports one optional closing entry with a strict Atomic hosted renderer matrix', () => {
    expect(PASS71_HF307_CHOPPER_MG_DESCRIPTOR).toEqual({
      evidenceId: 'HF-307',
      kind: 'pass71-hf307-exact-chopper-mg-splash-coverage',
      minimumCount: 0,
      maximumCount: 1,
    });
    expect(PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY).toMatchObject({
      descriptor: PASS71_HF307_CHOPPER_MG_DESCRIPTOR,
      closesFeedback: true,
      ownerSubjectiveApproval: 'not-claimed',
    });
    expect(PASS71_HF307_SCOPES).toEqual([
      { arena: 'atomic-acres', renderer: 'webgl2' },
      { arena: 'atomic-acres', renderer: 'webgpu' },
    ]);
    expect(PASS71_HF307_TOOLING_PATHS).toEqual(expect.arrayContaining([
      'src/killstreak-runtime.ts',
      'src/chopper-gunner-fire-ray.test.ts',
      'src/pass71-hf307-chopper-mg-release-evidence.test.ts',
      'tests/e2e/pass71-hf307-chopper-mg.spec.ts',
      'scripts/qa/pass71-hf307-chopper-mg-evidence-contract.mjs',
      'scripts/qa/pass71-hf307-chopper-mg-evidence-contract.d.mts',
      'scripts/qa/pass71-hf307-chopper-mg-evidence-contract.test.mjs',
      'scripts/qa/run-pass71-hf307-chopper-mg-evidence.mjs',
    ]));
  });

  it('freezes the exact 3x policy and rejects a hard-covered possessed impact', () => {
    expect(CHOPPER_GUNNER_SPLASH_POLICY).toEqual({
      precedingDirectHitRadiusM: 1,
      linearRadiusMultiplier: 3,
      splashRadiusM: 3,
      radialMinimumDamageMultiplier: 0.25,
    });
    expect(CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM).toBe(
      CHOPPER_GUNNER_SPLASH_POLICY.precedingDirectHitRadiusM
        * CHOPPER_GUNNER_SPLASH_POLICY.linearRadiusMultiplier,
    );
    expect(CHOPPER_GUN_PROFILE.cadenceMs).toBe(280);
    const possessedStart = runtime.indexOf('const ray = chopperGunnerAuthoritativeRay(');
    const possessedEnd = runtime.indexOf('\n      if (hit) {', possessedStart);
    const possessedRay = runtime.slice(possessedStart, possessedEnd);
    expect(possessedRay).toContain('CHOPPER_GUN_PROFILE.maximumRangeM,\n        false,');
    expect(possessedRay).toContain('CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM');
    expect(PASS71_HF307_REQUIRED_ASSERTIONS).toContain(
      'rejects a centred primary and every nearby splash target when hard cover blocks the admitted impact',
    );
  });

  it('requires trusted owner input, rejected guest control, exact candidate identity, and no visual claim', () => {
    expect(nativeEvidence).toContain("host.mouse.down({ button: 'left' })");
    expect(nativeEvidence).toContain("event.type === 'mousedown' && event.button === 0 && event.trusted === true");
    expect(nativeEvidence).toContain('window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl(entityId)');
    expect(nativeEvidence).toContain('expect(guestApiAccepted).toBe(false)');
    expect(nativeEvidence).toContain("capture: 'complete-host-single-cadence-window'");
    expect(nativeEvidence).toContain('expect(completeHostCapture).toHaveLength(2)');
    expect(nativeEvidence).toContain('toBeLessThan(CHOPPER_GUN_PROFILE.cadenceMs)');
    expect(nativeEvidence).toContain('expect(guestTransport).toEqual({');
    expect(nativeEvidence).toContain('resultIds: completeHostCapture.map((sample: any) => sample.resultId)');
    expect(nativeEvidence).toContain("mode: 'hosted'");
    expect(nativeEvidence).toContain("topology: 'owned-private-two-peer'");
    expect(nativeEvidence).toContain('replicaDrift: Math.max(');
    expect(nativeEvidence).not.toContain('.screenshot(');
    expect(runner).toContain("QA_INSTALLED_EDGE: '1'");
    expect(runner).toContain('PASS71_HF307_EDGE_EXECUTABLE: edgeExecutable');
    expect(nativeEvidence).toContain("browserCdp.send('Browser.getBrowserCommandLine')");
    expect(nativeEvidence).toContain('launchedExecutablePath');
    expect(runner).toContain('component.scope.browser.launchedExecutablePath !== exactEdgeExecutable');
    expect(playwrightConfig).toContain('PASS71_HF307_EDGE_EXECUTABLE');
    expect(network).toContain('LOCAL_MULTIPLAYER_QA_HOST_DAMAGE_RESULT_EVENT');
    expect(network).toContain("payload.type === 'killstreak-damage-result'");
    expect(runner).toContain("sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`)");
    expect(runner).toContain('pass71Hf307ToolingHashesAtSource(root, expectedSourceSha)');
    expect(runner).toContain("embeddedLosslessPngCount: 0");
    expect(runner).toContain('visualClaims: false');
  });

  it('keeps the fixture and validator API mutually executable', () => {
    const record = createPass71Hf307EvidenceFixture();
    expect(pass71Hf307EvidenceFailures(record, {
      sourceSha: record.source.expectedSourceSha,
      sourceTreeSha: record.source.sourceTreeSha,
      tooling: record.tooling,
    })).toEqual([]);
  });
});
