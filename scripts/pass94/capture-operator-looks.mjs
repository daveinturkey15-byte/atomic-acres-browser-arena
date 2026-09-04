/**
 * PASS 94 — headless capture of the operator look and gait sheets.
 *
 * Drives `dev/pass94-operator-looks.html`, which builds operators through the
 * shipped `buildOperator` / `poseOperator` path. Four sheets:
 *
 *   gaits-procedural.png   one bot in every locomotion and posture state
 *   skins-procedural.png   four skins x two teams, procedural TSL looks
 *   skins-tinted.png       the same eight, with the look gate closed - i.e. the
 *                          shipped multiply-tint path, same renderer, same
 *                          lights, same poses, so the pair is an honest A/B
 *   gaits-tinted.png       the gait sheet on the shipped materials
 *
 * Usage: node scripts/pass94/capture-operator-looks.mjs [--port 4311]
 * Requires a vite dev server; it starts and stops its own.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] ?? 4311);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad port ${port}`);
// 4296-4302 belong to other lanes and to the owner's HITL preview.
if (port >= 4296 && port <= 4302) throw new Error(`port ${port} is reserved for other lanes`);

const root = process.cwd();
const outputDir = resolve(root, 'docs/evidence/pass94/animation-skins/captures');
mkdirSync(outputDir, { recursive: true });

const SHEETS = [
  { name: 'gaits-procedural', mode: 'gaits', looks: 'procedural' },
  { name: 'gaits-tinted', mode: 'gaits', looks: 'tinted' },
  { name: 'skins-procedural', mode: 'skins', looks: 'procedural' },
  { name: 'skins-tinted', mode: 'skins', looks: 'tinted' },
];

function startVite() {
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  return new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error('vite did not start in 60 s')), 60_000);
    const onData = (chunk) => {
      const text = String(chunk);
      process.stdout.write(`[vite] ${text}`);
      if (text.includes('ready in') || text.includes(`:${port}/`)) {
        clearTimeout(timer);
        resolveReady(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      rejectReady(new Error(`vite exited early with ${code}`));
    });
  });
}

const vite = await startVite();
const browser = await chromium.launch({
  headless: true,
  args: [
    '--headless=new',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=d3d11',
    '--window-position=2560,0',
  ],
});

const receipt = { capturedAt: new Date().toISOString(), sheets: [], consoleErrors: [] };

try {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1400 } });
  page.on('console', (message) => {
    if (message.type() === 'error') receipt.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => receipt.consoleErrors.push(`pageerror: ${error.message}`));

  for (const sheet of SHEETS) {
    const url = `http://127.0.0.1:${port}/dev/pass94-operator-looks.html?mode=${sheet.mode}&looks=${sheet.looks}`;
    process.stdout.write(`\ncapturing ${sheet.name} -> ${url}\n`);
    await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForSelector('body[data-capture-ready="1"]', { timeout: 180_000 });
    const status = await page.textContent('#status');
    const element = await page.waitForSelector('#sheet');
    const path = resolve(outputDir, `${sheet.name}.png`);
    await element.screenshot({ path });
    receipt.sheets.push({ name: sheet.name, url, status, path });
    process.stdout.write(`  ${status}\n  wrote ${path}\n`);
  }
} finally {
  await browser.close();
  vite.kill();
}

writeFileSync(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
process.stdout.write(`\nconsole errors: ${receipt.consoleErrors.length}\n`);
for (const error of receipt.consoleErrors.slice(0, 10)) process.stdout.write(`  ${error}\n`);
