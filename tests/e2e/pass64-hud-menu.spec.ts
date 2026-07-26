import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

type ReviewViewport = Readonly<{ id: string; width: number; height: number }>;

const reviewViewports = [
  { id: 'laptop', width: 1280, height: 720 },
  { id: 'desktop', width: 1920, height: 1080 },
  { id: 'ultrawide', width: 2560, height: 1080 },
  { id: 'narrow', width: 390, height: 844 },
] as const satisfies readonly ReviewViewport[];
const highDpiViewport = { id: 'high-dpi', width: 390, height: 844 } as const satisfies ReviewViewport;

async function ready(page: Page): Promise<void> {
  await page.goto('/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=pass64-hud&previewTime=0');
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return debug?.snapshot().weaponReady === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
}

async function captureReview(page: Page, testInfo: TestInfo, state: string, viewport: ReviewViewport): Promise<void> {
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

async function refreshPausedCanvasAfterViewportChange(page: Page): Promise<void> {
  // Resizing a canvas clears its backing store. Submit real world frames again
  // before freezing deterministic HUD evidence so a solid clear colour can
  // never masquerade as a valid live-match screenshot.
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  await page.waitForTimeout(180);
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

    await expect(page.locator('#menu-showcase > #game')).toBeVisible();
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-frame', 'helicopter');
    await expect(page.locator('#menu-preview-label')).toContainText('NUKE TOWN');

    await cards.nth(1).click();
    await expect(page.locator('#arena-title')).toHaveText('TERMINAL');
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-frame', 'helicopter');
    await expect(page.locator('#menu-preview-label')).toContainText('TERMINAL');
    await cards.nth(2).click();
    await expect(page.locator('#arena-title')).toHaveText('RustRig');
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-frame', 'helicopter');
    await expect(page.locator('#menu-preview-label')).toContainText('RUSTRIG');
    await cards.nth(3).click();
    await expect(page.locator('#arena-title')).toHaveText('GUN RANGE');
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-frame', 'cat');
    await expect(page.locator('#menu-preview-label')).toContainText('CAT-CAM');
    await cards.nth(0).click();
    await expect(page.locator('#arena-title')).toContainText('NUKE TOWN');
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-frame', 'helicopter');
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

  test('keeps the simple graphics choice separate from collapsed advanced WebGPU controls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await ready(page);
    await page.locator('#menu-tab-options').click();
    await expect(page.locator('#graphics-profile option')).toHaveText(['QUALITY', 'PERFORMANCE', 'CUSTOM']);
    await expect(page.locator('#advanced-graphics')).not.toHaveAttribute('open', '');
    await expect(page.locator('#graphics-target-fps')).toBeHidden();
    await page.locator('#advanced-graphics summary').click();
    await expect(page.locator('#graphics-target-fps')).toBeVisible();
    await expect(page.locator('#graphics-target-fps')).toHaveAttribute('max', '360');
    await expect(page.locator('#graphics-target-fps-marks option[value="240"]')).toHaveCount(1);
    await expect(page.locator('[data-graphics-setting]')).toHaveCount(21);
    await expect(page.locator('[data-graphics-capability][aria-disabled="true"]')).toHaveCount(6);
    await expect(page.locator('#graphics-frame-rate-limit')).toHaveAttribute('max', '361');
    await expect(page.locator('#graphics-frame-rate-limit-value')).toHaveText('UNCAPPED');
    const registry = await page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().settings as {
        advancedGraphicsRegistry: { registeredKeys: string[]; controls: Array<{ runtimeConsumer: string }> };
      }
    ).advancedGraphicsRegistry);
    expect(registry.registeredKeys).toHaveLength(21);
    expect(registry.controls.every(({ runtimeConsumer }) => runtimeConsumer.length > 0)).toBe(true);
    const layout = await page.evaluate(() => ({
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelOverflowX: document.querySelector<HTMLElement>('#menu-panel-options')!.scrollWidth
        - document.querySelector<HTMLElement>('#menu-panel-options')!.clientWidth,
      labelFontPx: Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>('.graphics-preset-row label')!).fontSize),
    }));
    expect(layout).toEqual({ pageOverflowX: 0, panelOverflowX: 0, labelFontPx: 11 });
  });

  test('persists an Advanced Graphics edit as Custom across the renderer rebuild', async ({ page }) => {
    await ready(page);
    await page.locator('#menu-tab-options').click();
    await page.locator('#advanced-graphics summary').click();
    await page.locator('#graphics-frame-rate-limit').evaluate((node) => {
      const input = node as HTMLInputElement;
      input.value = '240';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForURL((url) => !url.searchParams.has('render'), { timeout: 30_000 });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
    await page.locator('#menu-tab-options').click();
    await page.locator('#advanced-graphics summary').click();
    await expect(page.locator('#graphics-profile')).toHaveValue('custom');
    await expect(page.locator('#graphics-frame-rate-limit')).toHaveValue('240');
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('atomic-acres-pass65-settings-v1') ?? 'null'));
    expect(persisted.graphics).toMatchObject({ preset: 'custom', frameRateLimit: 240 });
    await expect(page.locator('html')).toHaveAttribute('data-graphics-frame-rate-limit', '240');
  });

  test('animates the live arena preview when motion is allowed', async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await page.goto('/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=pass64-hud-motion');
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
    const before = await page.evaluate(() => ({
      position: (window.__ATOMIC_ACRES_DEBUG__.snapshot().menuCamera as { position: number[] }).position,
      motion: document.querySelector<HTMLElement>('#menu-preview-frame')?.dataset.motion,
      phase: document.querySelector<HTMLElement>('#menu-preview-frame')?.dataset.phase,
      parent: document.querySelector<HTMLCanvasElement>('#game')?.parentElement?.id,
    }));
    await page.waitForTimeout(350);
    const after = await page.evaluate(() => ({
      position: (window.__ATOMIC_ACRES_DEBUG__.snapshot().menuCamera as { position: number[] }).position,
      phase: document.querySelector<HTMLElement>('#menu-preview-frame')?.dataset.phase,
    }));
    const travel = Math.hypot(...after.position.map((value, index) => value - before.position[index]!));
    expect(before.motion).toBe('orbit');
    expect(before.parent).toBe('menu-showcase');
    expect(runtimeErrors).toEqual([]);
    expect(before.phase).toMatch(/^-?\d+\.\d+$/);
    expect(after.phase).toMatch(/^-?\d+\.\d+$/);
    expect(Number(after.phase) - Number(before.phase)).toBeGreaterThan(0.05);
    expect(travel).toBeGreaterThan(0.05);
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
        const mapDetail = getComputedStyle(document.querySelector<HTMLElement>('.map-card small')!);
        const heading = getComputedStyle(document.querySelector<HTMLElement>('.map-card span')!);
        return {
          contract: root.dataset.uiContract,
          pageOverflowX: root.scrollWidth - root.clientWidth,
          menuOverflowX: menu.scrollWidth - menu.clientWidth,
          withinViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
          mapWithinMenu: mapRect.left >= rect.left - 1 && mapRect.right <= rect.right + 1,
          showcaseInsideWorkspace: workspace.contains(showcase),
          rendererInsideShowcase: showcase.querySelector(':scope > #game') !== null,
          previewFrameVisible: getComputedStyle(document.querySelector<HTMLElement>('#menu-preview-frame')!).display !== 'none',
          mapDetailFontPx: Number.parseFloat(mapDetail.fontSize),
          mapHeadingFontPx: Number.parseFloat(heading.fontSize),
          shellWidthRatio: rect.width / innerWidth,
        };
      });
      expect(layout.contract).toBe('pass64-command-v2');
      expect(layout.pageOverflowX).toBe(0);
      expect(layout.menuOverflowX).toBe(0);
      expect(layout.withinViewport).toBe(true);
      expect(layout.mapWithinMenu).toBe(true);
      expect(layout.showcaseInsideWorkspace).toBe(true);
      expect(layout.rendererInsideShowcase).toBe(true);
      expect(layout.previewFrameVisible).toBe(true);
      expect(layout.mapDetailFontPx).toBeGreaterThanOrEqual(9);
      expect(layout.mapHeadingFontPx).toBeGreaterThanOrEqual(15);
      expect(layout.shellWidthRatio).toBeGreaterThan(viewport.id === 'ultrawide' ? 0.8 : viewport.id === 'narrow' ? 0.99 : 0.95);

      await captureReview(page, testInfo, 'setup', viewport);
    });
  }

  test('keeps the deployment shell bounded at real high DPI', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: highDpiViewport.width, height: highDpiViewport.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    try {
      await ready(page);
      expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const menu = document.querySelector<HTMLElement>('#menu')!;
        const bounds = menu.getBoundingClientRect();
        return {
          pageOverflowX: root.scrollWidth - root.clientWidth,
          menuOverflowX: menu.scrollWidth - menu.clientWidth,
          withinViewport: bounds.left >= -1 && bounds.right <= innerWidth + 1,
          mapCardCount: document.querySelectorAll('.map-card').length,
        };
      });
      expect(layout).toEqual({
        pageOverflowX: 0,
        menuOverflowX: 0,
        withinViewport: true,
        mapCardCount: 4,
      });
      await captureReview(page, testInfo, 'setup', highDpiViewport);
    } finally {
      await context.close();
    }
  });

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
        previewMotion: document.querySelector<HTMLElement>('#menu-preview-frame')?.dataset.motion,
        rendererParent: document.querySelector<HTMLCanvasElement>('#game')?.parentElement?.id,
      };
    });
    expect(contract.panelAnimationMs).toBeLessThanOrEqual(0.01);
    expect(contract.cardTransitionMs).toBeLessThanOrEqual(0.01);
    expect(contract.status).toContain('ready');
    expect(contract.controls).toBeGreaterThanOrEqual(8);
    expect(contract.previewMotion).toBe('static');
    expect(contract.rendererParent).toBe('menu-showcase');
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
      await refreshPausedCanvasAfterViewportChange(page);
      const mapGeometry = await page.evaluate(() => {
        const minimap = document.querySelector('#minimap')!.getBoundingClientRect();
        const heading = document.querySelector('#map-heading')!.getBoundingClientRect();
        const panels = ['#matchbar', '#objective', '#fps-counter', '#network-strip', '.hud-map-console', '.hud-operator-console', '.hud-weapon-console', '#support-block']
          .map((selector) => ({ selector, rect: document.querySelector(selector)!.getBoundingClientRect().toJSON() }));
        const overlapPairs: string[] = [];
        for (let left = 0; left < panels.length; left += 1) {
          for (let right = left + 1; right < panels.length; right += 1) {
            const a = panels[left]!;
            const b = panels[right]!;
            const overlaps = a.rect.left < b.rect.right - 1
              && a.rect.right > b.rect.left + 1
              && a.rect.top < b.rect.bottom - 1
              && a.rect.bottom > b.rect.top + 1;
            if (overlaps) overlapPairs.push(`${a.selector}:${b.selector}`);
          }
        }
        return {
          minimapBottom: minimap.bottom,
          headingTop: heading.top,
          overlapPairs,
          objectiveFontPx: Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>('#objective')!).fontSize),
          supportStateFontPx: Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>('.support-state')!).fontSize),
        };
      });
      expect(mapGeometry.headingTop).toBeGreaterThanOrEqual(mapGeometry.minimapBottom);
      expect(mapGeometry.overlapPairs).toEqual([]);
      expect(mapGeometry.objectiveFontPx).toBeGreaterThanOrEqual(9);
      expect(mapGeometry.supportStateFontPx).toBeGreaterThanOrEqual(viewport.id === 'narrow' ? 8 : 9);
      await captureReview(page, testInfo, 'live-hud', viewport);
    }
  });

  test('renders real dead and respawning HUD states', async ({ page }) => {
    await ready(page);
    await startDeterministicSolo(page);
    const killed = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setRenderPaused(false);
      api.damage(999);
      return api.snapshot().player as { alive: boolean; hp: number };
    });
    expect(killed).toMatchObject({ alive: false, hp: 0 });
    await expect(page.locator('#respawn')).toBeVisible();
    await expect(page.locator('#respawn strong')).toHaveText('ELIMINATED');
    await expect(page.locator('#respawn-countdown')).not.toHaveText('');
    await expect.poll(async () => {
      const player = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player) as { alive: boolean };
      return player.alive;
    }, { timeout: 5_000 }).toBe(true);
    await expect(page.locator('#respawn')).toBeHidden();
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
      await refreshPausedCanvasAfterViewportChange(page);
      await captureReview(page, testInfo, 'match-end', viewport);
    }
  });
});
