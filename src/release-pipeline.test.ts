import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  expectedLastReleaseLabel,
  verifyProductionReleaseTimestamp,
} from '../scripts/release/release-timestamp-contract.mjs';

const workflow = readFileSync('.github/workflows/release-production.yml', 'utf8');
const verifyWorkflow = readFileSync('.github/workflows/verify.yml', 'utf8');
const receiptWriter = readFileSync('scripts/release/write-production-receipt.mjs', 'utf8');
const productionEnv = readFileSync('.env.production', 'utf8');
const diagnosticsPreviewRunner = readFileSync('scripts/qa/run-pass64-diagnostics-browser.mjs', 'utf8');
const liveTopologyVerifier = readFileSync('scripts/qa/verify-release-topology-browser.mjs', 'utf8');
const staticTopologyVerifier = readFileSync('scripts/qa/verify-release-topology.mjs', 'utf8');
const agentContract = readFileSync('AGENTS.md', 'utf8');
const contributionGuide = readFileSync('docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md', 'utf8');
const pass66ExecutionPlan = readFileSync('docs/PASS66_HITL_EXECUTION_PLAN_2026-07-29.md', 'utf8');
const ownerFeedbackSkill = readFileSync('.agents/skills/atomic-acres-owner-feedback-gate/SKILL.md', 'utf8');
const playwrightConfig = readFileSync('playwright.config.ts', 'utf8');
const ownedPlaywrightRunner = readFileSync('scripts/qa/run-playwright-with-topology.mjs', 'utf8');
const adsPhysicalMatrixRunner = readFileSync('scripts/qa/run-pass69-3-ads-physical-clearance.mjs', 'utf8');
const nearPlaneMatrixRunner = readFileSync('scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs', 'utf8');
const frameHitchMatrixRunner = readFileSync('scripts/qa/run-pass69-3-frame-hitch-matrix.mjs', 'utf8');
const supportAircraftMatrixRunner = readFileSync('scripts/qa/run-pass69-3-support-aircraft-live.mjs', 'utf8');
const riggedBotLiveRunner = readFileSync('scripts/qa/run-pass69-3-rigged-bot-live.mjs', 'utf8');
const nightlyPropertyRunner = readFileSync('scripts/qa/run-pass25a-nightly-property.mjs', 'utf8');
const mutationRunner = readFileSync('scripts/qa/run-pass25a-mutation.mjs', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const ownerFeedbackGraph = JSON.parse(readFileSync('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json', 'utf8'));
const topologyBrowserVerifier = readFileSync('scripts/qa/verify-release-topology-browser.mjs', 'utf8');

describe('production release workflow', () => {
  it('configures a repository-local bot identity before publishing gh-pages', () => {
    const identityStep = workflow.indexOf('Configure release commit identity');
    const publishStep = workflow.indexOf('Publish complete exact dist snapshot');

    expect(identityStep).toBeGreaterThan(-1);
    expect(publishStep).toBeGreaterThan(identityStep);
    expect(workflow).toContain('git config user.name "github-actions[bot]"');
    expect(workflow).toContain('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
    expect(workflow).not.toContain('git config --global');
  });

  it('stages timestamped stable Pass 67.1, rebuilt rollback Pass 63 and live Pass 69 The Big One before a complete publish', () => {
    expect(workflow).toContain('npm run stage:release-topology');
    expect(workflow).toContain('npm run verify:release-topology');
    expect(workflow).toContain('SOURCE_SHA: ${{ inputs.source_sha }}');
    expect(workflow).toContain('RELEASE_PASS: ${{ inputs.release_pass }}');
    expect(workflow).toContain('RELEASE_ROLLBACK_DIST: ${{ env.RELEASE_ROLLBACK_DIST }}');
    expect(workflow).toContain('git worktree add artifacts/pass63-rollback-src ac85e9b8b46cc2370aee903d564ecf3c4682b24c');
    expect(workflow).not.toContain('stage:stable-channel');
    expect(workflow).toContain('Stage live approved The Big One, timestamped rebuilt Pass 67.1 stable and rebuilt Pass 63 rollback');
    expect(readFileSync('package.json', 'utf8')).toContain('"deploy:ci": "gh-pages -d dist"');
    expect(readFileSync('package.json', 'utf8')).not.toContain('"deploy:ci": "gh-pages -d dist --add"');
  });

  it('verifies exactly the public Pass 69 and Pass 63 choices while retaining internal stable provenance', () => {
    expect(staticTopologyVerifier).toContain("const expectedChannelKeys = rollbackStaged ? ['experimental', 'stable'] : ['experimental'];");
    expect(staticTopologyVerifier).toContain('publicConfig.stable.pass !== config.rollback.pass');
    expect(liveTopologyVerifier).toContain('await buttons.count() !== 2');
    expect(liveTopologyVerifier).toContain("for (const choice of ['experimental', 'stable'])");
    expect(liveTopologyVerifier).toContain("await verifyChoice('stable', 'channels/pass63-rollback', 'PASS 63', 'pass63');");
    expect(liveTopologyVerifier).not.toContain("await verifyChoice('rollback'");
  });

  it('allows the external Pages deployment queue to drain without weakening exact-SHA verification', () => {
    expect(workflow).toContain('for attempt in $(seq 1 120); do');
    expect(workflow).toContain('if [[ "$build_sha" == "$pages_sha" && "$status" == "built" ]]');
    expect(workflow).toContain('if [[ "$build_sha" == "$pages_sha" && "$status" == "errored" ]]; then exit 1; fi');
    expect(workflow).toContain('sleep 10');
  });

  it('injects one production timestamp before building and records it in the receipt', () => {
    const timestampStep = workflow.indexOf('Capture immutable production build timestamp');
    const buildStep = workflow.indexOf('Build production bytes');
    const verifyStep = workflow.indexOf('Verify exact production bytes');
    expect(timestampStep).toBeGreaterThan(-1);
    expect(buildStep).toBeGreaterThan(timestampStep);
    expect(verifyStep).toBeGreaterThan(buildStep);
    expect(workflow).toContain('VITE_RELEASED_AT=$released_at');
    expect(workflow).toContain('Rebuild Pass 67.1 stable with its original Pages publication timestamp');
    expect(workflow).toContain('VITE_RELEASED_AT="$stable_released_at"');
    expect(workflow).toContain('REQUIRE_STABLE_RELEASE_TIMESTAMP: \'1\'');
    expect(topologyBrowserVerifier).toContain('Boolean(expectedReleasedAt)');
    expect(workflow.match(/test -n "\$\{RELEASE_BUILT_AT:-\}"/g)).toHaveLength(2);
    expect(topologyBrowserVerifier).toContain('process.env.RELEASE_BUILT_AT?.trim()');
    expect(topologyBrowserVerifier).toContain('verifyProductionReleaseTimestamp');
    expect(workflow).toContain('node scripts/release/write-production-receipt.mjs');
    expect(receiptWriter).toContain('releaseBuiltAt: process.env.RELEASE_BUILT_AT');
  });

  it('requires the published build to expose its exact UK-local day, date, and time instead of the pending sentinel', () => {
    const releasedAt = '2026-08-03T16:52:00Z';
    const label = 'LAST RELEASE · 3 AUG 2026 · 17:52 BST';
    expect(expectedLastReleaseLabel(releasedAt)).toBe(label);
    expect(verifyProductionReleaseTimestamp({
      expectedReleasedAt: releasedAt,
      observedReleasedAt: releasedAt,
      observedLabel: label,
      observedState: 'CURRENT LIVE',
    })).toEqual({ releasedAt, label, state: 'CURRENT LIVE' });
    expect(() => verifyProductionReleaseTimestamp({
      expectedReleasedAt: releasedAt,
      observedReleasedAt: 'PENDING_PRODUCTION',
      observedLabel: 'LAST RELEASE · PENDING_PRODUCTION',
      observedState: 'CURRENT BUILD',
    })).toThrow('Production candidate still exposes PENDING_PRODUCTION');
    expect(() => verifyProductionReleaseTimestamp({
      expectedReleasedAt: releasedAt,
      observedReleasedAt: '2026-08-03T16:53:00Z',
      observedLabel: label,
      observedState: 'CURRENT LIVE',
    })).toThrow('Production release timestamp mismatch');
  });

  it('binds production and immutable preview diagnostics to the exact source SHA', () => {
    const workerOrigin = 'https://atomic-acres-leaderboard.atomic-acres.workers.dev';
    expect(productionEnv).toContain(`VITE_MATCH_DIAGNOSTICS_URL=${workerOrigin}`);
    expect(workflow).toContain('VITE_MATCH_BUILD_ID: ${{ inputs.source_sha }}');
    expect(workflow).toContain(`VITE_MATCH_DIAGNOSTICS_URL: ${workerOrigin}`);
    expect(verifyWorkflow).toContain('VITE_MATCH_BUILD_ID: ${{ github.event.pull_request.head.sha || github.sha }}');
    expect(verifyWorkflow).toContain(`VITE_MATCH_DIAGNOSTICS_URL: ${workerOrigin}`);
    expect(diagnosticsPreviewRunner).toContain("execFileSync('git', ['rev-parse', 'HEAD']");
    expect(diagnosticsPreviewRunner).toContain('VITE_MATCH_BUILD_ID: sourceSha');
    expect(diagnosticsPreviewRunner).not.toContain("VITE_MATCH_BUILD_ID: 'pass64-browser-candidate'");
  });

  it('checks out the real PR head SHA rather than GitHub synthetic merge bytes', () => {
    const exactCheckout = 'ref: ${{ github.event.pull_request.head.sha || github.sha }}';
    expect(verifyWorkflow.match(new RegExp(exactCheckout.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(6);
    expect(verifyWorkflow).toContain('HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}');
    const staticJob = verifyWorkflow.slice(
      verifyWorkflow.indexOf('static-and-unit:'),
      verifyWorkflow.indexOf('requirements-acceptance:'),
    );
    expect(staticJob).toContain(exactCheckout);
    expect(staticJob).toContain('fetch-depth: 0');
  });

  it('blocks production on accepted requirements and verifies the canonical site after Pages builds', () => {
    const candidateBuildStep = workflow.indexOf('Build exact frozen-evidence candidate bytes');
    const acceptanceStep = workflow.indexOf('Validate accepted requirement manifest');
    const publishStep = workflow.indexOf('Publish complete exact dist snapshot');
    const pagesStep = workflow.indexOf('Wait for exact Pages build');
    const liveStep = workflow.indexOf('Verify canonical live release');
    const receiptStep = workflow.indexOf('Write acceptance-bound production receipt and timings');
    expect(candidateBuildStep).toBeGreaterThan(-1);
    // Pass 68+ uses the dynamic acceptance-gate; stale Pass 65/66 evidence
    // catalog and preview-provenance steps were removed from production.
    expect(acceptanceStep).toBeGreaterThan(candidateBuildStep);
    expect(acceptanceStep).toBeGreaterThan(-1);
    expect(acceptanceStep).toBeLessThan(publishStep);
    expect(liveStep).toBeGreaterThan(pagesStep);
    expect(receiptStep).toBeGreaterThan(liveStep);
    expect(workflow).toContain('QA_OUTPUT: artifacts/pipeline/live-release-smoke.json');
    expect(workflow).toContain('checks: read');
  });

  it('publishes immutable PR previews while requirement acceptance and timing remain explicit jobs', () => {
    expect(verifyWorkflow).toContain('requirements-acceptance:');
    expect(verifyWorkflow).toContain('pr-preview-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}');
    expect(verifyWorkflow).toContain('pipeline-metrics:');
    expect(verifyWorkflow).toContain('scripts/release/workflow-metrics.mjs');
  });

  it('owns and closes the local preview lifecycle for every catalogued Playwright gate', () => {
    expect(packageJson.scripts['qa:playwright-topology']).toBe('node scripts/qa/run-playwright-with-topology.mjs');
    expect(playwrightConfig).toContain("const externalPreview = process.env.QA_EXTERNAL_PREVIEW === '1'");
    expect(playwrightConfig).toContain("userAgent: installedEdgeChannel ? undefined : devices['Desktop Chrome'].userAgent");
    expect(playwrightConfig).toContain('webServer: externalPreview ? undefined :');
    expect(ownedPlaywrightRunner).toContain('outDir: temporaryDist');
    expect(ownedPlaywrightRunner).toContain("['scripts/release/stage-release-topology.mjs']");
    expect(ownedPlaywrightRunner).toContain('RELEASE_DIST_ROOT: temporaryDist');
    expect(ownedPlaywrightRunner).toContain("QA_EXTERNAL_PREVIEW: '1'");
    expect(ownedPlaywrightRunner).toContain('httpServer.closeAllConnections?.()');
    expect(ownedPlaywrightRunner).toContain('removeTemporaryTopology();');
    const playwrightTests = ownerFeedbackGraph.testCatalog
      .filter(({ command }: { command: string }) => (
        command.includes('playwright')
        || command === 'npm run qa:pass69-3:ads-physical'
        || command === 'npm run qa:pass69-3:near-plane'
        || command === 'npm run qa:pass69-3:frame-hitch'
        || command === 'npm run qa:pass69-3:support-aircraft'
        || command === 'npm run qa:pass69-3:rigged-bot-live'
      ));
    expect(playwrightTests.map(({ id }: { id: string }) => id)).toEqual([
      'T-MENU-LIFECYCLE-E2E',
      'T-CARE-LATCH-E2E',
      'T-HUD-E2E',
      'T-SUPPORT-VISUAL-E2E',
      'T-FOCUS-RECOVERY-E2E',
      'T-PROFILE-AUTHORITY-E2E',
      'T-PRIVACY-E2E',
      'T-FLASH-E2E',
      'T-SCOPED-ADS',
      'T-GUN-RANGE-TEST-BAY',
      'T-TIMED-MAP-WEAPONS',
      'T-FIELD-KIT-MENU',
      'T-RUSTRIG-PHYSICS',
      'T-PICKUP-REPICK',
      'T-MOBILE-TOUCH-69-1',
      'T-PASS69-3-ADS-PHYSICAL',
      'T-PASS69-3-NEAR-PLANE',
      'T-PASS69-3-GLASS-M14-HITCH',
      'T-PASS69-3-FLAME-FLARE-HITCH',
      'T-PASS69-3-SUPPORT-AIRCRAFT-LIVE',
      'T-PASS69-3-RIGGED-DUMMY',
    ]);
    const playwrightCommands = playwrightTests.map(({ command }: { command: string }) => command);
    expect(playwrightCommands.every((command: string) => (
      command.startsWith('npm run qa:playwright-topology -- ')
      || command === 'npm run qa:pass69-3:ads-physical'
      || command === 'npm run qa:pass69-3:near-plane'
      || command === 'npm run qa:pass69-3:frame-hitch'
      || command === 'npm run qa:pass69-3:support-aircraft'
      || command === 'npm run qa:pass69-3:rigged-bot-live'
    ))).toBe(true);
    expect(adsPhysicalMatrixRunner).toContain('scripts/qa/run-playwright-with-topology.mjs');
    expect(nearPlaneMatrixRunner).toContain('scripts/qa/run-playwright-with-topology.mjs');
    expect(frameHitchMatrixRunner).toContain('scripts/qa/run-playwright-with-topology.mjs');
    expect(supportAircraftMatrixRunner).toContain('scripts/qa/run-playwright-with-topology.mjs');
    expect(riggedBotLiveRunner).toContain('scripts/qa/run-playwright-with-topology.mjs');
    expect(riggedBotLiveRunner).toContain("from './rigged-rgb-raster-proof.mjs'");
    expect(ownerFeedbackGraph.testCatalog.find(({ id }: { id: string }) => id === 'T-PASS69-3-RIGGED-DUMMY')?.paths)
      .toEqual(expect.arrayContaining([
        'package-lock.json',
        'scripts/qa/rigged-rgb-raster-proof.mjs',
      ]));
    const catalogScripts = new Set<string>();
    const queue = ownerFeedbackGraph.testCatalog
      .map(({ command }: { command: string }) => /^npm run ([^\s]+)/u.exec(command)?.[1])
      .filter((script: string | undefined): script is string => Boolean(script));
    while (queue.length > 0) {
      const script = queue.shift()!;
      if (catalogScripts.has(script)) continue;
      catalogScripts.add(script);
      const command = packageJson.scripts[script] ?? '';
      for (const match of command.matchAll(/npm run ([A-Za-z0-9:._-]+)/gu)) queue.push(match[1]);
    }
    expect([...catalogScripts]
      .filter((script) => /(?:^|&&\s*)playwright test/u.test(packageJson.scripts[script] ?? '')))
      .toEqual([]);
  });

  it('runs the exact 100000-sequence nightly property gate without POSIX-only environment syntax', () => {
    const command = packageJson.scripts['test:property:nightly'];
    expect(command).toBe('node scripts/qa/run-pass25a-nightly-property.mjs');
    expect(command).not.toMatch(/(?:^|\s)[A-Z_][A-Z0-9_]*=[^\s]+\s/u);
    expect(nightlyPropertyRunner).toContain('const NIGHTLY_PROPERTY_RUNS = 100_000;');
    expect(nightlyPropertyRunner).toContain('PASS25_PROPERTY_RUNS: String(NIGHTLY_PROPERTY_RUNS)');
    expect(nightlyPropertyRunner).toContain("[vitestCli, 'run', 'src/gameplay-state-property.test.ts']");
    expect(nightlyPropertyRunner).toContain('spawnSync(process.execPath');
  });

  it('runs the exact 50-sequence mutation gate without POSIX-only environment syntax', () => {
    const command = packageJson.scripts['test:mutation'];
    expect(command).toBe('node scripts/qa/run-pass25a-mutation.mjs');
    expect(command).not.toMatch(/(?:^|\s)[A-Z_][A-Z0-9_]*=[^\s]+\s/u);
    expect(mutationRunner).toContain('const MUTATION_PROPERTY_RUNS = 50;');
    expect(mutationRunner).toContain('PASS25_PROPERTY_RUNS: String(MUTATION_PROPERTY_RUNS)');
    expect(mutationRunner).toContain("[strykerCli, 'run', ...process.argv.slice(2)]");
    expect(mutationRunner).toContain("../../node_modules/@stryker-mutator/core/bin/stryker.js");
    expect(mutationRunner).toContain('spawnSync(process.execPath');
  });

  it('makes exact Pass 69 evidence and real preview provenance mandatory in the required acceptance job', () => {
    const acceptanceJob = verifyWorkflow.indexOf('requirements-acceptance:');
    const metricsJob = verifyWorkflow.indexOf('pipeline-metrics:');
    const section = verifyWorkflow.slice(acceptanceJob, metricsJob);
    const installStep = section.indexOf('npm ci --ignore-scripts');
    const buildStep = section.indexOf('Build exact frozen-evidence candidate bytes');
    const candidateStep = section.indexOf('Verify exact Pass 69 evidence catalog and frozen runtime');
    const provenanceStep = section.indexOf('Verify immutable Pass 69 preview provenance and bytes');
    const acceptanceStep = section.indexOf('Verify complete requirement-to-evidence coverage and exact preview approval');

    expect(section).toContain('needs: [classify-change, static-and-unit]');
    expect(installStep).toBeGreaterThan(-1);
    expect(buildStep).toBeGreaterThan(installStep);
    expect(candidateStep).toBeGreaterThan(buildStep);
    expect(provenanceStep).toBeGreaterThan(candidateStep);
    expect(acceptanceStep).toBeGreaterThan(provenanceStep);
    expect(section).toContain('scripts/release/acceptance-gate.mjs --phase ci');
    expect(section).toContain('scripts/release/verify-pr-preview-provenance.mjs');
    expect(section).toContain('GITHUB_TOKEN: ${{ github.token }}');
    expect(section).toContain('artifacts/pipeline/pr-preview-provenance.json');
  });

  it('records the schema 3 two-channel topology in the production receipt', () => {
    expect(workflow).toContain('node scripts/release/write-production-receipt.mjs');
    expect(receiptWriter).toContain('schemaVersion: 3');
    expect(receiptWriter).toContain('topology,');
    expect(receiptWriter).toContain("readJson('artifacts/pipeline/release-topology.json')");
  });

  it('does not use a blocking GitHub Actions watcher inside the workflow', () => {
    expect(workflow).not.toContain('gh run watch');
  });

  it('binds the live browser proof to public Pass 69 and Pass 63 choices, internal stable provenance, aliases, and Last Release', () => {
    expect(liveTopologyVerifier).toContain("verifyChoice('experimental', 'channels/the-big-one', channelConfig.experimental.pass, 'pass69')");
    expect(liveTopologyVerifier).toContain("verifyChoice('stable', 'channels/pass63-rollback', 'PASS 63', 'pass63')");
    expect(liveTopologyVerifier).not.toContain("verifyChoice('rollback'");
    expect(liveTopologyVerifier).toContain('pinned-channel-provenance.json');
    expect(liveTopologyVerifier).toContain('Stable embedded runtime digest');
    expect(liveTopologyVerifier).toContain("verifyLegacyRoute('latest'");
    expect(liveTopologyVerifier).toContain("verifyLegacyRoute('normal'");
    expect(liveTopologyVerifier).toContain("verifyLegacyRoute('room'");
    expect(liveTopologyVerifier).toContain('Last Release timestamp is not a published instant');
    expect(liveTopologyVerifier).not.toContain("'channels/the-big-one', 'PASS 65'");
  });

  it('records the narrow standing Pass 66 authorization without fabricating preview HITL', () => {
    for (const source of [agentContract, contributionGuide, pass66ExecutionPlan, ownerFeedbackSkill]) {
      expect(source).toContain('standing conditional');
      expect(source).toMatch(/does not claim|not evidence|must explicitly avoid claiming|Dave did not/u);
    }
    expect(agentContract).toContain('Pass 65 must never be promoted');
    expect(contributionGuide).toContain('Pass 65 is superseded audit evidence and must never be promoted');
    expect(pass66ExecutionPlan).not.toContain('Stop. Do not publish Version 66.');
  });

  it('permits only one fenced retained-asset menu compile after first-frame media readiness', () => {
    expect(agentContract).toContain("Only after the selected video's first frame is visible");
    expect(agentContract).toContain('one fenced, isolated submission');
    expect(agentContract).toContain('construct zero gameplay arenas');
    expect(agentContract).toContain('run zero live preview rendering or physics');
  });
});
