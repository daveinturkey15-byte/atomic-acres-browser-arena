import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

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

async function captureReview(page: Page, testInfo: TestInfo, state: string, viewport: typeof reviewViewports[number]): Promise<void> {
  const directory = resolve(process.cwd(), 'artifacts/pass64/ui-review');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `${state}-${viewport.id}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(`${state}-${viewport.id}`, { path, contentType: 'image/png' });
}

async function startDeterministicSolo(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await page.waitForTimeout(2_500);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
}

test.describe('Pass 64 command HUD and menu contract', () => {
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
    await expect(page.locator('#arena-title')).toHaveText('RustRig');
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
        const showcase = document.querySelector<HTMLElement>('#menu-showcase')!;
        const workspace = document.querySelector<HTMLElement>('.command-workspace')!;
        const rect = menu.getBoundingClientRect();
        const mapRect = map.getBoundingClientRect();
        return {
          contract: root.dataset.uiContract,
          pageOverflowX: root.scrollWidth - root.clientWidth,
          menuOverflowX: menu.scrollWidth - menu.clientWidth,
          withinViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
          mapWithinMenu: mapRect.left >= rect.left - 1 && mapRect.right <= rect.right + 1,
          showcaseInsideWorkspace: workspace.contains(showcase),
          shellWidthRatio: rect.width / innerWidth,
        };
      });
      expect(layout.contract).toBe('pass64-command-v2');
      expect(layout.pageOverflowX).toBe(0);
      expect(layout.menuOverflowX).toBe(0);
      expect(layout.withinViewport).toBe(true);
      expect(layout.mapWithinMenu).toBe(true);
      expect(layout.showcaseInsideWorkspace).toBe(true);
      expect(layout.shellWidthRatio).toBeGreaterThan(viewport.id === 'ultrawide' ? 0.8 : viewport.id === 'narrow' ? 0.99 : 0.95);

      await captureReview(page, testInfo, 'setup', viewport);
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

  test('preserves the critical live-match HUD across the review viewport matrix', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await ready(page);
    await startDeterministicSolo(page);

    for (const selector of ['#hud', '#matchbar', '#crosshair', '#minimap', '#health-block', '#weapon-block', '#equipment-block', '#support-block']) {
      await expect(page.locator(selector)).toBeVisible();
    }
    await expect(page.locator('#objective')).toContainText('NUKE TOWN');
    await expect(page.locator('#support-block [data-support]')).toHaveCount(5);
    for (const viewport of reviewViewports) {
      await page.setViewportSize(viewport);
      await captureReview(page, testInfo, 'live-hud', viewport);
    }
  });

  test('renders a full returned-lobby command room at every review viewport', async ({ page }, testInfo) => {
    await ready(page);
    await page.evaluate(() => {
      const lobby = document.querySelector<HTMLElement>('#private-lobby')!;
      const room = document.querySelector<HTMLElement>('#room-card')!;
      const title = document.querySelector<HTMLElement>('#private-lobby-title')!;
      const roster = document.querySelector<HTMLElement>('#lobby-roster')!;
      const status = document.querySelector<HTMLElement>('#network-status')!;
      lobby.hidden = false;
      room.hidden = false;
      title.textContent = 'RETURNED TO LOBBY';
      document.querySelector<HTMLElement>('#room-code')!.textContent = 'PASS-64-REVIEW';
      document.querySelector<HTMLElement>('#lobby-capacity-label')!.textContent = '3 / 6';
      status.textContent = 'Lobby reset · all operators can ready for the next match.';
      roster.innerHTML = [
        ['HOST OPERATOR', 'HOST · AQUA', '18 ms', 'READY'],
        ['GUEST ALPHA', 'GUEST · CORAL', '31 ms', 'SETTING UP'],
        ['GUEST BRAVO', 'GUEST · AQUA', '42 ms', 'READY'],
      ].map(([name, role, ping, state]) => `<div class="lobby-player"><span><strong>${name}</strong><small>${role}</small></span><b>${ping}</b><em>${state}</em></div>`).join('');
    });

    for (const viewport of reviewViewports) {
      await page.setViewportSize(viewport);
      await expect(page.locator('#private-lobby')).toBeVisible();
      await expect(page.locator('#lobby-ready')).toBeVisible();
      await expect(page.locator('#lobby-start')).toBeVisible();
      const bounded = await page.locator('#private-lobby').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= innerWidth + 1;
      });
      expect(bounded).toBe(true);
      await captureReview(page, testInfo, 'returned-lobby', viewport);
    }
  });

  test('renders the after-action match-end composition at every review viewport', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await ready(page);
    await startDeterministicSolo(page);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.endMatch());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'ended');
    await expect(page.locator('#banner .round-stats')).toBeVisible();
    await expect(page.locator('#rematch')).toBeVisible();

    for (const viewport of reviewViewports) {
      await page.setViewportSize(viewport);
      await captureReview(page, testInfo, 'match-end', viewport);
    }
  });
});
