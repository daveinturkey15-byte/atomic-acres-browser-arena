import { expect, test } from '@playwright/test';
import {
  TIMED_MAP_WEAPON_DEFINITIONS,
  type TimedMapWeaponId,
} from '../../src/timed-map-weapon-authority';
import { WEAPONS } from '../../src/gameplay';

const cases = [
  { weaponId: 'flamethrower', arenaId: 'rustworks-1v1', effect: 'flameStream' },
  { weaponId: 'flare-gun', arenaId: 'skyline-terminal', effect: 'flareProjectiles' },
] as const satisfies readonly Readonly<{
  weaponId: TimedMapWeaponId;
  arenaId: 'rustworks-1v1' | 'skyline-terminal';
  effect: 'flameStream' | 'flareProjectiles';
}>[];

for (const testCase of cases) {
  test(`${testCase.weaponId} appears only at the canonical midpoint and is a live finite weapon`, async ({ page }) => {
    test.setTimeout(150_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
    await page.goto(`/?release=latest&map=${testCase.arenaId}&renderer=webgl2&render=blender&multiplayerQa=1&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=pass66-${testCase.weaponId}`);
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return snapshot?.bootstrap?.stage === 'ready'
        && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
    }, undefined, { timeout: 60_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });

    const scheduled = await page.evaluate((weaponId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        state: snapshot.timedMapWeapons.states[weaponId],
        currentHostTimeMs: snapshot.timedMapWeapons.currentHostTimeMs,
        durationMs: snapshot.arenaSelection.rules.durationMs,
        presentation: snapshot.timedMapWeapons.presentation.entries.find((entry: { weaponId: string }) => entry.weaponId === weaponId),
      };
    }, testCase.weaponId);
    expect(scheduled.state).toMatchObject({
      weaponId: testCase.weaponId,
      arenaId: testCase.arenaId,
      status: 'scheduled',
      pickupPosition: [...TIMED_MAP_WEAPON_DEFINITIONS[testCase.weaponId].spawnPosition],
      announcementSent: false,
    });
    expect(scheduled.presentation.visible).toBe(false);
    expect(scheduled.durationMs).toBeGreaterThan(0);
    // The active transition and this sample are separated only by browser
    // polling. This served assertion complements the exact arithmetic unit
    // contract without exposing a mutable match clock to QA code.
    expect(Math.abs(
      scheduled.state.spawnAtHostTimeMs - scheduled.durationMs / 2 - scheduled.currentHostTimeMs,
    )).toBeLessThan(2_000);

    const before = await page.evaluate(({ weaponId }) => (
      window.__ATOMIC_ACRES_DEBUG__.stageTimedMapWeaponMidpoint(weaponId, 'before')
    ), testCase);
    expect(before).toMatchObject({ status: 'scheduled', announcementSent: false });
    expect(await page.evaluate((weaponId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        state: snapshot.timedMapWeapons.states[weaponId],
        visible: snapshot.timedMapWeapons.presentation.entries.find((entry: { weaponId: string }) => entry.weaponId === weaponId)?.visible,
        announcements: snapshot.timedMapWeapons.audit.announcements,
      };
    }, testCase.weaponId)).toMatchObject({
      state: { status: 'scheduled', announcementSent: false },
      visible: false,
      announcements: 0,
    });

    const exact = await page.evaluate(({ weaponId }) => (
      window.__ATOMIC_ACRES_DEBUG__.stageTimedMapWeaponMidpoint(weaponId, 'exact')
    ), testCase);
    expect(exact).toMatchObject({
      status: 'available',
      pickupPosition: [...TIMED_MAP_WEAPON_DEFINITIONS[testCase.weaponId].spawnPosition],
      announcementSent: true,
    });
    await expect.poll(async () => page.evaluate((weaponId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const entry = snapshot.timedMapWeapons.presentation.entries.find((candidate: { weaponId: string }) => candidate.weaponId === weaponId);
      return {
        status: snapshot.timedMapWeapons.states[weaponId].status,
        visible: entry?.visible,
        source: entry?.source,
        announcements: snapshot.timedMapWeapons.audit.announcements,
      };
    }, testCase.weaponId), { timeout: 30_000 }).toEqual({
      status: 'available',
      visible: true,
      source: 'project-original-blender-world-lod0',
      announcements: 1,
    });

    const position = TIMED_MAP_WEAPON_DEFINITIONS[testCase.weaponId].spawnPosition;
    await page.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), position);
    expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop())).toBe(true);
    await expect.poll(async () => page.evaluate((weaponId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        weapon: snapshot.player.weapon,
        ammo: snapshot.player.ammo,
        status: snapshot.timedMapWeapons.states[weaponId].status,
        holderId: snapshot.timedMapWeapons.states[weaponId].holderId,
        visible: snapshot.timedMapWeapons.presentation.entries.find((entry: { weaponId: string }) => entry.weaponId === weaponId)?.visible,
      };
    }, testCase.weaponId)).toEqual({
      weapon: testCase.weaponId,
      ammo: WEAPONS[testCase.weaponId].mag,
      status: 'held',
      holderId: expect.any(String),
      visible: false,
    });

    await page.waitForTimeout(500);
    if (testCase.weaponId === 'flamethrower') {
      // The authored flamethrower has a real 180 ms spin-up. `fireOnce()` is an
      // instantaneous semi-auto QA tap and intentionally releases before that
      // gate. Acquire the same pointer-lock/input state as a player and hold the
      // real trigger until the first admitted stream emission instead.
      await page.locator('#game').click({ position: { x: 640, y: 360 } });
      await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 5_000 });
      await page.mouse.down();
      try {
        await page.waitForFunction(({ weaponId, effect, totalShots }) => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          const effectCount = effect === 'flameStream'
            ? snapshot.timedMapWeapons.flameStream.emissions
            : snapshot.timedMapWeapons.flareProjectiles.spawnCount;
          return snapshot.timedMapWeapons.states[weaponId].shotsRemaining
              < totalShots
            && effectCount > 0;
        }, {
          ...testCase,
          totalShots: TIMED_MAP_WEAPON_DEFINITIONS[testCase.weaponId].totalShots,
        }, { polling: 'raf', timeout: 5_000 });
      } finally {
        await page.mouse.up();
      }
    } else {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
    }
    const fired = await page.evaluate(({ weaponId, effect }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        shotsRemaining: snapshot.timedMapWeapons.states[weaponId].shotsRemaining,
        effectCount: effect === 'flameStream'
          ? snapshot.timedMapWeapons.flameStream.emissions
          : snapshot.timedMapWeapons.flareProjectiles.spawnCount,
      };
    }, testCase);
    const consumed = TIMED_MAP_WEAPON_DEFINITIONS[testCase.weaponId].totalShots - fired.shotsRemaining;
    expect(consumed).toBeGreaterThan(0);
    expect(fired.effectCount).toBe(consumed);
    if (testCase.weaponId === 'flare-gun') expect(consumed).toBe(1);
    await page.waitForTimeout(250);
    expect(await page.evaluate(({ weaponId, effect }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        shotsRemaining: snapshot.timedMapWeapons.states[weaponId].shotsRemaining,
        effectCount: effect === 'flameStream'
          ? snapshot.timedMapWeapons.flameStream.emissions
          : snapshot.timedMapWeapons.flareProjectiles.spawnCount,
      };
    }, testCase)).toEqual(fired);
    expect(pageErrors).toEqual([]);
  });
}
