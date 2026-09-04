// Captures and reads back every menu surface that claims a release identity (release badge, features panel, project map) from a running built menu.
//
// Usage:
//   node scripts/qa/capture-release-identity-surfaces.mjs
//
// Env (all optional):
//   BASE_URL     default: http://127.0.0.1:41978          — base URL of the built menu (local preview server or live channel)
//   LABEL        default: capture                        — prefix for output file names
//   OUT_DIR      default: artifacts/qa/hf406              — output directory (created recursively if missing)
//   MENU_QUERY   default: ?release=latest&renderer=webgpu — URL query appended to BASE_URL
//   VIEWPORT     default: 1600x900                        — page viewport, width x height
//
// Writes:
//   OUT_DIR (directory, created recursively)
//   OUT_DIR/LABEL-menu-full.png
//   OUT_DIR/LABEL-top-right.png
//   OUT_DIR/LABEL-features-panel.png
//   OUT_DIR/LABEL-project-map-overview.png
//   OUT_DIR/LABEL-project-map-changes.png
//   OUT_DIR/LABEL-project-map-structure.png
//   OUT_DIR/LABEL-readback.json (machine-readable readback of badge, brand, features and project-map text)
//
// Exit codes:
//   0 on success; non-zero on uncaught exception (browser launch failure, selector timeout) — no explicit process.exit calls

// HF-406 — capture and READ BACK every menu surface that claims a release identity.
//
// Owner, 2026-09-02: "ensure the top right thing is an accurate update of both the
// current pass number and features, and the map button contains the proper project
// map too. Currently it says pass 73 HITL?!"
//
// This lane's instrument. It opens the built menu (local preview server or a live
// channel URL), reads the three identity surfaces back out of the DOM, and writes
// both PNGs and a machine-readable JSON so a claim about the badge is measured
// rather than asserted:
//
//   1. the top-right meta block (#menu-meta-actions) — the release badge and the
//      PROJECT MAP button;
//   2. the release-history / features panel the badge opens;
//   3. the project map dialog, on its OVERVIEW and CHANGES pages.
//
// Launch policy: headless, channel 'chrome', muted (scripts/qa/lib/browser-launch-flags.mjs).
// The owner's screen is never touched.
//
// Usage:
//   BASE_URL=http://127.0.0.1:41978 LABEL=before node scripts/qa/capture-release-identity-surfaces.mjs
//   BASE_URL=https://.../channels/pass83 LABEL=live-pass83 node scripts/qa/capture-release-identity-surfaces.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41978';
const LABEL = process.env.LABEL ?? 'capture';
const OUT = process.env.OUT_DIR ?? 'artifacts/qa/hf406';
const QUERY = process.env.MENU_QUERY ?? '?release=latest&renderer=webgpu';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const [vw, vh] = (process.env.VIEWPORT ?? '1600x900').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));

const shot = async (name, locator) => {
  const path = `${OUT}/${LABEL}-${name}.png`;
  if (locator) await locator.screenshot({ path });
  else await page.screenshot({ path });
  console.log('[hf406] captured', path);
};

await page.goto(`${BASE}/${QUERY}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#last-updated-btn', { state: 'visible', timeout: 180000 });
await page.waitForTimeout(2500);

const text = async (selector) => page.evaluate(
  (s) => document.querySelector(s)?.textContent?.replace(/\s+/gu, ' ').trim() ?? null,
  selector,
);

await shot('menu-full');
await shot('top-right', page.locator('#menu-meta-actions'));

const badge = await text('#last-updated-btn');
const brand = await text('.command-brand');

await page.click('#last-updated-btn');
await page.waitForSelector('#changelog-panel:not([hidden])', { timeout: 20000 });
await page.waitForTimeout(400);
await shot('features-panel', page.locator('#changelog-panel'));
const featuresEyebrow = await text('#changelog-panel .changelog-header small');
const featuresFirstEntry = await text('#changelog-list > li:first-child');
await page.click('#changelog-close');
await page.waitForTimeout(300);

await page.click('#project-map-btn');
await page.waitForSelector('#project-map-panel:not([hidden])', { timeout: 20000 });
await page.waitForTimeout(400);
await shot('project-map-overview', page.locator('#project-map-panel'));
const mapMeta = await text('#project-map-panel .project-map-meta');
const mapOverview = await text('#project-map-page-overview');
await page.click('[data-project-page="changes"]');
await page.waitForTimeout(300);
await shot('project-map-changes', page.locator('#project-map-panel'));
const mapChanges = await text('#project-map-page-changes');
await page.click('[data-project-page="structure"]');
await page.waitForTimeout(300);
await shot('project-map-structure', page.locator('#project-map-panel'));
const mapStructure = await text('#project-map-page-structure');

const readback = {
  label: LABEL,
  base: BASE,
  capturedAt: new Date().toISOString(),
  badge,
  brand,
  featuresEyebrow,
  featuresFirstEntry,
  projectMap: { meta: mapMeta, overview: mapOverview, changes: mapChanges, structure: mapStructure },
  passNumbersSeen: {
    badge: [...new Set((badge ?? '').match(/PASS \d+/gu) ?? [])],
    featuresFirstEntry: [...new Set((featuresFirstEntry ?? '').match(/PASS \d+/gu) ?? [])],
    projectMapMeta: [...new Set((mapMeta ?? '').match(/PASS \d+/gu) ?? [])],
    projectMapOverview: [...new Set((mapOverview ?? '').match(/PASS \d+/gu) ?? [])],
  },
  hitlSeen: {
    badge: /HITL/u.test(badge ?? ''),
    featuresFirstEntry: /HITL/u.test(featuresFirstEntry ?? ''),
    projectMapMeta: /HITL/u.test(mapMeta ?? ''),
    projectMapOverview: /HITL/u.test(mapOverview ?? ''),
  },
  pageErrors,
  viewport: { width: vw, height: vh },
  // AGENTS.md: no horizontal overflow on any review viewport.
  documentOverflowsHorizontally: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
};
const jsonPath = `${OUT}/${LABEL}-readback.json`;
writeFileSync(jsonPath, `${JSON.stringify(readback, null, 2)}\n`);
console.log('[hf406] readback ->', jsonPath);
console.log(JSON.stringify({ badge, mapMeta: readback.projectMap.meta, passNumbersSeen: readback.passNumbersSeen, hitlSeen: readback.hitlSeen }, null, 2));

await browser.close();
