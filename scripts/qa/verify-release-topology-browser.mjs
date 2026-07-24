#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const releasePass = process.env.RELEASE_PASS ?? null;
const sourceSha = process.env.SOURCE_SHA ?? null;
const outputPath = process.env.QA_OUTPUT ?? null;
const screenshotDirectory = process.env.QA_SCREENSHOT_DIR ?? null;
const rootUrl = new URL(baseUrl);
if (sourceSha) rootUrl.searchParams.set('qa', sourceSha);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
const failures = [];
const routes = {};
let chooserLabels = [];

function passIn(label) {
  return /PASS [1-9][0-9]*/.exec(label)?.[0] ?? null;
}

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
    if (!expectedHeadlessWarning && (message.type() === 'warning' || message.type() === 'error')) {
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
  await page.waitForSelector('#release-channel-options [data-release-choice="normal"]');
  const buttons = page.locator('#release-channel-options button');
  const labels = await buttons.allTextContents();
  if (await buttons.count() !== 3) throw new Error(`Expected three release choices, got ${await buttons.count()}`);
  if (await page.locator('#menu').count()) throw new Error('Root chooser loaded a game runtime');
  return labels;
}

async function verifyChoice(choice, expectedPath) {
  const observed = await observedPage();
  const { page } = observed;
  try {
    await openChooser(page);
    const button = page.locator(`[data-release-choice="${choice}"]`);
    const label = (await button.textContent())?.trim() ?? '';
    await button.click();
    await page.waitForSelector('#menu', { timeout: 60_000 });
    await page.waitForSelector('#solo:not([disabled])', { timeout: 60_000 });
    await page.waitForTimeout(2_500);
    if (!page.url().includes(`/${expectedPath}/`) || !page.url().includes('release=latest')) {
      throw new Error(`${choice} route mismatch: ${page.url()}`);
    }
    const eyebrow = (await page.locator('.eyebrow').textContent())?.trim() ?? '';
    const labelledPass = passIn(label);
    if (labelledPass && !eyebrow.includes(labelledPass)) {
      throw new Error(`${choice} runtime ${eyebrow} does not match chooser ${label}`);
    }
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: join(screenshotDirectory, `${choice}.png`), fullPage: true });
    }
    routes[choice] = { label, url: page.url(), eyebrow };
  } finally {
    await observed.close();
  }
}

let thrown = null;
try {
  const chooser = await observedPage();
  try {
    chooserLabels = await openChooser(chooser.page);
    for (const choice of ['normal', 'stable', 'experimental']) {
      if (await chooser.page.locator(`[data-release-choice="${choice}"]`).count() !== 1) {
        throw new Error(`Missing unique ${choice} chooser action: ${JSON.stringify(chooserLabels)}`);
      }
    }
  } finally {
    await chooser.close();
  }

  await verifyChoice('normal', 'channels/new-netcode');
  await verifyChoice('stable', 'channels/recent-stable');
  await verifyChoice('experimental', 'channels/experimental-netcode-pass');
  if (releasePass && !normalizedPass(routes.experimental.eyebrow).includes(normalizedPass(releasePass))) {
    throw new Error(`Experimental runtime ${routes.experimental.eyebrow} does not match ${releasePass}`);
  }

  const room = await observedPage();
  try {
    const roomUrl = new URL(rootUrl);
    roomUrl.searchParams.set('room', 'qa-room');
    roomUrl.searchParams.set('autojoin', '1');
    await room.page.goto(roomUrl.toString(), { waitUntil: 'domcontentloaded' });
    await room.page.waitForURL(/\/channels\/new-netcode\/.*(?:room=qa-room.*release=latest|release=latest.*room=qa-room)/, { timeout: 30_000 });
    routes.room = { url: room.page.url() };
  } finally {
    await room.close();
  }
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
