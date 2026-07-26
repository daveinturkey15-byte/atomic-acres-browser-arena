import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const BASE_QUERY = '?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off';

async function stubExternalBoards(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ entries: [] }),
  }));
  await page.route('**/v1/streak', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ accepted: true }),
  }));
}

async function waitForPreview(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug?.snapshot();
    const frame = document.querySelector<HTMLElement>('#menu-preview-frame');
    return snapshot?.weaponReady === true
      && snapshot.bootstrap.stage === 'ready'
      && Number(frame?.dataset.visit) > 0
      && Boolean(frame?.dataset.presentation);
  }, undefined, { timeout: 30_000 });
}

async function cameraPosition(page: Page): Promise<number[]> {
  return page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().menuCamera as { position: number[] }
  ).position);
}

function travel(from: readonly number[], to: readonly number[]): number {
  return Math.hypot(...to.map((value, index) => value - (from[index] ?? 0)));
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const directory = resolve(process.cwd(), 'artifacts/pass65/preview-choreography');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test.describe('Pass 65 menu preview choreography', () => {
  test.beforeEach(async ({ page }) => stubExternalBoards(page));

  test('advances a bounded seeded helicopter pose without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/${BASE_QUERY}&seed=pass65-live-preview`);
    await waitForPreview(page);
    const before = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('#menu-preview-frame')!;
      return {
        position: (window.__ATOMIC_ACRES_DEBUG__.snapshot().menuCamera as { position: number[] }).position,
        phase: Number(frame.dataset.phase),
        pitch: Number(frame.dataset.pitch),
        yaw: Number(frame.dataset.yaw),
        bank: Number(frame.dataset.bank),
        altitude: Number(frame.dataset.altitudeOffset),
        speed: Number(frame.dataset.speedScale),
        cockpit: document.querySelector<HTMLElement>('.preview-helicopter')?.dataset.cockpitAsset,
      };
    });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>('#menu-preview-frame')!;
      return {
        position: (window.__ATOMIC_ACRES_DEBUG__.snapshot().menuCamera as { position: number[] }).position,
        phase: Number(frame.dataset.phase),
      };
    });
    expect(errors).toEqual([]);
    expect(after.phase - before.phase).toBeGreaterThan(0.1);
    expect(travel(before.position, after.position)).toBeGreaterThan(0.2);
    expect(Math.abs(before.pitch)).toBeLessThanOrEqual(0.9);
    expect(Math.abs(before.yaw)).toBeLessThanOrEqual(1.4);
    expect(Math.abs(before.bank)).toBeLessThanOrEqual(2.3);
    expect(Math.abs(before.altitude)).toBeLessThanOrEqual(0.85);
    expect(before.speed).toBeGreaterThanOrEqual(0.92);
    expect(before.speed).toBeLessThanOrEqual(1.08);
    expect(before.cockpit).toBe('pass65-sleek-cockpit-v1');
  });

  test('captures every deterministic helicopter and cat composition at 1440p', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto(`/${BASE_QUERY}&seed=pass65-capture&previewTime=6500`);
    await waitForPreview(page);
    let firstAtomicVisit = 0;
    let firstAtomicFlightSignature = '';
    for (const [arenaId, frame, presentation] of [
      ['atomic-acres', 'helicopter', 'menu-helo-nuke-town-v1'],
      ['skyline-terminal', 'helicopter', 'menu-helo-terminal-v1'],
      ['rustworks-1v1', 'helicopter', 'menu-helo-rustrig-v1'],
      ['gun-range', 'cat', 'menu-cat-gun-range-v1'],
    ] as const) {
      await page.locator(`.map-card[data-arena-id="${arenaId}"]`).click();
      await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-arena', arenaId);
      await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-frame', frame);
      await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-presentation', presentation);
      if (arenaId === 'atomic-acres') {
        const frameData = page.locator('#menu-preview-frame');
        firstAtomicVisit = Number(await frameData.getAttribute('data-visit'));
        firstAtomicFlightSignature = await frameData.evaluate((element) => [
          element.dataset.pitch,
          element.dataset.yaw,
          element.dataset.bank,
          element.dataset.altitudeOffset,
        ].join(':'));
      }
      await capture(page, testInfo, `${arenaId}-preview-2560x1440`);
    }
    await expect(page.locator('#menu-preview-motion')).toContainText('FIRST-PERSON PROWL');

    await page.locator('.map-card[data-arena-id="atomic-acres"]').click();
    const frameData = page.locator('#menu-preview-frame');
    await expect(frameData).toHaveAttribute('data-arena', 'atomic-acres');
    await expect.poll(async () => Number(await frameData.getAttribute('data-visit'))).toBeGreaterThan(firstAtomicVisit);
    await expect.poll(async () => frameData.evaluate((element) => [
      element.dataset.pitch,
      element.dataset.yaw,
      element.dataset.bank,
      element.dataset.altitudeOffset,
    ].join(':'))).not.toBe(firstAtomicFlightSignature);
  });

  test('holds useful helicopter and cat compositions under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${BASE_QUERY}&seed=pass65-reduced-motion`);
    await waitForPreview(page);
    const helicopterBefore = await cameraPosition(page);
    await page.waitForTimeout(350);
    expect(await cameraPosition(page)).toEqual(helicopterBefore);
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-motion', 'static');
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-moment', 'STABILIZED SHOWCASE');

    await page.locator('.map-card[data-arena-id="gun-range"]').click();
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-frame', 'cat');
    const catBefore = await cameraPosition(page);
    await page.waitForTimeout(350);
    expect(await cameraPosition(page)).toEqual(catBefore);
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-moment', 'CURIOUS RANGE WATCH');
    await expect(page.locator('#menu-preview-motion')).toHaveText('FIRST-PERSON HOLD');
  });
});
