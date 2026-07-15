import { expect, test, type Page } from '@playwright/test';

type DebugState = {
  gameStarted: boolean;
  gameMode: string;
  matchPhase: 'warmup' | 'active' | 'ended';
  matchEndReason: 'score' | 'time' | null;
  scores: [number, number];
  player: {
    hp: number;
    kills: number;
    deaths: number;
    weapon: string;
    primaryWeapon: string;
    equippedWeapons: string[];
    ammo: number;
    reserve: number;
    reloading: boolean;
    stance: 'stand' | 'crouch' | 'prone';
    crouched: boolean;
    prone: boolean;
    sprinting: boolean;
    grenades: number;
    position: number[];
  };
  bots: Array<{
    id: string;
    hp: number;
    alive: boolean;
    kills: number;
    position: number[];
    waypoint: number;
    blockedSince: number;
    hasLineOfSight: boolean;
    rootVisible: boolean;
    visibleMeshCount: number;
    screenPosition: number[];
    presentationReady: boolean;
    presentationWeaponSafe: boolean;
    operatorModel: { skinnedMeshes: number; clips: number; weaponChildren: number; activeClip: string } | null;
  }>;
  remotes: number;
  remotePlayers: Array<{ id: string; stance: 'stand' | 'crouch' | 'prone'; position: number[] }>;
  grenades: number;
  fieldSupport: {
    streak: number;
    available: Record<'scout-sweep' | 'yardhawk' | 'tri-pass', boolean>;
    scoutActive: boolean;
    yardhawkActive: boolean;
    strikePasses: number;
  };
  teamPings: Array<{ kind: string; expiresInMs: number; position: number[] }>;
  activeImpactParticles: number;
  activeImpactMarks: number;
  activeTracers: number;
  originalArtLoaded: boolean;
  arenaZone: string;
  arenaStoryReady: boolean;
  interiorTelemetry: {
    houses: number;
    groundRooms: number;
    upperRooms: number;
    doors: number;
    windows: number;
    ramps: number;
    furnishings: number;
    fixtures: number;
    visibleCollisionProxies: number;
  };
  weaponReady: boolean;
  weaponPresentation: {
    weapon: 'carbine' | 'smg' | 'scattergun' | 'pistol';
    heat: number;
    shotsPresented: number;
    activeCasings: number;
    activeSmoke: number;
    detailsReady: boolean;
    modelKind: 'licensed-imported' | 'original-authored';
    adsProgress: number;
    armsVisible: boolean;
    armMeshCount: number;
    knifeVisible: boolean;
    riggedArms: Array<{ finite: boolean; bindOffsetsPreserved: boolean; contactError: number }>;
    importedModel: { source: string; weapon: string; clips: number; meshes: number; socketContractReady: boolean; muzzleForwardDot: number | null; sightForwardDot: number | null } | null;
  };
  weaponActionHistory: string[];
  menuVisible: boolean;
  networkSync: { stateIntervalMs: number; interpolationRate: number };
  networkLifecycle: { role: string; joinDeadlineActive: boolean; peerPresent: boolean; hostConnectionPresent: boolean };
  render: { profile: 'performance' | 'quality' | 'compat'; representation: 'responsive' | 'full' | 'compat'; calls: number; triangles: number; points: number; lines: number; sceneObjects: number; reducedMode: boolean; shadows: boolean; shadowMode: 'off' | 'static' | 'dynamic'; pixelRatio: number; drawingBuffer: number[]; antialias: boolean; framePacing: { ready: boolean; cadenceHz: number; medianMs: number; p95Ms: number; displayLimited: boolean }; staticBatchPalette: Array<string | null> };
};

async function debug(page: Page): Promise<DebugState> {
  return page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot());
}

async function pageReadyAt(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => {
    const status = document.querySelector<HTMLElement>('#network-status');
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    const debugApi = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__;
    const snapshot = debugApi?.snapshot();
    return status?.dataset.kind === 'ok' && solo?.disabled === false && snapshot?.weaponReady === true && snapshot.originalArtLoaded === true;
  }, undefined, { timeout: 30_000 });
}

async function pageReady(page: Page): Promise<void> {
  await pageReadyAt(page, '/?render=performance');
}

async function startSolo(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { startSolo: () => void } }).__ATOMIC_ACRES_DEBUG__.startSolo());
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active',
    undefined,
    { timeout: 15_000 },
  );
}

