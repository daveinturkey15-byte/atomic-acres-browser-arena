#!/usr/bin/env node
// ===========================================================================
// HF-418 — the RTX explainer's mechanical falsifier.
//
// THE CLAIM UNDER TEST: "selecting RTX opens an explainer ... and never
// silently changes the web renderer" (ledger row HF-418).
//
// A unit test can prove the copy is right and the handler is shaped right. It
// cannot prove that the running game left the renderer alone, because the
// handler lives in legacy-main.ts and the settings it must not touch live in
// storage and in a live renderer. So this drives the REAL menu in a real
// headless WebGPU Chrome and compares a full snapshot of the graphics state
// taken before and after selecting the RTX row.
//
// It fails if ANY of these is false:
//   - the dialog is open after selecting RTX;
//   - the select has returned to the profile that was active before;
//   - the persisted graphics settings are byte-identical to before;
//   - the pending badge does not claim an unsaved change;
//   - selecting a real profile afterwards still works (the explainer must not
//     have poisoned the handler).
//
// It also runs the same check while a REAL profile is pending, because that is
// the case a naive `value = displayedGraphicsPreset` restore gets wrong: it
// would silently discard the player's unsaved choice.
//
// HEADLESS ONLY (owner instruction 2026-09-02 12:40).
//
// Usage: node scripts/qa/verify-rtx-explainer-headless.mjs --url http://localhost:41977
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';
import { RTX_NATIVE_RUNTIME_OPTION_VALUE } from '../../src/ui/rtx-native-runtime-explainer.ts';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://localhost:41977');
const OUT_DIR = arg('--out', 'artifacts/graphics-audit');

const issues = [];
const pageErrors = [];

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS, '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});

let receipt = null;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&externalServices=off&previewTime=0`,
    { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

  const readState = () => page.evaluate(() => {
    const dialog = document.getElementById('rtx-native-runtime-explainer');
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      selectValue: document.querySelector('#graphics-profile')?.value ?? null,
      displayedPreset: snapshot.settings?.displayedGraphicsPreset ?? null,
      // The whole persisted control set, so a single silently flipped control
      // is caught rather than only a changed preset name.
      graphics: JSON.stringify(snapshot.settings?.graphics ?? null),
      badge: document.getElementById('graphics-effective')?.textContent ?? null,
      dialogOpen: dialog ? (dialog.open === true || dialog.hidden === false) : false,
      visibleSummary: [...document.querySelectorAll('.graphics-profile-summary')]
        .filter((node) => !node.hidden)
        .map((node) => node.dataset.graphicsProfile),
    };
  });

  const selectProfile = (value) => page.evaluate((next) => {
    const select = document.querySelector('#graphics-profile');
    select.value = next;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

  // --- Case 1: no pending change. ---
  const before = await readState();
  await selectProfile(RTX_NATIVE_RUNTIME_OPTION_VALUE);
  const afterRtx = await readState();
  if (!afterRtx.dialogOpen) issues.push('case1:dialog-did-not-open');
  if (afterRtx.selectValue !== before.selectValue) {
    issues.push(`case1:select-moved:${before.selectValue}->${afterRtx.selectValue}`);
  }
  if (afterRtx.graphics !== before.graphics) issues.push('case1:persisted-graphics-changed');
  if (afterRtx.displayedPreset !== before.displayedPreset) issues.push('case1:displayed-preset-changed');
  if (afterRtx.badge !== before.badge) issues.push(`case1:badge-changed:${String(afterRtx.badge)}`);
  if (afterRtx.visibleSummary.length !== 1 || afterRtx.visibleSummary[0] !== before.selectValue) {
    issues.push(`case1:summary-out-of-sync:${JSON.stringify(afterRtx.visibleSummary)}`);
  }
  await page.evaluate(() => document.getElementById('rtx-native-runtime-explainer-close')?.click());

  // --- Case 2: a real profile is pending and unsaved. The restore must give
  // that profile back, not the one already committed. ---
  await selectProfile('balanced');
  const pending = await readState();
  if (pending.selectValue !== 'balanced') issues.push('case2:balanced-not-selectable');
  await selectProfile(RTX_NATIVE_RUNTIME_OPTION_VALUE);
  const afterRtx2 = await readState();
  if (!afterRtx2.dialogOpen) issues.push('case2:dialog-did-not-open');
  if (afterRtx2.selectValue !== 'balanced') {
    issues.push(`case2:pending-choice-discarded:${String(afterRtx2.selectValue)}`);
  }
  if (afterRtx2.graphics !== before.graphics) issues.push('case2:persisted-graphics-changed');
  await page.evaluate(() => document.getElementById('rtx-native-runtime-explainer-close')?.click());

  // --- Case 3: the handler still works afterwards. ---
  await selectProfile('performance');
  const afterProfile = await readState();
  if (afterProfile.selectValue !== 'performance') issues.push('case3:handler-poisoned');
  if (afterProfile.visibleSummary[0] !== 'performance') issues.push('case3:summary-not-updated');

  receipt = {
    schema: 'hf418-rtx-explainer/1',
    checkedAtIso: new Date().toISOString(),
    before,
    afterRtxNoPending: afterRtx,
    afterRtxWithPending: afterRtx2,
    afterRealProfile: afterProfile,
    pageErrors,
    issues,
  };
} finally {
  await browser.close();
}

mkdirSync(resolve(process.cwd(), OUT_DIR), { recursive: true });
writeFileSync(resolve(process.cwd(), OUT_DIR, 'rtx-explainer-receipt.json'),
  `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ issues, pageErrors: pageErrors.length }, null, 2));
if (issues.length > 0) process.exitCode = 1;
