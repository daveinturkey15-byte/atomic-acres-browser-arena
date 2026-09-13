#!/usr/bin/env node
// ===========================================================================
// PASS 87 Lane AR, item 1 - names what makes the deployment shell overflow.
//
// tests/e2e/pass64-hud-menu.spec.ts reports one number per viewport
// (menuOverflowX), and Lane Y's reading of it was that eight-plus arena cards
// no longer fit. This instrument exists because that reading was wrong and a
// single number could not say so: the overflow was a flat ~19% of the SHELL at
// every width from 390 px to 3440 px, which is not what a card grid does.
//
// Per review viewport it measures menuOverflowX, which descendants report
// content past the shell's right edge, the number with all pseudo-elements
// suppressed, and then the number with each candidate pseudo-element
// suppressed on its own. The last one is the answer: a pseudo-element has no
// DOM node, so a walk over `children` cannot see it, and
// `#menu.pass64-command-deck::after` - a decorative bloom at `inset: -20%` -
// was the entire overflow.
//
// Headless only (owner instruction 2026-09-02 12:40). Needs a served build:
//   QA_BASE_URL=http://127.0.0.1:4173 node scripts/qa/probe-menu-overflow.mjs
// ===========================================================================
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4173';
const VIEWPORTS = [
  { id: 'narrow', width: 390, height: 844 },
  { id: 'laptop', width: 1280, height: 720 },
  { id: 'review', width: 1600, height: 900 },
  { id: 'desktop', width: 1920, height: 1080 },
  { id: 'owner', width: 2560, height: 1440 },
  { id: 'ultrawide', width: 3440, height: 1440 },
];

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

const rows = [];
for (const viewport of VIEWPORTS) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(400);
  const report = await page.evaluate(() => {
    const menu = document.querySelector('#menu');
    const base = menu.scrollWidth;
    const measureWithout = (selector) => {
      const style = document.createElement('style');
      style.textContent = selector + '{display:none!important}';
      document.head.appendChild(style);
      const width = menu.scrollWidth;
      style.remove();
      return width;
    };
    const withoutPseudos = measureWithout('#menu::before,#menu::after,#menu *::before,#menu *::after');
    const perSelector = {};
    const candidates = [
      '#menu::before', '#menu::after',
      '.pass64-command-deck.panel::before', '#menu-showcase::before',
      '.menu-tabs button.active::after', '.command-brand strong::after',
      '#menu .command-header::before', '#menu .command-header::after',
      '#menu .command-rail::before', '#menu .command-rail::after',
      '#menu .command-workspace::before', '#menu .command-workspace::after',
      '#menu .deployment-manifest::before', '#menu .deployment-manifest::after',
      '#menu .arena-command::before', '#menu .arena-command::after',
      '#menu .cockpit-instruments::before', '#menu .cockpit-instruments::after',
      '#menu .map-selector::before', '#menu .map-selector::after',
      '#menu .map-card::before', '#menu .map-card::after',
      '#menu .menu-panel::before', '#menu .menu-panel::after',
      '#menu section::before', '#menu section::after',
      '#menu div::before', '#menu div::after',
      '#menu aside::before', '#menu aside::after',
      '#menu header::before', '#menu header::after',
      '#menu button::before', '#menu button::after',
      '#menu span::before', '#menu span::after',
    ];
    for (const selector of candidates) {
      const width = measureWithout(selector);
      if (base - width > 4) perSelector[selector] = base - width;
    }
    const cs = getComputedStyle(menu);
    // Which single descendant, when its width is clamped, removes the overflow?
    const all = [...menu.querySelectorAll('*')];
    const wide = all
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        cls: (el.className && String(el.className).slice(0, 60)) || null,
        offsetLeft: el.offsetLeft,
        offsetWidth: el.offsetWidth,
        right: el.offsetLeft + el.offsetWidth,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }))
      .filter((row) => row.right > menu.clientWidth + 1 || row.scrollWidth - row.clientWidth > 30)
      .sort((a, b) => (b.right - a.right) || (b.scrollWidth - a.scrollWidth))
      .slice(0, 8);
    return {
      menuClientWidth: menu.clientWidth,
      menuScrollWidth: base,
      menuOverflowX: base - menu.clientWidth,
      withoutPseudos,
      perSelector,
      menuStyle: {
        position: cs.position, overflow: cs.overflow, display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns, padding: cs.padding, width: cs.width,
        transform: cs.transform, zoom: cs.zoom, contain: cs.contain,
      },
      cards: document.querySelectorAll('.map-card').length,
      wide,
    };
  });
  rows.push({ viewport: viewport.id, ...report });
}
await browser.close();
console.log(JSON.stringify(rows, null, 2));
