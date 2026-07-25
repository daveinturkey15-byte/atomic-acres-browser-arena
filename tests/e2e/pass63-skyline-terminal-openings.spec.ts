import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

type OpeningAudit = Record<'performance' | 'quality', Array<{
  id: string;
  movementBlockers: number;
  shotBlockers: number;
  opaquePresentationBlockers: number;
  opaquePresentationBlockerNames: string[];
}>>;

type SkylineDebug = {
  snapshot: () => {
    gameStarted: boolean;
    matchPhase: string;
    arenaSelection: {
      id: string;
      skylineOpeningAudit: OpeningAudit;
    };
    render: { profile: 'performance' | 'blender' };
  };
  startSolo: () => void;
  setBotsFrozen: (frozen: boolean) => void;
  setCaptureViewmodelHidden: (hidden: boolean) => void;
  teleportPlayer: (x: number, y: number, z: number, yaw: number, pitch?: number) => void;
  collisionProbeAt: (x: number, y: number, z: number) => boolean;
};

test.beforeEach(async ({ page }) => {
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
});

test('keeps Terminal, aircraft, and cockpit apertures visually and mechanically open in both profiles', async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir('artifacts/pass63-terminal-openings', { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const profile of ['performance', 'blender'] as const) {
    await page.goto(`/?renderer=webgl2&render=${profile}&map=skyline-terminal&signal=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const status = document.querySelector<HTMLElement>('#network-status');
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: SkylineDebug }).__ATOMIC_ACRES_DEBUG__;
      const state = api?.snapshot();
      return status?.dataset.kind === 'ok'
        && state?.render.profile
        && state.arenaSelection.id === 'skyline-terminal';
    }, undefined, { timeout: 90_000 });
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: SkylineDebug }).__ATOMIC_ACRES_DEBUG__;
      api.startSolo();
    });
    await page.waitForFunction(() => {
      const state = (window as unknown as { __ATOMIC_ACRES_DEBUG__: SkylineDebug }).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active' && state.arenaSelection.id === 'skyline-terminal';
    }, undefined, { timeout: 30_000 });

    const state = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: SkylineDebug }
    ).__ATOMIC_ACRES_DEBUG__.snapshot());
    expect(state.render.profile).toBe(profile);
    const auditProfile = profile === 'blender' ? 'quality' : 'performance';
    expect(state.arenaSelection.skylineOpeningAudit[auditProfile].map((entry) => entry.id)).toEqual([
      'terminal-gate',
      'aircraft-boarding',
      'cockpit-entry',
    ]);
    for (const opening of state.arenaSelection.skylineOpeningAudit[auditProfile]) {
      expect(opening, `${profile}:${opening.id}`).toMatchObject({
        movementBlockers: 0,
        shotBlockers: 0,
        opaquePresentationBlockers: 0,
        opaquePresentationBlockerNames: [],
      });
    }

    const collision = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: SkylineDebug }).__ATOMIC_ACRES_DEBUG__;
      return {
        terminalGate: api.collisionProbeAt(0, 5.02, -11.8),
        aircraftBoarding: api.collisionProbeAt(0, 4.25, 1.0),
        cockpitEntry: api.collisionProbeAt(-17.55, 4.25, 2),
        cockpitFront: api.collisionProbeAt(-20.08, 4.25, 2),
        closedStaffDoor: api.collisionProbeAt(-22, 1.25, -34),
      };
    });
    expect(collision).toEqual({
      terminalGate: false,
      aircraftBoarding: false,
      cockpitEntry: false,
      cockpitFront: true,
      closedStaffDoor: true,
    });

    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: SkylineDebug }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.setCaptureViewmodelHidden(true);
      api.teleportPlayer(0, 5.02, -14.5, Math.PI, 0);
    });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `artifacts/pass63-terminal-openings/${profile}-terminal-gate.png`,
      timeout: 60_000,
    });
    await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: SkylineDebug }
    ).__ATOMIC_ACRES_DEBUG__.teleportPlayer(10, 1.7, -15.8, 0, 0));
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `artifacts/pass63-terminal-openings/${profile}-flight-screens.png`,
      timeout: 60_000,
    });
    await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: SkylineDebug }
    ).__ATOMIC_ACRES_DEBUG__.teleportPlayer(-16.2, 4.25, 2, Math.PI / 2, 0));
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `artifacts/pass63-terminal-openings/${profile}-cockpit-entry.png`,
      timeout: 60_000,
    });
  }

  expect(errors).toEqual([]);
});
