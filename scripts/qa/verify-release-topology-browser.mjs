#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { verifyProductionReleaseTimestamp } from '../release/release-timestamp-contract.mjs';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const releasePass = process.env.RELEASE_PASS ?? null;
const sourceSha = process.env.SOURCE_SHA ?? null;
const outputPath = process.env.QA_OUTPUT ?? null;
const screenshotDirectory = process.env.QA_SCREENSHOT_DIR ?? null;
const expectedReleasedAt = process.env.RELEASE_BUILT_AT?.trim() || null;
if (expectedReleasedAt && !releasePass) throw new Error('RELEASE_PASS is required with RELEASE_BUILT_AT');
const rootUrl = new URL(baseUrl);
if (sourceSha) rootUrl.searchParams.set('qa', sourceSha);
// The production runner is intentionally GPU-less. Route/chooser validation
// uses the explicit rollback renderer here; the accepted candidate's separate
// hardware gate proves required WebGPU/TSL on a real high-performance adapter.
rootUrl.searchParams.set('renderer', 'webgl2');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
const failures = [];
const routes = {};
let chooserLabels = [];

function normalizedPass(label) {
  return label?.replace(/\s+/g, '').toUpperCase() ?? null;
}

async function observedPage() {
  const page = await context.newPage();
  let observing = true;
  page.on('pageerror', (error) => {
    if (observing) failures.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (!observing) return;
    const text = message.text();
    const expectedHeadlessWarning = text === 'THREE.WebGLRenderer: KHR_parallel_shader_compile extension not supported.';
    const expectedReadbackWarning = /GL Driver Message .*GPU stall due to ReadPixels/.test(text);
    if (!expectedHeadlessWarning && !expectedReadbackWarning && (message.type() === 'warning' || message.type() === 'error')) {
      failures.push(`console ${message.type()}: ${text}`);
    }
  });
  page.on('response', (response) => {
    if (observing && response.status() >= 400) failures.push(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (!observing) return;
    const reason = request.failure()?.errorText ?? 'unknown failure';
    if (reason !== 'net::ERR_ABORTED') failures.push(`request failed: ${reason} ${request.url()}`);
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
  if (await buttons.count() !== 2
    || !labels.some((text) => text.includes('PASS 64') && text.includes('LIVE') && text.includes('EXPERIMENTAL NEW NETCODE'))
    || !labels.some((text) => text.includes('PASS 63') && text.includes('STABLE') && text.includes('NEW NETCODE'))
    || labels.some((text) => text.includes('PASS 59'))) {
    throw new Error(`Unexpected chooser labels: ${JSON.stringify(labels)}`);
  }
  if (await page.locator('[data-release-choice="normal"]').count()) throw new Error('Removed normal channel is still selectable');
  if (await page.locator('#menu').count()) throw new Error('Root chooser loaded a game runtime');
  return labels;
}

async function verifyRuntime(page, expectedPath, expectedPass) {
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
  const lastReleaseLabel = (await page.locator('#last-updated-btn').textContent())?.trim() ?? null;
  const releasedAt = await page.locator('#changelog-list > li:first-child time').getAttribute('datetime');
  const releaseState = (await page.locator('#changelog-list > li:first-child .changelog-entry-pass b').textContent())?.trim() ?? null;
  if (expectedReleasedAt && normalizedPass(expectedPass) === normalizedPass(releasePass)) {
    verifyProductionReleaseTimestamp({
      expectedReleasedAt,
      observedReleasedAt: releasedAt,
      observedLabel: lastReleaseLabel,
      observedState: releaseState,
    });
  }
  return { runtimeIdentity, lastReleaseLabel, releasedAt, releaseState };
}

async function verifyChoice(choice, expectedPath, expectedPass) {
  const observed = await observedPage();
  const { page } = observed;
  try {
    await openChooser(page);
    const button = page.locator(`[data-release-choice="${choice}"]`);
    const label = (await button.textContent())?.trim() ?? '';
    await button.click();
    const runtime = await verifyRuntime(page, expectedPath, expectedPass);
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: join(screenshotDirectory, `${choice}.png`), fullPage: true });
    }
    routes[choice] = { label, url: page.url(), eyebrow: runtime.runtimeIdentity, ...runtime };
  } finally {
    await observed.close();
  }
}

async function verifyLegacyRoute(name, configure) {
  const observed = await observedPage();
  const { page } = observed;
  try {
    const url = new URL(rootUrl);
    configure(url.searchParams);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    const runtime = await verifyRuntime(page, 'channels/experimental-netcode-pass', 'PASS 64');
    routes[name] = { url: page.url(), eyebrow: runtime.runtimeIdentity, ...runtime };
  } finally {
    await observed.close();
  }
}

let thrown = null;
try {
  const chooser = await observedPage();
  try {
    chooserLabels = await openChooser(chooser.page);
    for (const choice of ['experimental', 'stable']) {
      if (await chooser.page.locator(`[data-release-choice="${choice}"]`).count() !== 1) {
        throw new Error(`Missing unique ${choice} chooser action: ${JSON.stringify(chooserLabels)}`);
      }
    }
  } finally {
    await chooser.close();
  }

  await verifyChoice('experimental', 'channels/experimental-netcode-pass', 'PASS 64');
  await verifyChoice('stable', 'channels/recent-stable', 'PASS 63');
  if (releasePass && !normalizedPass(routes.experimental.eyebrow).includes(normalizedPass(releasePass))) {
    throw new Error(`Experimental runtime ${routes.experimental.eyebrow} does not match ${releasePass}`);
  }

  await verifyLegacyRoute('latest', (params) => params.set('release', 'latest'));
  await verifyLegacyRoute('normal', (params) => params.set('release', 'normal'));
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
  routes,
  failures,
};
if (outputPath) {
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(result, null, 2));
if (thrown || failures.length > 0) process.exitCode = 1;