test.describe('boot and authored presentation', () => {
  test('boots without runtime errors and loads original art/weapons', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReady(page);
    const state = await debug(page);
    expect(state.originalArtLoaded).toBe(true);
    expect(state.weaponReady).toBe(true);
    expect(state.weaponPresentation.detailsReady).toBe(true);
    expect(state.menuVisible).toBe(true);
    expect(state.arenaStoryReady).toBe(true);
    await expect(page.locator('.eyebrow')).toContainText('HIGH REFINEMENT PASS 17');
    expect(state.networkSync).toEqual({ stateIntervalMs: 33, interpolationRate: 24 });
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/menu-structured-pass.png', fullPage: true });
  });

  test('menu exposes controls and accessibility settings', async ({ page }) => {
    await pageReady(page);
    await expect(page.locator('#solo')).toHaveText('BOT SKIRMISH');
    await page.getByRole('button', { name: 'OPTIONS' }).click();
    await expect(page.locator('#sensitivity')).toBeVisible();
    await expect(page.locator('#controller-sensitivity')).toBeVisible();
    await expect(page.locator('#field-of-view')).toBeVisible();
    await expect(page.locator('#graphics-profile')).toBeVisible();
    await expect(page.locator('#graphics-profile')).toHaveValue('performance');
    await expect(page.locator('#graphics-profile option')).toHaveCount(2);
    await expect(page.locator('#graphics-profile option')).toHaveText(['PERFORMANCE', 'QUALITY']);
    await page.locator('#controller-sensitivity').evaluate((input) => {
      const slider = input as HTMLInputElement;
      slider.value = '1.45';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.reload();
    await pageReady(page);
    await page.getByRole('button', { name: 'OPTIONS' }).click();
    await expect(page.locator('#controller-sensitivity')).toHaveValue('1.45');
    await expect(page.locator('.controls')).toContainText('crouch');
    await expect(page.locator('.controls')).toContainText('prone');
    await expect(page.locator('.controls')).toContainText('knife');
    await expect(page.locator('.controls')).toContainText('frag');
  });

  test('times out an invalid room and leaves a clean retryable state', async ({ page }) => {
    await pageReady(page);
    await page.locator('#room-input').fill('missing-room-pass17');
    await page.locator('#join').click();
    await expect(page.locator('#network-status')).toContainText('Connection timed out', { timeout: 15_000 });
    await expect(page.locator('#network-status')).toHaveAttribute('data-kind', 'error');
    await expect(page.locator('#join')).toBeEnabled();
    expect((await debug(page)).networkLifecycle).toMatchObject({
      role: 'offline', joinDeadlineActive: false, peerPresent: false, hostConnectionPresent: false,
    });
  });

  test('selects and persists an allowlisted field kit for deployment', async ({ page }) => {
    await pageReady(page);
    await page.getByRole('button', { name: 'FIELD KIT' }).click();
    const runner = page.locator('[data-kit-id="runner"]');
    await runner.click();
    await expect(runner).toHaveClass(/selected/);
    await page.getByRole('button', { name: 'DEPLOY' }).click();
    await expect(page.locator('#selected-kit-summary')).toContainText('Circuit Runner');
    await page.reload();
    await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('#solo')?.disabled === false);
    await expect(page.locator('#selected-kit-summary')).toContainText('Vectorline SMG');
    await page.locator('#solo').click();
    await expect.poll(async () => (await debug(page)).player.weapon).toBe('smg');
    expect((await debug(page)).player.equippedWeapons).toEqual(['smg', 'pistol']);
    await page.evaluate(() => {
      document.exitPointerLock();
      document.querySelector('#menu')?.classList.remove('hidden');
    });
    await expect(page.locator('#menu')).toBeVisible();
    await page.getByRole('button', { name: 'FIELD KIT' }).click();
    await page.locator('[data-kit-id="breacher"]').click();
    await expect.poll(async () => (await debug(page)).player.weapon).toBe('smg');
    await page.getByRole('button', { name: 'DEPLOY' }).click();
    await expect(page.locator('#selected-kit-summary')).toContainText('QUEUED NEXT DEPLOYMENT');
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { damage: (amount: number) => void } }).__ATOMIC_ACRES_DEBUG__.damage(999));
    await expect.poll(async () => (await debug(page)).player.weapon, { timeout: 6_000 }).toBe('scattergun');
    expect((await debug(page)).player.equippedWeapons).toEqual(['scattergun', 'pistol']);
  });
});

