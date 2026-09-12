#!/usr/bin/env node
// ===========================================================================
// PASS 87 Lane AR, item 1 - skeptic follow-up.
//
// The deployment-shell overflow was one decorative pseudo-element,
// `#menu.pass64-command-deck::after`, at `inset: -20%`. Bounding it to a 100%
// box stopped the overflow - but every percentage in that rule is a percentage
// OF THE LAYER, so shrinking the box also MOVED the bloom: the gradient anchor
// went from -20% + 22%x1.4 = 10.8% of the shell to -20% + 22% = 2.0%, and its
// radius from 53.2% of shell width to 38%. That is a real, if subtle, art
// change to the deployment shell, and AGENTS.md requires a HUD/menu change to
// be looked at, not reasoned about.
//
// The shipped rule now re-expresses each of those percentages against the new
// box (gradient 53.2% at 30.8%/16.8%, transform-origin 70% 70%, keyframe
// translations x1.4) so the painted result should be IDENTICAL at every phase
// of the animation. This instrument checks that claim the only way worth
// checking it: it screenshots the shell with the shipped rule, then again with
// the pre-PASS-87 geometry forced back on by an override, at both ends of the
// bloom animation, and diffs the pixels.
//
// Every number here is reported against two controls, because a diff of 0 is
// meaningless on its own:
//   noise      - the same state captured twice. The floor.
//   visibility - the shell with the bloom layer removed entirely. If THIS is
//                also 0, the bloom paints nothing the viewer can see (its
//                siblings are opaque and sit above it), and the parity result
//                is 0 for that reason rather than for the intended one. Say so
//                either way; do not quietly bank it.
//
// It also re-reports menuOverflowX per viewport, because a parity fix that
// re-introduced the overflow would be no fix at all.
//
// Headless only (owner instruction 2026-09-02 12:40). Needs a served build:
//   node scripts/qa/run-with-preview-server.mjs node scripts/qa/probe-menu-bloom-parity.mjs
// ===========================================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180';
const OUT = resolve('docs/evidence/pass87/residuals');
const VIEWPORTS = [
  { id: 'desktop', width: 1920, height: 1080 },
  { id: 'narrow', width: 390, height: 844 },
];
// The two ends of `p77-deck-bloom`, written in each rule's own units. These are
// the same on-screen transform: the shipped box is 1/1.4 of the old one, so its
// percentage translations are the old ones x1.4, and its origin is the old
// box's centre expressed in the new box (70%).
const PHASES = [
  { id: 'from', shipped: 'translate3d(-2.1%, -1.4%, 0) scale(1)', legacy: 'translate3d(-1.5%, -1%, 0) scale(1)', opacity: '0.45' },
  { id: 'to', shipped: 'translate3d(2.8%, 2.1%, 0) scale(1.12)', legacy: 'translate3d(2%, 1.5%, 0) scale(1.12)', opacity: '0.85' },
];

const freezeCss = (transform, opacity) => `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  #menu-preview-video, #menu-preview-frame { visibility: hidden !important; }
  #menu.pass64-command-deck::after { transform: ${transform} !important; opacity: ${opacity} !important; }
`;

// The pre-PASS-87 rule, restored on top of the shipped one.
const legacyGeometryCss = `
  #menu.pass64-command-deck::after {
    top: -20% !important; left: -20% !important; right: -20% !important; bottom: -20% !important;
    width: auto !important; height: auto !important;
    transform-origin: 50% 50% !important;
    background: radial-gradient(38% 38% at 22% 12%, rgb(232 120 31 / 0.10), transparent 70%) !important;
  }
`;

const hiddenBloomCss = '#menu.pass64-command-deck::after { display: none !important; }';

async function rawPixels(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

function compare(left, right) {
  if (left.data.length !== right.data.length) throw new Error('screenshots differ in size; cannot compare');
  let differing = 0;
  let maxDelta = 0;
  for (let index = 0; index < left.data.length; index += 1) {
    const delta = Math.abs(left.data[index] - right.data[index]);
    if (delta > 0) { differing += 1; if (delta > maxDelta) maxDelta = delta; }
  }
  return { differingChannelSamples: differing, maxChannelDelta: maxDelta };
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS, '--enable-unsafe-webgpu', '--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${BASE}/?release=latest&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=pass64-hud&previewTime=0`,
  { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const solo = document.querySelector('#solo');
  return debug?.snapshot().weaponReady === true && solo?.disabled === false;
}, undefined, { timeout: 120_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));

/** Captures the shell with `extraCss` layered on top of the frozen base state. */
async function capture(phase, extraCss) {
  const handles = [await page.addStyleTag({ content: freezeCss(phase.shipped, phase.opacity) })];
  if (extraCss) {
    handles.push(await page.addStyleTag({ content: extraCss }));
    // The legacy geometry needs its own transform, in its own units.
    if (extraCss === legacyGeometryCss) handles.push(await page.addStyleTag({ content: freezeCss(phase.legacy, phase.opacity) }));
  }
  await page.waitForTimeout(200);
  const shot = await page.locator('#menu').screenshot({ animations: 'disabled' });
  for (const handle of handles.reverse()) await handle.evaluate((node) => node.remove());
  await page.waitForTimeout(120);
  return rawPixels(shot);
}

mkdirSync(OUT, { recursive: true });
const rows = [];
for (const viewport of VIEWPORTS) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => {
    const menu = document.querySelector('#menu');
    return {
      menuOverflowX: menu.scrollWidth - menu.clientWidth,
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  for (const phase of PHASES) {
    const shipped = await capture(phase, null);
    const shippedAgain = await capture(phase, null);
    const legacy = await capture(phase, legacyGeometryCss);
    const hidden = await capture(phase, hiddenBloomCss);
    rows.push({
      viewport: viewport.id,
      width: viewport.width,
      height: viewport.height,
      phase: phase.id,
      ...overflow,
      shotPixels: shipped.info.width * shipped.info.height,
      noise: compare(shipped, shippedAgain),
      parity: compare(shipped, legacy),
      visibility: compare(shipped, hidden),
    });
  }
}
await page.close();
await browser.close();

const worstParity = Math.max(...rows.map((row) => row.parity.maxChannelDelta));
const worstNoise = Math.max(...rows.map((row) => row.noise.maxChannelDelta));
const bloomVisible = rows.some((row) => row.visibility.maxChannelDelta > row.noise.maxChannelDelta);
const report = {
  probe: 'menu bloom parity + overflow, PASS 87 Lane AR item 1',
  base: BASE,
  worstParityMaxChannelDelta: worstParity,
  worstNoiseMaxChannelDelta: worstNoise,
  bloomPaintsVisiblePixels: bloomVisible,
  verdict: worstParity <= worstNoise
    ? (bloomVisible
      ? 'the shipped bloom paints what the pre-PASS-87 bloom painted, and it is visible'
      : 'the bloom paints nothing a viewer can see at these viewports; parity holds trivially')
    : 'PARITY BROKEN',
  rows,
};
writeFileSync(resolve(OUT, 'menu-bloom-parity.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
const overflowed = rows.filter((row) => row.menuOverflowX !== 0);
if (overflowed.length > 0) {
  console.error(`menuOverflowX is not 0: ${JSON.stringify(overflowed)}`);
  process.exitCode = 1;
}
if (worstParity > worstNoise) {
  console.error(`bloom parity broken: parity delta ${worstParity} above the ${worstNoise} noise floor`);
  process.exitCode = 1;
}
