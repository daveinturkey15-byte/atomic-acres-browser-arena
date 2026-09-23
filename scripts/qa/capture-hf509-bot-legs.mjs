#!/usr/bin/env node
// HF-509 — bot crouch / prone leg capture.
//
// The owner's report is visual ("their legs get tangled up"), so the judge is a
// capture, per `game-animation-asset-pipeline`'s own rule that captures are the
// judge and a single view hides the defect. One bot is staged directly ahead of
// the camera with `placeBotAhead`, frozen with `setBotPresentation`, and shot in
// each of the four stances the report names, plus the two transitions.
//
// It also reads back whatever the runtime's own animation contract exposes for
// the staged bot, so the receipt carries numbers rather than only pixels.
//
// Headless, installed Chrome, one page, hard-bounded. Usage:
//   node scripts/qa/capture-hf509-bot-legs.mjs --url http://127.0.0.1:4255 \
//     --out docs/evidence/pass95/bot-anim-prone-crouch/after --label after
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:4255');
const ARENA = arg('--arena', 'atomic-acres');
const LABEL = arg('--label', 'after');
const OUT = resolve(process.cwd(), arg('--out', `docs/evidence/pass95/bot-anim-prone-crouch/${LABEL}`));
const RENDERER = arg('--renderer', 'webgpu');
mkdirSync(OUT, { recursive: true });

// The stances the report names, plus a moving crouch and a crawl, because the
// tangle the owner describes is a MOVING one: a static crouch never selects the
// lateral run whose ankles cross.
const STATIONS = [
  { name: 'stand-idle', stance: 'stand', speed: 0 },
  { name: 'crouch-idle', stance: 'crouch', speed: 0 },
  { name: 'crouch-walk', stance: 'crouch', speed: 2.4 },
  { name: 'prone-idle', stance: 'prone', speed: 0 },
  { name: 'prone-crawl', stance: 'prone', speed: 1.0 },
];

const errors = [];
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--window-position=-2400,-2400', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const receipt = { label: LABEL, arena: ARENA, renderer: RENDERER, stations: [], errors };
try {
  await page.goto(`${BASE}/?renderer=${RENDERER}&render=quality&seed=hf509`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  receipt.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.waitForTimeout(1_500);

  for (const station of STATIONS) {
    await page.evaluate(({ stance, speed }) => {
      window.__ATOMIC_ACRES_DEBUG__.setBotPresentation(stance, speed, 'carbine');
    }, station);
    const staged = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(3.4));
    // Long enough for the stance cross-fade (300-380 ms) to settle and for the
    // locomotion cycle to reach its worst phase at least once.
    await page.waitForTimeout(1_100);
    const sample = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const bot = (snapshot.bots ?? [])[0] ?? null;
      const contract = bot?.operatorModel?.animationContract ?? null;
      return {
        botId: bot?.id ?? null,
        stance: bot?.stance ?? null,
        activeClip: contract?.activeClip ?? bot?.operatorModel?.activeClip ?? null,
        pivotHeight: contract?.pivotHeight ?? null,
        pivotPitch: contract?.pivotPitch ?? null,
        posture: contract?.pass94 ?? contract?.posture ?? null,
        pass77: contract?.pass77 ?? null,
      };
    });
    const file = resolve(OUT, `${LABEL}-${station.name}.png`);
    await page.screenshot({ path: file });
    receipt.stations.push({ ...station, staged: staged?.bot ?? null, sample, screenshot: file });
    console.error(`[hf509] ${LABEL} ${station.name} clip=${sample.activeClip} stance=${sample.stance}`);
  }
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotPresentation(null); });
} finally {
  writeFileSync(resolve(OUT, `${LABEL}-receipt.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  await browser.close();
}
console.error(`[hf509] ${receipt.stations.length} stations, ${errors.length} page errors -> ${OUT}`);
