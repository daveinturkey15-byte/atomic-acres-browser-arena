#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { verifyProductionReleaseTimestamp } from '../release/release-timestamp-contract.mjs';

const channelConfig = JSON.parse(readFileSync(new URL('../../release-channels.json', import.meta.url), 'utf8'));
const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const releasePass = process.env.RELEASE_PASS ?? null;
const sourceSha = process.env.SOURCE_SHA ?? null;
const outputPath = process.env.QA_OUTPUT ?? null;
const screenshotDirectory = process.env.QA_SCREENSHOT_DIR ?? null;
const expectedReleasedAt = process.env.RELEASE_BUILT_AT?.trim() || null;
const expectedRollbackReleasedAt = process.env.ROLLBACK_RELEASED_AT?.trim() || null;
if (expectedReleasedAt && !releasePass) throw new Error('RELEASE_PASS is required with RELEASE_BUILT_AT');
if (expectedRollbackReleasedAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expectedRollbackReleasedAt)
  || Number.isNaN(Date.parse(expectedRollbackReleasedAt)))) {
  throw new Error('ROLLBACK_RELEASED_AT must be one strict UTC ISO-8601 instant');
}
const rootUrl = new URL(baseUrl);
if (sourceSha) rootUrl.searchParams.set('qa', sourceSha);
// The production runner is intentionally GPU-less. Route/chooser validation
// uses the explicit rollback renderer here; the accepted candidate's separate
// hardware gate proves required WebGPU/TSL on a real high-performance adapter.
rootUrl.searchParams.set('renderer', 'webgl2');
// Release topology is an offline product-identity gate. Pass 66 understands
// this flag and must not let optional leaderboard traffic contaminate it.
rootUrl.searchParams.set('externalServices', 'off');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
const failures = [];
const routes = {};
const provenance = {};
let chooserLabels = [];

