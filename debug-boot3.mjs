import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2');
await page.waitForTimeout(6000);
const info = await page.evaluate(() => ({
  url: location.href,
  menuVisible: !!document.querySelector('#menu'),
  fatal: !!document.querySelector('#fatal-error, .fatal-error, #fatal'),
  fatalText: document.querySelector('#fatal-error, .fatal-error, #fatal')?.textContent?.slice(0, 400) ?? null,
  bodyText: document.body.innerText.slice(0, 500),
  hasDebug: typeof window.__ATOMIC_ACRES_DEBUG__?.snapshot === 'function',
}));
console.log(JSON.stringify(info, null, 1));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 6), null, 1));
await browser.close();
