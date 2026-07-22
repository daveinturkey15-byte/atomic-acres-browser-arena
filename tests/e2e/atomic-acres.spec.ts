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
  spawnSelection: {
    previousIndex: number;
    selectedIndex: number;
    selectedVisibleThreats: number;
    minimumVisibleThreats: number;
    safeTierCount: number;
    selectedSide: 0 | 1;
    flipped: boolean;
  } | null;
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
    operatorModel: {
      source: string;
      appearance: string;
      skinnedMeshes: number;
      visibleSkinnedMeshes: number;
      mergedVertexLod: boolean;
      clips: number;
      weaponChildren: number;
      activeClip: string;
      embeddedWeaponsSuppressed: number;
      visibleEmbeddedWeapons: number;
      armBonesPresent: number;
      meleeKnifeVisible: boolean;
      muzzleForwardDot: number;
      animationContract: { stance: 'stand' | 'crouch' | 'prone'; crouchBlend: number; proneBlend: number; pivotHeight: number; pivotPitch: number };
      weaponMount: { modelId: string; finishId: string; forwardCorrection: string; directChild: boolean; finite: boolean; localScale: number[] };
      supportGrip: { supportError: number; finite: boolean; torsoClear: boolean; torsoRelativeBendHint: boolean };
    } | null;
    neonHaze: boolean;
  }>;
  botEscalation: { deaths: number; initialBots: number; targetBots: number; activeBots: number; nextReinforcementAt: number };
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
    rewardCycle: number;
    bestStreakThisMatch: number;
    available: Record<'scout-sweep' | 'yardhawk' | 'tri-pass' | 'hunter-swarm' | 'nuke', boolean>;
    scoutActive: boolean;
    yardhawk: { active: boolean; phase: 'thrown' | 'homing' | null; targetId?: string; position?: number[]; armedInMs?: number };
    yardhawkExplosions: number;
    tacticalMapOpen: boolean;
    tacticalTargets: Array<{ x: number; z: number }>;
    strikeMissiles: Array<{ target: number[]; impactInMs: number; position: number[] }>;
    triPassLaunches: number;
    triPassImpacts: number;
    triPassLastImpactDelayMs: number | null;
    hunterDrones: Array<{ index: number; targetId: string; position: number[]; diveInMs: number; expiresInMs: number }>;
    hunterSwarmLaunches: number;
    hunterSwarmImpacts: number;
    gamepadSelection: 'scout-sweep' | 'yardhawk' | 'tri-pass' | 'hunter-swarm' | 'nuke';
    nuke: { active: boolean; detonated: boolean; detonateInMs: number; finishInMs: number };
    nukeActivations: number;
    nukeDetonations: number;
    explosionProfile: { source: string | null; totalSyncMs: number };
    explosionFrameProfile: { sources: string[]; impacts: number; totalSyncMs: number; maxImpactSyncMs: number };
    prewarmedNuke: { shockwaveInScene: boolean; prewarmed: boolean; dynamicLights: number };
  };
  overdrive: {
    generation: number;
    available: boolean;
    nextSpawnAt: number;
    holderId: string | null;
    activeUntil: number;
    position: number[];
    damageMultiplier: number;
    remainingMs: number;
    spawns: number;
    pickups: number;
    expiries: number;
    visible: boolean;
    worldIconVisible: boolean;
    worldIconName: string;
    minimapSymbol: string;
  };
  deathDrops: Array<{ id: string; weapon: string; ammoAvailable: boolean; weaponAvailable: boolean; position: number[]; expiresInMs: number }>;
  breakableWindows: Array<{ id: string; broken: boolean; visible: boolean; position: number[] }>;
  physicalCover: Array<{
    id: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number; minY?: number; maxY?: number };
    blocksMovement: true;
    blocksShots: true;
    performanceVisualKind: 'cargo-stack' | 'pipe-stack' | 'service-skip' | 'generator-trailer' | null;
    performanceVisualMeshes: number;
  }>;
  minimap: {
    backingWidth: number;
    cssWidth: number;
    headingDegrees: number;
    landmarks: Array<{
      id: string;
      kind: 'bus' | 'cargo-stack' | 'pipe-stack' | 'service-skip' | 'generator-trailer';
      label: string;
    }>;
  };
  spawnSafety: Array<{ team: 0 | 1; authored: number; valid: number }>;
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
  worldIdentity: {
    pass: 'world-identity-27';
    routes: Array<{ id: string; label: string; role: string; landmark: string }>;
    cuesInsideBounds: boolean;
  };
  worldIdentityPresentation: { routeLights: number; routeSigns: number; cueInstances: number; atmosphericParticles: number };
  neighbourhoodLife: {
    loaded: boolean;
    floraInstances: number;
    faunaInstances: number;
    streetItems: number;
    flowerBeds: number;
    benches: number;
    bins: number;
    bicycles: number;
    genericMarkers: number;
  };
  arenaZone: string;
  arenaStoryReady: boolean;
  interiorTelemetry: {
    houses: number;
    groundRooms: number;
    upperRooms: number;
    doors: number;
    windows: number;
    ramps: number;
    wallMaterialVariants: number;
    pbrMaterialFamilies: number;
    furnishings: number;
    fixtures: number;
    visibleCollisionProxies: number;
    visibleRamps: number;
    furnishingSets: number;
    furnishingSourcePieces: number;
    furnishingBatches: number;
    furnishingMaterialFamilies: string[];
    texturedFurnishingMaterialFamilies: string[];
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
    firstPersonSource: string;
    weaponModelId: string;
    weaponFinishId: string;
    modelVisibleMeshCount: number;
    adsProgress: number;
    sightOffset: [number, number] | null;
    armsVisible: boolean;
    armMeshCount: number;
    attachedWeaponBatchStats: { sourceMeshes: number; batches: number };
    knifeVisible: boolean;
    riggedArms: Array<{ finite: boolean; bindOffsetsPreserved: boolean; contactError: number }>;
    importedModel: { source: string; weapon: string; clips: number; meshes: number; detailMeshes: number; socketContractReady: boolean; muzzleForwardDot: number | null; sightForwardDot: number | null } | null;
  };
  sniperScope: { active: boolean; magnification: number; baseFov: number; cameraFov: number; viewmodelVisible: boolean };
  weaponActionHistory: string[];
  menuVisible: boolean;
  networkSync: { stateIntervalMs: number; interpolationRate: number };
  networkLifecycle: { role: string; joinDeadlineActive: boolean; peerPresent: boolean; hostConnectionPresent: boolean };
  render: {
    profile: 'performance' | 'blender' | 'compat';
    representation: 'responsive' | 'blender' | 'compat';
    atomicSignal: {
      enabled: boolean;
      profile: 'performance' | 'blender' | 'compat';
      fallbackReason: string | null;
      bypassReason: string | null;
      passCpuMs: number;
      averagePassCpuMs: number;
      samples: number;
      textureSamples: number;
      targetValidated: boolean;
      outputValidated: boolean;
      width: number;
      height: number;
    };
    materialCompatibility: {
      materials: number;
      colorTexturesCorrected: number;
      dataTexturesCorrected: number;
      anisotropyAdjusted: number;
      darkSurfacesLifted: number;
      roughnessAdjusted: number;
      metalnessAdjusted: number;
    };
    fpsCounter: { value: string | null; pacing: string; visible: boolean; anchor: 'top-right' };
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
      fogColor: number;
      fogNear: number;
      fogFar: number;
      skyTop: number;
      skyHorizon: number;
      skyBottom: number;
      routeLightIntensity: number;
    };
    sky: {
      pass: 30;
      top: string;
      horizon: string;
      bottom: string;
      cloudShadow: string;
      cloudLight: string;
      cloudBands: number;
      fogColor: string;
      fogNear: number;
      fogFar: number;
      godRayStrength: number;
      godRayLobes: number;
      extraDraws: number;
    };
    grass: {
      pass: 30;
      enabled: boolean;
      bypassReason: string | null;
      blades: number;
      submissions: number;
      authoritative: false;
    };
    atmosphere: {
      pass: 30;
      enabled: boolean;
      bypassReason: string | null;
      mistCards: number;
      smokeCards: number;
      dustMotes: number;
      triangles: number;
      submissions: number;
      volumetricRayMarching: false;
    };
    framePacing: { ready: boolean; cadenceHz: number; medianMs: number; p95Ms: number; displayLimited: boolean };
    minimapRenders: number;
    staticBatchPalette: Array<string | null>;
    blenderEnvironment: {
      status: 'idle' | 'loading' | 'ready' | 'fallback';
      asset: string;
      meshCount: number;
      materialCount: number;
      texturedMaterials: number;
      pbrMaterials: number;
      textureCount: number;
      triangleCount: number;
      semanticWindows: number;
      boundWindows: number;
      transparentUpperWindows: number;
      routeLandmarks: number;
      modeledBuses: number;
      largeCoverAssets: number;
      housePropSets: number;
      worldIdentityPass: boolean;
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

// Browser gameplay tests must never read from or write to the production
// leaderboard. Unit/Worker suites exercise the real schema independently.
test.beforeEach(async ({ page }) => {
  await page.route('**/v1/leaderboard?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }) });
  });
  await page.route('**/v1/streak', async (route) => {
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true }) });
  });
});

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
    await expect(page.locator('.eyebrow')).toContainText('FOUR ORIGINAL PLAY SPACES · PERFORMANCE FIRST · PASS 57');
    expect(state.networkSync).toEqual({ stateIntervalMs: 50, interpolationRate: 24 });
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/menu-structured-pass.png', fullPage: true });
  });

  test('requires an intentional callsign before any deployment and remembers it across builds', async ({ page }) => {
    test.setTimeout(180_000);
    await pageReady(page);
    await page.locator('#player-name').fill('');
    await page.locator('#solo').click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#player-name-error')).toBeVisible();
    expect((await debug(page)).gameStarted).toBe(false);

    await page.locator('#player-name').fill('Dave');
    await page.locator('#room-input').fill('');
    await page.locator('#join').click();
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('atomic-acres:player-name:v1'))).toBe('Dave');
    expect((await debug(page)).gameStarted).toBe(false);
    await page.reload();
    await pageReady(page);
    await expect(page.locator('#player-name')).toHaveValue('Dave');
  });

  test('loads versioned high scores and surfaces real-time same-origin updates', async ({ page }) => {
    const recordedAt = Date.UTC(2026, 6, 17, 12);
    await page.addInitScript(({ recordedAt }) => {
      localStorage.setItem('atomic-acres:high-scores:v1', JSON.stringify({
        version: 1,
        entries: [{ id: 'score:dave:one', name: 'Dave', kills: 14, deaths: 4, bestStreak: 9, won: true, recordedAt }],
      }));
    }, { recordedAt });
    await pageReady(page);
    await expect(page.locator('#high-score-list')).toContainText('Dave');
    await expect(page.locator('#high-score-list')).toContainText('14 KILLS');

    await page.evaluate(({ recordedAt }) => {
      const channel = new BroadcastChannel('atomic-acres:high-scores:v1');
      channel.postMessage([{ id: 'score:ellis:one', name: 'Ellis', kills: 18, deaths: 2, bestStreak: 12, won: true, recordedAt }]);
      channel.close();
    }, { recordedAt });
    await expect(page.locator('#high-score-list')).toContainText('Ellis');
    await expect(page.locator('#high-score-list')).toContainText('18 KILLS');
  });

  test('records a completed match with the continuous best streak in durable storage', async ({ page }) => {
    await pageReady(page);
    await startSolo(page);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { earnSupport: (kills: number) => void; setKills: (kills: number) => void; endMatch: () => void } }).__ATOMIC_ACRES_DEBUG__;
      api.earnSupport(7);
      api.setKills(30);
      api.endMatch();
    });
    await expect.poll(async () => (await debug(page)).matchPhase).toBe('ended');
    const entries = await page.evaluate(() => {
      const raw = localStorage.getItem('atomic-acres:high-scores:v1');
      return raw ? (JSON.parse(raw) as { entries: Array<Record<string, unknown>> }).entries : [];
    });
    expect(entries.find((entry) => entry.name === 'QA Operator')).toMatchObject({ name: 'QA Operator', kills: 30, bestStreak: 7, won: true });
  });

  test('persists a named streak immediately and keeps it when the player exits before round end', async ({ page }) => {
    await pageReady(page);
    await startSolo(page);
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ATOMIC_ACRES_DEBUG__: { earnSupport: (kills: number) => void; setKills: (kills: number) => void };
      }).__ATOMIC_ACRES_DEBUG__;
      // Real eliminations increment the match kill count before support is awarded.
      // Keep the debug scenario faithful so the shared leaderboard policy accepts
      // the immediate row (kills must be greater than or equal to the streak).
      api.setKills(8);
      api.earnSupport(8);
    });
    expect((await debug(page)).matchPhase).toBe('active');
    await expect.poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem('atomic-acres:high-scores:v1');
      const entries = raw ? (JSON.parse(raw) as { entries: Array<Record<string, unknown>> }).entries : [];
      return entries.find((entry) => entry.name === 'QA Operator');
    })).toMatchObject({ id: 'global:qa_20operator', name: 'QA Operator', bestStreak: 8 });
    await page.reload();
    await pageReady(page);
    const qaScore = page.locator('#high-score-list li').filter({ hasText: 'QA Operator' });
    await expect(qaScore).toContainText('QA Operator');
    await expect(qaScore).toContainText('×8 STREAK');
  });

  test('defaults new players to Quality Graphics while retaining explicit slow-PC profiles', async ({ page }) => {
    const shaderErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /Atomic Signal|Shader Error|WebGLProgram/.test(message.text())) shaderErrors.push(message.text());
    });
    await pageReadyAt(page, '/?signal=on');
    const defaultState = await debug(page);
    expect(defaultState.render).toMatchObject({
      profile: 'blender',
      representation: 'blender',
      atomicSignal: { enabled: true, fallbackReason: null, textureSamples: 5 },
    });
    expect(defaultState.render.materialCompatibility.materials).toBeGreaterThan(0);
    expect(defaultState.render.atomicSignal.targetValidated).toBe(true);
    expect(defaultState.render.atomicSignal.outputValidated).toBe(true);
    expect(defaultState.spawnSafety).toEqual([
      { team: 0, authored: 12, valid: 12 },
      { team: 1, authored: 12, valid: 12 },
    ]);
    await expect(page.locator('#graphics-profile')).toHaveValue('blender');
    await pageReadyAt(page, '/?render=performance&signal=on');
    expect((await debug(page)).render).toMatchObject({
      profile: 'performance',
      representation: 'responsive',
      atomicSignal: { enabled: true, fallbackReason: null, textureSamples: 1 },
    });
    expect(shaderErrors).toEqual([]);
  });

  test('keeps the compatibility profile on the direct renderer fallback', async ({ page }) => {
    await pageReadyAt(page, '/?render=compat');
    const state = await debug(page);
    expect(state.render.atomicSignal).toMatchObject({
      enabled: false,
      profile: 'compat',
      fallbackReason: null,
      bypassReason: 'compat-profile',
      textureSamples: 0,
      targetValidated: false,
      outputValidated: false,
    });
    await expect(page.locator('html')).not.toHaveClass(/atomic-signal-render/);
    await expect(page.locator('#vignette')).not.toHaveCSS('display', 'none');
  });

  test('uses the default direct path only when the live renderer is classified as software', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=performance');
    const state = await debug(page);
    const rendererKind = await page.evaluate(() => document.documentElement.dataset.atomicSignalRenderer);
    if (rendererKind === 'software') {
      expect(state.render.atomicSignal).toMatchObject({
        enabled: false,
        fallbackReason: null,
        bypassReason: 'software-renderer',
        textureSamples: 0,
        samples: 0,
      });
    } else {
      expect(rendererKind).toBe('hardware');
      expect(state.render.atomicSignal).toMatchObject({
        enabled: true,
        fallbackReason: null,
        bypassReason: null,
      });
    }
    expect(errors).toEqual([]);
  });

  test('falls back to the authored procedural arena if the default Blender asset cannot load', async ({ page }) => {
    await page.route('**/atomic-acres-blender-arena.glb', (route) => route.abort('failed'));
    await pageReadyAt(page, '/');
    await expect.poll(async () => (await debug(page)).render.blenderEnvironment.status).toBe('fallback');
    const state = await debug(page);
    expect(state.render.profile).toBe('blender');
    expect(state.render.blenderEnvironment.proceduralWorldHidden).toBe(false);
    expect(state.originalArtLoaded).toBe(true);
  });

  test('loads the complete Quality Graphics arena and binds authored breakable windows', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=blender&mist=on');
    const menuState = await debug(page);
    expect(menuState.render).toMatchObject({
      profile: 'blender', representation: 'blender', antialias: true,
      shadows: true, shadowMode: 'static',
      lighting: {
        exposure: 1.18, hemisphereIntensity: 1.9, ambientIntensity: 0.82,
        sunIntensity: 2.7, fogNear: 32, fogFar: 104,
        routeLightIntensity: 5, streetLightIntensity: 6, interiorLightIntensity: 15,
        routeLightCount: 3, streetLightCount: 4, interiorLightCount: 4,
        godRayStrength: 0.12, godRayLobes: 4,
      },
      blenderEnvironment: {
        status: 'ready', meshCount: 33, materialCount: 27, texturedMaterials: 19, pbrMaterials: 19, textureCount: 35, triangleCount: 34_336,
        semanticWindows: 6, boundWindows: 6, transparentUpperWindows: 2, routeLandmarks: 3, modeledBuses: 2, largeCoverAssets: 4, housePropSets: 2, worldIdentityPass: true,
        proceduralWorldHidden: true, error: null,
      },
    });
    expect(menuState.worldIdentity).toMatchObject({ pass: 'world-identity-27', cuesInsideBounds: true });
    expect(menuState.worldIdentity.routes).toHaveLength(3);
    expect(menuState.worldIdentityPresentation).toEqual({
      routeLights: 0,
      routeSigns: 3,
      cueInstances: 0,
      atmosphericParticles: 0,
      practicalLights: 0,
      streetLights: 0,
      interiorLights: 0,
      fixtureInstances: 8,
      ceilingInstances: 10,
    });
    expect(menuState.render.calls).toBeLessThanOrEqual(75);
    expect(menuState.render.atmosphere).toMatchObject({
      enabled: true, bypassReason: null, mistCards: 10, smokeCards: 5, dustMotes: 96, triangles: 30, volumetricRayMarching: false,
    });
    expect(menuState.physicalCover.map((cover) => cover.id)).toEqual([
      'north-tour-bus', 'south-shuttle-bus',
      'north-cargo-stack', 'south-pipe-stack', 'west-service-skip', 'east-generator-trailer',
    ]);
    for (const cover of menuState.physicalCover) {
      expect(cover.blocksMovement).toBe(true);
      expect(cover.blocksShots).toBe(true);
      expect(cover.bounds.maxY! - cover.bounds.minY!).toBeGreaterThanOrEqual(2.2);
    }
    for (const cover of menuState.physicalCover.filter((entry) => entry.id.includes('bus'))) {
      expect(cover.bounds.maxY! - cover.bounds.minY!).toBeGreaterThanOrEqual(3.5);
      expect(Math.max(cover.bounds.maxX - cover.bounds.minX, cover.bounds.maxZ - cover.bounds.minZ)).toBeGreaterThanOrEqual(10);
    }
    await expect(page.locator('#graphics-profile')).toHaveValue('blender');
    await startSolo(page);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setBotsFrozen: (frozen: boolean) => void;
        stageWindow: (index: number, distance?: number) => void;
        equipWeapon: (weapon: string) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.stageWindow(0, 5);
      api.equipWeapon('carbine');
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().breakableWindows[0]?.broken === true, undefined, { timeout: 10_000 });
    const activeState = await debug(page);
    expect(activeState.breakableWindows[0]).toMatchObject({ broken: true, visible: false });
    expect(activeState.render.blenderEnvironment.status).toBe('ready');
    // Quality keeps authored PBR receiver/arm silhouettes plus Pass 32 mist,
    // grounded signage and large-cover batches. The measured worst staged view
    // remains bounded; one live impact/fragment draw may still be present in
    // this transient sample. The settled-scene budget is enforced below.
    expect(activeState.render.calls).toBeLessThanOrEqual(176);
    expect(activeState.render.triangles).toBeLessThanOrEqual(100_000);
    await page.waitForFunction(() => {
      const state = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.activeImpactParticles === 0 && state.activeTracers === 0;
    }, undefined, { timeout: 30_000 });
    await page.waitForTimeout(1_100);
    const stableState = await debug(page);
    expect(stableState.render.calls).toBeLessThanOrEqual(160);
    expect(stableState.render.triangles).toBeLessThanOrEqual(100_000);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/blender-render-gameplay.png', timeout: 60_000 });
  });

  test('keeps all three Pass 27 route identities legible from representative approaches', async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=blender');
    await startSolo(page);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));

    const samples = [
      { id: 'verdant', position: [-18, 1.7, 12, Math.PI / 2, 0] as const, zone: 'west-garden', label: 'VERDANT ARRAY' },
      { id: 'transit', position: [5, 1.7, -24, Math.PI, 0] as const, zone: 'central-transit', label: 'CIVIC TRANSIT' },
      { id: 'helio', position: [18, 1.7, -14, -Math.PI / 2, 0] as const, zone: 'east-service', label: 'HELIO SERVICE' },
    ];

    for (const sample of samples) {
      await page.evaluate(({ position }) => {
        const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { teleportPlayer: (x: number, y: number, z: number, yaw: number, pitch: number) => void } }).__ATOMIC_ACRES_DEBUG__;
        api.teleportPlayer(position[0], position[1], position[2], position[3], position[4]);
      }, sample);
      await expect.poll(async () => (await debug(page)).arenaZone).toBe(sample.zone);
      await expect(page.locator('#location-label')).toHaveText(sample.label);
      const state = await debug(page);
      expect(state.worldIdentityPresentation).toMatchObject({ routeLights: 0, routeSigns: 3, cueInstances: 0 });
      expect(state.render.blenderEnvironment).toMatchObject({ routeLandmarks: 3, worldIdentityPass: true });
      await page.screenshot({ path: `test-results/pass27-route-${sample.id}.png`, timeout: 60_000 });
    }
    expect(errors).toEqual([]);
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
    await expect(page.locator('#graphics-profile option')).toHaveText(['PERFORMANCE', 'QUALITY GRAPHICS']);
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
    await page.locator('#player-name').fill('Retry QA');
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
    test.setTimeout(120_000);
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
    await startSolo(page);
    await page.waitForFunction(
      () => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().player.weapon === 'smg',
      undefined,
      { timeout: 20_000 },
    );
    expect((await debug(page)).player.equippedWeapons).toEqual(['smg', 'pistol']);
    await page.evaluate(() => {
      if (document.pointerLockElement) document.exitPointerLock();
      document.querySelector('#menu')?.classList.remove('hidden');
    });
    await expect(page.locator('#menu')).toBeVisible();
    await page.getByRole('button', { name: 'FIELD KIT' }).click();
    await page.locator('[data-kit-id="breacher"]').click();
    await page.waitForFunction(
      () => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().player.weapon === 'smg',
      undefined,
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: 'DEPLOY' }).click();
    await expect(page.locator('#selected-kit-summary')).toContainText('QUEUED NEXT DEPLOYMENT');
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { damage: (amount: number) => void } }).__ATOMIC_ACRES_DEBUG__.damage(999));
    await page.waitForFunction(
      () => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().player.weapon === 'scattergun',
      undefined,
      { timeout: 12_000 },
    );
    expect((await debug(page)).player.equippedWeapons).toEqual(['scattergun', 'pistol']);
  });
});

