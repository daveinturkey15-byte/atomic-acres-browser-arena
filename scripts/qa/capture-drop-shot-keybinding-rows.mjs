// HF-412 (Lane Y) — the HUD half of the drop shot, inspected rather than assumed.
//
// The drop shot's second control is a HOLD of the crouch bind, so it has no
// keybinding row of its own; it is announced as a hint inside the PRONE row's
// action label. AGENTS.md's HUD forging contract requires every HUD/menu change
// to be visually inspected at the review viewports and to keep menu labels at
// 1280x720 above 9px with no clipping or surface overlap - so this captures the
// row and MEASURES it rather than eyeballing a screenshot:
//   - the hint's computed font size (the >= 9px floor),
//   - the hint's rectangle against its row's and the panel's content box
//     (clipping / overlap),
//   - horizontal overflow of the options panel and of the page.
//
// It writes one cropped PNG of the keybinding rows per viewport plus a JSON
// record, under docs/evidence/pass85/hf412/keybindings/.
//
// Headless only (owner instruction 12:40 BST: no browser may take the screen).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41997');
const OUT_DIR = arg('--out-dir', 'docs/evidence/pass85/hf412/keybindings');

// The repository's own review viewports (src/ui/surface-registry.ts), narrowed
// to the three this change can plausibly affect: the 9px floor is stated at
// 1280x720, `review` is where the PASS 84 menu overflow was measured, and
// `narrow` is the tightest row width in the set.
const VIEWPORTS = [
  { id: 'laptop', width: 1280, height: 720, deviceScaleFactor: 1 },
  { id: 'review', width: 1600, height: 900, deviceScaleFactor: 1 },
  { id: 'narrow', width: 390, height: 844, deviceScaleFactor: 2 },
];

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS, '--use-angle=d3d11', '--ignore-gpu-blocklist'],
});

const records = [];
try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    await page.goto(`${BASE}/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=hf412-keybindings&previewTime=0`,
      { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      return debug?.snapshot().weaponReady === true
        && document.querySelector('#solo')?.disabled === false;
    }, undefined, { timeout: 180_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    await page.locator('#menu-tab-options').click();
    await page.locator('#key-binding-rows').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);

    const measurement = await page.evaluate(() => {
      const rows = document.querySelector('#key-binding-rows');
      const panel = document.querySelector('#menu-panel-options');
      const proneRow = document.querySelector('.key-binding-row[data-action="prone"]');
      const hint = proneRow?.querySelector('.binding-hint') ?? null;
      const action = proneRow?.querySelector('.binding-action') ?? null;
      const key = proneRow?.querySelector('kbd') ?? null;
      const rect = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
      };
      return {
        hintText: hint?.textContent ?? null,
        hintFontPx: hint ? Number.parseFloat(getComputedStyle(hint).fontSize) : null,
        actionFontPx: action ? Number.parseFloat(getComputedStyle(action).fontSize) : null,
        hintRect: rect(hint),
        actionRect: rect(action),
        keyRect: rect(key),
        rowRect: rect(proneRow),
        rowsRect: rect(rows),
        rowScrollOverflowX: proneRow ? proneRow.scrollWidth - proneRow.clientWidth : null,
        actionScrollOverflowX: action ? action.scrollWidth - action.clientWidth : null,
        panelOverflowX: panel ? panel.scrollWidth - panel.clientWidth : null,
        pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rowsCount: document.querySelectorAll('.key-binding-row').length,
        hintCount: document.querySelectorAll('.binding-hint').length,
      };
    });

    const file = join(OUT_DIR, `key-binding-rows-${viewport.id}-${viewport.width}x${viewport.height}.png`);
    await page.locator('#key-binding-rows').screenshot({ path: file, animations: 'disabled' });

    // The falsifier, stated here rather than left to a reader's eye.
    const failures = [];
    if (!measurement.hintText) failures.push('the prone row carries no hold-crouch hint');
    if ((measurement.hintFontPx ?? 0) < 9) failures.push(`hint font ${measurement.hintFontPx}px is under the 9px floor`);
    if ((measurement.actionScrollOverflowX ?? 0) > 0) failures.push('the action label clips its own content');
    if (measurement.hintRect && measurement.rowRect
      && measurement.hintRect.right > measurement.rowRect.right + 0.5) failures.push('the hint runs past the row');
    if (measurement.hintRect && measurement.keyRect
      && measurement.hintRect.right > measurement.keyRect.x + 0.5) failures.push('the hint overlaps the key chip');
    if ((measurement.pageOverflowX ?? 0) > 0) failures.push(`page overflows horizontally by ${measurement.pageOverflowX}px`);
    records.push({ viewport, screenshot: file, ...measurement, failures });
    console.log(`[hf412-keybindings] ${viewport.id}: font ${measurement.hintFontPx}px, panelOverflowX ${measurement.panelOverflowX}, pageOverflowX ${measurement.pageOverflowX}, ${failures.length === 0 ? 'clean' : `FAIL ${failures.join('; ')}`}`);
    await page.close();
  }
} finally {
  await browser.close();
}

const report = {
  contract: 'hf412-keybinding-row-review-v1',
  capturedAt: new Date().toISOString(),
  base: BASE,
  // Recorded because the lane's own finding is that the options panel already
  // overflows on PASS 84 at some viewports; this says whether the added hint
  // changed that, not whether it is zero.
  records,
  pass: records.every((record) => record.failures.length === 0),
};
writeFileSync(join(OUT_DIR, 'keybinding-rows.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`[hf412-keybindings] ${report.pass ? 'PASS' : 'FAIL'} - ${join(OUT_DIR, 'keybinding-rows.json')}`);
process.exitCode = report.pass ? 0 : 1;
