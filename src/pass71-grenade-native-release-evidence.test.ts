import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contract = readFileSync('scripts/qa/pass71-grenade-native-receipt-contract.mjs', 'utf8');
const contractTests = readFileSync('scripts/qa/pass71-grenade-native-receipt-contract.test.mjs', 'utf8');
const runner = readFileSync('scripts/qa/run-pass71-grenade-native-receipt.mjs', 'utf8');
const verifier = readFileSync('scripts/qa/verify-pass71-grenade-native-evidence.mjs', 'utf8');
const coverageContract = readFileSync('scripts/qa/pass71-hf298-coverage-contract.mjs', 'utf8');
const coverageTests = readFileSync('scripts/qa/pass71-hf298-coverage-contract.test.mjs', 'utf8');
const coverageRunner = readFileSync('scripts/qa/run-pass71-hf298-coverage.mjs', 'utf8');
const coverageVerifier = readFileSync('scripts/qa/verify-pass71-hf298-coverage.mjs', 'utf8');
const spec = readFileSync('tests/e2e/pass71-grenade-first-action.spec.ts', 'utf8');
const playwrightConfig = readFileSync('playwright.config.ts', 'utf8');
const acceptanceGate = readFileSync('scripts/release/acceptance-gate.mjs', 'utf8');
const verifyWorkflow = readFileSync('.github/workflows/verify.yml', 'utf8');
const releaseWorkflow = readFileSync('.github/workflows/release-production.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

describe('Pass 71 exact-SHA grenade native release evidence', () => {
  it('owns a clean exact-candidate installed-Edge component runner for every representative scope', () => {
    for (const token of [
      "values['expected-source-sha']",
      "git('rev-parse', 'HEAD')",
      "git('status', '--porcelain', '--untracked-files=all')",
      'checkoutSourceSha !== expectedSourceSha || !cleanBefore',
      "endingCheckoutSourceSha = git('rev-parse', 'HEAD')",
      "QA_INSTALLED_EDGE: '1'",
      'PASS71_GRENADE_EDGE_EXECUTABLE: edgeExecutable',
      'PASS71_GRENADE_RENDERER: scope.renderer',
      'PASS71_GRENADE_NATIVE_MODE: scope.mode',
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
    expect(spec).toContain('actionPage.context().browser()?.version()');
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
    expect(acceptanceGate).toContain('PASS71_NATIVE_EVIDENCE_REGISTRY');
    expect(acceptanceGate).toContain('has no registered evidence validator');
    expect(acceptanceGate).toContain('PASS71_GRENADE_NATIVE_EVIDENCE_DESCRIPTOR');
    expect(acceptanceGate).toContain("PASS71_HF298_REQUIREMENT_ID = 'R3'");
    expect(acceptanceGate).toContain('feedbackId must be HF-298');
    expect(acceptanceGate).toContain('requires all four solo/hosted x WebGL2/WebGPU components');
    expect(acceptanceGate).toContain('pass71GrenadeNativeToolingHashesAtSource(REPOSITORY_ROOT, preview?.sourceSha)');
    expect(acceptanceGate).toContain('pass71GrenadeNativeEvidenceFailures(record');
    expect(acceptanceGate).toContain('pass71Hf298CoverageFailures(record');
    expect(acceptanceGate).toContain("manifestPath === 'acceptance/pass-71.json'");
    expect(acceptanceGate).toContain('candidate B may change only acceptance/pass-71.json');
    expect(acceptanceGate).toContain('.startedAt cannot precede preview.createdAt');
    expect(acceptanceGate).toContain('.completedAt cannot follow humanAcceptance.approvedAt');
    expect(acceptanceGate).toContain('.finalizedAt cannot follow humanAcceptance.approvedAt');
    expect(verifyWorkflow).toContain('node scripts/release/acceptance-gate.mjs --phase ci');
    expect(releaseWorkflow).toContain('node scripts/release/acceptance-gate.mjs --phase release');
    expect(verifier).toContain('assertPass71GrenadeNativeEvidence(record');
  });

  it('finalizes exactly four component receipts into one digest-bound HF-298 coverage record', () => {
    for (const scope of [
      "Object.freeze({ mode: 'solo', renderer: 'webgl2' })",
      "Object.freeze({ mode: 'solo', renderer: 'webgpu' })",
      "Object.freeze({ mode: 'hosted', renderer: 'webgl2' })",
      "Object.freeze({ mode: 'hosted', renderer: 'webgpu' })",
    ]) expect(contract).toContain(scope);
    expect(spec).toContain('startOwnedPeerServer(peerPort)');
    expect(spec).toContain('privateMatch?.members.length === 2');
    expect(spec).toContain("presentation: { status: 'synchronous' }");
    expect(contract).toContain("renderer === 'webgl2' && (");
    expect(contract).toContain('baseline.targetSubmissionSequence !== 0');
    expect(coverageContract).toContain("kind: 'pass71-hf298-full-scope-coverage'");
    expect(coverageContract).toContain('exact-four-component-set');
    expect(coverageContract).toContain('pass71GrenadeNativeRecordSha256(component)');
    expect(coverageRunner).toContain('for (const scope of PASS71_GRENADE_NATIVE_EVIDENCE.scopes) runComponent(scope)');
    expect(coverageRunner).toContain('const manifestEvidence = [...components, coverage]');
    expect(coverageRunner).toContain('Paste the complete five-record nativeEvidence array');
    expect(coverageVerifier).toContain('records.length !== 5 || components.length !== 4 || coverages.length !== 1');
    expect(coverageTests).toContain('rejects a WebGL2 component that invents asynchronous GPU submission sequences');
  });

  it('exposes explicit run, contract and verification commands', () => {
    expect(packageJson.scripts['qa:pass71:grenade-native:contract'])
      .toContain('scripts/qa/pass71-hf298-coverage-contract.test.mjs');
    expect(packageJson.scripts['qa:pass71:grenade-native:verify'])
      .toBe('node scripts/qa/verify-pass71-hf298-coverage.mjs');
    expect(packageJson.scripts['qa:pass71:grenade-native:component'])
      .toBe('node scripts/qa/run-pass71-grenade-native-receipt.mjs');
    expect(packageJson.scripts['qa:pass71:grenade-native'])
      .toContain('run-pass71-hf298-coverage.mjs');
  });
});