test.describe('solo mechanics', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const simulationOnly = /routes the bot|routes the mirrored|sky missiles/.test(testInfo.title);
    await pageReadyAt(page, simulationOnly ? '/?render=compat&renderPaused=1' : '/?render=performance');
    await startSolo(page);
    await page.evaluate((pauseRenderer) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void; respawn: () => void; setRenderPaused: (paused: boolean) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.respawn();
      if (pauseRenderer) api.setRenderPaused(true);
    }, simulationOnly);
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
        (target) => {
          const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot();
          const dx = snapshot.player.position[0] - target.stage.start[0];
          const dz = snapshot.player.position[2] - target.stage.start[2];
          const progress = dx * target.stage.uphill[0] + dz * target.stage.uphill[2];
          return performance.now() - target.now >= 1_200
            && snapshot.frameCount - target.frame >= 20
            && progress >= target.stage.run + 0.35
            && snapshot.player.position[1] > target.stage.top[1] - 0.5;
        },
        { ...traversalStart, stage },
        { timeout: 20_000 },
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

  test('spawns two matching rigged low-damage combat bots and they navigate', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(false));
    const before = await debug(page);
    expect(before.bots).toHaveLength(2);
    expect(before.bots.every((bot) => bot.alive)).toBe(true);
    expect(before.bots.every((bot) => bot.operatorModel !== null
      && bot.operatorModel.source === 'Quaternius Ultimate Modular Males / Swat.gltf'
      && bot.operatorModel.appearance === 'neon-purple'
      && bot.operatorModel.skinnedMeshes > 0
      && bot.operatorModel.visibleSkinnedMeshes > 0
      && bot.neonHaze)).toBe(true);
    expect(new Set(before.bots.map((bot) => JSON.stringify({
      source: bot.operatorModel?.source,
      appearance: bot.operatorModel?.appearance,
      skinnedMeshes: bot.operatorModel?.skinnedMeshes,
      mergedVertexLod: bot.operatorModel?.mergedVertexLod,
      clips: bot.operatorModel?.clips,
    }))).size).toBe(1);
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

  test('adds one matching hostile reinforcement on the fifth cumulative bot death', async ({ page }) => {
    expect((await debug(page)).botEscalation).toMatchObject({
      deaths: 0,
      initialBots: 2,
      targetBots: 2,
      activeBots: 2,
      dormantBots: 4,
      dormantBotsPrewarmed: true,
      dynamicReinforcementLights: 0,
      maximumBots: 6,
      nextReinforcementAt: 5,
    });
    for (let death = 1; death <= 5; death += 1) {
      await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { damageBot: (amount: number) => void } }).__ATOMIC_ACRES_DEBUG__.damageBot(999));
      await expect.poll(async () => (await debug(page)).botEscalation.deaths).toBe(death);
      if (death === 2 || death === 4) {
        await expect.poll(async () => (await debug(page)).bots.filter((bot) => bot.alive).length, { timeout: 5_000 }).toBe(2);
      }
    }
    const escalated = await debug(page);
    expect(escalated.botEscalation).toMatchObject({
      deaths: 5,
      initialBots: 2,
      targetBots: 3,
      activeBots: 3,
      dormantBots: 3,
      dormantBotsPrewarmed: true,
      dynamicReinforcementLights: 0,
      maximumBots: 6,
      nextReinforcementAt: 10,
    });
    expect(escalated.bots).toHaveLength(3);
    expect(escalated.bots[2]).toMatchObject({ alive: true, neonHaze: true, presentationReady: true, presentationWeaponSafe: true });
    expect(escalated.bots[2].operatorModel).toMatchObject({
      source: 'Quaternius Ultimate Modular Males / Swat.gltf', appearance: 'neon-purple', skinnedMeshes: 5,
    });
  });

  test('renders seven distinct authored first-person weapons with connected two-hand grips and a readable hostile operator', async ({ page }) => {
    test.setTimeout(180_000);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { placeBotAhead: (distance: number) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.placeBotAhead(5);
    });
    await page.waitForTimeout(150);
    const weapons = ['carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'pistol', 'machine-pistol'] as const;
    const sourceMeshCounts = new Map<string, number>();
    const finishIds = new Set<string>();
    for (const weapon of weapons) {
      await page.evaluate((selected) => {
        (window as unknown as { __ATOMIC_ACRES_DEBUG__: { equipWeapon: (weapon: string) => void } }).__ATOMIC_ACRES_DEBUG__.equipWeapon(selected);
      }, weapon);
      await expect.poll(async () => (await debug(page)).weaponPresentation.weapon).toBe(weapon);
      const weaponState = (await debug(page)).weaponPresentation;
      expect(weaponState.armsVisible, `${weapon}:armsVisible`).toBe(true);
      expect(weaponState.armMeshCount, `${weapon}:armMeshCount`).toBeGreaterThanOrEqual(6);
      expect(weaponState.modelKind, `${weapon}:modelKind`).toBe('original-authored');
      expect(weaponState.firstPersonSource, `${weapon}:firstPersonSource`).toBe('authored-pbr-v6-seven-unique-finishes');
      expect(weaponState.weaponModelId, `${weapon}:modelId`).toBe(`${weapon}-authored-v6`);
      expect(typeof weaponState.weaponFinishId, `${weapon}:finishId`).toBe('string');
      expect(weaponState.importedModel, `${weapon}:importedModel`).toBeNull();
      expect(weaponState.detailsReady, `${weapon}:detailsReady`).toBe(true);
      expect(weaponState.modelVisibleMeshCount, `${weapon}:modelVisibleMeshCount`).toBeGreaterThanOrEqual(8);
      expect(weaponState.attachedWeaponBatchStats, `${weapon}:batchStats`).not.toBeNull();
      expect(weaponState.attachedWeaponBatchStats.sourceMeshes, `${weapon}:sourceMeshes`).toBeGreaterThanOrEqual(11);
      expect(weaponState.riggedArms, `${weapon}:riggedArms`).toHaveLength(2);
      expect(weaponState.riggedArms.every((arm: { finite: boolean; bindOffsetsPreserved: boolean; contactError: number }) => arm.finite && arm.bindOffsetsPreserved && arm.contactError <= 0.02), `${weapon}:handContact`).toBe(true);
      expect(weaponState.sightOffset?.every(Number.isFinite), `${weapon}:sightOffset`).toBe(true);
      sourceMeshCounts.set(weapon, weaponState.attachedWeaponBatchStats.sourceMeshes);
      finishIds.add(weaponState.weaponFinishId);
      await page.evaluate(() => (
        window as unknown as { __ATOMIC_ACRES_DEBUG__: { setRenderPaused: (paused: boolean) => void } }
      ).__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
      try {
        await page.screenshot({ path: `test-results/pass32-${weapon}-viewmodel.png`, animations: 'disabled', timeout: 60_000 });
      } finally {
        await page.evaluate(() => (
          window as unknown as { __ATOMIC_ACRES_DEBUG__: { setRenderPaused: (paused: boolean) => void } }
        ).__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
      }
    }
    // Performance batching should preserve the machine pistol's extra authored
    // compensator/control geometry without rewarding it for extra draw calls.
    expect(sourceMeshCounts.get('machine-pistol')).toBeGreaterThan(sourceMeshCounts.get('pistol') ?? 0);
    expect(finishIds.size).toBe(7);
    const state = await debug(page);
    expect(state.bots[0].rootVisible).toBe(true);
    expect(state.bots[0].visibleMeshCount).toBeGreaterThanOrEqual(9);
    expect(state.bots[0].screenPosition).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    expect(state.bots[0].operatorModel).toMatchObject({
      skinnedMeshes: 5, visibleSkinnedMeshes: 1, mergedVertexLod: true, clips: 24, weaponChildren: 1,
    });
    expect(Math.abs(state.bots[0].screenPosition[0])).toBeLessThan(0.5);
    expect(Math.abs(state.bots[0].screenPosition[1])).toBeLessThan(0.8);
  });

  test('holds one forward-facing weapon through smooth sprint, crouch and prone operator poses', async ({ page }) => {
    test.setTimeout(180_000);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        placeBotAhead: (distance: number) => void;
        aimAtBot: (zone?: 'head' | 'body' | 'limb') => void;
        setCaptureViewmodelHidden: (hidden: boolean) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.placeBotAhead(4);
      api.aimAtBot('body');
      api.setCaptureViewmodelHidden(true);
    });
    const staged = await debug(page);
    const [botX, , botZ] = staged.bots[0].position;
    const [playerX, , playerZ] = staged.player.position;
    const towardPlayerX = playerX - botX;
    const towardPlayerZ = playerZ - botZ;
    const towardPlayerLength = Math.hypot(towardPlayerX, towardPlayerZ) || 1;
    const forwardX = towardPlayerX / towardPlayerLength;
    const forwardZ = towardPlayerZ / towardPlayerLength;
    const diagonalX = forwardX + forwardZ * 0.85;
    const diagonalZ = forwardZ - forwardX * 0.85;
    const diagonalLength = Math.hypot(diagonalX, diagonalZ) || 1;
    const cameraX = botX + diagonalX / diagonalLength * 2.35;
    const cameraZ = botZ + diagonalZ / diagonalLength * 2.35;
    const cameraYaw = Math.atan2(-(botX - cameraX), -(botZ - cameraZ));
    await page.evaluate(({ x, z, yaw }) => {
      (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setCaptureCameraPose: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
      } }).__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(x, 0.9, z, yaw, 0);
    }, { x: cameraX, z: cameraZ, yaw: cameraYaw });

    const weapons = ['carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'pistol', 'machine-pistol'] as const;
    const modelIds = new Set<string>();
    const finishIds = new Set<string>();
    for (const weapon of weapons) {
      await page.evaluate((selected) => {
        (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
          setBotPresentation: (stance: 'stand', speed: number, weapon: typeof selected) => void;
        } }).__ATOMIC_ACRES_DEBUG__.setBotPresentation('stand', 0, selected);
      }, weapon);
      await page.waitForTimeout(180);
      const operator = (await debug(page)).bots[0].operatorModel!;
      expect.soft(operator.embeddedWeaponsSuppressed, `${weapon}:suppressed`).toBeGreaterThanOrEqual(1);
      expect.soft(operator.visibleEmbeddedWeapons, `${weapon}:spareWeapon`).toBe(0);
      expect.soft(operator.weaponChildren, `${weapon}:socketChildren`).toBe(1);
      expect.soft(operator.weaponMount, `${weapon}:mount`).toMatchObject({
        directChild: true, finite: true, forwardCorrection: 'stable-body-mount-minus-z',
      });
      expect.soft(Math.max(...operator.weaponMount.localScale), `${weapon}:third-person scale`).toBeLessThanOrEqual(0.54);
      expect.soft(operator.armBonesPresent, `${weapon}:complete arm chains`).toBe(6);
      expect.soft(operator.muzzleForwardDot, `${weapon}:forward`).toBeGreaterThan(0.82);
      expect.soft(operator.supportGrip.supportError, `${weapon}:supportError ${JSON.stringify(operator.supportGrip)}`).toBeLessThanOrEqual(0.025);
      expect.soft(operator.supportGrip, `${weapon}:supportGrip ${JSON.stringify(operator.supportGrip)}`).toMatchObject({
        finite: true, torsoClear: true, torsoRelativeBendHint: true, bothHandsConnected: true,
        dominantGrip: { finite: true, torsoClear: true },
      });
      modelIds.add(operator.weaponMount.modelId);
      finishIds.add(operator.weaponMount.finishId);
      await page.screenshot({ path: `test-results/refined-operator-${weapon}.png`, animations: 'disabled' });
    }
    expect(modelIds.size).toBe(7);
    expect(finishIds.size).toBe(7);

    const poses = [
      { name: 'idle', stance: 'stand' as const, speed: 0 },
      { name: 'sprint', stance: 'stand' as const, speed: 7 },
      { name: 'crouch', stance: 'crouch' as const, speed: 1.2 },
      { name: 'prone', stance: 'prone' as const, speed: 0.8 },
    ];
    for (const pose of poses) {
      await page.evaluate(({ stance, speed }) => {
        (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
          setBotPresentation: (stance: 'stand' | 'crouch' | 'prone', speed: number, weapon: 'carbine') => void;
        } }).__ATOMIC_ACRES_DEBUG__.setBotPresentation(stance, speed, 'carbine');
      }, pose);
      await page.waitForTimeout(520);
      const operator = (await debug(page)).bots[0].operatorModel!;
      expect.soft(operator.animationContract.stance, pose.name).toBe(pose.stance);
      expect.soft(operator.visibleEmbeddedWeapons, pose.name).toBe(0);
      expect.soft(operator.muzzleForwardDot, pose.name).toBeGreaterThan(0.82);
      const gripEvidence = `${pose.name}:${JSON.stringify(operator.supportGrip)}`;
      expect.soft(operator.supportGrip.finite, gripEvidence).toBe(true);
      expect.soft(operator.supportGrip.torsoClear, gripEvidence).toBe(true);
      expect.soft(operator.supportGrip.bothHandsConnected, gripEvidence).toBe(true);
      expect.soft(operator.supportGrip.dominantGrip.torsoClear, gripEvidence).toBe(true);
      if (pose.stance === 'crouch') expect.soft(operator.animationContract.crouchBlend, pose.name).toBeGreaterThan(0.98);
      if (pose.stance === 'prone') {
        expect.soft(operator.animationContract.proneBlend, pose.name).toBeGreaterThan(0.98);
        expect.soft(operator.animationContract.pivotHeight, pose.name).toBeGreaterThan(0.35);
        expect.soft(operator.animationContract.pivotHeight, pose.name).toBeLessThan(0.55);
      }
      await page.screenshot({ path: `test-results/refined-operator-pose-${pose.name}.png`, animations: 'disabled' });
      for (const poseWeapon of weapons) {
        if (poseWeapon === 'carbine') continue;
        await page.evaluate(({ stance, speed, weapon }) => {
          (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
            setBotPresentation: (
              stance: 'stand' | 'crouch' | 'prone', speed: number, weapon: typeof weapon,
            ) => void;
          } }).__ATOMIC_ACRES_DEBUG__.setBotPresentation(stance, speed, weapon);
        }, { stance: pose.stance, speed: pose.speed, weapon: poseWeapon });
        await page.waitForTimeout(140);
        const weaponPose = (await debug(page)).bots[0].operatorModel!;
        const weaponPoseEvidence = `${pose.name}/${poseWeapon}:${JSON.stringify(weaponPose.supportGrip)}`;
        expect.soft(weaponPose.muzzleForwardDot, weaponPoseEvidence).toBeGreaterThan(0.82);
        expect.soft(weaponPose.supportGrip, weaponPoseEvidence).toMatchObject({
          finite: true,
          torsoClear: true,
          bothHandsConnected: true,
          dominantGrip: { finite: true, torsoClear: true },
        });
      }
    }
  });

  test('plays a bounded rigged death animation before a clean respawn', async ({ page }) => {
    const dying = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        placeBotAhead: (distance: number) => void;
        damageBot: (amount: number) => void;
        snapshot: () => DebugState;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.placeBotAhead(5);
      api.damageBot(999);
      return api.snapshot().bots[0];
    });
    expect(dying.alive).toBe(false);
    expect(dying.rootVisible).toBe(true);
    expect(dying.operatorModel?.activeClip).toBe('Death');
    await expect.poll(async () => (await debug(page)).bots[0].alive, { timeout: 8_000 }).toBe(true);
    const respawned = (await debug(page)).bots[0];
    expect(respawned.rootVisible).toBe(true);
    expect(respawned.operatorModel?.activeClip).toBe('Idle_Gun_Pointing');
  });

  test('animates the knife on misses while keeping first-person arms visible', async ({ page }) => {
    const melee = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        respawn: () => void;
        setBotsFrozen: (frozen: boolean) => void;
        melee: () => { accepted: boolean };
        snapshot: () => DebugState;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.respawn();
      const result = api.melee();
      return { result, state: api.snapshot() };
    });
    expect(melee.result.accepted).toBe(true);
    expect(melee.state.weaponPresentation.knifeVisible).toBe(true);
    const active = melee.state;
    expect(active.weaponPresentation.armsVisible).toBe(true);
    expect(active.weaponPresentation.armMeshCount).toBeGreaterThanOrEqual(2);
    await expect.poll(async () => (await debug(page)).weaponPresentation.knifeVisible, { timeout: 3_000 }).toBe(false);
  });

  test('keeps the rigged arms and knife complete during third-person melee', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        placeBotAhead: (distance: number) => void;
        meleeBot: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.placeBotAhead(4);
      api.meleeBot();
    });
    await expect.poll(async () => (await debug(page)).bots[0].operatorModel?.meleeKnifeVisible).toBe(true);
    const operator = (await debug(page)).bots[0].operatorModel!;
    expect(operator.armBonesPresent).toBe(6);
    expect(operator.weaponChildren).toBe(1);
    await page.screenshot({ path: 'test-results/player-feedback-rigged-knife.png', animations: 'disabled' });
    await expect.poll(async () => (await debug(page)).bots[0].operatorModel?.meleeKnifeVisible, { timeout: 3_000 }).toBe(false);
  });

  test('blocks street props and the upper house facade at their authored positions', async ({ page }) => {
    const collision = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        collisionProbe: (x: number, z: number) => boolean;
        collisionProbeAt: (x: number, y: number, z: number) => boolean;
      } }).__ATOMIC_ACRES_DEBUG__;
      return {
        bins: [[-21.4, -33], [21.4, 33], [-14.3, 12], [14.3, -12], [-28, -34], [28, 34]]
          .map(([x, z]) => api.collisionProbe(x, z)),
        benches: [[-15.2, -7], [15.2, 7], [-15.2, 26], [15.2, -26]]
          .map(([x, z]) => api.collisionProbe(x, z)),
        upperFacade: api.collisionProbeAt(-9, 6, -19.78),
        upperInteriorClear: api.collisionProbeAt(-9, 6, -20.5),
      };
    });
    expect(collision.bins.every(Boolean)).toBe(true);
    expect(collision.benches.every(Boolean)).toBe(true);
    expect(collision.upperFacade).toBe(true);
    expect(collision.upperInteriorClear).toBe(false);
  });

  test('shows critical damage, clears prone sprint intent on respawn, and surfaces round stats', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        respawn: () => void;
        setBotsFrozen: (frozen: boolean) => void;
        placeBotAhead: (distance: number) => void;
        aimAtBot: (zone: 'head') => void;
        fireOnce: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.respawn();
      api.setBotsFrozen(true);
      api.placeBotAhead(4);
      api.aimAtBot('head');
      api.fireOnce();
    });
    await expect.poll(async () => page.locator('#damage-numbers').getAttribute('data-last-critical')).toBe('true');
    expect(Number(await page.locator('#damage-numbers').getAttribute('data-last-damage'))).toBeGreaterThan(0);
    await expect(page.locator('#damage-numbers')).toHaveAttribute('data-last-label', /CRIT/);

    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setStance: (stance: 'prone') => void;
        setMovement: (forward: boolean, sprint: boolean) => void;
        damage: (amount: number) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setStance('prone');
      api.setMovement(true, true);
      api.damage(999);
    });
    await expect.poll(async () => (await debug(page)).player.hp, { timeout: 6_000 }).toBe(100);
    const respawned = (await debug(page)).player;
    expect(respawned.stance).toBe('stand');
    expect(respawned.sprinting).toBe(false);

    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setMovement: (forward: boolean, sprint?: boolean) => void;
        endMatch: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setMovement(false);
      api.endMatch();
    });
    const roundStats = page.locator('.round-stats');
    await expect(roundStats).toBeVisible();
    await expect(roundStats).toContainText('K/D');
    await expect(roundStats).toContainText('ACCURACY');
    await expect(roundStats).toContainText('DAMAGE');
    await expect(roundStats).toContainText('HEADSHOTS');
    await page.screenshot({ path: 'test-results/player-feedback-round-stats.png', animations: 'disabled' });
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
      'hunter-swarm': false,
      nuke: false,
    });
    const activated = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        activateSupport: (id: 'scout-sweep' | 'yardhawk' | 'tri-pass') => void;
        snapshot: () => DebugState;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.activateSupport('scout-sweep');
      api.activateSupport('yardhawk');
      return api.snapshot().fieldSupport;
    });
    expect(activated.scoutActive).toBe(true);
    expect(activated.yardhawk.active).toBe(true);
    expect(['thrown', 'homing']).toContain(activated.yardhawk.phase);
    await expect.poll(async () => (await debug(page)).fieldSupport.yardhawkExplosions, { timeout: 12_000 }).toBe(1);
    const exploded = (await debug(page)).fieldSupport;
    expect(exploded.available.yardhawk).toBe(false);
    expect(exploded.explosionProfile.source).toBe('yardhawk');
    expect(exploded.explosionProfile.totalSyncMs).toBeLessThan(12);
  });

  test('Yardhawk collides with solid walls and cannot damage its target through cover', async ({ page }) => {
    const staged = await page.evaluate(() => (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: { stageYardhawkWall: () => boolean };
    }).__ATOMIC_ACRES_DEBUG__.stageYardhawkWall());
    expect(staged).toBe(true);
    await expect.poll(async () => (await debug(page)).fieldSupport.yardhawkExplosions, { timeout: 5_000 }).toBe(1);
    const state = await debug(page);
    expect(state.bots[0].hp).toBe(100);
    expect(state.fieldSupport.yardhawk.active).toBe(false);
  });

  test('loops field-support progression after Tri-Pass so three more kills re-earn Scout Sweep', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        earnSupport: (kills: number) => void;
        activateSupport: (id: 'scout-sweep') => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.earnSupport(3);
      api.activateSupport('scout-sweep');
      api.earnSupport(4);
    });
    const firstCycle = (await debug(page)).fieldSupport;
    expect(firstCycle.streak).toBe(7);
    expect(firstCycle.rewardCycle).toBe(0);
    await page.evaluate(() => (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: { earnSupport: (kills: number) => void };
    }).__ATOMIC_ACRES_DEBUG__.earnSupport(3));
    const looped = (await debug(page)).fieldSupport;
    expect(looped.streak).toBe(10);
    expect(looped.rewardCycle).toBe(3);
    expect(looped.bestStreakThisMatch).toBe(10);
    expect(looped.available['scout-sweep']).toBe(true);
  });

  test('routes the bot from the interior ramp foot onto the upper floor instead of jamming', async ({ page }) => {
    const staged = await page.evaluate(() => {
      const api = (window as unknown as {
        __ATOMIC_ACRES_DEBUG__: { stageBotAtIndoorRamp: () => boolean; setRenderPaused: (paused: boolean) => void };
      }).__ATOMIC_ACRES_DEBUG__;
      const result = api.stageBotAtIndoorRamp();
      api.setRenderPaused(true);
      return result;
    });
    expect(staged).toBe(true);
    await expect.poll(async () => (await debug(page)).bots[0].position[1], { timeout: 12_000 }).toBeGreaterThan(2.5);
    expect((await debug(page)).bots[0].blockedSince).toBe(0);
  });

  test('routes the mirrored bot down the interior ramp without abandoning traversal mid-slope', async ({ page }) => {
    const staged = await page.evaluate(() => {
      const api = (window as unknown as {
        __ATOMIC_ACRES_DEBUG__: { stageBotAtIndoorRamp: (team?: 0 | 1, descending?: boolean) => boolean; setRenderPaused: (paused: boolean) => void };
      }).__ATOMIC_ACRES_DEBUG__;
      const result = api.stageBotAtIndoorRamp(1, true);
      api.setRenderPaused(true);
      return result;
    });
    expect(staged).toBe(true);
    expect((await debug(page)).bots[0].position[1]).toBeGreaterThan(3);
    await expect.poll(async () => (await debug(page)).bots[0].position[1], { timeout: 15_000 }).toBeLessThan(0.15);
  });

  test('resolves three player-selected sky missiles after one second', async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        earnSupport: (kills: number) => void;
        setRenderPaused: (paused: boolean) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setRenderPaused(true);
      api.earnSupport(7);
    });
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { activateSupport: (id: 'tri-pass') => void } }).__ATOMIC_ACRES_DEBUG__.activateSupport('tri-pass'));
    await page.waitForFunction(() => document.querySelector<HTMLElement>('#strike-map-overlay')?.hidden === false);
    await page.evaluate(() => {
      (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setRenderPaused: (paused: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setRenderPaused(true);
      const map = document.querySelector<HTMLCanvasElement>('#strike-map')!;
      const rect = map.getBoundingClientRect();
      for (const [x, y] of [[95, 100], [240, 250], [385, 360]]) {
        map.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + x, clientY: rect.top + y }));
      }
    });
    const scheduled = (await debug(page)).fieldSupport;
    expect(scheduled.triPassLaunches).toBe(3);
    expect(scheduled.available).toMatchObject({
      'scout-sweep': true,
      yardhawk: true,
      'tri-pass': false,
      nuke: false,
    });
    await page.waitForFunction(() => document.querySelector<HTMLElement>('#strike-map-overlay')?.hidden === true);
    await expect.poll(async () => (await debug(page)).fieldSupport.triPassImpacts, { timeout: 12_000 }).toBe(3);
    const impacted = (await debug(page)).fieldSupport;
    const impactDelay = impacted.triPassLastImpactDelayMs;
    expect(impactDelay).not.toBeNull();
    expect(impactDelay!).toBeGreaterThanOrEqual(950);
    expect(impacted.explosionFrameProfile).toMatchObject({
      sources: ['tri-pass', 'tri-pass', 'tri-pass'],
      impacts: 3,
    });
    expect(impacted.explosionFrameProfile.totalSyncMs).toBeLessThan(30);
  });

  test('launches exactly five deterministic Hunter Swarm drones at eight eliminations', async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        earnSupport: (kills: number) => void;
        activateSupport: (id: 'hunter-swarm') => void;
        setBotsFrozen: (frozen: boolean) => void;
        placeBotAhead: (distance: number) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.placeBotAhead(8);
      api.earnSupport(8);
      api.activateSupport('hunter-swarm');
    });
    const launched = (await debug(page)).fieldSupport;
    expect(launched.hunterSwarmLaunches).toBe(5);
    expect(launched.hunterDrones).toHaveLength(5);
    expect(launched.available['hunter-swarm']).toBe(false);
    await expect.poll(async () => (await debug(page)).fieldSupport.hunterSwarmImpacts, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    const impacted = (await debug(page)).fieldSupport;
    expect(impacted.explosionProfile.source).toBe('hunter-swarm');
    expect(impacted.explosionProfile.totalSyncMs).toBeLessThan(12);
  });

  test('arms and detonates the 15-elimination Nuke with a bounded warning sequence', async ({ page }) => {
    test.setTimeout(120_000);
    expect((await debug(page)).fieldSupport.prewarmedNuke).toEqual({ shockwaveInScene: true, prewarmed: true, dynamicLights: 0 });
    await page.evaluate(() => {
      const flash = document.querySelector<HTMLElement>('#nuke-flash')!;
      document.documentElement.dataset.qaNukeFlashObserved = String(!flash.hidden);
      const flashObserver = new MutationObserver(() => {
        if (flash.hidden) return;
        document.documentElement.dataset.qaNukeFlashObserved = 'true';
        flashObserver.disconnect();
      });
      flashObserver.observe(flash, { attributes: true, attributeFilter: ['hidden'] });
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        earnSupport: (kills: number) => void;
        activateSupport: (id: 'nuke') => void;
        setBotsFrozen: (frozen: boolean) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.earnSupport(15);
      api.activateSupport('nuke');
    });
    await expect(page.locator('#nuke-warning')).toBeVisible();
    expect((await debug(page)).fieldSupport.nukeActivations).toBe(1);
    await expect.poll(async () => (await debug(page)).fieldSupport.nukeDetonations, { timeout: 15_000 }).toBe(1);
    const detonated = (await debug(page)).fieldSupport;
    expect(detonated.explosionProfile.source).toBe('nuke');
    expect(detonated.explosionProfile.totalSyncMs).toBeLessThan(12);
    expect(detonated.explosionFrameProfile).toMatchObject({ sources: ['nuke'], impacts: 1 });
    await expect(page.locator('html')).toHaveAttribute('data-qa-nuke-flash-observed', 'true');
    await expect(page.locator('#nuke-warning')).toBeHidden({ timeout: 8_000 });
  });

  test('makes the strengthened Model 12 decisive at close range', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setBotsFrozen: (frozen: boolean) => void;
        equipWeapon: (weapon: 'scattergun') => void;
        placeBotAhead: (distance: number) => void;
        aimAtBot: (zone: 'body') => void;
        fireOnce: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.equipWeapon('scattergun');
      api.placeBotAhead(3);
      api.aimAtBot('body');
      api.fireOnce();
    });
    await expect.poll(async () => (await debug(page)).bots[0].alive).toBe(false);
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
    // The animated centre-mass ray can reach the torso (67) or foreground arm
    // (67 × 0.9) depending on the pinned SWAT pose. Both are valid accepted
    // non-head zones; the explicit head sample below is the 1.5× one-shot gate.
    await expect.poll(async () => (await debug(page)).bots[0].hp).toBeLessThan(100);
    let state = await debug(page);
    expect(state.bots[0].hp).toBeGreaterThanOrEqual(33);
    expect(state.bots[0].hp).toBeLessThanOrEqual(40);
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
    // Respect the bot's authored post-respawn protection before proving the
    // follow-up headshot; the first life already verifies raw sniper damage.
    await page.waitForTimeout(1_100);
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
    await expect.poll(async () => (await debug(page)).player.primaryWeapon).toBe(targetDrop.weapon);
    await expect.poll(async () => (await debug(page)).deathDrops.some((drop) => drop.id === targetDrop.id)).toBe(false);
  });

  test('keeps the permanent reticle and every physical ADS sight on the authoritative centre ray', async ({ page }) => {
    test.setTimeout(180_000);
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

    for (const weapon of ['carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'pistol', 'machine-pistol'] as const) {
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

  test('broken semantic windows stop blocking player shots and grenade blasts shatter intact panes', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setBotsFrozen: (frozen: boolean) => void;
        stageWindow: (index: number, distance: number) => void;
        placeBotAhead: (distance: number) => void;
        fireOnce: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.stageWindow(0, 3);
      api.placeBotAhead(5);
      api.fireOnce();
    });
    await expect.poll(async () => (await debug(page)).breakableWindows[0].broken).toBe(true);
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        aimAtBot: (zone: 'body') => void;
        fireOnce: () => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.aimAtBot('body');
      api.fireOnce();
    });
    await expect.poll(async () => (await debug(page)).bots[0].hp).toBeLessThan(100);

    const grenadeBreaks = await page.evaluate(() => (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: { detonateGrenadeAtWindow: (index: number) => number };
    }).__ATOMIC_ACRES_DEBUG__.detonateGrenadeAtWindow(1));
    expect(grenadeBreaks).toBeGreaterThanOrEqual(1);
    expect((await debug(page)).breakableWindows[1].broken).toBe(true);
  });

  test('keeps the reported west greenhouse route free of hidden wall planes', async ({ page }) => {
    const probes = await page.evaluate(() => {
      const probe = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        collisionProbe: (x: number, z: number) => boolean;
      } }).__ATOMIC_ACRES_DEBUG__.collisionProbe;
      return [
        probe(-29, 16),
        probe(-22, 14),
        probe(-25.5, 19.8),
        probe(-28, 12.2),
        probe(-23, 12.2),
      ];
    });
    expect(probes).toEqual([false, false, false, false, false]);
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
    await expect(page.locator('#map-heading')).toContainText('PLAYER UP');

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

  test('keeps Field Support below the map and collision-free at every supported HUD size', async ({ page }) => {
    const viewports = [
      { width: 1280, height: 720 },
      { width: 960, height: 540 },
      { width: 700, height: 700 },
      { width: 390, height: 844 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const metrics = await page.evaluate(() => {
        const visibleBox = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          return element && getComputedStyle(element).display !== 'none' ? element.getBoundingClientRect() : null;
        };
        const intersects = (a: DOMRect, b: DOMRect) => !(
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
        );
        const ammo = document.querySelector<HTMLElement>('#ammo')!;
        const support = document.querySelector<HTMLElement>('#support-block')!;
        const cards = [...document.querySelectorAll<HTMLElement>('[data-support]')];
        const supportBox = support.getBoundingClientRect();
        const minimapBox = visibleBox('#minimap')!;
        const boxes = cards.map((card) => card.getBoundingClientRect());
        const persistentRegions = [
          '#matchbar', '#objective', '#network-strip', '#killfeed', '#location-label',
          '#equipment-block', '#health-block', '#combat-stats', '#weapon-block', '#ping-block',
        ].map(visibleBox).filter((box): box is DOMRect => box !== null && box.width > 0 && box.height > 0);
        const cardOverlap = boxes.some((box, index) => boxes.slice(index + 1).some((other) => intersects(box, other)));
        const overflow = cards.some((card) => [...card.querySelectorAll<HTMLElement>('*')].some((child) => (
          child.scrollWidth > child.clientWidth + 1 || child.scrollHeight > child.clientHeight + 1
        )));
        return {
          ammoFont: Number.parseFloat(getComputedStyle(ammo).fontSize),
          cardCount: cards.length,
          supportWidth: supportBox.width,
          supportHeight: supportBox.height,
          leftGap: supportBox.left,
          rightGap: window.innerWidth - supportBox.right,
          minimapGap: supportBox.top - (visibleBox('#location-label')?.bottom ?? minimapBox.bottom),
          leftAnchored: supportBox.left < window.innerWidth * 0.5,
          verticallyStacked: boxes.slice(1).every((box, index) => box.top >= boxes[index].bottom),
          persistentOverlap: persistentRegions.some((region) => intersects(supportBox, region)),
          cardOverlap,
          overflow,
        };
      });
      expect(metrics.ammoFont, JSON.stringify(viewport)).toBeGreaterThanOrEqual(viewport.width <= 700 ? 40 : 64);
      expect(metrics.cardCount, JSON.stringify(viewport)).toBe(5);
      expect(metrics.supportWidth, JSON.stringify(viewport)).toBeGreaterThanOrEqual(145);
      expect(metrics.supportWidth, JSON.stringify(viewport)).toBeLessThanOrEqual(525);
      expect(metrics.supportHeight, JSON.stringify(viewport)).toBeGreaterThan(55);
      expect(metrics.leftGap, JSON.stringify(viewport)).toBeGreaterThanOrEqual(8);
      expect(metrics.rightGap, JSON.stringify(viewport)).toBeGreaterThanOrEqual(8);
      expect(metrics.minimapGap, JSON.stringify(viewport)).toBeGreaterThanOrEqual(8);
      expect(metrics.leftAnchored, JSON.stringify(viewport)).toBe(true);
      expect(metrics.persistentOverlap, JSON.stringify(viewport)).toBe(false);
      expect(metrics.cardOverlap, JSON.stringify(viewport)).toBe(false);
      expect(metrics.overflow, JSON.stringify(viewport)).toBe(false);
    }
  });

  test('spawns and awards the contested centre Overdrive Core for exactly 4× damage', async ({ page }) => {
    const initialSpawnInMs = await page.evaluate(() => {
      const state = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.overdrive.nextSpawnAt - performance.now();
    });
    expect(initialSpawnInMs).toBeGreaterThan(105_000);
    expect(initialSpawnInMs).toBeLessThanOrEqual(120_000);
    const spawnAnnouncement = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setOverdrive: (mode: 'available' | 'expired') => void;
        teleportPlayer: (x: number, y: number, z: number) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.teleportPlayer(12, 0.02, 0);
      api.setOverdrive('available');
      const announcement = document.querySelector<HTMLElement>('#power-announcement');
      return { hidden: announcement?.hidden ?? true, text: announcement?.textContent ?? '' };
    });
    expect(spawnAnnouncement.hidden).toBe(false);
    expect(spawnAnnouncement.text).toContain('QUAD DAMAGE ONLINE');
    await expect.poll(async () => (await debug(page)).overdrive.visible).toBe(true);
    expect((await debug(page)).overdrive).toMatchObject({
      available: true, worldIconVisible: true, worldIconName: 'quad-damage-world-icon', minimapSymbol: '4×',
    });
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { teleportPlayer: (x: number, y: number, z: number) => void } }).__ATOMIC_ACRES_DEBUG__;
      api.teleportPlayer(0, 0.02, 0);
    });
    let active: DebugState['overdrive'] | null = null;
    await expect.poll(async () => {
      active = (await debug(page)).overdrive;
      return active.damageMultiplier;
    }).toBe(4);
    expect(active).not.toBeNull();
    const observedActive = active as unknown as {
      available: boolean;
      pickups: number;
      remainingMs: number;
    };
    expect(observedActive.available).toBe(false);
    expect(observedActive.pickups).toBe(1);
    expect(observedActive.remainingMs).toBeGreaterThan(12_000);
    expect(observedActive.remainingMs).toBeLessThanOrEqual(15_000);
    await expect(page.locator('#overdrive-hud')).toBeVisible();
    await expect(page.locator('#overdrive-hud')).toContainText('4× DAMAGE');
    await expect(page.locator('#power-announcement')).toContainText('QUAD DAMAGE');
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setOverdrive: (mode: 'expired') => void } }).__ATOMIC_ACRES_DEBUG__.setOverdrive('expired'));
    await expect(page.locator('#overdrive-hud')).toBeHidden();
  });

  test('reaches Hunter Swarm and Nuke through the standard gamepad support selector', async ({ page }) => {
    await page.evaluate(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
      (window as unknown as { __PASS31_PAD__: { buttons: Array<{ pressed: boolean; touched: boolean; value: number }> } }).__PASS31_PAD__ = { buttons };
    });
    const pulse = async (index: number) => {
      await page.evaluate((button) => {
        const target = (window as unknown as { __PASS31_PAD__: { buttons: Array<{ pressed: boolean; value: number }> } }).__PASS31_PAD__.buttons[button];
        target.pressed = true; target.value = 1;
      }, index);
      await page.waitForTimeout(60);
      await page.evaluate((button) => {
        const target = (window as unknown as { __PASS31_PAD__: { buttons: Array<{ pressed: boolean; value: number }> } }).__PASS31_PAD__.buttons[button];
        target.pressed = false; target.value = 0;
      }, index);
      await page.waitForTimeout(60);
    };
    await pulse(15); await pulse(15); await pulse(15);
    expect((await debug(page)).fieldSupport.gamepadSelection).toBe('hunter-swarm');
    await pulse(15);
    expect((await debug(page)).fieldSupport.gamepadSelection).toBe('nuke');
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { earnSupport: (count: number) => void } }).__ATOMIC_ACRES_DEBUG__.earnSupport(15));
    await pulse(12);
    await expect.poll(async () => (await debug(page)).fieldSupport.nukeActivations).toBe(1);
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
    await expect(page.locator('#killfeed')).toContainText('ENEMY');
    await expect.poll(async () => (await debug(page)).teamPings.length, { timeout: 7_000 }).toBe(0);
    const secondKinds = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        sendPing: (kind: 'push') => void;
        snapshot: () => DebugState;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.sendPing('push');
      return api.snapshot().teamPings.map((ping) => ping.kind);
    });
    expect(secondKinds).toEqual(['push']);
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
    const interruption = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        fireOnce: () => void;
        reload: () => void;
        openMenu: () => void;
        snapshot: () => DebugState;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.fireOnce();
      api.reload();
      const started = api.snapshot().player.reloading;
      api.openMenu();
      const interrupted = api.snapshot();
      return { started, interrupted };
    });
    expect(interruption.started).toBe(true);
    expect(interruption.interrupted.player.reloading).toBe(false);
    const eventCount = interruption.interrupted.weaponActionHistory.length;
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
    const fired = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void; snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__;
      api.fireOnce();
      return api.snapshot();
    });
    expect(fired.player.ammo).toBeLessThan(before.player.ammo);
    expect(fired.activeImpactParticles).toBeGreaterThan(0);
    expect(fired.activeImpactMarks).toBeGreaterThan(0);
    expect(fired.activeImpactMarks).toBeLessThanOrEqual(32);
    expect(fired.activeTracers).toBeLessThanOrEqual(18);
    expect(fired.weaponPresentation.weapon).toBe('carbine');
    expect(fired.weaponPresentation.detailsReady).toBe(true);
    expect(fired.weaponPresentation.shotsPresented).toBe(before.weaponPresentation.shotsPresented + 1);
    expect(fired.weaponPresentation.heat).toBeGreaterThan(0);
    // Non-scattergun casings are admitted at the same presentation boundary as
    // the shot. Assert that exact snapshot rather than racing a short-lived
    // pooled mesh against a long software-rendered frame.
    expect(fired.weaponPresentation.activeCasings).toBeGreaterThan(0);
    expect(fired.weaponPresentation.activeCasings).toBeLessThanOrEqual(16);
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

  test('automatically completes a reload when the final round empties the magazine', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as {
        __ATOMIC_ACRES_DEBUG__: {
          equipWeapon: (weapon: 'carbine') => void;
          setAmmo: (weapon: 'carbine', ammo: number, reserve: number) => void;
          fireOnce: () => void;
        };
      }).__ATOMIC_ACRES_DEBUG__;
      api.equipWeapon('carbine');
      api.setAmmo('carbine', 1, 30);
      api.fireOnce();
    });
    await expect.poll(async () => (await debug(page)).player.ammo).toBe(0);
    await expect.poll(async () => (await debug(page)).player.reloading).toBe(true);
    await expect.poll(async () => (await debug(page)).player.ammo, { timeout: 3_000 }).toBe(30);
    const after = await debug(page);
    expect(after.player.reloading).toBe(false);
    expect(after.player.reserve).toBe(0);
    expect(after.weaponActionHistory).toEqual(['mag-release', 'mag-out', 'mag-in', 'mag-seat', 'bolt-release']);
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
    await expect(page.locator('#objective')).toContainText('FIVE MINUTES · MOST KILLS WINS');
    await expect(page.locator('#grenades')).toHaveText('FRAG ×2');
    await expect(page.locator('#minimap')).toBeVisible();
    await expect(page.locator('#location-label')).toHaveText(/AQUA HABITAT|CORAL HABITAT|VERDANT ARRAY|CIVIC TRANSIT|HELIO SERVICE/);
    await page.keyboard.down('Tab');
    await expect(page.locator('#roster-list > div')).toHaveCount(3);
    await page.keyboard.up('Tab');
    await page.screenshot({ path: 'test-results/gameplay-structured-pass.png', fullPage: true });
  });

  test('ends Atomic Acres on the five-minute time limit and performs a complete rematch reset', async ({ page }) => {
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setKills: (kills: number) => void; endMatch: () => void } }).__ATOMIC_ACRES_DEBUG__;
      api.setKills(30);
      api.endMatch();
    });
    const ended = await debug(page);
    expect(ended.matchPhase).toBe('ended');
    expect(ended.matchEndReason).toBe('time');
    expect(ended.scores[0] + ended.scores[1]).toBeGreaterThanOrEqual(30);
    await expect(page.locator('#banner')).toContainText('VICTORY');
    await expect(page.locator('#rematch')).toBeVisible();
    await page.locator('#rematch').click();
    await expect.poll(async () => (await debug(page)).matchPhase, { timeout: 6_000 }).toBe('active');
    expect((await debug(page)).scores).toEqual([0, 0]);
    await expect(page.locator('#banner')).toBeHidden();
  });

  test('shows directional damage, ADS telemetry and delayed health recovery', async ({ page }) => {
    const initialAds = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setAds: (held: boolean) => void; snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__;
      api.setAds(true);
      return {
        progress: api.snapshot().weaponPresentation.adsProgress,
        crosshairAds: document.querySelector('#crosshair')?.classList.contains('ads') ?? false,
      };
    });
    expect(initialAds.progress).toBeLessThan(0.9);
    expect(initialAds.crosshairAds).toBe(false);
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
    await pageReadyAt(page, '/?render=performance&signal=on');
    await startSolo(page);
    await page.waitForTimeout(500);
    const state = await debug(page);
    expect(state.render.profile).toBe('performance');
    expect(state.render.representation).toBe('responsive');
    expect(state.render.reducedMode).toBe(true);
    expect(state.render.shadows).toBe(false);
    expect(state.render.shadowMode).toBe('off');
    expect(state.render.lighting).toMatchObject({
      exposure: 1.16, hemisphereIntensity: 1.82, ambientIntensity: 0.78,
      sunIntensity: 2.65, shadowBias: -0.00028, shadowNormalBias: 0.025, softShadows: false,
      fogNear: 36, fogFar: 112,
      routeLightIntensity: 3, streetLightIntensity: 4, interiorLightIntensity: 11,
      routeLightCount: 3, streetLightCount: 4, interiorLightCount: 2,
      godRayStrength: 0.08, godRayLobes: 2,
    });
    expect(state.worldIdentityPresentation).toEqual({
      routeLights: 0,
      routeSigns: 3,
      cueInstances: 0,
      atmosphericParticles: 0,
      practicalLights: 0,
      streetLights: 0,
      interiorLights: 0,
      fixtureInstances: 8,
      ceilingInstances: 10,
    });
    expect(state.render.grass).toMatchObject({
      pass: 30,
      enabled: false,
      bypassReason: 'software-renderer',
      blades: 0,
      submissions: 0,
      authoritative: false,
    });
    expect(state.render.atmosphere).toMatchObject({
      pass: 30,
      enabled: false,
      bypassReason: 'software-renderer',
      mistCards: 0,
      volumetricRayMarching: false,
    });
    expect(state.render.sky).toMatchObject({ pass: 30, cloudBands: 0, godRayStrength: 0, godRayLobes: 0, extraDraws: 0 });
    expect(state.render.pixelRatio).toBeCloseTo(0.75, 5);
    expect(state.render.antialias).toBe(false);
    expect(state.render.atomicSignal).toMatchObject({
      enabled: true,
      fallbackReason: null,
      textureSamples: 1,
      targetValidated: true,
      outputValidated: true,
    });
    const overlays = await page.evaluate(() => ({
      grade: getComputedStyle(document.querySelector('#color-grade')!).display,
      grain: getComputedStyle(document.querySelector('#film-grain')!).display,
    }));
    expect(overlays).toEqual({ grade: 'none', grain: 'none' });
    const viewport = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    expect(state.render.drawingBuffer[0]).toBeLessThanOrEqual(Math.ceil(viewport[0] * 0.75));
    expect(state.render.drawingBuffer[1]).toBeLessThanOrEqual(Math.ceil(viewport[1] * 0.75));
    // Retain the draw-call ceiling. Pass 32 spends a tightly bounded 8k-triangle
    // envelope above the old 150k cap on four recognisable Performance-profile
    // physical-cover silhouettes instead of generic collider boxes.
    expect(state.render.calls).toBeLessThanOrEqual(147);
    expect(state.render.triangles).toBeLessThanOrEqual(158_000);
    expect(state.render.staticBatchPalette).toEqual(expect.arrayContaining(['789d55', '4eaaa7', 'c66d5a']));
    expect(state.physicalCover.slice(2).map((cover) => ({
      id: cover.id,
      kind: cover.performanceVisualKind,
      meshes: cover.performanceVisualMeshes,
    }))).toEqual([
      { id: 'north-cargo-stack', kind: 'cargo-stack', meshes: 5 },
      { id: 'south-pipe-stack', kind: 'pipe-stack', meshes: 5 },
      { id: 'west-service-skip', kind: 'service-skip', meshes: 7 },
      { id: 'east-generator-trailer', kind: 'generator-trailer', meshes: 9 },
    ]);
    expect(state.interiorTelemetry).toEqual({
      houses: 2,
      groundRooms: 4,
      upperRooms: 4,
      doors: 4,
      windows: 6,
      ramps: 4,
      wallMaterialVariants: 6,
      pbrMaterialFamilies: 9,
      furnishings: 40,
      fixtures: 0,
      visibleCollisionProxies: 0,
      visibleRamps: 4,
      furnishingSets: 2,
      furnishingSourcePieces: 40,
      furnishingBatches: 4,
      furnishingMaterialFamilies: ['dark-equipment', 'fabric', 'metal', 'timber'],
      texturedFurnishingMaterialFamilies: ['dark-equipment', 'fabric', 'metal', 'timber'],
    });
    expect(state.neighbourhoodLife).toEqual({
      loaded: true,
      floraInstances: 48,
      faunaInstances: 0,
      streetItems: 13,
      flowerBeds: 6,
      benches: 4,
      bins: 6,
      bicycles: 3,
      genericMarkers: 0,
    });
    await page.setViewportSize({ width: 1000, height: 700 });
    await expect.poll(async () => {
      const resized = await debug(page);
      return resized.render.atomicSignal.width === resized.render.drawingBuffer[0]
        && resized.render.atomicSignal.height === resized.render.drawingBuffer[1];
    }).toBe(true);
    expect(errors).toEqual([]);
  });

  test('Performance hardware tier retains bounded mist, smoke and low-altitude dust', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=performance&mist=on');
    await startSolo(page);
    await page.waitForTimeout(300);
    const atmosphere = (await debug(page)).render.atmosphere;
    expect(atmosphere).toMatchObject({
      pass: 30,
      enabled: true,
      bypassReason: null,
      mistCards: 10,
      smokeCards: 5,
      dustMotes: 64,
      triangles: 30,
      textureSamples: 0,
      volumetricRayMarching: false,
      perFrameAllocations: 0,
    });
    expect(atmosphere.submissions).toBeLessThanOrEqual(3);
    expect(errors).toEqual([]);
  });

  test('legacy Quality alias loads Quality Graphics', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=quality');
    await expect(page.locator('#graphics-profile option')).toHaveCount(2);
    await expect(page.locator('#graphics-profile option')).toHaveText(['PERFORMANCE', 'QUALITY GRAPHICS']);
    await startSolo(page);
    await page.waitForTimeout(1_000);
    const state = await debug(page);
    expect(state.render.profile).toBe('blender');
    expect(state.render.representation).toBe('blender');
    expect(state.render.blenderEnvironment.status).toBe('ready');
    expect(state.render.pixelRatio).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('Performance gameplay shows a live FPS counter in the top right', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=performance&signal=on');
    await startSolo(page);
    const fpsCounter = page.locator('#fps-counter');
    await expect(fpsCounter).toBeVisible();
    await expect(fpsCounter.locator('b')).toHaveText(/^\d{1,3}$/);
    const box = await fpsCounter.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x + box!.width).toBeGreaterThan(viewport!.width - 140);
    expect(box!.y).toBeLessThan(80);
    const signalState = await debug(page);
    expect(signalState.render.fpsCounter).toMatchObject({ visible: true, anchor: 'top-right' });
    expect(signalState.render.atomicSignal).toMatchObject({ enabled: true, fallbackReason: null, textureSamples: 1 });
    expect(signalState.render.atomicSignal.samples).toBeGreaterThan(0);
    const cadenceStart = signalState;
    await page.waitForFunction((targetFrame) => (
      (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } })
        .__ATOMIC_ACRES_DEBUG__.snapshot().frameCount >= targetFrame
    ), cadenceStart.frameCount + 3, { timeout: 15_000 });
    const cadenceEnd = await debug(page);
    const renderedFrames = cadenceEnd.frameCount - cadenceStart.frameCount;
    const minimapFrames = cadenceEnd.render.minimapRenders - cadenceStart.render.minimapRenders;
    expect(minimapFrames).toBeGreaterThanOrEqual(renderedFrames - 1);
    expect(minimapFrames).toBeLessThanOrEqual(renderedFrames + 1);
    expect(errors).toEqual([]);
  });

  test('camera-relative map, damage direction and respawn safety agree on left and right', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReadyAt(page, '/?render=performance');
    await startSolo(page);
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setBotsFrozen: (frozen: boolean) => void;
        placeBotRelative: (right: number, forward: number) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.placeBotRelative(7, 0);
    });

    const markerCentreX = async (): Promise<number> => page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#minimap')!;
      const context = canvas.getContext('2d')!;
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      let weightedX = 0;
      let pixels = 0;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const r = image.data[offset];
          const g = image.data[offset + 1];
          const b = image.data[offset + 2];
          const a = image.data[offset + 3];
          if (r >= 248 && g >= 112 && g <= 124 && b >= 89 && b <= 101 && a >= 245) {
            weightedX += x;
            pixels += 1;
          }
        }
      }
      if (pixels < 20) throw new Error(`Expected enemy minimap marker pixels, found ${pixels}`);
      return weightedX / pixels;
    });

    const waitForTwoFrames = async (): Promise<void> => {
      const state = await debug(page);
      await page.waitForFunction((targetFrame) => (
        (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } })
          .__ATOMIC_ACRES_DEBUG__.snapshot().frameCount >= targetFrame
      ), state.frameCount + 2, { timeout: 15_000 });
    };

    await waitForTwoFrames();
    const minimapState = await debug(page);
    expect(minimapState.minimap.landmarks).toEqual([
      { id: 'north-tour-bus', kind: 'bus', label: 'BUS' },
      { id: 'south-shuttle-bus', kind: 'bus', label: 'BUS' },
      { id: 'north-cargo-stack', kind: 'cargo-stack', label: 'CRGO' },
      { id: 'south-pipe-stack', kind: 'pipe-stack', label: 'PIPE' },
      { id: 'west-service-skip', kind: 'service-skip', label: 'SKIP' },
      { id: 'east-generator-trailer', kind: 'generator-trailer', label: 'GEN' },
    ]);
    expect(await markerCentreX()).toBeGreaterThan(180);
    const rightDamage = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: { showBotDamageDirection: () => number | null } }
    ).__ATOMIC_ACRES_DEBUG__.showBotDamageDirection());
    expect(rightDamage).toBeCloseTo(Math.PI / 2);
    const rightCssAngle = Number.parseFloat(await page.locator('#damage-direction').evaluate((node) => (
      node as HTMLElement
    ).style.getPropertyValue('--damage-angle')));
    expect(rightCssAngle).toBeGreaterThan(1);

    await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: { placeBotRelative: (right: number, forward: number) => void } }
    ).__ATOMIC_ACRES_DEBUG__.placeBotRelative(-7, 0));
    await waitForTwoFrames();
    expect(await markerCentreX()).toBeLessThan(180);
    const leftDamage = await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: { showBotDamageDirection: () => number | null } }
    ).__ATOMIC_ACRES_DEBUG__.showBotDamageDirection());
    expect(leftDamage).toBeCloseTo(-Math.PI / 2);

    await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: { respawn: () => void } }
    ).__ATOMIC_ACRES_DEBUG__.respawn());
    const firstRespawn = (await debug(page)).spawnSelection!;
    expect(firstRespawn.selectedVisibleThreats).toBe(firstRespawn.minimumVisibleThreats);
    if (firstRespawn.safeTierCount > 1) expect(firstRespawn.selectedIndex).not.toBe(firstRespawn.previousIndex);
    await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: { respawn: () => void } }
    ).__ATOMIC_ACRES_DEBUG__.respawn());
    const secondRespawn = (await debug(page)).spawnSelection!;
    expect(secondRespawn.selectedVisibleThreats).toBe(secondRespawn.minimumVisibleThreats);
    if (secondRespawn.safeTierCount > 1) expect(secondRespawn.selectedIndex).not.toBe(secondRespawn.previousIndex);
    expect(errors).toEqual([]);
  });
});
