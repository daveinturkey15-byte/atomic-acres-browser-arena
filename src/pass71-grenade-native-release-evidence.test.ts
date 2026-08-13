import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contract = readFileSync('scripts/qa/pass71-grenade-native-receipt-contract.mjs', 'utf8');
const contractTests = readFileSync('scripts/qa/pass71-grenade-native-receipt-contract.test.mjs', 'utf8');
const runner = readFileSync('scripts/qa/run-pass71-grenade-native-receipt.mjs', 'utf8');
const verifier = readFileSync('scripts/qa/verify-pass71-grenade-native-evidence.mjs', 'utf8');
const spec = readFileSync('tests/e2e/pass71-grenade-first-action.spec.ts', 'utf8');
const playwrightConfig = readFileSync('playwright.config.ts', 'utf8');
const acceptanceGate = readFileSync('scripts/release/acceptance-gate.mjs', 'utf8');
const verifyWorkflow = readFileSync('.github/workflows/verify.yml', 'utf8');
const releaseWorkflow = readFileSync('.github/workflows/release-production.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

describe('Pass 71 exact-SHA grenade native release evidence', () => {
  it('owns a clean exact-candidate installed-Edge native-WebGPU runner', () => {
    for (const token of [
      "values['expected-source-sha']",
      "git('rev-parse', 'HEAD')",
      "git('status', '--porcelain', '--untracked-files=all')",
      'checkoutSourceSha !== expectedSourceSha || !cleanBefore',
      "endingCheckoutSourceSha = git('rev-parse', 'HEAD')",
      "QA_INSTALLED_EDGE: '1'",
      'PASS71_GRENADE_EDGE_EXECUTABLE: edgeExecutable',
      "PASS71_GRENADE_RENDERER: 'webgpu'",
      "PASS71_GRENADE_EVIDENCE_MODE: 'native-no-freeze'",
      'PASS71_GRENADE_NATIVE_COMPONENT_DIR: componentDirectory',
      "'tests/e2e/pass71-grenade-first-action.spec.ts'",
      "'--workers=1', '--retries=0'",
      'for (const grenade of PASS71_GRENADE_NATIVE_EVIDENCE.grenades)',
      'native trial requires unbound owned-preview port',
      '`--grep=${grenade} cold and warm throws`',
      'readWindowsExecutableIdentity(edgeExecutable)',
      'authenticodeStatus: executableIdentity.signatureStatus',
      "resolve(root, 'scripts/qa/verify-npm10-lockfile.mjs')",
      'assertPass71GrenadeNativeEvidence(record',
      'pass71GrenadeNativeRecordSha256(record)',
      'pass71GrenadeNativeToolingHashesAtSource(root, expectedSourceSha)',
      'native-evidence.json',
    ]) expect(runner).toContain(token);
    expect(runner).not.toContain('software-ci-semantic');
    expect(playwrightConfig).toContain('PASS71_GRENADE_EDGE_EXECUTABLE');
    expect(playwrightConfig).toContain('{ executablePath: pass71GrenadeEdgeExecutable }');
  });

  it('observes served source provenance from staged browser bytes rather than copying the runner environment', () => {
    expect(spec).toContain("fetch(new URL('channel-provenance.json', window.location.href)");
    expect(spec).toContain("cache: 'no-store'");
    expect(spec).toContain('sourceSha: nativeExpectedSourceSha');
    expect(spec).toContain('servedCandidate,');
    expect(spec).toContain('page.context().browser()?.version()');
    expect(runner).toContain('servedSourceSha: served?.sourceSha');
    expect(runner).not.toContain('servedSourceSha: expectedSourceSha');
  });

  it('recomputes every native frontier including raw maximum-rAF and fails closed on faults', () => {
    for (const token of [
      "evidenceId: 'HF-298'",
      "grenades: Object.freeze(['frag', 'flash', 'smoke', 'semtex'])",
      "phases: Object.freeze(['cold', 'warm'])",
      "['maximum-animation-frame-gap', 'maximumAnimationFrameGapMs'",
      "['maximum-frame-work', 'maximumFrameWorkMs'",
      "['maximum-presentation-pending', 'maximumPendingForMs'",
      "['first-submission-delay', 'firstSubmissionDelayMs'",
      "['first-completion-delay', 'firstCompletionDelayMs'",
      "runtime.adapterClass !== 'GPUAdapter'",
      "runtime.deviceClass !== 'GPUDevice'",
      'runtime.softwareAdapter !== false',
      "trial.faults.length !== 0",
      "record.faults.length !== 0",
      "record.receiptSha256 !== pass71GrenadeNativeRecordSha256(record)",
    ]) expect(contract).toContain(token);
    expect(contractTests).toContain('retains and gates native maximum-rAF');
    expect(contractTests).toContain('rejects missing, duplicate, reordered and unknown grenade trials');
    expect(contractTests).toContain('rejects unknown fields at canonical receipt and nested measurement boundaries');
    expect(contract).toContain("previewOwnership !== 'owned-fresh-staged-topology-per-grenade'");
    expect(contract).toContain("record.browser.authenticodeStatus !== 'Valid'");
    expect(contract).toContain('record.browser.executableVersion');
  });

  it('makes the ready-to-paste canonical record mechanically mandatory in both CI acceptance and release', () => {
    expect(acceptanceGate).toContain("manifest.releasePass === 'PASS 71'");
    expect(acceptanceGate).toContain('hf298Records.length !== 1');
    expect(acceptanceGate).toContain('has no registered evidence validator');
    expect(acceptanceGate).toContain('PASS71_GRENADE_NATIVE_EVIDENCE.evidenceId');
    expect(acceptanceGate).toContain('pass71GrenadeNativeToolingHashesAtSource(REPOSITORY_ROOT, preview?.sourceSha)');
    expect(acceptanceGate).toContain('pass71GrenadeNativeEvidenceFailures(record');
    expect(acceptanceGate).toContain("manifestPath === 'acceptance/pass-71.json'");
    expect(acceptanceGate).toContain('candidate B may change only acceptance/pass-71.json');
    expect(acceptanceGate).toContain('native evidence startedAt cannot precede preview.createdAt');
    expect(acceptanceGate).toContain('native evidence completedAt cannot follow humanAcceptance.approvedAt');
    expect(verifyWorkflow).toContain('node scripts/release/acceptance-gate.mjs --phase ci');
    expect(releaseWorkflow).toContain('node scripts/release/acceptance-gate.mjs --phase release');
    expect(verifier).toContain('assertPass71GrenadeNativeEvidence(record');
  });

  it('exposes explicit run, contract and verification commands', () => {
    expect(packageJson.scripts['qa:pass71:grenade-native:contract'])
      .toBe('node --test scripts/qa/pass71-grenade-native-receipt-contract.test.mjs scripts/qa/pass71-edge-executable-identity.test.mjs');
    expect(packageJson.scripts['qa:pass71:grenade-native:verify'])
      .toBe('node scripts/qa/verify-pass71-grenade-native-evidence.mjs');
    expect(packageJson.scripts['qa:pass71:grenade-native'])
      .toContain('run-pass71-grenade-native-receipt.mjs');
  });
});
