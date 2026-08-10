import { expect, test, type Page } from '@playwright/test';
import {
  captureFrameHitchRendererEvidence,
  expectFrameHitchRendererEvidence,
  frameHitchRoute,
  writeOfficialFrameHitchReceipt,
} from './pass69-3-frame-hitch-evidence';

type ProbeAction = 'noop' | 'fire' | 'equip-m14' | 'ads-on' | 'ads-off';

type FrameProbe = Readonly<{
  label: string;
  action: ProbeAction;
  synchronousMs: number;
  eventToPresentedFrameMs: number;
  presentedFrameDelta: number;
}>;

const MAX_EVENT_TO_PRESENTED_FRAME_MS = 120;
const MAX_SYNCHRONOUS_ACTION_MS = 50;

async function deploy(page: Page): Promise<void> {
  await page.goto(frameHitchRoute('atomic-acres', 'pass69-3-glass-m14-hitch-gate'));
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.admissionState().matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2;
  }, undefined, { timeout: 30_000 });
}

async function eventToNextPresentedFrame(page: Page, label: string, action: ProbeAction): Promise<FrameProbe> {
  return page.evaluate(({ selectedLabel, selectedAction }) => new Promise<FrameProbe>((resolve, reject) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug) return reject(new Error('Atomic Acres debug surface is unavailable'));
    requestAnimationFrame(() => {
      const startedAt = performance.now();
      const presentedBefore = debug.admissionState().presentedGameplayFrame;
      if (selectedAction === 'fire') debug.fireOnce();
      else if (selectedAction === 'equip-m14') debug.equipWeapon('m14-ebr');
      else if (selectedAction === 'ads-on') debug.setAds(true);
      else if (selectedAction === 'ads-off') debug.setAds(false);
      const synchronousMs = performance.now() - startedAt;
      const deadline = startedAt + 2_000;
      const inspect = () => {
        const presentedAfter = debug.admissionState().presentedGameplayFrame;
        if (presentedAfter > presentedBefore) {
          resolve({
            label: selectedLabel,
            action: selectedAction,
            synchronousMs: Number(synchronousMs.toFixed(3)),
            eventToPresentedFrameMs: Number((performance.now() - startedAt).toFixed(3)),
            presentedFrameDelta: presentedAfter - presentedBefore,
          });
          return;
        }
        if (performance.now() >= deadline) {
          reject(new Error(`${selectedAction} did not reach another presented gameplay frame within 2000ms`));
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
  }), { selectedLabel: label, selectedAction: action });
}

function expectBoundedProbe(probe: FrameProbe): void {
  const evidence = `${probe.label}/${probe.action} ${JSON.stringify(probe)}`;
  expect(probe.presentedFrameDelta, `${evidence}: presentation must advance`).toBeGreaterThan(0);
  expect(probe.synchronousMs, `${evidence}: synchronous action budget`).toBeLessThan(MAX_SYNCHRONOUS_ACTION_MS);
  expect(probe.eventToPresentedFrameMs, `${evidence}: event-to-next-presented-frame budget`)
    .toBeLessThan(MAX_EVENT_TO_PRESENTED_FRAME_MS);
}

test('cold carbine control, glass breach and first M14 EBR use reach the next presented frame without a freeze', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await deploy(page);
  const runtimeBefore = await captureFrameHitchRendererEvidence(page, testInfo);
  expectFrameHitchRendererEvidence(runtimeBefore, 'atomic-acres', 'glass/M14 initial runtime');
  const retainedGlassBefore = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      pool: snapshot.windowGlassDebrisPool,
      panes: snapshot.breakableWindows.map((window: any) => window.retainedDebrisPrewarmed),
    };
  });
  expect(retainedGlassBefore).toEqual({
    pool: {
      contract: 'retained-exact-instanced-render-object-v1',
      retained: 6,
      currentArenaRetained: 6,
      active: 0,
    },
    panes: [true, true, true, true, true, true],
  });

  const baseline = await eventToNextPresentedFrame(page, 'baseline-noop', 'noop');

  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.equipWeapon('carbine');
    const snapshot = debug.snapshot() as any;
    const [x, y, z] = snapshot.player.position;
    debug.teleportPlayer(x, y, z, snapshot.player.yaw, 1.25);
  });
  const coldCarbine = await eventToNextPresentedFrame(page, 'cold-carbine-empty-sky', 'fire');

  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.stageWindow(0, 4);
  });
  const coldGlass = await eventToNextPresentedFrame(page, 'cold-glass-breach', 'fire');
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).breakableWindows[0].broken)).toBe(true);

  await page.waitForTimeout(150);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stageWindow(1, 4));
  const warmGlass = await eventToNextPresentedFrame(page, 'warm-glass-breach', 'fire');
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).breakableWindows[1].broken)).toBe(true);

  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.placeBotAhead(6);
    debug.aimAtBot('body');
  });
  const m14Equip = await eventToNextPresentedFrame(page, 'm14-cold-equip', 'equip-m14');
  const m14Ads = await eventToNextPresentedFrame(page, 'm14-cold-ads-on', 'ads-on');
  const m14Shot = await eventToNextPresentedFrame(page, 'm14-cold-fire', 'fire');
  const m14AdsRelease = await eventToNextPresentedFrame(page, 'm14-ads-off', 'ads-off');
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).dmrThermal.active)).toBe(false);

  const glassAfter = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      coldWindowBroken: snapshot.breakableWindows[0].broken,
      warmWindowBroken: snapshot.breakableWindows[1].broken,
      pool: snapshot.windowGlassDebrisPool,
    };
  });
  expect(glassAfter).toMatchObject({ coldWindowBroken: true, warmWindowBroken: true });
  const runtimeAfter = await captureFrameHitchRendererEvidence(page, testInfo);
  expectFrameHitchRendererEvidence(runtimeAfter, 'atomic-acres', 'glass/M14 final runtime');

  const probes = [baseline, coldCarbine, coldGlass, warmGlass, m14Equip, m14Ads, m14Shot, m14AdsRelease];
  await testInfo.attach('event-to-presented-frame-receipt', {
    body: Buffer.from(JSON.stringify({
      renderer: runtimeAfter.runtime.actualBackend,
      maximumEventToPresentedFrameMs: MAX_EVENT_TO_PRESENTED_FRAME_MS,
      maximumSynchronousActionMs: MAX_SYNCHRONOUS_ACTION_MS,
      runtimeBefore,
      runtimeAfter,
      retainedGlassBefore,
      glassAfter,
      probes,
    }, null, 2)),
    contentType: 'application/json',
  });
  for (const probe of probes) expectBoundedProbe(probe);
  for (const probe of [coldCarbine, coldGlass, warmGlass, m14Equip, m14Ads, m14Shot, m14AdsRelease]) {
    expect(
      probe.eventToPresentedFrameMs,
      `${probe.action}: regression must remain within 4x the no-op frame plus 40ms`,
    ).toBeLessThan(baseline.eventToPresentedFrameMs * 4 + 40);
  }
  expect(browserErrors).toEqual([]);
  writeOfficialFrameHitchReceipt(
    'glass-m14',
    runtimeBefore,
    runtimeAfter,
    {
      maximumEventToPresentedFrameMs: MAX_EVENT_TO_PRESENTED_FRAME_MS,
      maximumSynchronousActionMs: MAX_SYNCHRONOUS_ACTION_MS,
      maximumRelativeMultiplier: 4,
      maximumRelativeAllowanceMs: 40,
    },
    { retainedGlassBefore, glassAfter, probes },
    browserErrors,
  );
});
