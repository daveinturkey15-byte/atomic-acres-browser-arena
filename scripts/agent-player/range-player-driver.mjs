#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { associateRangeTarget, findCyanRangeTargets } from './range-target-vision.mjs';

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
function argsFrom(argv) { const out = {}; for (let i = 0; i < argv.length; i += 1) { const t = argv[i]; if (!t.startsWith('--')) throw new Error(`Unexpected argument ${t}`); out[t.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } return out; }
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
function parseRangeHud(text = '') { const m = String(text).match(/GUN RANGE\s*·\s*SCORE\s*(\d+)\s*·\s*(\d+)\s*HITS/i); return m ? { score: Number(m[1]), hits: Number(m[2]) } : null; }
async function trustedLocatorClick(page, locator) { const box = await locator.boundingBox(); if (!box) throw new Error('Visible trusted click target unavailable'); await page.bringToFront(); const cdp = await page.context().newCDPSession(page); const x = box.x + box.width / 2; const y = box.y + box.height / 2; await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); }
async function trustedClick(page, selector) { await trustedLocatorClick(page, page.locator(selector)); }
async function clickVisibleExact(page, text) { const nodes = page.getByText(text, { exact: true }); for (let i = 0; i < await nodes.count(); i += 1) { const node = nodes.nth(i); if (await node.isVisible()) { await node.click(); return; } } throw new Error(`No visible exact text: ${text}`); }
async function moveAim(page, x, y) { await page.evaluate(({ mx, my }) => window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: mx, movementY: my })), { mx: x, my: y }); }
async function firePulse(page, pulseMs) { await page.evaluate(() => { const c = document.querySelector('#game'); window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2 })); c?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2 })); window.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 3 })); c?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 3 })); }); await sleep(pulseMs); await page.evaluate(() => { const c = document.querySelector('#game'); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 2 })); c?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 2 })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0 })); c?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0 })); }); }
async function capture(page) { const jpeg = await page.screenshot({ type: 'jpeg', quality: 78 }); const { data, info } = await sharp(jpeg).resize({ width: 320, height: 180, fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { jpeg, width: info.width, height: info.height, targets: findCyanRangeTargets(data, info.width, info.height, info.channels) }; }
function targetNearestCentre(frame) { const cx = frame.width / 2; const cy = frame.height / 2; return frame.targets.map((target) => ({ target, distance: Math.hypot(target.x - cx, target.y - cy) })).sort((a, b) => a.distance - b.distance)[0]?.target ?? null; }
async function hud(page) { return page.evaluate(() => ({ mode: document.querySelector('#match-mode-label')?.textContent?.trim() ?? null, objective: document.querySelector('#objective')?.textContent?.trim() ?? null, weapon: document.querySelector('#weapon-name')?.textContent?.trim() ?? null, ammo: Number(document.querySelector('#ammo')?.textContent?.match(/\d+/)?.[0] ?? NaN), pointer: Boolean(document.pointerLockElement), focused: document.hasFocus(), summary: Boolean(document.querySelector('#download-match-summary')) })); }
async function aimAtVisibleTarget(page, evidenceDirectory, firstEvidence) { const cx = 160; const cy = 90; let selected = null; for (let step = 0; step < 12; step += 1) { const frame = await capture(page); selected = selected ? associateRangeTarget(selected, frame.targets, 18)?.target ?? targetNearestCentre(frame) : targetNearestCentre(frame); if (!selected) { await sleep(80); continue; } if (firstEvidence && step === 0) await writeFile(resolve(evidenceDirectory, 'first-range-target.jpg'), frame.jpeg); const dx = selected.x - cx; const dy = selected.y - cy; if (Math.hypot(dx, dy) <= 2.5) return { target: selected, error: Math.hypot(dx, dy) }; await moveAim(page, clamp(dx * 4, -90, 90), clamp(dy * 4, -90, 90)); await sleep(70); selected = null; } return null; }
async function download(page, selector, path) { const event = page.waitForEvent('download', { timeout: 20_000 }); await page.locator(selector).click({ timeout: 20_000 }); const file = await event; await file.saveAs(path); return JSON.parse(await readFile(path, 'utf8')); }

export async function runRange(args) {
  const output = resolve(String(args.output ?? 'artifacts/agent-player/range-run'));
  const pulseMs = clamp(Number(args['pulse-ms'] ?? 72), 20, 250);
  const cadenceMs = clamp(Number(args['cadence-ms'] ?? 300), pulseMs + 30, 1200);
  const url = String(args.url);
  await mkdir(output, { recursive: true });
  const browser = await chromium.connectOverCDP(String(args.cdp ?? 'http://127.0.0.1:9333'));
  const context = browser.contexts()[0]; const page = context.pages()[0]; const errors = []; const actions = []; let releasedAtEnd = false;
  page.on('pageerror', (error) => errors.push(String(error)));
  const startedAt = new Date(); let startedFireAt = null; let pulseCount = 0; let reloadCount = 0; let firstEvidence = true; let invalidReason = null; let finalHud = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.locator('#menu').waitFor({ state: 'visible', timeout: 120_000 });
    await clickVisibleExact(page, 'GUN RANGE'); await sleep(500);
    const selectedText = await page.locator('#network-status').innerText();
    if (!/Gun Range selected\s*·\s*2 MIN\s*·\s*6P FFA\s*·\s*NO BOTS/i.test(selectedText)) throw new Error(`Visible Gun Range receipt missing: ${selectedText}`);
    await page.screenshot({ path: resolve(output, 'range-selected.png') });
    await trustedClick(page, '#solo');
    await page.waitForFunction(() => document.querySelector('#match-mode-label')?.textContent?.includes('TARGET DRILL'), null, { timeout: 30_000 });
    await sleep(3500); await page.screenshot({ path: resolve(output, 'range-spawn.png') });
    let current = await hud(page);
    if (!current.pointer || !current.focused) throw new Error('Visible live-range pointer/focus receipt missing before bench movement');
    await page.keyboard.down('KeyA'); await sleep(1000); await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW');
    const pickupAdjustments = [['KeyF', 0], ['KeyA', 300], ['KeyW', 220], ['KeyD', 180], ['KeyA', 360], ['KeyW', 260]];
    current = await hud(page);
    for (const [code, duration] of pickupAdjustments) {
      if (current.weapon === 'VECTORLINE SMG') break;
      if (duration > 0) { await page.keyboard.down(code); await sleep(duration); await page.keyboard.up(code); }
      await page.keyboard.press('KeyF'); await sleep(220);
      current = await hud(page);
    }
    if (current.weapon !== 'VECTORLINE SMG') throw new Error(`Visible weapon pickup failed: ${current.weapon}`);
    if (current.mode !== 'TARGET DRILL') throw new Error(`Visible range mode lost: ${current.mode}`);
    if (!current.pointer) {
      if (await page.locator('#menu').isVisible().catch(() => false)) {
        await clickVisibleExact(page, 'DEPLOY');
        const resumeNodes = page.getByText('RETURN TO MATCH', { exact: true });
        let resumed = false;
        for (let i = 0; i < await resumeNodes.count(); i += 1) {
          const node = resumeNodes.nth(i);
          if (await node.isVisible()) { await trustedLocatorClick(page, node); resumed = true; break; }
        }
        if (!resumed) throw new Error('Visible RETURN TO MATCH control missing after SMG pickup');
      } else {
        await trustedClick(page, '#game');
      }
      await sleep(220);
      current = await hud(page);
    }
    if (!current.pointer || !current.focused) throw new Error('Visible post-pickup pointer/focus receipt missing');
    await page.screenshot({ path: resolve(output, 'vectorline-smg-picked.png') });
    startedFireAt = new Date();
    let previousPulseAt = 0;
    while (Date.now() - startedAt.getTime() < 128_000) {
      current = await hud(page); finalHud = current;
      if (current.summary) break;
      if (current.mode !== 'TARGET DRILL' || current.weapon !== 'VECTORLINE SMG') { invalidReason = `visible-state-mismatch:${current.mode}:${current.weapon}`; break; }
      if (!current.focused || !current.pointer) { invalidReason = 'focus-or-pointer-loss'; break; }
      if (Number.isFinite(current.ammo) && current.ammo <= 4) { await page.keyboard.press('KeyR'); reloadCount += 1; actions.push({ atMs: Date.now() - startedAt.getTime(), kind: 'reload', ammo: current.ammo }); await sleep(1450); continue; }
      const elapsedSincePulse = Date.now() - previousPulseAt;
      if (elapsedSincePulse < cadenceMs) { await sleep(Math.min(40, cadenceMs - elapsedSincePulse)); continue; }
      const aimed = await aimAtVisibleTarget(page, output, firstEvidence);
      firstEvidence = false;
      if (!aimed) { await sleep(80); continue; }
      const before = await capture(page); await sleep(45); const after = await capture(page);
      const beforeTarget = targetNearestCentre(before); const associated = associateRangeTarget(beforeTarget, after.targets, 8)?.target;
      const centreError = associated ? Math.hypot(associated.x - 160, associated.y - 90) : Infinity;
      if (!associated || centreError > 2.8) { await sleep(50); continue; }
      const beforeHud = parseRangeHud(current.objective);
      previousPulseAt = Date.now(); await firePulse(page, pulseMs); pulseCount += 1;
      actions.push({ atMs: previousPulseAt - startedAt.getTime(), kind: 'smg-pulse', pulseMs, centreError, scoreBefore: beforeHud?.score ?? null, hitsBefore: beforeHud?.hits ?? null });
    }
    await page.evaluate(() => { const c = document.querySelector('#game'); for (const button of [0, 2]) { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button, buttons: 0 })); c?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button, buttons: 0 })); } });
    await page.locator('#download-match-summary').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    finalHud = await hud(page);
    await page.screenshot({ path: resolve(output, 'range-final.png') });
    const summaryVisible = await page.locator('#download-match-summary').isVisible().catch(() => false);
    const technicalVisible = await page.locator('#download-match-technical').isVisible().catch(() => false);
    const summary = summaryVisible ? await download(page, '#download-match-summary', resolve(output, 'match-summary.json')) : null;
    const technical = technicalVisible ? await download(page, '#download-match-technical', resolve(output, 'match-technical.json')) : null;
    await writeFile(resolve(output, 'actions.json'), `${JSON.stringify(actions, null, 2)}\n`);
    const report = { schemaVersion: 1, kind: 'atomic-player-range-run', startedAt: startedAt.toISOString(), endedAt: new Date().toISOString(), source: { url, pass: 'PASS 63' }, protocol: { activity: 'gun-range', durationSeconds: 120, targetValue: 100, weapon: 'VECTORLINE SMG', pulseMs, cadenceMs }, receipts: { selectedGunRange: true, selectedText, observedWeapon: 'VECTORLINE SMG', mode: 'TARGET DRILL' }, input: { pulseCount, reloadCount, releasedAtEnd: true }, outcome: { invalidReason, finalHud: parseRangeHud(finalHud?.objective), summaryDownloaded: Boolean(summary), technicalDownloaded: Boolean(technical), officialSummary: summary }, browser: { pageErrors: errors } };
    await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`); releasedAtEnd = true; return report;
  } finally {
    try { await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW'); await page.keyboard.up('KeyR'); await page.evaluate(() => { const c = document.querySelector('#game'); for (const button of [0, 2]) { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button, buttons: 0 })); c?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button, buttons: 0 })); } }); releasedAtEnd = true; } catch {}
    if (!releasedAtEnd) await writeFile(resolve(output, 'release-failure.txt'), 'Input release receipt failed\n').catch(() => undefined);
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) runRange(argsFrom(process.argv.slice(2))).then((report) => console.log(JSON.stringify({ score: report.outcome.officialSummary?.stats?.score ?? report.outcome.finalHud?.score ?? null, hits: report.outcome.officialSummary?.stats?.hits ?? report.outcome.finalHud?.hits ?? null, pulses: report.input.pulseCount, invalidReason: report.outcome.invalidReason }))).catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
