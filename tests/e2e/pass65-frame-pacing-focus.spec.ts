import { expect, test } from '@playwright/test';

type Pacing = {
  ready: boolean;
  sampleCount: number;
  cadenceHz: number;
  lastResetReason: string | null;
};

const pacing = () => (
  window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => { render: { framePacing: Pacing } } } }
).__ATOMIC_ACRES_DEBUG__.snapshot().render.framePacing;

test('resets stale frame-pacing evidence through the visibility-regain recovery path', async ({ page }) => {
  await page.goto('/?renderer=webgl2&signal=off&seed=pass65-focus-pacing', { waitUntil: 'domcontentloaded' });
  await page.fill('#player-name', 'Focus pacing QA');
  await page.click('#solo');
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => { gameStarted: boolean } } }
  ).__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => { render: { framePacing: Pacing } } } }
  ).__ATOMIC_ACRES_DEBUG__?.snapshot().render.framePacing.ready === true, undefined, { timeout: 60_000 });
  const before = await page.evaluate(pacing);
  expect(before.sampleCount).toBeGreaterThanOrEqual(90);

  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { recoverFromVisibilityRegain: () => void } }
  ).__ATOMIC_ACRES_DEBUG__.recoverFromVisibilityRegain());
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => { render: { framePacing: Pacing } } } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().render.framePacing.lastResetReason === 'tab visibility regained');

  const recovered = await page.evaluate(pacing);
  expect(recovered.lastResetReason).toBe('tab visibility regained');
  expect(recovered.sampleCount).toBeLessThan(30);
  expect(recovered.sampleCount).toBeLessThan(before.sampleCount);
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => { render: { framePacing: Pacing } } } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().render.framePacing.sampleCount >= 10);
  expect((await page.evaluate(pacing)).cadenceHz).toBeGreaterThan(0);
});