test.describe('solo mechanics', () => {
  test.beforeEach(async ({ page }) => {
    await pageReady(page);
    await startSolo(page);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  });

  test('spawns one bounded close-range combat bot and it navigates', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(false));
    const before = await debug(page);
    expect(before.bots).toHaveLength(1);
    expect(before.bots.every((bot) => bot.alive)).toBe(true);
    await page.waitForTimeout(1_200);
    const after = await debug(page);
    const moved = after.bots.some((bot, index) => {
      const previous = before.bots[index].position;
      return Math.hypot(bot.position[0] - previous[0], bot.position[2] - previous[2]) > 0.05;
    });
    expect(moved).toBe(true);
    expect(after.bots.every((bot) => bot.position[0] >= -33.56 && bot.position[0] <= 33.56
      && bot.position[2] >= -42.56 && bot.position[2] <= 42.56)).toBe(true);
    expect(after.bots.every((bot) => Number.isInteger(bot.waypoint) && bot.waypoint >= 0 && bot.waypoint < 8
      && Number.isFinite(bot.blockedSince))).toBe(true);
    expect(after.bots.every((bot) => bot.presentationReady && bot.presentationWeaponSafe)).toBe(true);
  });

  test('renders first-person arms and a readable hostile operator', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { placeBotAhead: (distance: number) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.placeBotAhead(5);
    });
    await page.waitForTimeout(150);
    const state = await debug(page);
    expect(state.weaponPresentation.armsVisible).toBe(true);
    expect(state.weaponPresentation.armMeshCount).toBeGreaterThanOrEqual(3);
    expect(state.weaponPresentation.modelKind).toBe('original-authored');
    expect(state.weaponPresentation.importedModel).toBeNull();
    expect(state.weaponPresentation.detailsReady).toBe(true);
    expect(state.weaponPresentation.riggedArms).toHaveLength(2);
    expect(state.weaponPresentation.riggedArms.every((arm: { finite: boolean; bindOffsetsPreserved: boolean; contactError: number }) => arm.finite && arm.bindOffsetsPreserved && arm.contactError <= 0.02)).toBe(true);
    expect(state.bots[0].rootVisible).toBe(true);
    expect(state.bots[0].visibleMeshCount).toBeGreaterThanOrEqual(19);
    expect(state.bots[0].screenPosition).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    expect(state.bots[0].operatorModel).toMatchObject({ skinnedMeshes: 5, clips: 24, weaponChildren: 1 });
    expect(Math.abs(state.bots[0].screenPosition[0])).toBeLessThan(0.5);
    expect(Math.abs(state.bots[0].screenPosition[1])).toBeLessThan(0.8);
    await page.screenshot({ path: 'test-results/performance-arms-operator.png' });
  });

  test('plays a bounded rigged death animation before a clean respawn', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { placeBotAhead: (distance: number) => void; damageBot: (amount: number) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.placeBotAhead(5);
      api.damageBot(999);
    });
    await expect.poll(async () => (await debug(page)).bots[0].alive).toBe(false);
    const dying = (await debug(page)).bots[0];
    expect(dying.rootVisible).toBe(true);
    expect(dying.operatorModel?.activeClip).toBe('Death');
    await page.waitForTimeout(1_200);
    expect((await debug(page)).bots[0].rootVisible).toBe(false);
    await expect.poll(async () => (await debug(page)).bots[0].alive, { timeout: 2_000 }).toBe(true);
    expect((await debug(page)).bots[0].operatorModel?.activeClip).toBe('Idle_Gun_Pointing');
  });

  test('animates the knife on misses while keeping first-person arms visible', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { melee: () => void } }).__ATOMIC_ACRES_DEBUG__.melee());
    await expect.poll(async () => (await debug(page)).weaponPresentation.knifeVisible, { timeout: 350 }).toBe(true);
    const active = await debug(page);
    expect(active.weaponPresentation.armsVisible).toBe(true);
    expect(active.weaponPresentation.armMeshCount).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(650);
    expect((await debug(page)).weaponPresentation.knifeVisible).toBe(false);
  });

  test('earns and activates all three bounded field supports', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { earnSupport: (kills: number) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.earnSupport(7);
    });
    expect((await debug(page)).fieldSupport.available).toEqual({
      'scout-sweep': true,
      yardhawk: true,
      'tri-pass': true,
    });
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { activateSupport: (id: 'scout-sweep' | 'yardhawk' | 'tri-pass') => void } }).__ATOMIC_ACRES_DEBUG__;
      api.activateSupport('scout-sweep');
      api.activateSupport('yardhawk');
      api.activateSupport('tri-pass');
    });
    await expect.poll(async () => (await debug(page)).fieldSupport.scoutActive).toBe(true);
    await expect.poll(async () => (await debug(page)).fieldSupport.yardhawkActive).toBe(true);
    await expect.poll(async () => (await debug(page)).fieldSupport.strikePasses, { timeout: 2_000 }).toBeGreaterThan(0);
    expect(Object.values((await debug(page)).fieldSupport.available)).toEqual([false, false, false]);
  });

  test('rate-limits fixed team pings and cleans their markers', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { sendPing: (kind: 'enemy' | 'push') => void } }).__ATOMIC_ACRES_DEBUG__;
      api.sendPing('enemy');
      api.sendPing('push');
    });
    expect((await debug(page)).teamPings.map((ping) => ping.kind)).toEqual(['enemy']);
    await page.waitForTimeout(1_050);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { sendPing: (kind: 'push') => void } }).__ATOMIC_ACRES_DEBUG__.sendPing('push'));
    expect((await debug(page)).teamPings.map((ping) => ping.kind)).toEqual(['enemy', 'push']);
    await expect(page.locator('#killfeed')).toContainText('ENEMY');
    await expect(page.locator('#killfeed')).toContainText('PUSH');
    await expect.poll(async () => (await debug(page)).teamPings.length, { timeout: 7_000 }).toBe(0);
  });

  test('opening the deployment menu neutralizes movement input', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { openMenu: () => void } }).__ATOMIC_ACRES_DEBUG__.openMenu());
    await expect(page.locator('#menu')).toBeVisible();
    const before = await debug(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');
    const after = await debug(page);
    expect(Math.hypot(
      after.player.position[0] - before.player.position[0],
      after.player.position[2] - before.player.position[2],
    )).toBeLessThan(0.02);
  });

  test('menu interruption cancels a pre-seat reload without stale action events', async ({ page }) => {
    await page.evaluate(() => {
      const debug = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void; reload: () => void } }).__ATOMIC_ACRES_DEBUG__;
      debug.fireOnce();
      debug.reload();
    });
    await page.waitForTimeout(110);
    expect((await debug(page)).player.reloading).toBe(true);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { openMenu: () => void } }).__ATOMIC_ACRES_DEBUG__.openMenu());
    const interrupted = await debug(page);
    expect(interrupted.player.reloading).toBe(false);
    const eventCount = interrupted.weaponActionHistory.length;
    await page.waitForTimeout(900);
    expect((await debug(page)).weaponActionHistory).toHaveLength(eventCount);
  });

  test('walk, sprint, crouch and prone alter the real player stance', async ({ page }) => {
    const before = await debug(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(650);
    await page.keyboard.up('KeyW');
    const walked = await debug(page);
    expect(Math.hypot(walked.player.position[0] - before.player.position[0], walked.player.position[2] - before.player.position[2])).toBeGreaterThan(0.4);

    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(160);
    expect((await debug(page)).player.sprinting).toBe(true);
    await page.waitForTimeout(490);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');

    await page.keyboard.down('KeyC');
    await page.waitForTimeout(120);
    const crouched = await debug(page);
    expect(crouched.player.crouched).toBe(true);
    await page.keyboard.up('KeyC');

    await page.keyboard.down('KeyS');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(180);
    const backwardSprintAttempt = await debug(page);
    expect(backwardSprintAttempt.player.stance).toBe('crouch');
    expect(backwardSprintAttempt.player.sprinting).toBe(false);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyS');

    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(180);
    const prone = await debug(page);
    expect(prone.player.stance).toBe('prone');
    expect(prone.player.prone).toBe(true);
    expect(prone.player.position[1]).toBeLessThan(crouched.player.position[1] - 0.45);

    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(180);
    const recovered = await debug(page);
    expect(recovered.player.stance).toBe('stand');
    expect(recovered.player.sprinting).toBe(true);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
  });

  test('fires, switches only between the class primary and service pistol, then reloads', async ({ page }) => {
    const before = await debug(page);
    expect(before.player.primaryWeapon).toBe('carbine');
    expect(before.player.equippedWeapons).toEqual(['carbine', 'pistol']);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForTimeout(120);
    const fired = await debug(page);
    expect(fired.player.ammo).toBeLessThan(before.player.ammo);
    expect(fired.activeImpactParticles).toBeGreaterThan(0);
    expect(fired.activeImpactMarks).toBeGreaterThan(0);
    expect(fired.activeImpactMarks).toBeLessThanOrEqual(32);
    expect(fired.activeTracers).toBeLessThanOrEqual(18);
    expect(fired.weaponPresentation.weapon).toBe('carbine');
    expect(fired.weaponPresentation.detailsReady).toBe(true);
    expect(fired.weaponPresentation.shotsPresented).toBe(before.weaponPresentation.shotsPresented + 1);
    expect(fired.weaponPresentation.heat).toBeGreaterThan(0);
    await expect.poll(async () => (await debug(page)).weaponPresentation.activeCasings, { timeout: 800 }).toBeGreaterThan(0);
    expect((await debug(page)).weaponPresentation.activeCasings).toBeLessThanOrEqual(16);
    expect(fired.weaponPresentation.activeSmoke).toBeGreaterThan(0);
    expect(fired.weaponPresentation.activeSmoke).toBeLessThanOrEqual(8);

    await page.keyboard.press('Digit2');
    await page.waitForTimeout(450);
    expect((await debug(page)).player.weapon).toBe('pistol');
    expect((await debug(page)).weaponPresentation.detailsReady).toBe(true);

    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForTimeout(120);
    const beforeReload = await debug(page);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(1_750);
    const afterReload = await debug(page);
    expect(afterReload.player.ammo).toBeGreaterThan(beforeReload.player.ammo);
    expect(afterReload.player.reserve).toBeLessThan(beforeReload.player.reserve);
    expect(afterReload.weaponActionHistory).toEqual(['mag-release', 'mag-out', 'mag-in', 'mag-seat', 'bolt-release']);

    await page.keyboard.press('Digit3');
    await page.waitForTimeout(250);
    expect((await debug(page)).player.weapon).toBe('pistol');
    await page.keyboard.press('Digit1');
    await expect.poll(async () => (await debug(page)).player.weapon).toBe('carbine');
  });

  test('throws one frag, consumes inventory and resolves the fuse', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { throwGrenade: () => void } }).__ATOMIC_ACRES_DEBUG__.throwGrenade());
    await page.waitForTimeout(100);
    const thrown = await debug(page);
    expect(thrown.player.grenades).toBe(0);
    expect(thrown.grenades).toBe(1);
    await page.waitForTimeout(2_500);
    expect((await debug(page)).grenades).toBe(0);
  });

  test('HUD reports match, stance, equipment and bots in roster', async ({ page }) => {
    await expect(page.locator('#connection-pill')).toHaveText('BOT SKIRMISH');
    await expect(page.locator('#objective')).toContainText('FIRST TO 25');
    await expect(page.locator('#grenades')).toHaveText('FRAG ×1');
    await expect(page.locator('#minimap')).toBeVisible();
    await expect(page.locator('#location-label')).toHaveText(/AQUA HOUSE|CORAL HOUSE|SKYLINE GARDEN|SOLAR SERVICE|ATOM-LINER CROSSING/);
    await page.keyboard.down('Tab');
    await expect(page.locator('#roster-list > div')).toHaveCount(2);
    await page.keyboard.up('Tab');
    await page.screenshot({ path: 'test-results/gameplay-structured-pass.png', fullPage: true });
  });

  test('ends on the score limit and performs a complete rematch reset', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { endMatch: () => void } }).__ATOMIC_ACRES_DEBUG__.endMatch());
    const ended = await debug(page);
    expect(ended.matchPhase).toBe('ended');
    expect(ended.matchEndReason).toBe('score');
    expect(ended.scores[0] + ended.scores[1]).toBeGreaterThanOrEqual(25);
    await expect(page.locator('#banner')).toContainText('VICTORY');
    await expect(page.locator('#rematch')).toBeVisible();
    await page.locator('#rematch').click();
    await expect.poll(async () => (await debug(page)).matchPhase, { timeout: 6_000 }).toBe('active');
    expect((await debug(page)).scores).toEqual([0, 0]);
    await expect(page.locator('#banner')).toBeHidden();
  });

  test('shows directional damage, ADS telemetry and delayed health recovery', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setAds: (held: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setAds(true));
    expect((await debug(page)).weaponPresentation.adsProgress).toBeLessThan(0.9);
    await expect(page.locator('#crosshair')).not.toHaveClass(/ads/);
    await page.waitForTimeout(150);
    expect((await debug(page)).weaponPresentation.adsProgress).toBeGreaterThanOrEqual(0.9);
    await expect(page.locator('#crosshair')).toHaveClass(/ads/);
    await expect(page.locator('#crosshair i').first()).toHaveCSS('opacity', '0');
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setAds: (held: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setAds(false));

    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { damage: (amount: number) => void } }).__ATOMIC_ACRES_DEBUG__.damage(40));
    const damaged = await debug(page);
    expect(damaged.player.hp).toBeLessThanOrEqual(60);
    await expect(page.locator('#damage-direction')).toHaveClass(/pulse/);
    await page.waitForTimeout(5_700);
    expect((await debug(page)).player.hp).toBeGreaterThan(damaged.player.hp);
  });
});