function normalizedPass(label) {
  return label?.replace(/\s+/g, '').toUpperCase() ?? null;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

function assertExactSha(value, label) {
  if (!/^[0-9a-f]{40}$/.test(value ?? '')) throw new Error(`${label} is not an exact Git SHA: ${JSON.stringify(value)}`);
}

async function fetchJson(relativePath) {
  const url = new URL(relativePath, rootUrl);
  if (sourceSha) url.searchParams.set('qa', sourceSha);
  const page = await context.newPage();
  try {
    const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    if (!response || !response.ok()) throw new Error(`HTTP ${response?.status() ?? 'NO_RESPONSE'} ${url}`);
    return JSON.parse(await response.text());
  } catch (error) {
    throw new Error(`Invalid JSON at ${url}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await page.close();
  }
}

async function verifyPublishedProvenance() {
  const live = await fetchJson(`${channelConfig.experimental.path}/channel-provenance.json`);
  assertEqual(live.schemaVersion, 4, 'Live provenance schema');
  assertEqual(live.channel, 'the-big-one', 'Live provenance channel');
  assertEqual(live.releasePass, channelConfig.experimental.pass, 'Live provenance pass');
  assertEqual(live.path, channelConfig.experimental.path, 'Live provenance path');
  assertExactSha(live.sourceSha, 'Live provenance sourceSha');
  if (sourceSha) assertEqual(live.sourceSha, sourceSha, 'Live provenance sourceSha');
  if (releasePass) assertEqual(live.releasePass, releasePass, 'Live provenance releasePass');

  provenance.live = live;
  const previousEmbedded = await fetchJson(`${channelConfig.previous.path}/channel-provenance.json`);
  assertEqual(previousEmbedded.schemaVersion, 4, 'Previous embedded provenance schema');
  assertEqual(previousEmbedded.releasePass, channelConfig.previous.pass, 'Previous embedded pass');
  assertEqual(previousEmbedded.sourceSha, channelConfig.previous.sourceSha, 'Previous embedded source SHA');
  assertEqual(previousEmbedded.path, channelConfig.previous.pagesPath, 'Previous embedded source path');
  assertEqual(previousEmbedded.exactRootFileCount, channelConfig.previous.runtimeFileCount, 'Previous embedded file count');
  assertEqual(previousEmbedded.treeSha256, channelConfig.previous.runtimeTreeSha256, 'Previous embedded digest');
  const previousWrapper = await fetchJson(`${channelConfig.previous.path}/pinned-channel-provenance.json`);
  assertEqual(previousWrapper.channel, 'pass70-retained', 'Previous wrapper channel');
  assertEqual(previousWrapper.releasePass, channelConfig.previous.pass, 'Previous wrapper pass');
  assertEqual(previousWrapper.sourceSha, channelConfig.previous.sourceSha, 'Previous wrapper source SHA');
  assertEqual(previousWrapper.pagesSha, channelConfig.previous.pagesSha, 'Previous wrapper Pages SHA');
  assertEqual(previousWrapper.pagesPath, channelConfig.previous.pagesPath, 'Previous wrapper Pages path');
  assertEqual(previousWrapper.path, channelConfig.previous.path, 'Previous wrapper route');
  assertEqual(previousWrapper.pinnedRuntime?.treeSha256, previousEmbedded.treeSha256, 'Previous wrapper embedded digest');
  provenance.previous = { wrapper: previousWrapper, embedded: previousEmbedded };
  const retainedEmbedded = await fetchJson(`${channelConfig.retained.path}/channel-provenance.json`);
  assertEqual(retainedEmbedded.schemaVersion, 4, 'Retained embedded provenance schema');
  assertEqual(retainedEmbedded.releasePass, channelConfig.retained.pass, 'Retained embedded pass');
  assertEqual(retainedEmbedded.sourceSha, channelConfig.retained.sourceSha, 'Retained embedded source SHA');
  assertEqual(retainedEmbedded.path, channelConfig.retained.pagesPath, 'Retained embedded source path');
  assertEqual(retainedEmbedded.exactRootFileCount, channelConfig.retained.runtimeFileCount, 'Retained embedded file count');
  assertEqual(retainedEmbedded.treeSha256, channelConfig.retained.runtimeTreeSha256, 'Retained embedded digest');
  const retainedWrapper = await fetchJson(`${channelConfig.retained.path}/pinned-channel-provenance.json`);
  assertEqual(retainedWrapper.channel, 'pass69-retained', 'Retained wrapper channel');
  assertEqual(retainedWrapper.releasePass, channelConfig.retained.pass, 'Retained wrapper pass');
  assertEqual(retainedWrapper.sourceSha, channelConfig.retained.sourceSha, 'Retained wrapper source SHA');
  assertEqual(retainedWrapper.pagesSha, channelConfig.retained.pagesSha, 'Retained wrapper Pages SHA');
  assertEqual(retainedWrapper.pagesPath, channelConfig.retained.pagesPath, 'Retained wrapper Pages path');
  assertEqual(retainedWrapper.path, channelConfig.retained.path, 'Retained wrapper route');
  assertEqual(retainedWrapper.pinnedRuntime?.treeSha256, retainedEmbedded.treeSha256, 'Retained wrapper embedded digest');
  provenance.retained = { wrapper: retainedWrapper, embedded: retainedEmbedded };
  const stableOriginal = await fetchJson(`${channelConfig.stable.path}/channel-provenance.json`);
  if (stableOriginal.rebuiltFromSource === true) {
    assertEqual(stableOriginal.schemaVersion, 4, 'Stable rebuilt provenance schema');
    assertEqual(stableOriginal.channel, 'recent-stable', 'Stable rebuilt channel');
    assertEqual(stableOriginal.releasePass, channelConfig.stable.pass, 'Stable rebuilt pass');
    assertEqual(stableOriginal.sourceSha, channelConfig.stable.sourceSha, 'Stable rebuilt sourceSha');
    assertEqual(stableOriginal.path, channelConfig.stable.path, 'Stable rebuilt route');
    assertEqual(stableOriginal.originalPagesSha, channelConfig.stable.pagesSha, 'Stable original Pages SHA');
    assertEqual(stableOriginal.originalPagesPath, channelConfig.stable.pagesPath, 'Stable original Pages path');
    if (!stableOriginal.releasedAt || Number.isNaN(Date.parse(stableOriginal.releasedAt))) {
      throw new Error(`Stable rebuilt timestamp is invalid: ${JSON.stringify(stableOriginal.releasedAt)}`);
    }
    provenance.stable = { rebuilt: stableOriginal };
  } else {
    assertEqual(stableOriginal.schemaVersion, 4, 'Stable embedded provenance schema');
    assertEqual(stableOriginal.releasePass, channelConfig.stable.pass, 'Stable embedded provenance pass');
    assertEqual(stableOriginal.sourceSha, channelConfig.stable.sourceSha, 'Stable embedded sourceSha');
    assertEqual(stableOriginal.path, channelConfig.stable.pagesPath, 'Stable embedded source path');
    assertEqual(stableOriginal.exactRootFileCount, channelConfig.stable.runtimeFileCount, 'Stable embedded runtime file count');
    assertEqual(stableOriginal.treeSha256, channelConfig.stable.runtimeTreeSha256, 'Stable embedded runtime digest');

    const stableWrapper = await fetchJson(`${channelConfig.stable.path}/pinned-channel-provenance.json`);
    assertEqual(stableWrapper.schemaVersion, 4, 'Stable wrapper provenance schema');
    assertEqual(stableWrapper.channel, 'recent-stable', 'Stable wrapper channel');
    assertEqual(stableWrapper.releasePass, channelConfig.stable.pass, 'Stable wrapper pass');
    assertEqual(stableWrapper.sourceSha, channelConfig.stable.sourceSha, 'Stable wrapper sourceSha');
    assertEqual(stableWrapper.pagesSha, channelConfig.stable.pagesSha, 'Stable wrapper pagesSha');
    assertEqual(stableWrapper.pagesPath, channelConfig.stable.pagesPath, 'Stable wrapper Pages path');
    assertEqual(stableWrapper.path, channelConfig.stable.path, 'Stable wrapper route');
    assertEqual(stableWrapper.pinnedRuntime?.sourceSha, stableOriginal.sourceSha, 'Stable wrapper embedded sourceSha');
    assertEqual(stableWrapper.pinnedRuntime?.exactRootFileCount, stableOriginal.exactRootFileCount, 'Stable wrapper embedded file count');
    assertEqual(stableWrapper.pinnedRuntime?.treeSha256, stableOriginal.treeSha256, 'Stable wrapper embedded digest');
    provenance.stable = { wrapper: stableWrapper, embedded: stableOriginal };
  }
  if (channelConfig.rollback) {
    const rollbackOriginal = await fetchJson(`${channelConfig.rollback.path}/channel-provenance.json`);
    assertEqual(rollbackOriginal.schemaVersion, 4, 'Rollback provenance schema');
    assertEqual(rollbackOriginal.releasePass, channelConfig.rollback.pass, 'Rollback provenance pass');
    assertEqual(rollbackOriginal.sourceSha, channelConfig.rollback.sourceSha, 'Rollback provenance source SHA');
    assertEqual(rollbackOriginal.path, channelConfig.rollback.path, 'Rollback provenance route');
    if (expectedRollbackReleasedAt) {
      assertEqual(rollbackOriginal.rebuiltFromSource, true, 'Rollback rebuilt-source marker');
      assertEqual(rollbackOriginal.releasedAt, expectedRollbackReleasedAt, 'Rollback original release timestamp');
      assertEqual(rollbackOriginal.originalPagesSha, channelConfig.rollback.pagesSha, 'Rollback original Pages SHA');
      assertEqual(rollbackOriginal.originalPagesPath, channelConfig.rollback.pagesPath, 'Rollback original Pages path');
    }
    provenance.rollback = { rebuilt: rollbackOriginal };
  }
}

async function observedPage() {
  const page = await context.newPage();
  let observing = true;
  const isPinnedStableExternal = (resourceUrl) => {
    if (!page.url().includes(`/${channelConfig.stable.path}/`)) return false;
    try {
      const { hostname } = new URL(resourceUrl);
      return hostname === 'fonts.googleapis.com'
        || hostname === 'fonts.gstatic.com'
        || hostname === 'atomic-acres-leaderboard.atomic-acres.workers.dev';
    } catch {
      return false;
    }
  };
  page.on('pageerror', (error) => {
    if (observing) failures.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (!observing) return;
    const text = message.text();
    const legacyStableExternal = isPinnedStableExternal(message.location().url);
    const expectedHeadlessWarning = text === 'THREE.WebGLRenderer: KHR_parallel_shader_compile extension not supported.';
    const expectedReadbackWarning = /GL Driver Message .*GPU stall due to ReadPixels/.test(text);
    if (!legacyStableExternal && !expectedHeadlessWarning && !expectedReadbackWarning
      && (message.type() === 'warning' || message.type() === 'error')) {
      failures.push(`console ${message.type()}: ${text}`);
    }
  });
  page.on('response', (response) => {
    if (observing && response.status() >= 400 && !isPinnedStableExternal(response.url())) {
      failures.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (!observing) return;
    const reason = request.failure()?.errorText ?? 'unknown failure';
    if (reason !== 'net::ERR_ABORTED' && !isPinnedStableExternal(request.url())) {
      failures.push(`request failed: ${reason} ${request.url()}`);
    }
  });
  return {
    page,
    async close() {
      observing = false;
      await page.close();
    },
  };
}

async function openChooser(page) {
  await page.goto(rootUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#release-channel-options [data-release-choice="experimental"]');
  const buttons = page.locator('#release-channel-options button');
  const labels = await buttons.allTextContents();
  const expectedBadge = expectedReleasedAt ? 'LIVE' : 'RELEASE CANDIDATE';
  if (await buttons.count() !== 4
    || !labels.some((text) => text.includes(channelConfig.experimental.pass) && text.includes(expectedBadge) && !text.includes('THE BIG ONE'))
    || !labels.some((text) => text.includes('PASS 70') && text.includes('PREVIOUS LIVE'))
    || !labels.some((text) => text.includes('PASS 69') && text.includes('PREVIOUS STABLE'))
    || !labels.some((text) => text.includes('PASS 63') && text.includes('STABLE') && text.includes('WEBGL'))
    || labels.some((text) => text.includes('PASS 66') || text.includes('PASS 65') || text.includes('PASS 64') || text.includes('PASS 59'))) {
    throw new Error(`Unexpected chooser labels: ${JSON.stringify(labels)}`);
  }
  if (expectedReleasedAt && labels.some((text) => /candidate/iu.test(text))) {
    throw new Error(`Production chooser still exposes candidate copy: ${JSON.stringify(labels)}`);
  }
  if (await page.locator('[data-release-choice="normal"]').count()) throw new Error('Removed normal channel is still selectable');
  if (await page.locator('#menu').count()) throw new Error('Root chooser loaded a game runtime');
  return labels;
}

async function verifyRuntime(page, expectedPath, expectedPass, expectedChangelogId, expectedRouteReleasedAt = null) {
  await page.waitForSelector('#menu', { timeout: 60_000 });
  await page.waitForSelector('#solo:not([disabled])', { timeout: 60_000 });
  await page.waitForTimeout(2_500);
  if (!page.url().includes(`/${expectedPath}/`) || !page.url().includes('release=latest')) {
    throw new Error(`Channel route mismatch: ${page.url()}`);
  }
  const identityLabels = await page.locator('.command-brand span, .eyebrow').allTextContents();
  const runtimeIdentity = identityLabels.map((label) => label.trim()).filter(Boolean).join(' | ');
  if (!normalizedPass(runtimeIdentity).includes(normalizedPass(expectedPass))) {
    throw new Error(`Runtime ${runtimeIdentity} does not match ${expectedPass}`);
  }
  let lastRelease = null;
  if (expectedChangelogId) {
    await page.waitForSelector('#last-updated-btn', { timeout: 60_000 });
    const lastReleaseLabel = (await page.locator('#last-updated-btn').textContent())?.trim() ?? '';
    const isCurrentCandidate = expectedPath === channelConfig.experimental.path;
    const expectsPendingCandidate = isCurrentCandidate && !expectedReleasedAt;
    if (expectsPendingCandidate
      ? lastReleaseLabel !== 'CURRENT CANDIDATE · PUBLIC HITL AFTER RELEASE'
      : !lastReleaseLabel.includes('LAST RELEASE') || lastReleaseLabel.includes('PENDING_PRODUCTION')) {
      throw new Error(`Invalid Last Release label for ${expectedPass}: ${JSON.stringify(lastReleaseLabel)}`);
    }
    await page.locator('#last-updated-btn').click();
    await page.waitForSelector('#changelog-panel:not([hidden])');
    const currentRelease = page.locator('#changelog-list > li').first();
    assertEqual(await currentRelease.getAttribute('data-changelog-id'), expectedChangelogId, `${expectedPass} current changelog id`);
    const currentReleaseText = (await currentRelease.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    if (!normalizedPass(currentReleaseText).includes(normalizedPass(expectedPass))) {
      throw new Error(`${expectedPass} Last Release details do not identify the current pass: ${JSON.stringify(currentReleaseText)}`);
    }
    const releaseState = (await currentRelease.locator('.changelog-entry-pass b').textContent())?.trim() ?? null;
    const time = currentRelease.locator('time');
    const releasedAt = await time.getAttribute('datetime');
    const timeText = (await time.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    if (expectsPendingCandidate) {
      if (releaseState !== 'LOCAL CANDIDATE' || releasedAt !== null
        || !timeText.includes('NOT PUBLISHED') || !timeText.includes('AWAITING OWNER HITL')) {
        throw new Error(`${expectedPass} candidate is not explicitly pending owner HITL: ${JSON.stringify({ releaseState, releasedAt, timeText })}`);
      }
    } else if (!releasedAt || Number.isNaN(Date.parse(releasedAt)) || timeText.includes('NOT PUBLISHED')) {
      throw new Error(`${expectedPass} Last Release timestamp is not a published instant: ${JSON.stringify(releasedAt)}`);
    }
    const exactExpectedReleasedAt = expectedRouteReleasedAt
      ?? (expectedReleasedAt && normalizedPass(expectedPass) === normalizedPass(releasePass) ? expectedReleasedAt : null);
    if (exactExpectedReleasedAt) {
      verifyProductionReleaseTimestamp({
        expectedReleasedAt: exactExpectedReleasedAt,
        observedReleasedAt: releasedAt,
        observedLabel: lastReleaseLabel,
        observedState: releaseState,
      });
    }
    lastRelease = { lastReleaseLabel, changelogId: expectedChangelogId, releasedAt };
  }
  return { runtimeIdentity, lastRelease };
}

async function verifyChoice(choice, expectedPath, expectedPass, expectedChangelogId, expectedRouteReleasedAt = null) {
  const observed = await observedPage();
  const { page } = observed;
  try {
    await openChooser(page);
    const button = page.locator(`[data-release-choice="${choice}"]`);
    const label = (await button.textContent())?.trim() ?? '';
    await button.click();
    const runtime = await verifyRuntime(page, expectedPath, expectedPass, expectedChangelogId, expectedRouteReleasedAt);
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: join(screenshotDirectory, `${choice}.png`), fullPage: true });
    }
    routes[choice] = { label, url: page.url(), eyebrow: runtime.runtimeIdentity, lastRelease: runtime.lastRelease };
  } finally {
    await observed.close();
  }
}

async function verifyLegacyRoute(name, configure, expectedPath = 'channels/the-big-one', expectedPass = channelConfig.experimental.pass) {
  const observed = await observedPage();
  const { page } = observed;
  try {
    const url = new URL(rootUrl);
    configure(url.searchParams);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    const runtime = await verifyRuntime(page, expectedPath, expectedPass);
    routes[name] = { url: page.url(), eyebrow: runtime.runtimeIdentity };
  } finally {
    await observed.close();
  }
}

let thrown = null;
try {
  await verifyPublishedProvenance();
  const chooser = await observedPage();
  try {
    chooserLabels = await openChooser(chooser.page);
    for (const choice of ['experimental', 'previous', 'retained', 'stable']) {
      if (await chooser.page.locator(`[data-release-choice="${choice}"]`).count() !== 1) {
        throw new Error(`Missing unique ${choice} chooser action: ${JSON.stringify(chooserLabels)}`);
      }
    }
    if (await chooser.page.locator('[data-release-choice="rollback"]').count() !== 0) {
      throw new Error(`Rollback alias must not duplicate the stable chooser action: ${JSON.stringify(chooserLabels)}`);
    }
  } finally {
    await chooser.close();
  }

  await verifyChoice('experimental', 'channels/the-big-one', channelConfig.experimental.pass, 'pass72');
  await verifyChoice('previous', 'channels/pass70-retained', 'PASS 70', 'pass70');
  await verifyChoice('retained', 'channels/pass69-retained', 'PASS 69', 'pass69');
  await verifyChoice('stable', 'channels/pass63-rollback', 'PASS 63', 'pass63', expectedRollbackReleasedAt);
  if (releasePass && !normalizedPass(routes.experimental.eyebrow).includes(normalizedPass(releasePass))) {
    throw new Error(`Experimental runtime ${routes.experimental.eyebrow} does not match ${releasePass}`);
  }

  await verifyLegacyRoute('latest', (params) => params.set('release', 'latest'));
  await verifyLegacyRoute('normal', (params) => params.set('release', 'normal'));
  await verifyLegacyRoute('previous', (params) => params.set('release', 'previous'), 'channels/pass70-retained', 'PASS 70');
  await verifyLegacyRoute('pass69', (params) => params.set('release', 'pass69'), 'channels/pass69-retained', 'PASS 69');
  await verifyLegacyRoute('room', (params) => {
    params.set('room', 'qa-room');
    params.set('autojoin', '1');
  });
} catch (error) {
  thrown = error;
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await context.close();
  await browser.close();
}

const result = {
  schemaVersion: 1,
  ok: failures.length === 0,
  sourceSha,
  releasePass,
  baseUrl: rootUrl.toString(),
  verifiedAt: new Date().toISOString(),
  chooserLabels,
  provenance,
  routes,
  failures,
};
if (outputPath) {
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(result, null, 2));
if (thrown || failures.length > 0) process.exitCode = 1;
