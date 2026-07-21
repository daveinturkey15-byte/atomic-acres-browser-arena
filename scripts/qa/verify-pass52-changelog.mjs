import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const screenshotDir = process.env.QA_SCREENSHOT_DIR ?? '/tmp';
const browser = await chromium.launch({ headless: true });
const reports = [];
try {
  for (const profile of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
  ]) {
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile ?? false });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    const url = new URL(baseUrl);
    url.searchParams.set('render', 'compat');
    url.searchParams.set('seed', `pass52-changelog-${profile.name}`);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    const button = (await page.textContent('#last-updated-btn'))?.trim();
    await page.click('#last-updated-btn');
    await page.waitForFunction(() => document.querySelector('#changelog-panel')?.hidden === false);
    const state = await page.evaluate(() => {
      const panel = document.querySelector('#changelog-panel');
      const first = document.querySelector('#changelog-list > li');
      const rect = panel.getBoundingClientRect();
      return {
        entryCount: document.querySelectorAll('#changelog-list > li').length,
        firstId: first?.getAttribute('data-changelog-id'),
        firstTitle: first?.querySelector(':scope > strong')?.textContent?.trim(),
        firstAreas: [...first.querySelectorAll('.changelog-areas span')].map((node) => node.textContent?.trim()),
        firstTime: first?.querySelector('time')?.textContent?.trim(),
        firstDatetime: first?.querySelector('time')?.getAttribute('datetime'),
        liveBadge: first?.querySelector('.changelog-entry-pass b')?.textContent?.trim(),
        panelRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    const screenshot = `${screenshotDir}/pass52-changelog-${profile.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
    reports.push({ profile: profile.name, viewport: profile.viewport, button, errors, state, screenshot });
    if (button !== 'LAST RELEASE · 21 JUL 2026 · 19:47 BST') throw new Error(`${profile.name}: unexpected button ${button}`);
    if (errors.length || state.entryCount !== 8 || state.firstId !== 'pass52' || state.firstDatetime !== '2026-07-21T19:47:24+01:00'
      || state.liveBadge !== 'CURRENT LIVE' || !state.firstTime.includes('BST · UTC+1 · 19:47:24') || state.horizontalOverflow
      || state.panelRect.left < -1 || state.panelRect.right > profile.viewport.width + 1) throw new Error(`${profile.name}: ${JSON.stringify({ errors, state })}`);
    await context.close();
  }
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
}
