import { expect, test, type Page } from '@playwright/test';

type DebugState = {
  gameStarted: boolean;
  frameCount: number;
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
  grenadeVisual: {
    status: 'idle' | 'loading' | 'ready' | 'fallback';
    asset: string;
    sourceMeshCount: number;
    sourceMaxDimension: number;
    targetMaxDimension: number;
    active: Array<{ name: string; authored: boolean; meshes: number }>;
  };
  grenadeExplosion: {
    total: number;
    activeVisuals: number;
    poolCapacity: number;
    dynamicLights: number;
    prewarmed: boolean;
    lastExplosionAgeMs: number | null;
    profile: { disposeMs: number; audioMs: number; visualMs: number; targetDamageMs: number; selfDamageMs: number; totalSyncMs: number };
  };
  audio: {
    sanctifiedFragChoir: {
      asset: string;
      status: 'idle' | 'loading' | 'fetched' | 'decoding' | 'ready' | 'error';
      ready: boolean;
      prewarmed: boolean;
      byteLength: number;
      durationSeconds: number;
      plays: number;
    };
  };
  fieldSupport: {
    streak: number;
    available: Record<'scout-sweep' | 'yardhawk' | 'tri-pass', boolean>;
    scoutActive: boolean;
    yardhawk: { active: boolean; phase: 'thrown' | 'homing' | null; targetId?: string; position?: number[]; armedInMs?: number };
    yardhawkExplosions: number;
    tacticalMapOpen: boolean;
    tacticalTargets: Array<{ x: number; z: number }>;
    strikeMissiles: Array<{ target: number[]; impactInMs: number; position: number[] }>;
    triPassLaunches: number;
    triPassImpacts: number;
    triPassLastImpactDelayMs: number | null;
  };
  deathDrops: Array<{ id: string; weapon: string; ammoAvailable: boolean; weaponAvailable: boolean; position: number[]; expiresInMs: number }>;
  breakableWindows: Array<{ id: string; broken: boolean; visible: boolean; position: number[] }>;
  minimap: { backingWidth: number; cssWidth: number; headingDegrees: number };
  houseNavigation: Array<{
    id: string;
    dimensions: { width: number; depth: number; wallThickness: number };
    rampWidth: number;
    indoorRampWidth: number;
    rampNames: string[];
    floorSections: string[];
    routeAnchors: number;
    indoorRouteAnchors: number;
  }>;
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
    visibleRamps: number;
  };
  weaponReady: boolean;
  weaponPresentation: {
    weapon: 'carbine' | 'smg' | 'scattergun' | 'sniper' | 'pistol' | 'machine-pistol';
    heat: number;
    shotsPresented: number;
    activeCasings: number;
    activeSmoke: number;
    detailsReady: boolean;
    modelKind: 'licensed-imported' | 'original-authored';
    adsProgress: number;
    sightOffset: [number, number] | null;
    armsVisible: boolean;
    armMeshCount: number;
    attachedWeaponBatchStats: { sourceMeshes: number; batches: number };
    knifeVisible: boolean;
    riggedArms: Array<{ finite: boolean; bindOffsetsPreserved: boolean; contactError: number }>;
    importedModel: { source: string; weapon: string; clips: number; meshes: number; socketContractReady: boolean; muzzleForwardDot: number | null; sightForwardDot: number | null } | null;
  };
  sniperScope: { active: boolean; magnification: number; baseFov: number; cameraFov: number; viewmodelVisible: boolean };
  weaponActionHistory: string[];
  menuVisible: boolean;
  networkSync: { stateIntervalMs: number; interpolationRate: number };
  networkLifecycle: { role: string; joinDeadlineActive: boolean; peerPresent: boolean; hostConnectionPresent: boolean };
  render: {
    profile: 'performance' | 'quality' | 'blender' | 'compat';
    representation: 'responsive' | 'full' | 'blender' | 'compat';
    calls: number;
    triangles: number;
    points: number;
    lines: number;
    sceneObjects: number;
    reducedMode: boolean;
    shadows: boolean;
    shadowMode: 'off' | 'static' | 'dynamic';
    pixelRatio: number;
    drawingBuffer: number[];
    antialias: boolean;
    lighting: {
      exposure: number;
      hemisphereIntensity: number;
      ambientIntensity: number;
      sunIntensity: number;
      shadowBias: number;
      shadowNormalBias: number;
      softShadows: boolean;
    };
    framePacing: { ready: boolean; cadenceHz: number; medianMs: number; p95Ms: number; displayLimited: boolean };
    staticBatchPalette: Array<string | null>;
    blenderEnvironment: {
      status: 'idle' | 'loading' | 'ready' | 'fallback';
      asset: string;
      meshCount: number;
      materialCount: number;
      texturedMaterials: number;
      textureCount: number;
      triangleCount: number;
      semanticWindows: number;
      boundWindows: number;
      proceduralWorldHidden: boolean;
      error: string | null;
    };
  };
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
    await expect(page.locator('.eyebrow')).toContainText('TEXTURED BLENDER PASS 24');
    expect(state.networkSync).toEqual({ stateIntervalMs: 33, interpolationRate: 24 });
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/menu-structured-pass.png', fullPage: true });
  });

  test('loads the complete Blender Render arena and binds authored breakable windows', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=blender');
    const menuState = await debug(page);
    expect(menuState.render).toMatchObject({
      profile: 'blender', representation: 'blender', antialias: true,
      shadows: true, shadowMode: 'static',
      lighting: {
        exposure: 1.02, hemisphereIntensity: 1, ambientIntensity: 0.18,
        sunIntensity: 2.45, shadowBias: -0.00012, shadowNormalBias: 0.04, softShadows: false,
      },
      blenderEnvironment: {
        status: 'ready', meshCount: 25, materialCount: 19, texturedMaterials: 12, textureCount: 9, triangleCount: 18_884,
        semanticWindows: 6, boundWindows: 6, proceduralWorldHidden: true, error: null,
      },
    });
    expect(menuState.render.calls).toBeLessThanOrEqual(70);
    await expect(page.locator('#graphics-profile')).toHaveValue('blender');
    await startSolo(page);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setBotsFrozen: (frozen: boolean) => void;
        stageWindow: (index: number, distance?: number) => void;
        equipWeapon: (weapon: string) => void;
        setAds: (held: boolean) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.stageWindow(0, 5);
      api.equipWeapon('carbine');
      api.setAds(true);
    });
    await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation.adsProgress >= 0.98, undefined, { timeout: 15_000 });
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows[0]?.broken === true, undefined, { timeout: 10_000 });
    const activeState = await debug(page);
    expect(activeState.breakableWindows[0]).toMatchObject({ broken: true, visible: false });
    expect(activeState.render.blenderEnvironment.status).toBe('ready');
    expect(activeState.render.calls).toBeLessThanOrEqual(90);
    expect(activeState.render.triangles).toBeLessThanOrEqual(100_000);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/blender-render-gameplay.png' });
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
    await expect(page.locator('#graphics-profile option')).toHaveCount(3);
    await expect(page.locator('#graphics-profile option')).toHaveText(['PERFORMANCE', 'QUALITY', 'BLENDER RENDER']);
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

  test('sprints smoothly from the foot to the landing of both house ramps', async ({ page }) => {
    type RampStage = { kind: 'interior' | 'exterior'; start: number[]; top: number[]; uphill: number[]; run: number };
    for (const kind of ['interior', 'exterior'] as const) {
      const stage = await page.evaluate((rampKind) => {
        const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { stageHouseRamp: (value: 'interior' | 'exterior') => RampStage | null } }).__ATOMIC_ACRES_DEBUG__;
        return api.stageHouseRamp(rampKind);
      }, kind);
      expect(stage, `${kind}:stage`).not.toBeNull();
      if (!stage) throw new Error(`Unable to stage ${kind} ramp`);
      await page.waitForTimeout(120);
      const traversalStart = await page.evaluate(() => ({
        frame: (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().frameCount,
        now: performance.now(),
      }));
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      await page.waitForFunction(
        (start) => {
          const frame = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().frameCount;
          return performance.now() - start.now >= 2_400 && frame - start.frame >= 36;
        },
        traversalStart,
        { timeout: 15_000 },
      );
      await page.keyboard.up('KeyW');
      await page.keyboard.up('ShiftLeft');
      const state = await debug(page);
      const completedFrames = state.frameCount - traversalStart.frame;
      const dx = state.player.position[0] - stage.start[0];
      const dz = state.player.position[2] - stage.start[2];
      const progress = dx * stage.uphill[0] + dz * stage.uphill[2];
      expect(progress, `${kind}:progress frames=${completedFrames} start=${JSON.stringify(stage.start)} end=${JSON.stringify(state.player.position)}`).toBeGreaterThanOrEqual(stage.run + 0.35);
      expect(state.player.position[1], `${kind}:landing-height`).toBeGreaterThan(stage.top[1] - 0.5);
    }
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
    await expect.poll(async () => (await debug(page)).weaponPresentation.knifeVisible, { timeout: 1_000 }).toBe(true);
    const active = await debug(page);
    expect(active.weaponPresentation.armsVisible).toBe(true);
    expect(active.weaponPresentation.armMeshCount).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(650);
    expect((await debug(page)).weaponPresentation.knifeVisible).toBe(false);
  });

  test('throws a homing Yardhawk and resolves its hunter-killer explosion', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        earnSupport: (kills: number) => void;
        placeBotAhead: (distance: number) => void;
        activateSupport: (id: 'scout-sweep' | 'yardhawk' | 'tri-pass') => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.earnSupport(7);
      api.placeBotAhead(4);
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
    });
    await expect.poll(async () => (await debug(page)).fieldSupport.scoutActive).toBe(true);
    await expect.poll(async () => (await debug(page)).fieldSupport.yardhawk.active).toBe(true);
    expect(['thrown', 'homing']).toContain((await debug(page)).fieldSupport.yardhawk.phase);
    await expect.poll(async () => (await debug(page)).fieldSupport.yardhawkExplosions, { timeout: 4_000 }).toBe(1);

    expect((await debug(page)).fieldSupport.available.yardhawk).toBe(false);
  });

  test('resolves three player-selected sky missiles after one second', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
      earnSupport: (kills: number) => void;
      activateSupport: (id: 'tri-pass') => void;
    } }).__ATOMIC_ACRES_DEBUG__.earnSupport(7));
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { activateSupport: (id: 'tri-pass') => void } }).__ATOMIC_ACRES_DEBUG__.activateSupport('tri-pass'));
    await expect(page.locator('#strike-map-overlay')).toBeVisible();
    await page.locator('#strike-map').click({ position: { x: 95, y: 100 } });
    await page.locator('#strike-map').click({ position: { x: 240, y: 250 } });
    await page.locator('#strike-map').click({ position: { x: 385, y: 360 } });
    const scheduled = (await debug(page)).fieldSupport;
    expect(scheduled.triPassLaunches).toBe(3);
    await expect(page.locator('#strike-map-overlay')).toBeHidden();
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setRenderPaused: (paused: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    await expect.poll(async () => (await debug(page)).fieldSupport.triPassImpacts, { timeout: 12_000 }).toBe(3);
    const impactDelay = (await debug(page)).fieldSupport.triPassLastImpactDelayMs;
    expect(impactDelay).not.toBeNull();
    expect(impactDelay!).toBeGreaterThanOrEqual(950);
    expect((await debug(page)).fieldSupport.available).toEqual({ 'scout-sweep': true, yardhawk: true, 'tri-pass': false });
  });

  test('sniper lethality, marksman auto sidearm, walk-over scavenging and independent F weapon pickup all hold', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        equipKit: (id: 'marksman') => void;
        placeBotAhead: (distance: number) => void;
        aimAtBot: (zone: 'body' | 'head') => void;
        fireOnce: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.equipKit('marksman');
      api.placeBotAhead(5);
      api.aimAtBot('body');
      api.fireOnce();
    });
    await expect.poll(async () => (await debug(page)).bots[0].hp).toBe(45);
    let state = await debug(page);
    expect(state.player.primaryWeapon).toBe('sniper');
    expect(state.player.ammo).toBe(4);
    expect(state.weaponPresentation.weapon).toBe('sniper');

    await page.waitForTimeout(1_120);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { aimAtBot: (zone: 'body') => void; fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__;
      api.aimAtBot('body');
      api.fireOnce();
    });
    await expect.poll(async () => (await debug(page)).bots[0].alive).toBe(false);
    await expect.poll(async () => (await debug(page)).deathDrops.length).toBe(1);

    await expect.poll(async () => (await debug(page)).bots[0].alive, { timeout: 4_000 }).toBe(true);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        placeBotAhead: (distance: number) => void;
        aimAtBot: (zone: 'head') => void;
        fireOnce: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.placeBotAhead(8);
      api.aimAtBot('head');
      api.fireOnce();
    });
    await expect.poll(async () => (await debug(page)).bots[0].alive).toBe(false);
    await expect.poll(async () => (await debug(page)).deathDrops.length).toBe(2);

    state = await debug(page);
    expect(state.player.equippedWeapons).toEqual(['sniper', 'machine-pistol']);
    await page.keyboard.press('Digit2');
    await expect.poll(async () => (await debug(page)).player.weapon).toBe('machine-pistol');
    const targetDrop = state.deathDrops[0];
    const [x, y, z] = targetDrop.position;
    await page.evaluate(([dropX, dropY, dropZ]) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setAmmo: (weapon: 'machine-pistol', ammo: number, reserve: number) => void;
        setGrenades: (count: number) => void;
        teleportPlayer: (x: number, y: number, z: number) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setAmmo('machine-pistol', 3, 0);
      api.setGrenades(1);
      api.teleportPlayer(dropX, dropY + 1.5, dropZ);
    }, [x, y, z]);
    await expect.poll(async () => (await debug(page)).player.reserve).toBeGreaterThan(0);
    state = await debug(page);
    expect(state.player.primaryWeapon).toBe('sniper');
    expect(state.player.weapon).toBe('machine-pistol');
    expect(state.player.ammo).toBe(3);
    expect(state.player.grenades).toBe(2);
    const scavenged = state.deathDrops.find((drop) => drop.id === targetDrop.id);
    expect(scavenged).toMatchObject({ ammoAvailable: false, weaponAvailable: true });

    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await debug(page)).player.primaryWeapon).toBe('carbine');
    await expect.poll(async () => (await debug(page)).deathDrops.some((drop) => drop.id === targetDrop.id)).toBe(false);
  });

  test('keeps the permanent reticle and every physical ADS sight on the authoritative centre ray', async ({ page }) => {
    const reticle = await page.evaluate(() => {
      const crosshair = document.querySelector<HTMLElement>('#crosshair')!;
      const rect = crosshair.getBoundingClientRect();
      const dot = getComputedStyle(crosshair, '::after');
      return {
        offsetX: rect.left + rect.width / 2 - innerWidth / 2,
        offsetY: rect.top + rect.height / 2 - innerHeight / 2,
        dotVisible: dot.content !== 'none' && Number.parseFloat(dot.width) >= 3 && Number.parseFloat(dot.height) >= 3,
      };
    });
    expect(reticle).toEqual({ offsetX: 0, offsetY: 0, dotVisible: true });

    for (const weapon of ['carbine', 'smg', 'scattergun', 'sniper', 'pistol', 'machine-pistol'] as const) {
      await page.evaluate((weaponId) => {
        const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
          equipWeapon: (id: typeof weaponId) => void;
          setAds: (held: boolean) => void;
          setMovement: (forward: boolean) => void;
          fireOnce: () => void;
        } }).__ATOMIC_ACRES_DEBUG__;
        api.setAds(false);
        api.setMovement(false);
        api.equipWeapon(weaponId);
        api.setAds(true);
      }, weapon);
      await expect.poll(async () => (await debug(page)).weaponPresentation.adsProgress).toBeGreaterThan(0.98);
      await expect.poll(async () => {
        const offset = (await debug(page)).weaponPresentation.sightOffset;
        return offset ? Math.hypot(...offset) : Number.POSITIVE_INFINITY;
      }).toBeLessThan(0.006);
      if (weapon === 'sniper') await expect.poll(async () => (await debug(page)).sniperScope.active).toBe(true);
      const settledState = await debug(page);
      if (weapon === 'sniper') {
        expect(settledState.sniperScope).toMatchObject({ active: true, magnification: 3, viewmodelVisible: false });
        const angularRatio = Math.tan(settledState.sniperScope.baseFov * Math.PI / 360)
          / Math.tan(settledState.sniperScope.cameraFov * Math.PI / 360);
        expect(angularRatio).toBeCloseTo(3, 1);
        const scopePicture = await page.evaluate(() => {
          const scope = document.querySelector<HTMLElement>('#sniper-scope')!;
          const reticle = scope.querySelector<HTMLElement>('.scope-reticle')!;
          const rect = reticle.getBoundingClientRect();
          return {
            hidden: scope.hidden,
            centreX: rect.left + rect.width / 2 - innerWidth / 2,
            centreY: rect.top + rect.height / 2 - innerHeight / 2,
            diameter: rect.width,
          };
        });
        expect(scopePicture.hidden).toBe(false);
        expect(Math.abs(scopePicture.centreX)).toBeLessThan(0.01);
        expect(Math.abs(scopePicture.centreY)).toBeLessThan(0.01);
        expect(scopePicture.diameter).toBeGreaterThan(300);
      } else {
        expect(settledState.sniperScope.active).toBe(false);
        expect(settledState.sniperScope.viewmodelVisible).toBe(true);
      }

      await page.evaluate(() => {
        const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setMovement: (forward: boolean) => void; fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__;
        api.setMovement(true);
        api.fireOnce();
      });
      await page.waitForTimeout(90);
      const firingOffset = (await debug(page)).weaponPresentation.sightOffset;
      expect(firingOffset, `${weapon} sight telemetry`).not.toBeNull();
      expect(Math.hypot(...firingOffset!), `${weapon} sight moved off the bullet ray during recoil`).toBeLessThan(0.012);
    }
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setAds: (held: boolean) => void; setMovement: (forward: boolean) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.setMovement(false);
    });
  });

  test('doubles the minimap, exposes heading, enlarges house flow, and breaks glass with gun and knife', async ({ page }) => {
    let state = await debug(page);
    expect(state.minimap.backingWidth).toBe(360);
    expect(state.minimap.cssWidth).toBeGreaterThanOrEqual(299);
    expect(state.houseNavigation).toHaveLength(2);
    expect(state.houseNavigation.every((house) => house.dimensions.width === 20.2 && house.dimensions.depth === 16.4)).toBe(true);
    expect(state.houseNavigation.every((house) => house.rampWidth >= 2.8 && house.routeAnchors >= 9)).toBe(true);
    expect(state.houseNavigation.every((house) => house.indoorRampWidth >= 2.2 && house.indoorRampWidth < house.rampWidth && house.indoorRouteAnchors >= 9)).toBe(true);
    expect(state.houseNavigation.every((house) => house.rampNames.includes('exterior-access-ramp') && house.rampNames.includes('interior-access-ramp'))).toBe(true);
    expect(state.houseNavigation.every((house) => ['upper-floor-main', 'upper-floor-ramp-front', 'upper-floor-ramp-rear'].every((name) => house.floorSections.includes(name)))).toBe(true);
    expect(state.houseNavigation.every((house) => !house.floorSections.includes('upper-floor-slab'))).toBe(true);
    expect(state.breakableWindows).toHaveLength(6);

    const [px, py, pz] = state.player.position;
    await page.evaluate(([x, y, z]) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { teleportPlayer: (x: number, y: number, z: number, yaw?: number) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.teleportPlayer(x, y, z, -Math.PI / 2);
    }, [px, py, pz]);
    await expect.poll(async () => (await debug(page)).minimap.headingDegrees).toBe(90);

    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { stageWindow: (index: number, distance: number) => void; fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__;
      api.stageWindow(0, 4);
      api.fireOnce();
    });
    await expect.poll(async () => (await debug(page)).breakableWindows[0].broken).toBe(true);
    expect((await debug(page)).breakableWindows[0].visible).toBe(false);

    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { stageWindow: (index: number, distance: number) => void } }).__ATOMIC_ACRES_DEBUG__.stageWindow(0, 1.1));
    const windowZ = (await debug(page)).breakableWindows[0].position[2];
    const standingBeforeZ = (await debug(page)).player.position[2];
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(520);
    await page.keyboard.up('KeyW');
    const standingAfterZ = (await debug(page)).player.position[2];
    expect(Math.sign(standingAfterZ - windowZ)).toBe(Math.sign(standingBeforeZ - windowZ));

    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { stageWindow: (index: number, distance: number) => void } }).__ATOMIC_ACRES_DEBUG__.stageWindow(0, 1.1));
    const jumpBeforeZ = (await debug(page)).player.position[2];
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Space');
    await page.waitForTimeout(55);
    await page.keyboard.press('KeyC');
    await expect.poll(async () => (await debug(page)).player.crouched).toBe(true);
    await page.waitForTimeout(2_000);
    await page.keyboard.up('KeyW');
    const jumpAfter = await debug(page);
    expect(Math.sign(jumpAfter.player.position[2] - windowZ)).toBe(-Math.sign(jumpBeforeZ - windowZ));

    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { stageWindow: (index: number, distance: number) => void; melee: () => void } }).__ATOMIC_ACRES_DEBUG__;
      api.stageWindow(1, 1.25);
      api.melee();
    });
    await expect.poll(async () => (await debug(page)).breakableWindows[1].broken).toBe(true);
  });

  test('keeps ammo and Field Support cards large, clear, and non-overlapping', async ({ page }) => {
    const metrics = await page.evaluate(() => {
      const ammo = document.querySelector<HTMLElement>('#ammo')!;
      const weapon = document.querySelector<HTMLElement>('#weapon-block')!;
      const support = document.querySelector<HTMLElement>('#support-block')!;
      const cards = [...document.querySelectorAll<HTMLElement>('[data-support]')];
      const supportBox = support.getBoundingClientRect();
      const weaponBox = weapon.getBoundingClientRect();
      return {
        ammoFont: Number.parseFloat(getComputedStyle(ammo).fontSize),
        cardFonts: cards.map((card) => Number.parseFloat(getComputedStyle(card).fontSize)),
        cardCount: cards.length,
        supportWidth: supportBox.width,
        verticalGap: weaponBox.top - supportBox.bottom,
      };
    });
    expect(metrics.ammoFont).toBeGreaterThanOrEqual(64);
    expect(metrics.cardFonts.every((size) => size >= 15)).toBe(true);
    expect(metrics.cardCount).toBe(3);
    expect(metrics.supportWidth).toBeGreaterThanOrEqual(390);
    expect(metrics.verticalGap).toBeGreaterThanOrEqual(6);
  });

  test('keeps the doubled map responsive and bottom-left HUD cards separated at 960x540', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    const metrics = await page.evaluate(() => {
      const minimap = document.querySelector<HTMLElement>('#minimap')!.getBoundingClientRect();
      const location = document.querySelector<HTMLElement>('#location-label')!.getBoundingClientRect();
      const equipment = document.querySelector<HTMLElement>('#equipment-block')!.getBoundingClientRect();
      const health = document.querySelector<HTMLElement>('#health-block')!.getBoundingClientRect();
      return {
        minimapWidth: minimap.width,
        locationEquipmentGap: equipment.top - location.bottom,
        equipmentHealthGap: health.top - equipment.bottom,
      };
    });
    expect(metrics.minimapWidth).toBe(240);
    expect(metrics.locationEquipmentGap).toBeGreaterThanOrEqual(6);
    expect(metrics.equipmentHealthGap).toBeGreaterThanOrEqual(6);
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

  test('fires, switches only between the class primary and issued sidearm, then reloads', async ({ page }) => {
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

  test('starts with two frags and resolves a prewarmed Hallelujah explosion without a detonation hitch', async ({ page }) => {
    await page.waitForFunction(
      () => {
        const choir = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().audio.sanctifiedFragChoir;
        return choir.ready === true && choir.prewarmed === true;
      },
      undefined,
      { timeout: 10_000 },
    );
    const result = await page.evaluate(async () => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState; throwGrenade: () => void; teleportPlayer: (x: number, y: number, z: number) => void } }).__ATOMIC_ACRES_DEBUG__;
      const before = api.snapshot();
      const frames: Array<{ end: number; duration: number }> = [];
      const longTasks: Array<{ start: number; duration: number }> = [];
      let last = performance.now();
      let sampling = true;
      const tick = (now: number) => {
        frames.push({ end: now, duration: now - last });
        last = now;
        if (sampling) requestAnimationFrame(tick);
      };
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
      });
      try { observer.observe({ type: 'longtask', buffered: false }); } catch { /* unsupported browser */ }
      requestAnimationFrame(tick);
      const throwAt = performance.now();
      api.throwGrenade();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const thrown = api.snapshot();
      await new Promise((resolve) => setTimeout(resolve, 3_250));
      sampling = false;
      observer.disconnect();
      const after = api.snapshot();
      const explosionAt = performance.now() - (after.grenadeExplosion.lastExplosionAgeMs ?? 0);
      const baselineFrames = frames.filter((sample) => sample.end >= throwAt + 350 && sample.end <= throwAt + 1_700);
      const baselineLongTasks = longTasks.filter((task) => task.start >= throwAt + 350 && task.start <= throwAt + 1_700);
      const detonationFrames = frames.filter((sample) => {
        const start = sample.end - sample.duration;
        return start <= explosionAt + 500 && sample.end >= explosionAt - 50;
      });
      const detonationLongTasks = longTasks.filter((task) => task.start <= explosionAt + 500 && task.start + task.duration >= explosionAt - 50);
      const percentile95 = (values: number[]) => {
        if (values.length === 0) return 0;
        const ordered = [...values].sort((a, b) => a - b);
        return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * 0.95))];
      };
      return {
        before,
        thrown,
        after,
        baselineP95FrameMs: percentile95(baselineFrames.map((sample) => sample.duration)),
        baselineP95LongTaskMs: percentile95(baselineLongTasks.map((task) => task.duration)),
        detonationMaxFrameMs: Math.max(0, ...detonationFrames.map((sample) => sample.duration)),
        detonationMaxLongTaskMs: Math.max(0, ...detonationLongTasks.map((task) => task.duration)),
      };
    });

    expect(result.before.player.grenades).toBe(2);
    expect(result.before.grenadeVisual.status).toBe('ready');
    expect(result.before.grenadeVisual.asset).toBe('./assets/original/models/holy-hand-frag.glb');
    expect(result.before.grenadeVisual.sourceMeshCount).toBeGreaterThanOrEqual(12);
    expect(result.before.grenadeExplosion).toMatchObject({ poolCapacity: 4, dynamicLights: 0, prewarmed: true });
    expect(result.before.audio.sanctifiedFragChoir).toMatchObject({
      asset: './assets/original/audio/sanctified-frag-hallelujah.wav',
      status: 'ready',
      ready: true,
      prewarmed: true,
      byteLength: 313_152,
      plays: 0,
    });
    expect(result.thrown.player.grenades).toBe(1);
    expect(result.thrown.grenades).toBe(1);
    expect(result.thrown.grenadeVisual.active).toHaveLength(1);
    expect(result.thrown.grenadeVisual.active[0]).toMatchObject({ name: 'sanctified-frag-authored-glb', authored: true });
    expect(result.thrown.grenadeVisual.active[0].meshes).toBeGreaterThanOrEqual(12);
    expect(result.after.grenadeExplosion.total).toBe(1);
    expect(result.after.grenadeExplosion.activeVisuals).toBe(0);
    expect(result.after.grenades).toBe(0);
    expect(result.after.audio.sanctifiedFragChoir.plays).toBe(1);
    const hitchEvidence = `baselineFrameP95=${result.baselineP95FrameMs.toFixed(1)}ms detonationFrame=${result.detonationMaxFrameMs.toFixed(1)}ms baselineLongTaskP95=${result.baselineP95LongTaskMs.toFixed(1)}ms detonationLongTask=${result.detonationMaxLongTaskMs.toFixed(1)}ms sync=${JSON.stringify(result.after.grenadeExplosion.profile)}`;
    expect(result.after.grenadeExplosion.profile.totalSyncMs, hitchEvidence).toBeLessThan(12);
    expect(result.detonationMaxFrameMs - result.baselineP95FrameMs, hitchEvidence).toBeLessThan(100);
    expect(result.detonationMaxLongTaskMs - result.baselineP95LongTaskMs, hitchEvidence).toBeLessThan(100);

    const [x, y, z] = result.after.player.position;
    const heartbeatBefore = result.after.frameCount;
    await page.evaluate(([px, py, pz]) => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { teleportPlayer: (x: number, y: number, z: number) => void } }).__ATOMIC_ACRES_DEBUG__.teleportPlayer(px + 1, py, pz), [x, y, z]);
    await expect.poll(async () => (await debug(page)).player.position[0]).toBeCloseTo(x + 1, 2);
    await page.waitForTimeout(350);
    expect((await debug(page)).frameCount).toBeGreaterThan(heartbeatBefore);
  });

  test('HUD reports match, stance, equipment and bots in roster', async ({ page }) => {
    await expect(page.locator('#connection-pill')).toHaveText('BOT SKIRMISH');
    await expect(page.locator('#objective')).toContainText('FIRST TO 25');
    await expect(page.locator('#grenades')).toHaveText('FRAG ×2');
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
    expect(state.render.lighting).toEqual({
      exposure: 1.14, hemisphereIntensity: 1.48, ambientIntensity: 0.38,
      sunIntensity: 2.8, shadowBias: -0.00028, shadowNormalBias: 0.025, softShadows: false,
    });
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
      doors: 4,
      windows: 6,
      ramps: 4,
      furnishings: 0,
      fixtures: 0,
      visibleCollisionProxies: 0,
      visibleRamps: 4,
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
    expect(state.render.lighting).toEqual({
      exposure: 1.14, hemisphereIntensity: 1.48, ambientIntensity: 0.38,
      sunIntensity: 2.8, shadowBias: -0.00028, shadowNormalBias: 0.025, softShadows: false,
    });
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
      doors: 4,
      windows: 6,
      ramps: 4,
      furnishings: 0,
      fixtures: 0,
      visibleCollisionProxies: 0,
      visibleRamps: 4,
    });
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/quality-arms-operator.png' });
  });
});
