// Read-only probe: drive the REAL menu for high-seas and sample #status during the stall.
import { chromium } from '@playwright/test';

const URL = 'http://127.0.0.1:4292/?release=latest&renderer=webgpu&grass=off&mist=off&clouds=off&rays=off&seed=arena-boot-smoke&previewTime=0';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio', '--enable-unsafe-webgpu', '--disable-background-timer-throttling',
         '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
         '--window-position=-32000,-32000', '--window-size=2640,1520'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 200)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 90_000 });

const mode = process.argv[2] ?? 'debug';
if (mode === 'menu') {
  // Real-player path: click the High Seas card in the arena chooser, then deploy.
  const card = page.locator('text=/high\s*seas/i').first();
  await card.click({ timeout: 15_000 }).catch((e) => console.log('CARD CLICK FAILED', String(e).slice(0, 200)));
  await page.waitForTimeout(500);
  const deploy = page.locator('button:has-text("Solo"), button:has-text("Deploy"), button:has-text("Skirmish")').first();
  await deploy.click({ timeout: 15_000 }).catch((e) => console.log('DEPLOY CLICK FAILED', String(e).slice(0, 200)));
} else {
  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
  const selected = await page.evaluate(() => document.documentElement.dataset.arenaId ?? null);
  console.log('SELECTED-ARENA-DATASET:', selected);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
}

const seen = [];
const start = Date.now();
while (Date.now() - start < 130_000) {
  const s = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snap = api?.snapshot?.() ?? null;
    return {
      status: (document.querySelector('#status')?.textContent ?? '').slice(0, 160),
      stage: document.documentElement.dataset.bootstrapStage ?? null,
      arenaId: document.documentElement.dataset.arenaId ?? null,
      gameplayArena: document.documentElement.dataset.gameplayArena ?? null,
      phase: snap?.matchPhase ?? null,
      started: snap?.gameStarted ?? null,
    };
  }).catch(() => null);
  if (!s) break;
  const key = JSON.stringify(s);
  if (seen[seen.length - 1] !== key) {
    seen.push(key);
    console.log(`t+${((Date.now() - start) / 1000).toFixed(1)}s`, key);
  }
  if (s.phase === 'active' && s.started === true) { console.log('REACHED ACTIVE'); break; }
  await page.waitForTimeout(1000);
}
console.log('CONSOLE ERRORS (' + consoleErrors.length + '):');
for (const e of consoleErrors.slice(0, 10)) console.log('  ', e);
await browser.close();
