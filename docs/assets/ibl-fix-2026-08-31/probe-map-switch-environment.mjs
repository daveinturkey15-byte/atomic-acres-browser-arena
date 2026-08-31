#!/usr/bin/env node
/**
 * The map-switch half of the environment contract (2026-08-31).
 *
 * The first-arena probe proves the arena that CONSTRUCTS the TSL systems now
 * gets an environment. This one proves the other path still does, and that the
 * live gate - which now throws inside `configurePlayableArenaVisuals` - does
 * not take the map switch down with it.
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url')+1] : 'http://127.0.0.1:41999';
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--mute-audio','--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
const read = () => page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return {
    environment: s.environment?.name ?? null,
    environmentIntensity: s.environmentIntensity,
    background: s.background?.name ?? null,
    published: snap?.render?.atomicSignal?.advancedGraphics?.arenaEnvironment ?? null,
    appliedTslArenaDefinitions: snap?.render?.playableScene?.appliedTslArenaDefinitions ?? null,
  };
});
const enter = async (arena, viaMenu = false) => {
  if (viaMenu) {
    // A map switch is a MENU round trip. Calling selectArena from inside a live
    // match leaves the committed arena untouched, which is how the first run of
    // this probe measured four identical "switches".
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu(); });
    await page.waitForFunction(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return s.gameStarted === false || s.menuVisible === true;
    }, undefined, { timeout: 120_000 });
    await page.waitForTimeout(1_500);
  }
  await page.evaluate(async (a) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(a); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return s.matchPhase === 'active' && s.gameStarted === true; }, undefined, { timeout: 180_000 });
  await page.waitForTimeout(6_000);
  return read();
};
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=switch&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const report = { generatedAt: new Date().toISOString(), steps: [] };
report.steps.push({ step: 'first arena: atomic-acres', ...await enter('atomic-acres') });
report.steps.push({ step: 'switch 2: high-seas', ...await enter('high-seas', true) });
report.steps.push({ step: 'switch 3: test1', ...await enter('test1', true) });
report.steps.push({ step: 'switch 4: back to atomic-acres', ...await enter('atomic-acres', true) });
report.errors = errors;
for (const s of report.steps) console.log(s.step.padEnd(34), s.environment, 'intensity', s.environmentIntensity, 'expected', s.published?.expectedEnvironmentIntensity, 'source', s.published?.sourceTextureName, 'commits', s.appliedTslArenaDefinitions);
console.log('errors', JSON.stringify(errors.slice(0, 6)));
writeFileSync('docs/assets/ibl-fix-2026-08-31/map-switch-environment-report.json', `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
