import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const renderer = process.env.PASS66_ADS_RENDERER ?? 'webgl2';
const renderProfile = process.env.PASS66_ADS_RENDER_PROFILE ?? (renderer === 'webgpu' ? 'blender' : 'compat');

async function deploy(page: Page): Promise<number> {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&map=rustworks-1v1&renderer=${renderer}${requireWebGpu}&render=${renderProfile}&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass66-scoped-ads`);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
  const startedAt = Date.now();
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.placeBotAhead(6);
    api.aimAtBot('body');
  });
  return Date.now() - startedAt;
}

async function enterAds(page: Page, weapon: 'sniper' | 'm14-ebr'): Promise<{ elapsedMs: number; frameDelta: number }> {
  const before = await page.evaluate((weaponId) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as unknown as {
      equipWeapon(id: string): void;
      setAds(held: boolean): void;
      snapshot(): { frameCount: number };
    };
    api.setAds(false);
    api.equipWeapon(weaponId);
    const frameCount = api.snapshot().frameCount;
    api.setAds(true);
    return { frameCount, startedAt: performance.now() };
  }, weapon);
  await page.waitForFunction((weaponId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return weaponId === 'sniper'
      ? snapshot.sniperScope.active === true
      : snapshot.dmrThermal.active === true;
  }, weapon, { timeout: 2_500 });
  return page.evaluate((sample) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { elapsedMs: performance.now() - sample.startedAt, frameDelta: snapshot.frameCount - sample.frameCount };
  }, before);
}

test('M40 and M14 enter readable scoped ADS without a whiteout or frame-loop freeze at 1440p and 4K', async ({ page }) => {
  test.setTimeout(renderer === 'webgpu' ? 150_000 : 90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  await page.setViewportSize({ width: 2560, height: 1440 });
  const deploymentMs = await deploy(page);
  expect(deploymentMs).toBeLessThan(30_000);
  if (renderer === 'webgpu') {
    expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime)).toMatchObject({
      actualBackend: 'webgpu',
      deviceLost: false,
      uncapturedErrors: 0,
      presentation: { status: 'healthy' },
    });
  }

  const output = resolve(process.cwd(), 'artifacts/pass66/scoped-ads');
  mkdirSync(output, { recursive: true });
  for (const viewport of [{ width: 2560, height: 1440 }, { width: 3840, height: 2160 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: resolve(output, `hip-${renderer}-${viewport.width}x${viewport.height}.png`), animations: 'disabled' });

    const sniperAdmission = await enterAds(page, 'sniper');
    expect(sniperAdmission.elapsedMs).toBeLessThan(2_500);
    expect(sniperAdmission.frameDelta).toBeGreaterThan(0);
    await expect(page.locator('#sniper-scope')).toBeVisible();
    const sniperPicture = await page.evaluate(() => {
      const scope = document.querySelector<HTMLElement>('#sniper-scope')!;
      const reticle = scope.querySelector<HTMLElement>('.scope-reticle')!;
      const centreLayers = document.elementsFromPoint(innerWidth / 2, innerHeight / 2).map((node) => {
        const style = getComputedStyle(node);
        return { id: (node as HTMLElement).id, backgroundColor: style.backgroundColor, opacity: style.opacity };
      });
      const rect = reticle.getBoundingClientRect();
      return {
        centreErrorPx: Math.hypot(rect.left + rect.width / 2 - innerWidth / 2, rect.top + rect.height / 2 - innerHeight / 2),
        diameter: rect.width,
        opaqueWhiteLayer: centreLayers.some((layer) => layer.backgroundColor === 'rgb(255, 255, 255)' && Number(layer.opacity) > 0.9),
        opaqueBlackLayer: centreLayers.some((layer) => layer.backgroundColor === 'rgb(0, 0, 0)' && Number(layer.opacity) > 0.9),
      };
    });
    expect(sniperPicture.centreErrorPx).toBeLessThan(0.1);
    expect(sniperPicture.diameter).toBeGreaterThan(Math.min(viewport.height, viewport.width) * 0.5);
    expect(sniperPicture.opaqueWhiteLayer).toBe(false);
    expect(sniperPicture.opaqueBlackLayer).toBe(false);
    await page.screenshot({ path: resolve(output, `m40-${renderer}-${viewport.width}x${viewport.height}.png`), animations: 'disabled' });

    const m14Admission = await enterAds(page, 'm14-ebr');
    expect(m14Admission.elapsedMs).toBeLessThan(2_500);
    expect(m14Admission.frameDelta).toBeGreaterThan(0);
    await expect(page.locator('#dmr-thermal')).toBeVisible();
    await page.screenshot({ path: resolve(output, `m14-ebr-${renderer}-${viewport.width}x${viewport.height}.png`), animations: 'disabled' });
  }
  if (renderer === 'webgpu') {
    expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime)).toMatchObject({
      actualBackend: 'webgpu',
      deviceLost: false,
      uncapturedErrors: 0,
      presentation: { status: 'healthy' },
    });
  }
  expect(pageErrors).toEqual([]);
});
