import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('HF-297 partial non-closing first-person arms evidence wiring', () => {
  it('binds exact candidate A, installed hardware Chrome, bounded lossless sheets and all-weapon telemetry', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const runner = readFileSync('scripts/qa/run-pass71-hf297-arms-evidence.mjs', 'utf8');
    const contract = readFileSync('scripts/qa/pass71-hf297-arms-evidence-contract.mjs', 'utf8');
    const spec = readFileSync('tests/e2e/pass71-hf297-arms-visual.spec.ts', 'utf8');

    expect(packageJson.scripts['qa:pass71:hf297-arms:contract'])
      .toBe('node --test scripts/qa/pass71-hf297-arms-evidence-contract.test.mjs');
    expect(packageJson.scripts['qa:pass71:hf297-arms'])
      .toBe('npm run qa:pass71:hf297-arms:contract && node scripts/qa/run-pass71-hf297-arms-evidence.mjs');
    for (const token of [
      '--expected-source-sha', "git('status', '--porcelain', '--untracked-files=all')",
      'run-playwright-with-topology.mjs', "VITE_MATCH_BUILD_ID: expectedSourceSha",
      'readWindowsExecutableIdentity(chromeExecutable)', "signatureStatus !== 'Valid'",
      "PASS71_HF297_BROWSER_EXECUTABLE: chromeExecutable", 'pass71Hf297ToolingHashes(root)',
      'assertPass71Hf297Evidence(record', 'pass71Hf297RecordSha256(record)',
      "layout: 'three-by-three-ordered-action-review'", 'sourceFrameDigestSha256',
    ]) expect(runner).toContain(token);
    for (const token of [
      "evidenceId: 'HF-297'", "coverageDisposition: 'partial-non-closing-component-evidence'",
      'closingAuthority: false', 'closesFeedback: false', 'fullCartesianClaim: false',
      'ownerVisualInspectionPerformed: false', 'independentPixelOcclusionJudgmentPerformed: false',
      'matrixCellCount: 36', 'matrixCellCount: 80', "minimumCount: 0", "maximumCount: 1",
    ]) expect(contract).toContain(token);
    for (const token of [
      "'desktop-1440p'", "'ultrawide-1440p'", "'iphone-15-landscape'", "'iphone-15-portrait'",
      "'m4a1-fire'", "'pistol-reload'", "'field-knife-melee'", 'api.fireOnce()', 'api.melee()',
      'for (const weapon of WEAPONS)', 'for (const action of CATALOG_ACTIONS)',
      "api.setStance('prone')", 'surfaceRetreat >= 0.28', 'surfaceLift >= 0.13',
      'chromium.launch({', 'executablePath: browserExecutable', 'softwareAdapter: false',
    ]) expect(spec).toContain(token);
  });

  it('cannot be mistaken for literal HF-297 closure', () => {
    const contract = readFileSync('scripts/qa/pass71-hf297-arms-evidence-contract.mjs', 'utf8');
    expect(contract).toContain("'all 20 weapons and applicable actions are not crossed with standing, crouched, prone and contact states at every supported viewport'");
    expect(contract).toContain("'WebGPU is not captured by this HF-297 component");
    expect(contract).toContain("'hosted multiplayer roles are not crossed");
    expect(contract).toContain("'Dave has not inspected or tested these exact-candidate visual sheets'");
    expect(contract).toContain("if (record.closingAuthority !== false) failures.push('non-closing-authority')");
  });
});
