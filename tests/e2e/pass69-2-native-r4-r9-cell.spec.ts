import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { TIMED_MAP_WEAPON_DEFINITIONS, type TimedMapWeaponId } from '../../src/timed-map-weapon-authority';
import type { WeaponId } from '../../src/protocol';

const mode = process.env.PASS69_NATIVE_MODE;
const weapon = process.env.PASS69_NATIVE_WEAPON as WeaponId | undefined;
const arena = process.env.PASS69_NATIVE_ARENA;
const profile = process.env.PASS69_NATIVE_PROFILE;
const expectedSourceSha = process.env.PASS69_NATIVE_SOURCE_SHA ?? '';
const cellId = process.env.PASS69_NATIVE_CELL_ID ?? '';
const output = resolve(process.cwd(), 'artifacts/pass69-2/native-r4-r9/cells');
const receiptPath = resolve(output, `${cellId}.json`);

const SNIPERS = new Set<WeaponId>(['sniper', 'm14-ebr', 'railgun']);
const TIMED = new Set<TimedMapWeaponId>(['flamethrower', 'flare-gun']);
const PROFILES = new Set(['performance', 'blender', 'compat']);
const ARENAS = new Set(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range']);

async function deploy(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/?release=latest&map=${arena}&renderer=webgpu&requireWebGPU=1&render=${profile}&multiplayerQa=1&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=${cellId}`);
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.bootstrap?.stage === 'ready' && snapshot?.weaponReady === true
      && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
  }, undefined, { timeout: 60_000 });
  await page.bringToFront();
  // The gameplay canvas is deliberately hidden while the deployment menu is
  // active. Use the visible player-facing launch control so focus acquisition
  // remains trusted and the native gate cannot stall on a hidden surface.
  await page.locator('#player-name').fill(`PASS69 ${cellId}`);
  await page.locator('#solo').click();
  await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus(), undefined, { timeout: 5_000 });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

async function startTimingProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = { active: true, frames: 0, maxGapMs: 0, lastAtMs: performance.now(), longTasks: [] as number[] };
    (window as any).__PASS69_NATIVE_TIMING__ = probe;
    const observer = 'PerformanceObserver' in window
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) probe.longTasks.push(entry.duration);
        })
      : null;
    try { observer?.observe({ entryTypes: ['longtask'] }); } catch { /* unsupported browsers fail through frame evidence */ }
    (window as any).__PASS69_NATIVE_LONG_TASK_OBSERVER__ = observer;
    const tick = (now: number) => {
      if (!probe.active) return;
      probe.frames += 1;
      probe.maxGapMs = Math.max(probe.maxGapMs, now - probe.lastAtMs);
      probe.lastAtMs = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopTimingProbe(page: Page): Promise<Readonly<{ frames: number; maxGapMs: number; longTasks: number[] }>> {
  return page.evaluate(() => {
    const probe = (window as any).__PASS69_NATIVE_TIMING__ as {
      active: boolean; frames: number; maxGapMs: number; longTasks: number[];
    };
    probe.active = false;
    (window as any).__PASS69_NATIVE_LONG_TASK_OBSERVER__?.disconnect();
    return { frames: probe.frames, maxGapMs: probe.maxGapMs, longTasks: [...probe.longTasks] };
  });
}

async function sampleHealth(page: Page) {
  return page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = api.snapshot() as any;
    return {
      runtime: snapshot.render.runtime,
      presentation: api.samplePresentationTelemetry(),
      endurance: api.sampleEnduranceHealth(),
      admission: api.admissionState(),
      focused: document.hasFocus(),
      visibility: document.visibilityState,
      runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false
        || document.querySelector<HTMLElement>('#runtime-error-log')?.hidden === false,
    };
  });
}

function assertHealthy(sample: Awaited<ReturnType<typeof sampleHealth>>): void {
  expect(sample.focused).toBe(true);
  expect(sample.visibility).toBe('visible');
  expect(sample.runtime).toMatchObject({
    actualBackend: 'webgpu', softwareAdapter: false, deviceLost: false, uncapturedErrors: 0,
    presentation: { status: 'healthy', completionFailures: 0 },
  });
  expect(sample.presentation).toMatchObject({ status: 'healthy', completionFailures: 0 });
  expect(sample.runtimeErrorVisible).toBe(false);
}

async function equipSniper(page: Page, sniper: WeaponId): Promise<void> {
  await page.evaluate((weaponId) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    api.setAds(false);
    if (api.snapshot().player.weapon === weaponId) return;
    if (weaponId === 'railgun') {
      const staged = api.stageRailgunSpawn(0);
      if (Array.isArray(staged.pickupPosition)) {
        api.teleportPlayer(...staged.pickupPosition);
        if (api.interactRailgun() !== true) throw new Error('Railgun pickup was rejected');
      } else {
        // Railgun world spawns are deliberately Atomic-Acres-only. Other
        // arenas still need the real scoped renderer exercised by this matrix.
        if (api.grantRailgunToLocal() !== true) throw new Error('QA railgun authority grant was rejected');
      }
    } else {
      api.equipWeapon(weaponId);
    }
  }, sniper);
  await page.waitForFunction((weaponId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.weapon === weaponId, sniper);
}

async function runSniperCycle(page: Page, sniper: WeaponId, cycle: 'cold' | 'warm') {
  await equipSniper(page, sniper);
  const before = await sampleHealth(page);
  assertHealthy(before);
  await startTimingProbe(page);
  const startedAt = await page.evaluate(() => performance.now());
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
  await page.waitForFunction((weaponId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    if (state?.weaponPresentation?.adsProgress < 0.98) return false;
    if (weaponId === 'sniper') return state.sniperScope.active === true;
    if (weaponId === 'm14-ebr') return state.dmrThermal.active === true;
    return state.railgun.thermalVisible === true;
  }, sniper, { polling: 'raf', timeout: 2_500 });
  const settledAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(1_200);
  const timing = await stopTimingProbe(page);
  const after = await sampleHealth(page);
  const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
  const actionDurationMs = settledAt - startedAt;
  expect(actionDurationMs, `${sniper}/${arena}/${profile}/${cycle}: ADS entry`).toBeLessThan(2_500);
  expect(timing.frames).toBeGreaterThan(8);
  expect(timing.maxGapMs, `${sniper}/${arena}/${profile}/${cycle}: presentation progress fence`).toBeLessThan(1_300);
  expect(after.admission.presentedGameplayFrame - before.admission.presentedGameplayFrame).toBeGreaterThan(2);
  expect(state.aimAlignment.errorCssPixels).toBeLessThanOrEqual(1);
  expect(state.weaponPresentation.adsProgress).toBeGreaterThan(0.98);
  assertHealthy(after);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(false));
  await page.waitForTimeout(200);
  return { cycle, actionDurationMs, timing, before, after, alignmentErrorCssPixels: state.aimAlignment.errorCssPixels };
}

async function stageTimedWeapon(page: Page, timedWeapon: TimedMapWeaponId): Promise<void> {
  const returnPosition = timedWeapon === 'flare-gun'
    ? await page.evaluate(() => [...(window.__ATOMIC_ACRES_DEBUG__!.snapshot() as any).player.position] as [number, number, number])
    : null;
  const staged = await page.evaluate((weaponId) => (
    (window.__ATOMIC_ACRES_DEBUG__ as any).stageTimedMapWeaponMidpoint(weaponId, 'exact')
  ), timedWeapon);
  expect(staged.status).toBe('available');
  const [x, y, z] = TIMED_MAP_WEAPON_DEFINITIONS[timedWeapon].spawnPosition;
  await page.evaluate(([px, py, pz]) => (
    window.__ATOMIC_ACRES_DEBUG__ as any
  ).teleportPlayer(px, py, pz, 0, 0.9), [x, y, z]);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop())).toBe(true);
  await page.waitForFunction((weaponId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.weapon === weaponId, timedWeapon);
  // Timed-weapon pickup uses the same 280 ms first-person switch transition as
  // an ordinary player equip. Let that authored transition finish before the
  // measured cold/warm trigger cycles begin.
  await page.waitForTimeout(350);
  if (timedWeapon === 'flare-gun') {
    const target = await page.evaluate(([px, py, pz]) => {
      const api = window.__ATOMIC_ACRES_DEBUG__ as any;
      api.teleportPlayer(px, py, pz, 0, 0);
      api.placeBotAhead(2.5);
      api.aimAtBot('body');
      const snapshot = api.snapshot() as any;
      const bot = snapshot.bots[0];
      const [tx, , tz] = bot?.position ?? [Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY];
      return {
        alive: bot?.alive === true,
        hostile: bot?.team !== snapshot.player.team,
        distance: Math.hypot(tx - snapshot.player.position[0], tz - snapshot.player.position[2]),
      };
    }, returnPosition!);
    expect(target.alive).toBe(true);
    expect(target.hostile).toBe(true);
    expect(target.distance).toBeLessThanOrEqual(3);
  }
}

async function runTimedCycle(page: Page, timedWeapon: TimedMapWeaponId, cycle: 'cold' | 'warm') {
  if (timedWeapon === 'flare-gun') {
    await page.waitForFunction(() => {
      const player = (window.__ATOMIC_ACRES_DEBUG__!.snapshot() as any).player;
      return player.ammo > 0 && player.reloading === false;
    }, undefined, { polling: 'raf', timeout: 5_000 });
  }
  const before = await sampleHealth(page);
  assertHealthy(before);
  const beforeEffects = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).timedMapWeapons);
  await startTimingProbe(page);
  const startedAt = await page.evaluate(() => performance.now());
  let actionCompletedAt = startedAt;
  if (timedWeapon === 'flamethrower') {
    // The authored flamethrower has a real 180 ms spin-up and the runtime
    // deliberately ignores primary fire until the gameplay canvas owns pointer
    // lock. Acquire the same trusted input state used by the canonical Pass 66
    // timed-weapon gate before holding the real trigger.
    await page.locator('#game').click({ position: { x: 640, y: 360 } });
    await page.waitForFunction(
      () => document.pointerLockElement === document.querySelector('#game'),
      undefined,
      { timeout: 5_000 },
    );
    await page.mouse.down();
    try {
      await page.waitForFunction((emissions) => {
        const telemetry = (window.__ATOMIC_ACRES_DEBUG__!.snapshot() as any).timedMapWeapons.flameStream;
        return telemetry.emissions > emissions && telemetry.groundFireActive > 0;
      }, beforeEffects.flameStream.emissions, { polling: 'raf', timeout: 5_000 });
    } finally {
      await page.mouse.up();
    }
    actionCompletedAt = await page.evaluate(() => performance.now());
  } else {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
    actionCompletedAt = await page.evaluate(() => performance.now());
    for (const metric of ['spawnCount', 'impactCount', 'burnPulseCount'] as const) {
      await expect.poll(async () => page.evaluate((name) => {
        const telemetry = (window.__ATOMIC_ACRES_DEBUG__!.snapshot() as any).timedMapWeapons.flareProjectiles;
        return telemetry[name] as number;
      }, metric), {
        message: `flare ${metric} must advance during ${cycle}`,
        timeout: 5_000,
      }).toBeGreaterThan(beforeEffects.flareProjectiles[metric]);
    }
  }
  await page.waitForTimeout(1_200);
  const timing = await stopTimingProbe(page);
  const after = await sampleHealth(page);
  const afterEffects = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).timedMapWeapons);
  const actionDurationMs = actionCompletedAt - startedAt;
  expect(timing.frames).toBeGreaterThan(8);
  expect(timing.maxGapMs, `${timedWeapon}/${profile}/${cycle}: presentation progress fence`).toBeLessThan(1_300);
  expect(after.admission.presentedGameplayFrame - before.admission.presentedGameplayFrame).toBeGreaterThan(8);
  assertHealthy(after);
  if (timedWeapon === 'flamethrower') {
    expect(afterEffects.flameStream.emissions).toBeGreaterThan(beforeEffects.flameStream.emissions);
    expect(afterEffects.flameStream.particlesSpawned).toBeGreaterThan(beforeEffects.flameStream.particlesSpawned);
    expect(afterEffects.flameStream.groundFireActive).toBeGreaterThan(0);
    expect(afterEffects.flameStream.poolExhaustions).toBe(0);
  } else {
    expect(actionDurationMs).toBeLessThan(250);
    expect(afterEffects.flareProjectiles.spawnCount).toBeGreaterThan(beforeEffects.flareProjectiles.spawnCount);
    expect(afterEffects.flareProjectiles.impactCount).toBeGreaterThan(beforeEffects.flareProjectiles.impactCount);
    expect(afterEffects.flareProjectiles.burnPulseCount).toBeGreaterThan(beforeEffects.flareProjectiles.burnPulseCount);
    expect(afterEffects.flareProjectiles.poolExhaustions).toBe(0);
    expect(afterEffects.flareProjectiles.replicaRejectedSnapshots).toBe(0);
  }
  return { cycle, actionDurationMs, timing, before, after, effectsBefore: beforeEffects, effectsAfter: afterEffects };
}

test('proves one strict native cold/warm R4 or R9 cell', async ({ page, browserName }) => {
  test.setTimeout(180_000);
  expect(mode === 'sniper' || mode === 'timed').toBe(true);
  expect(weapon).toBeTruthy();
  expect(ARENAS.has(arena ?? '')).toBe(true);
  expect(PROFILES.has(profile ?? '')).toBe(true);
  expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
  expect(cellId).toMatch(/^[a-z0-9-]+$/u);
  if (mode === 'sniper') expect(SNIPERS.has(weapon!)).toBe(true);
  else expect(TIMED.has(weapon as TimedMapWeaponId)).toBe(true);
  expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()).toBe('');
  expect(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(expectedSourceSha);
  mkdirSync(output, { recursive: true });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) consoleErrors.push(message.text());
  });
  await deploy(page);
  let cycles;
  if (mode === 'sniper') {
    cycles = [await runSniperCycle(page, weapon!, 'cold'), await runSniperCycle(page, weapon!, 'warm')];
  } else {
    const timedWeapon = weapon as TimedMapWeaponId;
    await stageTimedWeapon(page, timedWeapon);
    cycles = [await runTimedCycle(page, timedWeapon, 'cold'), await runTimedCycle(page, timedWeapon, 'warm')];
  }
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  const final = await sampleHealth(page);
  assertHealthy(final);
  const sourceShaAfter = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  expect(sourceShaAfter).toBe(expectedSourceSha);
  expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()).toBe('');
  writeFileSync(receiptPath, `${JSON.stringify({
    schema: 'atomic-acres/pass69-2-native-edge-webgpu-r4-r9-cell@1',
    verdict: 'pass', checkedAt: new Date().toISOString(), sourceRevision: expectedSourceSha,
    cellId, mode, weapon, arena, profile,
    browser: { name: browserName, channel: 'msedge', version: await page.context().browser()!.version(), headless: false },
    thresholds: { actionProgressStallMs: 1_300, adsEntryMs: 2_500, dwellMs: 1_200 },
    cycles, final, pageErrors, consoleErrors,
  }, null, 2)}\n`);
});