test.describe('performance and stability', () => {
  test('Performance keeps readable art within its smooth rendering budget', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=performance');
    await startSolo(page);
    await page.waitForTimeout(500);
    const state = await debug(page);
    expect(state.render.profile).toBe('performance');
    expect(state.render.representation).toBe('responsive');
    expect(state.render.reducedMode).toBe(true);
    expect(state.render.shadows).toBe(false);
    expect(state.render.shadowMode).toBe('off');
    expect(state.render.pixelRatio).toBeCloseTo(0.75, 5);
    expect(state.render.antialias).toBe(false);
    const overlays = await page.evaluate(() => ({
      grade: getComputedStyle(document.querySelector('#color-grade')!).display,
      grain: getComputedStyle(document.querySelector('#film-grain')!).display,
    }));
    expect(overlays).toEqual({ grade: 'none', grain: 'none' });
    const viewport = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    expect(state.render.drawingBuffer[0]).toBeLessThanOrEqual(Math.ceil(viewport[0] * 0.75));
    expect(state.render.drawingBuffer[1]).toBeLessThanOrEqual(Math.ceil(viewport[1] * 0.75));
    expect(state.render.calls).toBeLessThanOrEqual(140);
    expect(state.render.triangles).toBeLessThanOrEqual(150_000);
    expect(state.render.staticBatchPalette).toEqual(expect.arrayContaining(['789d55', '4eaaa7', 'c66d5a']));
    expect(state.interiorTelemetry).toEqual({
      houses: 2,
      groundRooms: 4,
      upperRooms: 4,
      doors: 2,
      windows: 4,
      ramps: 2,
      furnishings: 0,
      fixtures: 0,
      visibleCollisionProxies: 0,
    });
    expect(errors).toEqual([]);
  });

  test('Quality keeps textured architecture and full combat presentation within budget', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=quality');
    await startSolo(page);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void; placeBotAhead: (distance: number) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.placeBotAhead(5);
    });
    await page.waitForTimeout(350);
    const state = await debug(page);
    expect(state.render.profile).toBe('quality');
    expect(state.render.representation).toBe('full');
    expect(state.render.shadowMode).toBe('off');
    expect(state.render.shadows).toBe(false);
    expect(state.render.pixelRatio).toBeLessThanOrEqual(1);
    expect(state.render.calls).toBeLessThanOrEqual(160);
    expect(state.render.triangles).toBeLessThanOrEqual(150_000);
    expect(state.weaponPresentation.armsVisible).toBe(true);
    expect(state.weaponPresentation.armMeshCount).toBe(6);
    expect(state.weaponPresentation.attachedWeaponBatchStats).toEqual({ sourceMeshes: 38, batches: 2 });
    expect(state.weaponPresentation.modelKind).toBe('original-authored');
    expect(state.weaponPresentation.importedModel).toBeNull();
    expect(state.weaponPresentation.detailsReady).toBe(true);
    expect(state.weaponPresentation.riggedArms).toHaveLength(2);
    expect(state.weaponPresentation.riggedArms.every((arm: { finite: boolean; bindOffsetsPreserved: boolean; contactError: number }) => arm.finite && arm.bindOffsetsPreserved && arm.contactError <= 0.02)).toBe(true);
    expect(state.bots[0].visibleMeshCount).toBeGreaterThanOrEqual(19);
    expect(state.bots[0].screenPosition).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    expect(state.bots[0].operatorModel).toMatchObject({ skinnedMeshes: 5, clips: 24, weaponChildren: 1 });
    expect(state.interiorTelemetry).toEqual({
      houses: 2,
      groundRooms: 4,
      upperRooms: 4,
      doors: 2,
      windows: 4,
      ramps: 2,
      furnishings: 0,
      fixtures: 0,
      visibleCollisionProxies: 0,
    });
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/quality-arms-operator.png' });
  });
});
