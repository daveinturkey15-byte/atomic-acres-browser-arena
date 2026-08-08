import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_KEY_BINDINGS } from '../../src/key-bindings';
import { PASS65_KILLSTREAK_CATALOG, type Pass65KillstreakId } from '../../src/killstreak-catalog';
import { WEAPONS } from '../../src/gameplay';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../../src/gun-range-test-bay';

async function startGunRange(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1_920, height: 1_080 });
  await page.goto('/?release=latest&map=gun-range&renderer=webgl2&render=blender&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=pass69-2-support-input');
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.bootstrap?.stage === 'ready'
      && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
}

async function focusGameplay(page: Page): Promise<void> {
  await page.locator('#game').click({ position: { x: 64, y: 64 }, force: true });
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 5_000 });
}

async function exerciseReadySlot(page: Page, slot: number, key: string): Promise<Pass65KillstreakId> {
  const id = await page.evaluate((slotIndex) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const actor = snapshot.killstreak.actors.find((candidate: { actorId: string }) => candidate.actorId === snapshot.player.id);
    return actor?.loadout.slots[slotIndex] ?? null;
  }, slot) as Pass65KillstreakId | null;
  expect(id).toBeTruthy();
  expect(await page.evaluate((supportId) => window.__ATOMIC_ACRES_DEBUG__.grantTestBaySupport(supportId), id!)).toBe(true);
  await expect.poll(async () => page.evaluate((supportId) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.available[supportId] === true
  ), id!)).toBe(true);
  await focusGameplay(page);
  await page.keyboard.press(key);
  await expect.poll(async () => page.evaluate((supportId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.fieldSupport.targetingMode === supportId
      || snapshot.fieldSupport.available[supportId] === false;
  }, id!), { timeout: 5_000 }).toBe(true);
  const targeting = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.targetingMode);
  if (targeting) {
    await page.keyboard.press('Escape');
    await expect.poll(async () => page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.targetingMode
    ))).toBeNull();
  }
  return id!;
}

test('ready selected support slots activate through default keys 3, 4, and 5', async ({ page }) => {
  test.setTimeout(120_000);
  await startGunRange(page);
  const ids: Pass65KillstreakId[] = [];
  ids.push(await exerciseReadySlot(page, 0, '3'));
  ids.push(await exerciseReadySlot(page, 1, '4'));
  ids.push(await exerciseReadySlot(page, 2, '5'));
  expect(new Set(ids).size).toBe(3);
});

test('a rebound support action activates the same compact ready slot', async ({ page }) => {
  test.setTimeout(120_000);
  const rebound = {
    ...DEFAULT_KEY_BINDINGS,
    'support-1': ['KeyQ'],
  };
  await page.addInitScript((profile) => {
    localStorage.setItem('atomic-acres.key-bindings.v1', JSON.stringify(profile));
  }, rebound);
  await startGunRange(page);
  await exerciseReadySlot(page, 0, 'q');
});

test('every nearby test-bay weapon station projects its canonical name into the visible F prompt', async ({ page }) => {
  test.setTimeout(120_000);
  await startGunRange(page);
  for (const station of GUN_RANGE_TEST_BAY_CONTRACT.weaponStations) {
    await page.evaluate(({ x, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z), station.position);
    await expect.poll(async () => page.evaluate((weaponId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.fieldSupport.fInteraction.candidates.some((candidate: { targetId: string }) => (
        candidate.targetId === `test-bay-weapon:${weaponId}`
      ));
    }, station.id)).toBe(true);
    await expect(page.locator('#pickup-prompt')).toBeVisible();
    await expect(page.locator('#pickup-prompt span')).toHaveText(
      `TAP F · EQUIP / REFILL ${WEAPONS[station.id].name.toUpperCase()}`,
    );
  }
});

test('only a full F hold activates an entity support that is absent from the selected loadout', async ({ page }) => {
  test.setTimeout(120_000);
  await startGunRange(page);
  const entitySupportIds: readonly Pass65KillstreakId[] = [
    'care-package', 'carpet-bomber', 'chopper', 'piloted-drone', 'drone-swarm',
  ];
  const loadout = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.killstreak.actors.find((candidate: { actorId: string }) => candidate.actorId === snapshot.player.id)!.loadout.slots;
  }) as Pass65KillstreakId[];
  const id = entitySupportIds.find((candidate) => !loadout.includes(candidate));
  expect(id).toBeTruthy();
  const station = GUN_RANGE_TEST_BAY_CONTRACT.supportStations.find((candidate) => candidate.id === id)!;
  const label = PASS65_KILLSTREAK_CATALOG.definitions.find((candidate) => candidate.id === id)!.displayName.toUpperCase();
  await page.evaluate(({ x, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z), station.position);
  await expect.poll(async () => page.evaluate((supportId) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.candidates
      .some((candidate: { targetId: string }) => candidate.targetId === `test-bay-support:${supportId}`)
  ), id!)).toBe(true);
  await expect(page.locator('#support-interaction-prompt span')).toHaveText(`HOLD F · TEST ${label}`);

  const beforeEntities = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.entities.length);
  await focusGameplay(page);
  await page.keyboard.down('f');
  await page.waitForTimeout(400);
  await page.keyboard.up('f');
  await page.waitForTimeout(150);
  expect(await page.evaluate((supportId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.fieldSupport.targetingMode === supportId || snapshot.killstreak.entities.length > 0;
  }, id!)).toBe(false);

  await focusGameplay(page);
  await page.keyboard.down('f');
  await page.waitForTimeout(1_150);
  await page.keyboard.up('f');
  await expect.poll(async () => page.evaluate(({ supportId, entityCount }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.fieldSupport.targetingMode === supportId || snapshot.killstreak.entities.length > entityCount;
  }, { supportId: id!, entityCount: beforeEntities }), { timeout: 5_000 }).toBe(true);
});
