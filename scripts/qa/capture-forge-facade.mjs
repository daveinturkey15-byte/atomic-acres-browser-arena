#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(process.cwd());
const lane = resolve(root, '..', '..', 'Desktop', 'stuff', 'aa-day-2026-09-06', 'lanes', 'night-luna');
const renders = resolve(lane, 'renders');
const dist = resolve(root, 'dist-facade');
mkdirSync(renders, { recursive: true });

const lock = resolve(process.env.TEMP ?? '.', 'aa-heavy.lock');
let lockHeld = false;
for (let attempt = 0; attempt < 3 && !lockHeld; attempt += 1) {
  try { mkdirSync(lock); writeFileSync(resolve(lock, 'owner.json'), JSON.stringify({ lane: 'night-luna', port: 4315, pid: process.pid, acquiredUtc: new Date().toISOString() })); lockHeld = true; }
  catch { await new Promise((resolveWait) => setTimeout(resolveWait, 20_000)); }
}
if (!lockHeld) throw new Error(`heavy lock is held: ${lock}`);

const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--host', '127.0.0.1', '--port', '4315', '--strictPort'], {
  cwd: root, stdio: 'ignore', shell: process.platform === 'win32',
});
let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  if (server.pid != null) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  if (existsSync(lock)) {
    const owner = resolve(lock, 'owner.json');
    if (existsSync(owner) && readFileSync(owner, 'utf8').includes('night-luna')) {
      try { spawnSync('powershell', ['-NoProfile', '-Command', `Remove-Item -LiteralPath '${lock.replaceAll("'", "''")}' -Recurse -Force -ErrorAction SilentlyContinue`], { stdio: 'ignore' }); } catch { /* evidence remains */ }
    }
  }
};
process.once('exit', cleanup);
process.once('SIGINT', () => { cleanup(); process.exit(130); });
process.once('uncaughtException', (error) => { console.error(error); cleanup(); process.exit(1); });
process.once('unhandledRejection', (error) => { console.error(error); cleanup(); process.exit(1); });
const base = 'http://127.0.0.1:4315/forge-facade.html';
for (let attempt = 0; attempt < 120; attempt += 1) {
  try { if ((await fetch(`${base}?mode=after&view=front`)).ok) break; } catch { /* preview is starting */ }
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  if (server.exitCode !== null) throw new Error(`vite preview exited ${server.exitCode}`);
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
page.on('requestfailed', (request) => { errors.push(`REQUEST FAILED ${request.url()} ${request.failure()?.errorText ?? ''}`); });
for (const view of ['front', 'three-quarter', 'window-close']) {
  for (const mode of ['before', 'after']) {
    errors.length = 0;
    await page.goto(`${base}?mode=${mode}&view=${view}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__FACADE_READY__?.backend === 'webgpu', undefined, { timeout: 120_000 });
    await page.screenshot({ path: resolve(renders, `facade-${view}-${mode}.png`), animations: 'disabled' });
    if (errors.length) throw new Error(`${mode}/${view} browser errors: ${JSON.stringify(errors)}`);
  }
}
await browser.close();

// Compose a sharp, lossless-ish contact sheet in the browser so the PNGs are
// not re-encoded by a platform image utility. JPEG is used only for the
// owner-facing sheet, at quality 94, while each source PNG remains untouched.
const sheet = await chromium.launch({ headless: true, channel: 'chrome' });
const sheetPage = await sheet.newPage({ viewport: { width: 1320, height: 1220 }, deviceScaleFactor: 1 });
const cells = [];
for (const view of ['front', 'three-quarter', 'window-close']) {
  for (const mode of ['before', 'after']) {
    const image = readFileSync(resolve(renders, `facade-${view}-${mode}.png`)).toString('base64');
    cells.push(`<figure><figcaption>${view} · ${mode}</figcaption><img src="data:image/png;base64,${image}"></figure>`);
  }
}
await sheetPage.setContent(`<style>body{margin:0;background:#263136;color:#fff8e9;font:16px system-ui;display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px}figure{margin:0}figcaption{padding:6px 0;font-weight:650;letter-spacing:.06em;text-transform:uppercase}img{display:block;width:640px;height:360px;object-fit:cover}</style>${cells.join('')}`);
await sheetPage.screenshot({ path: resolve(renders, 'FACADE-SHEET.jpg'), type: 'jpeg', quality: 94 });
await sheet.close();

cleanup();
console.log(JSON.stringify({ renders, sheet: resolve(renders, 'FACADE-SHEET.jpg'), errors }, null, 2));
