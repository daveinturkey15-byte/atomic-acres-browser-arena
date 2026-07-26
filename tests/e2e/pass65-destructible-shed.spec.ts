import { expect, test, type Page } from '@playwright/test';

type ShedDoorSnapshot = {
  phase: 'closed' | 'opening' | 'open' | 'closing' | 'blocked';
  direction: 'opening' | 'closing' | 'stationary';
  angleQ: number;
  desiredAngleQ: number;
  blockedBy: { kind: 'player' | 'major-debris' | 'bullet'; entityId: string } | null;
  resumePolicy: 'remain-blocked-until-new-command' | 'resume-when-clear';
};

type ShedSnapshot = {
  placementId: string;
  revision: number;
  door: ShedDoorSnapshot;
  surfaces: Array<{ surfaceId: string; dents: unknown[] }>;
};

type ShedDebug = {
  snapshot(): {
    matchPhase: string;
    interactiveWorld: {
      telemetry: { dents: number; presentationDraws: number };
      envelope: { sheds: ShedSnapshot[] };
    };
  };
  teleportPlayer(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  interactShed(): boolean;
  bulletHitShed(placementId?: string, surfaceId?: string, damageQ?: number, penetrationEnergyQ?: number): boolean;
};

async function readyAndDeploy(page: Page): Promise<void> {
  await page.goto('/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=pass65-shed-door');
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return debug?.snapshot().weaponReady === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
  await page.locator('#player-name').fill('PASS65 SHED QA');
  await page.locator('#solo').click();
  await expect.poll(async () => page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__ as unknown as ShedDebug).snapshot().matchPhase
  ))).toBe('active');
}

async function westShed(page: Page): Promise<ShedSnapshot> {
  return page.evaluate(() => {
    const sheds = (window.__ATOMIC_ACRES_DEBUG__ as unknown as ShedDebug)
      .snapshot().interactiveWorld.envelope.sheds;
    const shed = sheds.find((candidate) => candidate.placementId === 'atomic-shed-west');
    if (!shed) throw new Error('Missing atomic-shed-west');
    return shed;
  });
}

test('a real host mutation stops a moving door, persists its metal dent, and requires a new F command', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await readyAndDeploy(page);

  expect(await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as ShedDebug;
    // The west shed door centre is (-19.9, 1.1, 5). Start inside the F
    // admission radius, then leave its swept volume before it begins moving.
    debug.teleportPlayer(-17.72, 1.7, 5, Math.PI / 2, 0.24);
    return debug.interactShed();
  })).toBe(true);
  await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as ShedDebug
  ).teleportPlayer(0, 1.7, 0));
  await expect.poll(async () => (await westShed(page)).door).toMatchObject({ phase: 'opening' });
  await expect.poll(async () => (await westShed(page)).door.angleQ).toBeGreaterThan(0);

  expect(await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as ShedDebug
  ).bulletHitShed('atomic-shed-west', 'door-south', 30, 20))).toBe(true);
  const interrupted = await westShed(page);
  expect(interrupted.door).toMatchObject({
    phase: 'blocked',
    direction: 'opening',
    desiredAngleQ: 10_000,
    blockedBy: { kind: 'bullet' },
    resumePolicy: 'remain-blocked-until-new-command',
  });
  expect(interrupted.door.angleQ).toBeGreaterThan(0);
  expect(interrupted.door.angleQ).toBeLessThan(10_000);
  expect(interrupted.door.blockedBy?.entityId).toMatch(/^bullet-\d+-\d+$/);
  expect(interrupted.surfaces.find((surface) => surface.surfaceId === 'door-south')?.dents).toHaveLength(1);

  await page.waitForTimeout(350);
  expect((await westShed(page)).door.angleQ).toBe(interrupted.door.angleQ);
  const presentation = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as ShedDebug
  ).snapshot().interactiveWorld.telemetry);
  expect(presentation.dents).toBe(1);
  expect(presentation.presentationDraws).toBeGreaterThanOrEqual(9);

  expect(await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as ShedDebug;
    debug.teleportPlayer(-17.72, 1.7, 5, Math.PI / 2, 0.24);
    const accepted = debug.interactShed();
    debug.teleportPlayer(0, 1.7, 0);
    return accepted;
  })).toBe(true);
  await expect.poll(async () => (await westShed(page)).door).toMatchObject({
    phase: 'closing',
    direction: 'closing',
    desiredAngleQ: 0,
    blockedBy: null,
  });
  expect(pageErrors).toEqual([]);
});
