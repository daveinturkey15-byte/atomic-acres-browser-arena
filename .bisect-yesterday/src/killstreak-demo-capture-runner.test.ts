import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pass 66 killstreak demo capture runner', () => {
  it('routes authoring through a clean-SHA owned-preview wrapper', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['author:pass66:killstreak-demo-videos'])
      .toBe('node scripts/qa/run-pass66-killstreak-demo-capture.mjs');

    const runner = readFileSync('scripts/qa/run-pass66-killstreak-demo-capture.mjs', 'utf8');
    for (const marker of [
      "rmSync(artifactRoot, { recursive: true, force: true })",
      "'status', '--porcelain', '--untracked-files=all'",
      "QA_REQUIRE_OWNED_FRESH_PREVIEW: '1'",
      "QA_EXTERNAL_PREVIEW: '0'",
      "['.env', '.env.local', '.env.production.local']",
      "!key.toUpperCase().startsWith('VITE_')",
      "NODE_ENV: 'production'",
      'PASS66_KILLSTREAK_CAPTURE_SOURCE_SHA: sourceSha',
      "'--validate-capture-only'",
    ]) expect(runner).toContain(marker);
  });

  it('binds capture evidence to served candidate topology and the recursive closure', () => {
    const capture = readFileSync('tests/e2e/pass66-gun-range-killstreak-demo-capture.spec.ts', 'utf8');
    expect(capture).toContain('test.skip(');
    expect(capture).toContain('!captureExplicitlyEnabled');
    expect(capture).toContain("process.env.QA_REQUIRE_OWNED_FRESH_PREVIEW === '1'");
    expect(capture).toContain("process.env.QA_EXTERNAL_PREVIEW === '0'");
    expect(capture).toContain("'/channels/the-big-one/channel-provenance.json'");
    expect(capture).toContain('value.sourceSha !== expectedSourceSha');
    expect(capture).toContain('servedRuntimeTreeSha256: servedCandidate.treeSha256');
    expect(capture).toContain('collectKillstreakDemoSourceClosure(repositoryRoot)');
    expect(capture).toContain("'--use-angle=d3d11'");
    expect(capture).toContain("'--disable-software-rasterizer'");
    expect(capture).toContain('health.softwareAdapter !== false');
    expect(capture).toContain('resolveKillstreakDemoCameraPose(id, subjects.map(({ position }) => position))');
    expect(capture).toContain('projectKillstreakDemoWorldPoint(pose, position)');
    expect(capture).toContain('summarizeKillstreakDemoRuntimeCadence');
    expect(capture).toContain('videoNearDuplicateFrameRatio: videoProbe.nearDuplicateFrameRatio');
    expect(capture).toContain('milestones: captureTelemetry.milestones');

    const finalizer = readFileSync('scripts/qa/finalize-pass66-killstreak-demo-media.ts', 'utf8');
    expect(finalizer).toContain('assertExactCaptureGitState(repositoryRoot, receipt.gitHead)');
    expect(finalizer).toContain('assertPublishedMediaGitLineage(repositoryRoot, sourceReceipt.gitHead)');
    expect(finalizer).toContain("'docs/PASS66_FINAL_ADJUSTMENTS_LEDGER_2026-08-01.md'");
    expect(finalizer).toContain("'docs/PASS66_RECENT_REQUEST_AUDIT_2026-08-01.md'");
    expect(finalizer).toContain('JSON.stringify(receipt.sourceInputs) !== JSON.stringify(currentSourceClosure)');
    expect(finalizer).toContain('JSON.stringify(manifest.sourceInputs) !== JSON.stringify(currentSourceClosure)');
    expect(finalizer).toContain('nearDuplicateFrameRatio: capture.video.probe.nearDuplicateFrameRatio');
    expect(finalizer).toContain('sameKillstreakDemoVideoProbe(observedProbe, manifestProbe)');
  });

  it('uses one fail-closed video probe for decoded motion evidence during capture and finalization', () => {
    const capture = readFileSync('tests/e2e/pass66-gun-range-killstreak-demo-capture.spec.ts', 'utf8');
    const finalizer = readFileSync('scripts/qa/finalize-pass66-killstreak-demo-media.ts', 'utf8');
    const probe = readFileSync('scripts/qa/pass66-killstreak-demo-video-probe.ts', 'utf8');

    expect(capture).toContain("from '../../scripts/qa/pass66-killstreak-demo-video-probe'");
    expect(finalizer).toContain("from './pass66-killstreak-demo-video-probe'");
    expect(probe).toContain('analyzeKillstreakDemoDecodedCadence');
    expect(probe).toContain('KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RATIO');
    expect(probe).toContain('KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RUN');
    expect(probe).toContain("'-vsync', '0'");
  });
});
