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
const releaseChannels = JSON.parse(readFileSync('release-channels.json', 'utf8'));
const verificationReceiptWriter = readFileSync('scripts/release/write-verification-receipt.mjs', 'utf8');

describe('production release workflow', () => {
  // LANE AD (PASS 87). This workflow no longer publishes, so the assertions that pinned its
  // publish sequence are replaced by assertions that it CANNOT publish - a strictly stronger
  // safety property than "the identity step precedes the publish step".
  //
  // Why: Lane F (PASS 84) found that the workflow still staged and pushed the pre-PASS-80
  // topology. Its publish step replaced the whole gh-pages branch from `dist`, so one
  // dispatch would have deleted the pinned PASS 85 safe backup (HF-400) and resurrected six
  // retired trees over the live site. Every pass since 74 shipped through
  // scripts/orchestration/publish_pass<N>.py, which enumerates the live trees at run time and
  // asserts its exact post-state before committing.
  it('has no write path to any branch and cannot publish', () => {
    for (const forbidden of ['deploy:ci', 'gh-pages -d', 'git remote set-url', 'x-access-token',
      'pages/builds/latest', 'contents: write', 'Publish complete exact dist snapshot',
      'Configure release commit identity', 'git config user.name']) {
      expect(workflow, `release-production.yml must not contain ${forbidden}`).not.toContain(forbidden);
    }
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('git config ');
    expect(workflow).toContain('scripts/orchestration/publish_pass<N>.py');
    // ...and the publish route it names is the one that actually implements the policy.
    expect(workflow).toContain('node scripts/release/verify-two-channel-policy.mjs');
    expect(workflow).toContain('node --test scripts/release/release-policy-contract.test.mjs');
    expect(workflow).toContain('node --test scripts/orchestration/publish-sibling-drift.test.mjs');
    expect(packageJson.scripts['verify:publish-sibling-drift'])
      .toBe('node --test scripts/orchestration/publish-sibling-drift.test.mjs');
    expect(packageJson.scripts['verify:two-channel-policy']).toBe('node scripts/release/verify-two-channel-policy.mjs');
    expect(packageJson.scripts['verify:release-policy:contract'])
      .toBe('node --test scripts/release/release-policy-contract.test.mjs');
    // The one deploy script left in package.json must still never append to gh-pages, so a
    // hand run of it cannot silently grow the branch back past the two-channel policy.
    expect(readFileSync('package.json', 'utf8')).not.toContain('"deploy:ci": "gh-pages -d dist --add"');
  });

  it('stages and verifies the whole channel topology locally, deriving every path from the config', () => {
    expect(workflow).toContain('npm run stage:release-topology');
    expect(workflow).toContain('npm run verify:release-topology');
    expect(workflow).toContain('SOURCE_SHA: ${{ inputs.source_sha }}');
    expect(workflow).toContain('RELEASE_PASS: ${{ inputs.release_pass }}');
    expect(workflow).toContain('RELEASE_ROLLBACK_DIST: ${{ env.RELEASE_ROLLBACK_DIST }}');
    expect(workflow).toContain('git worktree add artifacts/pass63-rollback-src "$rollback_source_sha"');
    expect(workflow).not.toContain('stage:stable-channel');
    expect(workflow).toContain('Stage the full local channel topology and verify it end to end');
    expect(workflow).toContain('for channel_key in previous retained historical; do');
    expect(workflow).toContain('git cat-file -e "${pinned_pages_sha}^{commit}"');
    // No step name may pin a pass number: the old one said "Stage live Pass 73" while the
    // config staged PASS 86, which is the same staleness class as the channel-path literals.
    const stagingStepLine = workflow.split('\n').find((line) => line.includes('Stage the full local channel topology'));
    expect(stagingStepLine).not.toMatch(/Pass 7\d|Pass 8\d/u);
  });

  it('requires the core channels, allows published extras, and counts cards from the config', () => {
    // The core four (five with a staged rollback) are still REQUIRED to be present. What
    // changed is that the check is a superset, not an equality: the owner keeps every
    // published pass selectable, so the channel set grows, and an equality check meant a
    // correctly published PASS 80 made the config illegal.
    expect(staticTopologyVerifier).toContain("['experimental', 'previous', 'retained', 'historical', 'stable']");
    expect(staticTopologyVerifier).toContain("['experimental', 'previous', 'retained', 'historical']");
    expect(staticTopologyVerifier).toContain('const missingChannelKeys = requiredChannelKeys.filter((key) => !publicConfig[key]);');
    expect(staticTopologyVerifier).not.toContain('Root chooser must expose exactly');
    // Newly enforced, and never enforced before: an offered channel must actually be staged.
    expect(staticTopologyVerifier).toContain('which is not staged');
    // And a release must never REMOVE a pass the owner can currently select. The staging
    // script still rebuilds the config from a closed set, so without this a production
    // release would silently drop pass80 from the chooser.
    expect(staticTopologyVerifier).toContain("execFileSync('git', ['show', 'origin/gh-pages:release-channel-config.js']");
    expect(staticTopologyVerifier).toContain('would remove live channel(s)');
    // A verifier that could not run must never read as one that passed.
    expect(staticTopologyVerifier).toContain('NOT a pass - fetch gh-pages to enable this check.');
    expect(staticTopologyVerifier).toContain('publicConfig.retained.pass !== config.retained.pass');
    expect(staticTopologyVerifier).toContain('publicConfig.historical.pass !== config.historical.pass');
    expect(staticTopologyVerifier).toContain('publicConfig.stable.pass !== config.rollback.pass');
    expect(liveTopologyVerifier).toContain('await buttons.count() !== configuredChannelKeys.length');
    expect(liveTopologyVerifier).not.toContain('await buttons.count() !== 4');
    expect(liveTopologyVerifier).toContain("for (const choice of Object.keys(channelConfig).filter((key) => channelConfig[key]?.path))");
    // LANE AD (PASS 87): derived from the config, not spelled out. The retained aliases keep
    // their exact pass pins; only the PATH now comes from release-channels.json, so a
    // renamed or retired channel fails here instead of being asserted into existence.
    expect(liveTopologyVerifier).toContain("await verifyChoice('previous', channelConfig.previous.path, channelConfig.previous.pass,");
    expect(liveTopologyVerifier).toContain("await verifyChoice('retained', channelConfig.retained.path, channelConfig.retained.pass,");
    expect(liveTopologyVerifier).toContain("await verifyChoice('historical', channelConfig.historical.path, channelConfig.historical.pass,");
    expect(liveTopologyVerifier).not.toContain("await verifyChoice('stable'");
    expect(liveTopologyVerifier).toContain("verifyLegacyRoute('stable', (params) => params.set('release', 'stable'), channelConfig.previous.path, channelConfig.previous.pass)");
    expect(liveTopologyVerifier).toContain("verifyLegacyRoute('rollback', (params) => params.set('release', 'rollback'), channelConfig.previous.path, channelConfig.previous.pass)");
    expect(liveTopologyVerifier).not.toContain("await verifyChoice('rollback'");
  });

  // LANE AD (PASS 87): the Pages deployment queue is not this workflow's problem any more -
  // it deploys nothing, so it polls nothing. The exact-SHA discipline that loop protected
  // now lives on the publish script, which asserts the exact post-state of the branch it
  // pushed before it returns, and on the two-channel policy guard below.
  it('does not wait on, or poll, a Pages deployment it never triggers', () => {
    expect(workflow).not.toContain('for attempt in $(seq 1 120); do');
    // The pinned-channel rebuild steps still read `*_pages_sha` values out of the config to
    // fetch historical Pages commits; what must be gone is reading the branch TIP and
    // polling the Pages build API for it.
    expect(workflow).not.toContain('git ls-remote origin refs/heads/gh-pages');
    expect(workflow).not.toContain('sleep 10');
    expect(workflow).not.toContain('gh api');
    // Derived, so this pin cannot name a publish script the config stopped staging.
    const liveChannelId = releaseChannels.experimental.path.replace('channels/', '');
    const publishScript = readFileSync(`scripts/orchestration/publish_${liveChannelId}.py`, 'utf8');
    expect(publishScript).toContain('def assert_post_state(gh_pages_dir)');
    expect(publishScript).toContain('EXPECTED_POST_STATE = {LIVE_TREE, BACKUP_TREE}');
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
    expect(workflow).toContain('Rebuild Pass 63 rollback with its original Pages publication timestamp');
    expect(workflow).toContain('rollback_pages_sha="$(node -e');
    expect(workflow).toContain('VITE_RELEASED_AT="$rollback_released_at"');
    expect(workflow).not.toContain('VITE_RELEASED_AT="$RELEASE_BUILT_AT" npm run build');
    expect(workflow).toContain('ROLLBACK_RELEASED_AT=$rollback_released_at');
    expect(workflow).toContain('REQUIRE_ROLLBACK_RELEASE_TIMESTAMP: \'1\'');
    expect(staticTopologyVerifier).toContain('rollbackProvenance.releasedAt !== expectedRollbackReleasedAt');
    expect(staticTopologyVerifier).toContain('rollbackProvenance.exactRootFileCount !== rollbackFiles.length');
    expect(staticTopologyVerifier).toContain('rollbackProvenance.treeSha256 !== treeDigest(rollbackRoot, rollbackFiles)');
    expect(topologyBrowserVerifier).toContain('rollbackOriginal.releasedAt, expectedRollbackReleasedAt');
    expect(topologyBrowserVerifier).toContain('expectsPendingCandidate = isCurrentCandidate && !expectedReleasedAt');
    // HF-406: the label pin used to be the literal `HITL CANDIDATE · NOT LIVE`, a string
    // that named no pass. The gate now requires the badge to LEAD with the pass of the
    // channel under test in both the pending and the published branch, and forbids the
    // internal review acronym from ever being a pinned player-facing label again.
    expect(topologyBrowserVerifier).toContain('badgeLeadsWithItsPass = normalizedPass(lastReleaseLabel).startsWith(`${normalizedPass(expectedPass)}·`)');
    expect(topologyBrowserVerifier).toContain('if (!badgeLeadsWithItsPass');
    expect(topologyBrowserVerifier).toContain("? !lastReleaseLabel.includes('RELEASE CANDIDATE')");
    expect(topologyBrowserVerifier).toContain("lastReleaseLabel.includes('PENDING_PRODUCTION') || lastReleaseLabel.includes('RELEASE CANDIDATE')");
    expect(topologyBrowserVerifier).not.toContain('HITL');
    expect(topologyBrowserVerifier).toContain('verifyProductionReleaseTimestamp');
    expect(topologyBrowserVerifier).toContain('expectedPass,');
    expect(workflow.match(/test -n "\$\{RELEASE_BUILT_AT:-\}"/g)).toHaveLength(2);
    expect(topologyBrowserVerifier).toContain('process.env.RELEASE_BUILT_AT?.trim()');
    // LANE AD (PASS 87): a run that publishes nothing must not write a receipt that reads
    // like a publication. The schema-3 production envelope still exists and still demands a
    // Pages build plus a post-Pages live smoke - which is exactly why it cannot be used by a
    // verification-only job. The verification receipt states `published: false` and carries
    // the command that does publish.
    expect(workflow).toContain('node scripts/release/write-verification-receipt.mjs');
    expect(workflow).not.toContain('node scripts/release/write-production-receipt.mjs');
    expect(verificationReceiptWriter).toContain('releaseBuiltAt: process.env.RELEASE_BUILT_AT');
    expect(verificationReceiptWriter).toContain('published: false');
    expect(verificationReceiptWriter).toContain('publishCommand:');
    expect(verificationReceiptWriter).toContain("kind: 'release-verification'");
    expect(receiptWriter).toContain('releaseBuiltAt: process.env.RELEASE_BUILT_AT');
    expect(receiptWriter).toContain("throw new Error('Pages build is not exact and built')");
  });

  it('requires the published build to expose its own pass plus its exact UK-local day, date, and time instead of the pending sentinel', () => {
    const releasedAt = '2026-08-03T16:52:00Z';
    // HF-406: the published badge leads with the pass the build IS, then the instant it
    // went live. The old expected label was `LAST RELEASE · <date>` - it named no pass, so
    // a build that published under the PREVIOUS pass number (PASS 82 shipped stamped
    // PASS 81, and PASS 81 before it) satisfied this contract. The pass is now required
    // and pinned, so that class fails here as loudly as a wrong timestamp does.
    const label = 'PASS 84 · 3 AUG 2026 · 17:52 BST';
    expect(expectedLastReleaseLabel(releasedAt, 'PASS 84')).toBe(label);
    // A JS caller (every consumer here is .mjs) can still omit the pass; the runtime
    // guard, not the type, is what stops a publish from being verified without one.
    const untyped = expectedLastReleaseLabel as unknown as (releasedAt: string) => string;
    expect(() => untyped(releasedAt)).toThrow('needs the pass it publishes as');
    expect(() => expectedLastReleaseLabel(releasedAt, 'LAST RELEASE')).toThrow('needs the pass it publishes as');
    expect(verifyProductionReleaseTimestamp({
      expectedReleasedAt: releasedAt,
      expectedPass: 'PASS 84',
      observedReleasedAt: releasedAt,
      observedLabel: label,
      observedState: 'CURRENT LIVE',
    })).toEqual({ releasedAt, label, state: 'CURRENT LIVE' });
    expect(() => verifyProductionReleaseTimestamp({
      expectedReleasedAt: releasedAt,
      expectedPass: 'PASS 84',
      observedReleasedAt: 'PENDING_PRODUCTION',
      observedLabel: 'PASS 84 · PENDING_PRODUCTION',
      observedState: 'CURRENT BUILD',
    })).toThrow('Production candidate still exposes PENDING_PRODUCTION');
    expect(() => verifyProductionReleaseTimestamp({
      expectedReleasedAt: releasedAt,
      expectedPass: 'PASS 84',
      observedReleasedAt: '2026-08-03T16:53:00Z',
      observedLabel: label,
      observedState: 'CURRENT LIVE',
    })).toThrow('Production release timestamp mismatch');
    // The new half: right instant, previous pass on the badge.
    expect(() => verifyProductionReleaseTimestamp({
      expectedReleasedAt: releasedAt,
      expectedPass: 'PASS 84',
      observedReleasedAt: releasedAt,
      observedLabel: 'PASS 83 · 3 AUG 2026 · 17:52 BST',
      observedState: 'CURRENT LIVE',
    })).toThrow('Production Last Release label mismatch');
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

  it('blocks the release candidate on accepted requirements, the two-channel policy and the staged topology', () => {
    const candidateBuildStep = workflow.indexOf('Build exact frozen-evidence candidate bytes');
    const acceptanceStep = workflow.indexOf('Validate accepted requirement manifest');
    const policyStep = workflow.indexOf('Verify the HF-400 two-channel release policy');
    const topologyStep = workflow.indexOf('Stage the full local channel topology and verify it end to end');
    const receiptStep = workflow.indexOf('Write the release-candidate verification receipt');
    expect(candidateBuildStep).toBeGreaterThan(-1);
    // Pass 68+ uses the dynamic acceptance-gate; stale Pass 65/66 evidence
    // catalog and preview-provenance steps were removed from production.
    expect(acceptanceStep).toBeGreaterThan(candidateBuildStep);
    expect(policyStep).toBeGreaterThan(acceptanceStep);
    expect(topologyStep).toBeGreaterThan(policyStep);
    // The receipt is written last and only after every gate above it, so a receipt file can
    // never exist for a candidate whose topology or policy check did not run.
    expect(receiptStep).toBeGreaterThan(topologyStep);
    expect(workflow).toContain('artifacts/pipeline/two-channel-policy.json');
    expect(workflow).toContain('checks: read');
  });

  it('publishes immutable PR previews while requirement acceptance and timing remain explicit jobs', () => {
    expect(verifyWorkflow).toContain('requirements-acceptance:');
    expect(verifyWorkflow).toContain('pr-preview-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.sha }}');
    expect(verifyWorkflow).toContain('pipeline-metrics:');
    expect(verifyWorkflow).toContain('scripts/release/workflow-metrics.mjs');
  });

  it('runs Pass 73, Windows HUD and lifecycle files in separate fail-closed browser processes', () => {
    const windowsJob = verifyWorkflow.slice(
      verifyWorkflow.indexOf('bounded-browser-windows:'),
      verifyWorkflow.indexOf('bounded-browser-linux:'),
    );
    expect(windowsJob).toContain('timeout-minutes: 90');
    expect(windowsJob).toContain('name: Run Pass 73 gameplay regression contracts');
    expect(windowsJob).toContain('timeout-minutes: 25');
    expect(windowsJob).toContain('tests/e2e/pass73-gameplay-regressions.spec.ts tests/e2e/pass73-network-reveal-authority.spec.ts --project=chromium --workers=1 --retries=0');
    expect(windowsJob).toContain("Where-Object { $_ -ne 'pass73-gameplay-regressions' }");
    expect(windowsJob).toContain('name: Run Pass 64 HUD browser contracts');
    expect(windowsJob).toContain('timeout-minutes: 10');
    expect(windowsJob).toContain('node node_modules/@playwright/test/cli.js test tests/e2e/pass64-hud-menu.spec.ts --project=chromium --workers=1 --retries=0');
    expect(windowsJob).toContain('name: Run Pass 65 menu lifecycle contracts');
    expect(windowsJob).toContain('timeout-minutes: 13');
    expect(windowsJob).toContain('node node_modules/@playwright/test/cli.js test tests/e2e/pass65-menu-lifecycle.spec.ts --project=chromium --workers=1 --retries=0');
    expect(windowsJob).toContain('name: Upload Windows browser failure evidence');
    expect(windowsJob).toContain("if: failure() && needs.classify-change.outputs.mode != 'none'");
    expect(windowsJob).toContain('name: bounded-browser-windows-failure-${{ github.event.pull_request.head.sha || github.sha }}');
    expect(windowsJob).toContain('artifacts/pass25a/playwright-results/');
    expect(windowsJob).toContain('artifacts/pass65/menu-lifecycle/');
    expect(windowsJob).toContain('playwright-report/');
    expect(windowsJob).toContain('if-no-files-found: warn');

    const linuxJob = verifyWorkflow.slice(
      verifyWorkflow.indexOf('bounded-browser-linux:'),
      verifyWorkflow.indexOf('pipeline-metrics:'),
    );
    expect(linuxJob).toContain('timeout-minutes: 65');
    expect(linuxJob).not.toContain('name: Run Pass 73 gameplay regression contracts');
    expect(linuxJob).not.toContain('tests/e2e/pass73-gameplay-regressions.spec.ts');
    expect(linuxJob).not.toContain('tests/e2e/pass73-network-reveal-authority.spec.ts');
    expect(linuxJob).toContain("group !== 'pass73-gameplay-regressions'");
    expect(linuxJob).toContain('name: Upload Linux browser failure evidence');
    expect(linuxJob).toContain("if: failure() && needs.classify-change.outputs.mode != 'none'");
    expect(linuxJob).toContain('name: bounded-browser-linux-failure-${{ github.event.pull_request.head.sha || github.sha }}');
    expect(linuxJob).toContain('artifacts/pass25a/playwright-results/');
    expect(linuxJob).toContain('playwright-report/');
    expect(linuxJob).toContain('if-no-files-found: warn');
  });

  it('owns and closes the local preview lifecycle for every catalogued Playwright gate', () => {
    expect(packageJson.scripts['qa:playwright-topology']).toBe('node scripts/qa/run-playwright-with-topology.mjs');
    expect(playwrightConfig).toContain("const externalPreview = process.env.QA_EXTERNAL_PREVIEW === '1'");
    expect(playwrightConfig).toContain('userAgent: resolvePass70ChromiumProjectUserAgent({');
    expect(playwrightConfig).toContain('nativeEngineUserAgent,');
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
      'T-PASS70-FIELD-KIT-BROWSER',
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

  it('selects the changed acceptance manifest once and verifies its exact preview provenance', () => {
    const acceptanceJob = verifyWorkflow.indexOf('requirements-acceptance:');
    const metricsJob = verifyWorkflow.indexOf('pipeline-metrics:');
    const section = verifyWorkflow.slice(acceptanceJob, metricsJob);
    const installStep = section.indexOf('npm ci --ignore-scripts');
    const buildStep = section.indexOf('Build candidate bytes for acceptance verification');
    const acceptanceStep = section.indexOf('Verify changed acceptance manifest and write the selector receipt');
    const provenanceStep = section.indexOf('Verify the selected immutable preview provenance and bytes');

    expect(section).toContain('needs: [classify-change, static-and-unit]');
    expect(installStep).toBeGreaterThan(-1);
    expect(buildStep).toBeGreaterThan(installStep);
    expect(acceptanceStep).toBeGreaterThan(buildStep);
    expect(provenanceStep).toBeGreaterThan(acceptanceStep);
    expect(section).toContain('scripts/release/acceptance-gate.mjs --phase ci');
    expect(section.match(/scripts\/release\/acceptance-gate\.mjs --phase ci/gu)).toHaveLength(1);
    expect(section).toContain('--output artifacts/pipeline/acceptance-coverage.json');
    expect(section).toContain('scripts/release/verify-pr-preview-provenance.mjs');
    expect(section).toContain('--acceptance-receipt artifacts/pipeline/acceptance-coverage.json');
    expect(section).not.toContain('acceptance/pass-69.json');
    expect(section).toContain('GITHUB_TOKEN: ${{ github.token }}');
    expect(section).toContain('artifacts/pipeline/pr-preview-provenance.json');
  });

  it('records a receipt envelope with the complete staged topology', () => {
    // LANE AD (PASS 87): the workflow writes the VERIFICATION envelope now (it publishes
    // nothing). The schema-3 production envelope is unchanged and still demands the Pages
    // build and post-Pages live smoke it always did, so it remains the only receipt shape
    // that can claim a publication.
    expect(workflow).toContain('node scripts/release/write-verification-receipt.mjs');
    expect(receiptWriter).toContain('schemaVersion: 3');
    expect(receiptWriter).toContain('topology,');
    expect(receiptWriter).toContain("readJson('artifacts/pipeline/release-topology.json')");
    expect(verificationReceiptWriter).toContain('topology,');
    expect(verificationReceiptWriter).toContain("readJson('artifacts/pipeline/release-topology.json')");
    expect(verificationReceiptWriter).toContain("readJson('artifacts/pipeline/two-channel-policy.json')");
  });

  it('does not use a blocking GitHub Actions watcher inside the workflow', () => {
    expect(workflow).not.toContain('gh run watch');
  });

  it('binds live browser proof to four public builds, retained provenance, remapped legacy aliases, and Last Release', () => {
    // LANE AD (PASS 87): these four pinned the LITERAL channel paths the verifier checked.
    // `channels/the-big-one` stopped being the live channel at the pass80 cut, so this test
    // was green while pinning a verifier that asserted a topology no deploy produces. Every
    // path is now read from release-channels.json, and the pin moved with it - strictly
    // stronger, because the retired literal is now banned outright rather than merely
    // banned in one combination with 'PASS 65'.
    expect(liveTopologyVerifier).toContain("const liveChannelPath = channelConfig.experimental.path");
    expect(liveTopologyVerifier).toContain("const liveChannelId = liveChannelPath.slice('channels/'.length)");
    expect(liveTopologyVerifier).toContain("verifyChoice('experimental', liveChannelPath, channelConfig.experimental.pass, liveChangelogId)");
    expect(liveTopologyVerifier).toContain("verifyChoice('previous', channelConfig.previous.path, channelConfig.previous.pass,");
    expect(liveTopologyVerifier).toContain("verifyChoice('retained', channelConfig.retained.path, channelConfig.retained.pass,");
    expect(liveTopologyVerifier).toContain("verifyChoice('historical', channelConfig.historical.path, channelConfig.historical.pass,");
    expect(liveTopologyVerifier).not.toContain("'channels/the-big-one'");
    expect(liveTopologyVerifier).not.toContain("verifyChoice('stable'");
    expect(liveTopologyVerifier).not.toContain("verifyChoice('rollback'");
    expect(liveTopologyVerifier).toContain('pinned-channel-provenance.json');
    expect(liveTopologyVerifier).toContain('Stable embedded runtime digest');
    expect(liveTopologyVerifier).toContain("verifyLegacyRoute('latest'");
    expect(liveTopologyVerifier).toContain("verifyLegacyRoute('normal'");
    expect(liveTopologyVerifier).toContain("verifyLegacyRoute('room'");
    expect(liveTopologyVerifier).toContain('Last Release timestamp is not a published instant');
    // HF-406: same re-pin as above, on the live verifier's own copy of the check.
    expect(liveTopologyVerifier).toContain('badgeLeadsWithItsPass = normalizedPass(lastReleaseLabel).startsWith(`${normalizedPass(expectedPass)}·`)');
    expect(liveTopologyVerifier).not.toContain('HITL');
    expect(liveTopologyVerifier).toContain("releaseState !== 'LOCAL CANDIDATE'");
    expect(liveTopologyVerifier).toContain("timeText.includes('NOT PUBLISHED')");
    expect(liveTopologyVerifier).toContain("timeText.includes('RELEASE CANDIDATE')");
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
