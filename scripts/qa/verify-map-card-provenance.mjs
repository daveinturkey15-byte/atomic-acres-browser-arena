// Verifies the per-map authoring provenance actually RENDERS on the menu cards:
// correct text, and not wrapped into the card's narrow 31px grid column.
// Headless. Never opens a window on the owner's display.
import { chromium } from '@playwright/test';

const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:41933/';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.map-card', { timeout: 60_000 });

const cards = await page.$$eval('.map-card', (nodes) => nodes.map((card) => {
  const label = card.querySelector('span')?.textContent?.trim() ?? '';
  const note = card.querySelector('.map-authoring');
  const badge = card.querySelector('.map-prototype');
  const noteBox = note?.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  return {
    label,
    arenaId: card.dataset.arenaId,
    note: note?.textContent?.trim() ?? null,
    prototype: badge ? badge.textContent.trim() : null,
    // Fraction of the card's width the note occupies. A note trapped in the
    // 31px column reads far below 0.5 and wraps to one word per line.
    noteWidthFraction: noteBox && cardBox.width ? noteBox.width / cardBox.width : null,
    noteHeight: noteBox ? Math.round(noteBox.height) : null,
  };
}));

console.log(JSON.stringify(cards, null, 2));

let failures = 0;
for (const card of cards) {
  if (!card.note) { console.error(`FAIL ${card.arenaId}: no provenance note rendered`); failures += 1; continue; }
  const expected = card.arenaId === 'atomic-acres' ? 'IMPORTED ASSETS' : 'ALL CODE BUILD, NO ASSET IMPORT';
  if (card.note !== expected) { console.error(`FAIL ${card.arenaId}: note is "${card.note}", expected "${expected}"`); failures += 1; }
  if (card.noteWidthFraction !== null && card.noteWidthFraction < 0.6) {
    console.error(`FAIL ${card.arenaId}: note spans only ${(card.noteWidthFraction * 100).toFixed(0)}% of the card - it is trapped in the narrow grid column`);
    failures += 1;
  }
  if (card.noteHeight !== null && card.noteHeight > 34) {
    console.error(`FAIL ${card.arenaId}: note is ${card.noteHeight}px tall - it has wrapped badly`);
    failures += 1;
  }
}
await page.screenshot({ path: 'docs/assets/map-card-provenance.png', clip: { x: 0, y: 0, width: 1600, height: 950 } });
await browser.close();
console.log(failures === 0 ? 'PASS: every map card states its origin, on one readable line' : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
