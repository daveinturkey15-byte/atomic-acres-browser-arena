import { expect, test, type Page } from '@playwright/test';

const reviewViewports = [
  { id: 'laptop', width: 1280, height: 720 },
  { id: 'desktop', width: 1920, height: 1080 },
  { id: 'ultrawide', width: 2560, height: 1080 },
  { id: 'narrow', width: 390, height: 844 },
] as const;

async function ready(page: Page): Promise<void> {
  await page.goto('/?release=latest&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=pass64-hud');
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return debug?.snapshot().weaponReady === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
}

test.describe('Pass 64 tactical HUD and menu contract', () => {
  test('uses one ordered arena registry with new labels and stable machine ids', async ({ page }) => {
    await ready(page);
    const cards = page.locator('.map-card');
    await expect(cards).toHaveCount(4);
    await expect(cards).toHaveText([
      /NUKE TOWN/, /TERMINAL/, /RUSTRIG/, /GUN RANGE/,
    ]);
    expect(await cards.evaluateAll((elements) => elements.map((element) => ({
      id: (element as HTMLElement).dataset.arenaId,
      route: (element as HTMLElement).dataset.arenaRoute,
    })))).toEqual([
      { id: 'atomic-acres', route: 'nuke-town' },
      { id: 'skyline-terminal', route: 'terminal' },
      { id: 'rustworks-1v1', route: 'rustrig' },
      { id: 'gun-range', route: 'gun-range' },
    ]);

    await cards.nth(1).click();
    await expect(page.locator('#arena-title')).toHaveText('TERMINAL');
    await cards.nth(2).click();
    await expect(page.locator('#arena-title')).toContainText('RUST RIG');
    await cards.nth(0).click();
    await expect(page.locator('#arena-title')).toContainText('NUKE TOWN');
  });

  test('supports keyboard tabs and traps/restores dialog focus', async ({ page }) => {
    await ready(page);
    const deployTab = page.locator('#menu-tab-deploy');
    const kitTab = page.locator('#menu-tab-kit');
    const optionsTab = page.locator('#menu-tab-options');

    await deployTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(kitTab).toBeFocused();
    await expect(kitTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#menu-panel-kit')).toBeVisible();
    await page.keyboard.press('End');
    await expect(optionsTab).toBeFocused();
    await expect(page.locator('#menu-panel-options')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(deployTab).toBeFocused();

    const opener = page.locator('#project-map-btn');
    await opener.click();
    await expect(page.locator('#project-map-panel')).toBeVisible();
    await page.locator('#project-map-close').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#project-map-download-agent')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#project-map-close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#project-map-panel')).toBeHidden();
    await expect(opener).toBeFocused();
  });

  for (const viewport of reviewViewports) {
    test(`keeps the deployment shell bounded at ${viewport.id} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await ready(page);

      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const menu = document.querySelector<HTMLElement>('#menu')!;
        const map = document.querySelector<HTMLElement>('#map-selector')!;
        const rect = menu.getBoundingClientRect();
        const mapRect = map.getBoundingClientRect();
        return {
          contract: root.dataset.uiContract,
          pageOverflowX: root.scrollWidth - root.clientWidth,
          menuOverflowX: menu.scrollWidth - menu.clientWidth,
          withinViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
          mapWithinMenu: mapRect.left >= rect.left - 1 && mapRect.right <= rect.right + 1,
        };
      });
      expect(layout).toEqual({
        contract: 'pass64-tactical-v1',
        pageOverflowX: 0,
        menuOverflowX: 0,
        withinViewport: true,
        mapWithinMenu: true,
      });

      await testInfo.attach(`pass64-menu-${viewport.id}`, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      });
    });
  }

  test('honours reduced motion without hiding controls or status', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    const contract = await page.evaluate(() => {
      const panel = getComputedStyle(document.querySelector<HTMLElement>('.menu-panel')!);
      const card = getComputedStyle(document.querySelector<HTMLElement>('.map-card')!);
      return {
        panelAnimationMs: panel.animationDuration.endsWith('ms')
          ? Number.parseFloat(panel.animationDuration)
          : Number.parseFloat(panel.animationDuration) * 1000,
        cardTransitionMs: card.transitionDuration.endsWith('ms')
          ? Number.parseFloat(card.transitionDuration)
          : Number.parseFloat(card.transitionDuration) * 1000,
        status: document.querySelector('#network-status')?.textContent,
        controls: document.querySelectorAll('.menu-tabs button, .menu-actions button, .join-row button').length,
      };
    });
    expect(contract.panelAnimationMs).toBeLessThanOrEqual(0.01);
    expect(contract.cardTransitionMs).toBeLessThanOrEqual(0.01);
    expect(contract.status).toContain('ready');
    expect(contract.controls).toBeGreaterThanOrEqual(8);
  });

  test('preserves the critical live-match HUD at the deterministic desktop camera', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await ready(page);
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false);
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
    });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
    await page.waitForTimeout(2_500);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));

    for (const selector of ['#hud', '#matchbar', '#crosshair', '#minimap', '#health-block', '#weapon-block', '#equipment-block', '#support-block']) {
      await expect(page.locator(selector)).toBeVisible();
    }
    await expect(page.locator('#objective')).toContainText('NUKE TOWN');
    await expect(page.locator('#support-block [data-support]')).toHaveCount(5);
    await testInfo.attach('pass64-live-hud-desktop', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
  });
});
