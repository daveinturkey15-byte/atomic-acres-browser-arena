import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { WEAPONS } from '../../src/gameplay';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../../src/gun-range-test-bay';

test('renders the five-second Gun Range tunnel, grey test bay, and slow unarmed targets', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 2_560, height: 1_440 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.goto('/?release=latest&map=gun-range&renderer=webgl2&render=blender&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=pass66-test-bay');
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.bootstrap?.stage === 'ready'
      && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });

  const first = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    const snapshot = api.snapshot();
    return {
      bounds: snapshot.arenaSelection.bounds,
      targets: snapshot.rangePractice.targets.filter((target: { kind: string }) => target.kind === 'training-dummy'),
    };
  });
  expect(first.bounds).toEqual({ minX: -20, maxX: 100, minZ: -48, maxZ: 38 });
  expect(first.targets).toHaveLength(4);
  expect(first.targets.every((target: { active: boolean; health: number; maxHealth: number; visible: boolean }) => (
    target.active && target.visible && target.health === 300 && target.maxHealth === 300
  ))).toBe(true);
  const output = resolve(process.cwd(), 'artifacts/pass66/gun-range-test-bay');
  mkdirSync(output, { recursive: true });
  const setReviewCameraAndWait = async (cameraId: string): Promise<void> => {
    expect(await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId)).toBe(true);
    const beforeFrame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
    await page.waitForFunction((frame) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > frame, beforeFrame);
  };

  // The secure leaf begins as real movement authority, then travels clear when
  // the player reaches its proximity trigger. This proves the main-loop/Rapier
  // integration rather than accepting a presentation-only moving mesh.
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(51.5, 1.7, 12)
  ))).toBe(true);
  await setReviewCameraAndWait('gun-range-test-bay-door-approach');
  await page.screenshot({ path: resolve(output, 'gun-range-test-bay-door-closed-approach-2560x1440.png'), animations: 'disabled' });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null));
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(48.75, 1.7, 12, -Math.PI / 2, 0));
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(51.5, 1.7, 12)
  )), { timeout: 3_000 }).toBe(false);
  await setReviewCameraAndWait('gun-range-test-bay-door-bay-face');
  await page.screenshot({ path: resolve(output, 'gun-range-test-bay-door-open-bay-face-2560x1440.png'), animations: 'disabled' });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null));

  await page.waitForTimeout(750);
  const secondPositions = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice.targets
    .filter((target: { kind: string }) => target.kind === 'training-dummy')
    .map((target: { position: number[] }) => target.position));
  expect(secondPositions.some((position: number[], index: number) => position[0] !== first.targets[index].position[0])).toBe(true);

  // Every canonical weapon station is a live equip/refill path, including the
  // three authority-owned specials. Set equality in the unit contract alone
  // is not enough: exercise the real F arbitration and first-person swap.
  const exercisedWeapons: string[] = [];
  for (const station of GUN_RANGE_TEST_BAY_CONTRACT.weaponStations) {
    await page.evaluate(({ x, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z), station.position);
    await expect.poll(async () => page.evaluate((expectedWeapon) => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.candidates
        .some((candidate: { kind: string; targetId: string }) => candidate.kind === 'test-bay-weapon'
          && candidate.targetId === `test-bay-weapon:${expectedWeapon}`)
    ), station.id)).toBe(true);
    expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactTestBayStation())).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        weapon: snapshot.player.weapon,
        presentationWeapon: snapshot.weaponPresentation.weapon,
        detailsReady: snapshot.weaponPresentation.detailsReady,
        visibleMeshes: snapshot.weaponPresentation.modelVisibleMeshCount,
      };
    })).toEqual({
      weapon: station.id,
      presentationWeapon: station.id,
      detailsReady: true,
      visibleMeshes: expect.any(Number),
    });
    expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation.modelVisibleMeshCount)).toBeGreaterThan(0);
    exercisedWeapons.push(station.id);
  }
  expect(exercisedWeapons).toEqual(GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.map(({ id }) => id));

  const chopperStation = GUN_RANGE_TEST_BAY_CONTRACT.supportStations.find(({ id }) => id === 'chopper')!;
  await page.evaluate(({ x, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z), chopperStation.position);
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.candidates
    .some((candidate: { kind: string; targetId: string }) => candidate.kind === 'test-bay-support'
      && candidate.targetId === 'test-bay-support:chopper'))).toBe(true);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactTestBayStation())).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.entities
    .some((entity: { kind: string; ownerId: string }) => entity.kind === 'chopper' && entity.ownerId.length > 0)), {
    timeout: 20_000,
  }).toBe(true);

  // The station initially launches autonomous support. Its damage cannot prove
  // the reported Chopper Gunner trigger path, so enter possession through the
  // configured slot key and bind every later assertion to that activation.
  const chopperControl = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const actor = snapshot.killstreak.actors.find((candidate: { actorId: string }) => candidate.actorId === snapshot.player.id);
    const slotIndex = actor?.loadout.slots.indexOf('chopper') ?? -1;
    const entity = snapshot.killstreak.entities.find((candidate: { kind: string; ownerId: string }) => (
      candidate.kind === 'chopper' && candidate.ownerId === snapshot.player.id
    ));
    return {
      activationId: entity?.activationId ?? null,
      entityId: entity?.id ?? null,
      slotIndex,
      inputKey: slotIndex >= 0 ? String(slotIndex + 3) : null,
      inputCode: slotIndex >= 0 ? `Digit${slotIndex + 3}` : null,
    };
  });
  expect(chopperControl).toMatchObject({ slotIndex: 3, inputKey: '6', inputCode: 'Digit6' });
  expect(chopperControl.activationId).toBeTruthy();
  expect(chopperControl.entityId).toBeTruthy();

  await page.locator('#game').click({ position: { x: 64, y: 64 }, force: true });
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 5_000 });
  expect(await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      pointerLocked: document.pointerLockElement === document.querySelector('#game'),
      inputEligible: snapshot.fieldSupport.fInteraction.inputEligible,
      menuVisible: snapshot.menuVisible,
      matchPhase: snapshot.matchPhase,
      activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
    };
  })).toEqual({
    pointerLocked: true,
    inputEligible: true,
    menuVisible: false,
    matchPhase: 'active',
    activeElement: expect.any(String),
  });
  await page.keyboard.press(chopperControl.inputKey!);
  await expect.poll(async () => page.evaluate((entityId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const actor = snapshot.killstreak.actors.find((candidate: { actorId: string }) => candidate.actorId === snapshot.player.id);
    const entity = snapshot.killstreak.entities.find((candidate: { id: string }) => candidate.id === entityId);
    return {
      possession: actor?.possession ?? null,
      gunController: entity?.gunController ?? null,
      documentPossession: document.documentElement.dataset.killstreakPossession ?? 'none',
    };
  }, chopperControl.entityId), { timeout: 5_000 }).toEqual({
    possession: { kind: 'chopper-gunner', entityId: chopperControl.entityId },
    gunController: 'owner-player',
    documentPossession: 'chopper-gunner',
  });
  await expect(page.locator('#gunner-cockpit-hud')).toBeVisible();
  await expect(page.locator('#gunner-cockpit-hud .gunner-reticle')).toBeVisible();
  await expect(page.locator('#gunner-cockpit-hud')).toHaveAttribute('data-support-kind', 'chopper-gunner');
  const cockpitHudLayout = async () => page.evaluate(() => {
    const reticle = document.querySelector<HTMLElement>('#gunner-cockpit-hud .gunner-reticle')!;
    const centre = { x: innerWidth / 2, y: innerHeight / 2 };
    const aimPartRects = [...reticle.children].map((child) => (child as HTMLElement).getBoundingClientRect());
    const readouts = [...document.querySelectorAll<HTMLElement>('#gunner-cockpit-hud .gunner-readout')]
      .map((readout) => {
        const bounds = readout.getBoundingClientRect();
        return {
          id: readout.querySelector('strong')?.id ?? '',
          width: bounds.width,
          height: bounds.height,
          inside: bounds.left >= -1 && bounds.top >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1,
        };
      });
    return {
      viewport: [innerWidth, innerHeight],
      readouts,
      centreClear: aimPartRects.every((bounds) => !(
        centre.x >= bounds.left && centre.x <= bounds.right && centre.y >= bounds.top && centre.y <= bounds.bottom
      )),
      centreContract: reticle.dataset.centreClear,
    };
  });
  expect(await cockpitHudLayout()).toMatchObject({
    viewport: [2_560, 1_440],
    centreClear: true,
    centreContract: 'true',
    readouts: expect.arrayContaining([
      expect.objectContaining({ id: 'gunner-hull', inside: true }),
      expect.objectContaining({ id: 'gunner-ammo', inside: true }),
      expect.objectContaining({ id: 'gunner-altitude', inside: true }),
      expect.objectContaining({ id: 'gunner-speed', inside: true }),
      expect.objectContaining({ id: 'gunner-time', inside: true }),
      expect.objectContaining({ id: 'gunner-damage', inside: true }),
    ]),
  });
  const cockpitPresentation = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).killstreakPresentation.firstPersonSightline);
  expect(cockpitPresentation).toMatchObject({
    visibleOutsideCockpit: [],
    dashboardVisible: true,
    displaysVisible: true,
    hudVisible: false,
    centreSightlineClear: true,
    weaponVisible: true,
    overlayLayerExclusive: true,
    alignment: { pivotErrorM: expect.any(Number) },
  });
  expect(cockpitPresentation.alignment.pivotErrorM).toBeLessThan(0.001);
  const pass70ChopperEvidence = resolve(process.cwd(), 'artifacts/pass70/chopper-gunner');
  mkdirSync(pass70ChopperEvidence, { recursive: true });
  await page.screenshot({ path: resolve(pass70ChopperEvidence, 'possessed-desktop-webgl2-2560x1440.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCockpitHud = await cockpitHudLayout();
  expect(mobileCockpitHud).toMatchObject({ viewport: [390, 844], centreClear: true, centreContract: 'true' });
  expect(mobileCockpitHud.readouts).toHaveLength(6);
  expect(mobileCockpitHud.readouts.every(({ inside, width, height }) => inside && width > 0 && height > 0)).toBe(true);
  await page.screenshot({ path: resolve(pass70ChopperEvidence, 'possessed-mobile-webgl2-390x844.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 2_560, height: 1_440 });

  let selectedAim: {
    entityId: string;
    activationId: string;
    targetId: string;
    origin: number[];
    target: number[];
    yaw: number;
    pitch: number;
    lineOfSight: true;
  } | null = null;
  await expect.poll(async () => {
    selectedAim = await page.evaluate((targetIds) => {
      for (const targetId of targetIds) {
        const aim = window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTrainingDummy(targetId);
        if (aim) return aim;
      }
      return null;
    }, GUN_RANGE_TEST_BAY_CONTRACT.dummies.map(({ id }) => id));
    return selectedAim?.targetId ?? null;
  }, { timeout: 8_000 }).not.toBeNull();
  if (!selectedAim) throw new Error('No line-of-sight admitted training dummy was available to the possessed chopper');
  const targetId = selectedAim.targetId;
  expect(selectedAim).toMatchObject({
    entityId: chopperControl.entityId,
    activationId: chopperControl.activationId,
    lineOfSight: true,
  });
  const noFireBefore = await page.evaluate((expectedTargetId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const target = snapshot.rangePractice.targets.find((candidate: { id: string }) => candidate.id === expectedTargetId);
    return {
      hp: target.health,
      position: target.position,
      received: snapshot.supportDamageFeedback.received,
    };
  }, targetId);
  await page.waitForTimeout(400);
  const noFireAfter = await page.evaluate((expectedTargetId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const target = snapshot.rangePractice.targets.find((candidate: { id: string }) => candidate.id === expectedTargetId);
    return {
      hp: target.health,
      position: target.position,
      received: snapshot.supportDamageFeedback.received,
    };
  }, targetId);
  expect(noFireAfter.hp, 'possessed chopper must not retain autonomous fire').toBe(noFireBefore.hp);
  expect(noFireAfter.received, 'no autonomous damage may be counted after possession').toBe(noFireBefore.received);
  expect(noFireAfter.position, 'the admitted dummy must remain a moving target').not.toEqual(noFireBefore.position);

  const aim = await page.evaluate((expectedTargetId) => (
    window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTrainingDummy(expectedTargetId)
  ), targetId);
  expect(aim).toMatchObject({
    entityId: chopperControl.entityId,
    activationId: chopperControl.activationId,
    targetId,
    lineOfSight: true,
  });
  await expect.poll(async () => page.evaluate((expectedTargetId) => {
    const target = window.__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice.targets
      .find((candidate: { id: string }) => candidate.id === expectedTargetId);
    return target?.screenPosition ?? null;
  }, targetId)).toEqual([
    expect.any(Number),
    expect.any(Number),
    expect.any(Number),
  ]);
  const aimedTarget = await page.evaluate((expectedTargetId) => window.__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice.targets
    .find((candidate: { id: string }) => candidate.id === expectedTargetId), targetId);
  expect(Math.abs(aimedTarget.screenPosition[0]), 'dummy must be inside the possessed crosshair corridor').toBeLessThan(0.12);
  expect(Math.abs(aimedTarget.screenPosition[1]), 'dummy must be inside the possessed crosshair corridor').toBeLessThan(0.12);
  expect(aimedTarget.screenPosition[2]).toBeGreaterThan(-1);
  expect(aimedTarget.screenPosition[2]).toBeLessThan(1);

  const fireBaseline = await page.evaluate((expectedTargetId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const target = snapshot.rangePractice.targets.find((candidate: { id: string }) => candidate.id === expectedTargetId);
    return {
      hp: target.health,
      received: snapshot.supportDamageFeedback.received,
      startedAtMs: performance.now(),
    };
  }, targetId);
  await page.mouse.down({ button: 'left' });
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld
  )), { timeout: 2_000 }).toBe(true);
  let controlledDamageObserved = false;
  let heldFireDiagnostic: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 24 && !controlledDamageObserved; attempt += 1) {
    // The target and AI-flown platform both move. Keep the player aim aligned
    // while the real pointer-lock trigger remains held; the hook never submits
    // a control intent or damage event itself.
    await page.evaluate((expectedTargetId) => (
      window.__ATOMIC_ACRES_DEBUG__.aimPossessedChopperAtTrainingDummy(expectedTargetId)
    ), targetId);
    await page.waitForTimeout(75);
    heldFireDiagnostic = await page.evaluate(({ expectedTargetId, activationId, baselineHp, startedAtMs }) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const target = snapshot.rangePractice.targets.find((candidate: { id: string }) => candidate.id === expectedTargetId);
      const admitted = snapshot.supportDamageFeedback.recent.find((sample: {
        source: string; targetId: string; activationId: string; damage: number; atMs: number;
      }) => sample.source === 'chopper'
        && sample.targetId === expectedTargetId
        && sample.activationId === activationId
        && sample.damage > 0
        && sample.atMs >= startedAtMs);
      const targetConfirm = document.querySelector<HTMLElement>('#gunner-target-confirm');
      const cockpitHud = document.querySelector<HTMLElement>('#gunner-cockpit-hud');
      return {
        hit: target.health < baselineHp && Boolean(admitted),
        targetHealth: target.health,
        targetPosition: target.position,
        triggerHeld: snapshot.textChat.triggerHeld,
        possession: snapshot.killstreak.actors.find((actor: { actorId: string }) => actor.actorId === snapshot.player.id)?.possession ?? null,
        controlAdmission: snapshot.killstreakControlAdmission,
        feedbackReceived: snapshot.supportDamageFeedback.received,
        admitted: admitted ?? null,
        targetConfirm: {
          hidden: targetConfirm?.hidden ?? true,
          targetId: targetConfirm?.dataset.targetId ?? null,
          hitConfirm: cockpitHud?.dataset.hitConfirm ?? null,
        },
      };
    }, {
      expectedTargetId: targetId,
      activationId: chopperControl.activationId,
      baselineHp: fireBaseline.hp,
      startedAtMs: fireBaseline.startedAtMs,
    });
    controlledDamageObserved = heldFireDiagnostic.hit === true;
    if (controlledDamageObserved) {
      await page.screenshot({ path: resolve(pass70ChopperEvidence, 'authoritative-target-hit-confirm-webgl2.png'), animations: 'allow' });
    }
  }
  await test.info().attach('controlled-chopper-fire-diagnostic.json', {
    body: Buffer.from(`${JSON.stringify(heldFireDiagnostic, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld),
    'the real pointer-lock mouse trigger must remain held through the admitted shot').toBe(true);
  await page.mouse.up({ button: 'left' });
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld
  )), { timeout: 2_000 }).toBe(false);
  if (!controlledDamageObserved) console.log('CHOPPER_CONTROL_DIAGNOSTIC', JSON.stringify(heldFireDiagnostic));
  expect(controlledDamageObserved, 'held player trigger must yield a host-authoritative Chopper hit').toBe(true);
  const controlledDamage = await page.evaluate(({ expectedTargetId, activationId, startedAtMs }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const target = snapshot.rangePractice.targets.find((candidate: { id: string }) => candidate.id === expectedTargetId);
    const admitted = [...snapshot.supportDamageFeedback.recent].reverse().find((sample: {
      source: string; targetId: string; activationId: string; damage: number; atMs: number;
    }) => sample.source === 'chopper'
      && sample.targetId === expectedTargetId
      && sample.activationId === activationId
      && sample.atMs >= startedAtMs);
    const actor = snapshot.killstreak.actors.find((candidate: { actorId: string }) => candidate.actorId === snapshot.player.id);
    const entity = snapshot.killstreak.entities.find((candidate: { id: string }) => candidate.id === actor?.possession?.entityId);
    return { hp: target.health, received: snapshot.supportDamageFeedback.received, admitted, possession: actor.possession, gunController: entity?.gunController };
  }, { expectedTargetId: targetId, activationId: chopperControl.activationId, startedAtMs: fireBaseline.startedAtMs });
  expect(controlledDamage.hp).toBeLessThan(fireBaseline.hp);
  expect(controlledDamage.received).toBeGreaterThan(fireBaseline.received);
  expect(controlledDamage.admitted).toMatchObject({
    source: 'chopper',
    targetId,
    activationId: chopperControl.activationId,
    damage: expect.any(Number),
  });
  expect(controlledDamage.possession).toEqual({ kind: 'chopper-gunner', entityId: chopperControl.entityId });
  expect(controlledDamage.gunController).toBe('owner-player');
  expect(heldFireDiagnostic?.targetConfirm).toEqual({ hidden: false, targetId, hitConfirm: 'true' });

  await page.keyboard.press(chopperControl.inputKey!);
  await expect.poll(async () => page.evaluate((entityId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const actor = snapshot.killstreak.actors.find((candidate: { actorId: string }) => candidate.actorId === snapshot.player.id);
    const entity = snapshot.killstreak.entities.find((candidate: { id: string }) => candidate.id === entityId);
    return { possession: actor?.possession ?? null, gunController: entity?.gunController ?? null };
  }, chopperControl.entityId), { timeout: 5_000 }).toEqual({ possession: null, gunController: 'ai' });
  await expect(page.locator('#gunner-cockpit-hud')).toBeHidden();
  await expect(page.locator('#gunner-cockpit-hud')).toHaveAttribute('data-support-kind', 'none');
  await expect(page.locator('#gunner-target-confirm')).toBeHidden();
  await expect(page.locator('#chopper-thermal')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-killstreak-possession', 'none');

  for (const cameraId of [
    'gun-range-test-bay-corridor',
    'gun-range-test-bay-door-approach',
    'gun-range-test-bay-door-bay-face',
    'gun-range-test-bay-overview',
  ]) {
    await setReviewCameraAndWait(cameraId);
    const review = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.playableScene.deterministicReview);
    expect(review.cameraId).toBe(cameraId);
    await page.screenshot({ path: resolve(output, `${cameraId}-2560x1440.png`), animations: 'disabled' });
  }
  await page.screenshot({ path: resolve(output, 'gun-range-test-bay-live-chopper-2560x1440.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('atomically refreshes adjacent test-bay weapon prompts', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.goto('/?release=latest&map=gun-range&renderer=webgl2&render=blender&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=pass69-3-prompt');
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.bootstrap?.stage === 'ready'
      && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));

  // Traverse adjacent stations without interacting. Both fields and the
  // candidate identity must change together on each rendered frame.
  for (const station of GUN_RANGE_TEST_BAY_CONTRACT.weaponStations.slice(0, 2)) {
    await page.evaluate(({ x, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z), station.position);
    await expect.poll(async () => page.evaluate(() => {
      const prompt = document.querySelector<HTMLElement>('#pickup-prompt');
      return {
        hidden: prompt?.hidden ?? true,
        kind: prompt?.dataset.interactionKind ?? null,
        targetId: prompt?.dataset.targetId ?? null,
        action: prompt?.querySelector<HTMLElement>('span')?.textContent ?? '',
        subject: prompt?.querySelector<HTMLElement>('strong')?.textContent ?? '',
      };
    })).toEqual({
      hidden: false,
      kind: 'test-bay-weapon',
      targetId: `test-bay-weapon:${station.id}`,
      action: 'TAP \u00b7 EQUIP / REFILL',
      subject: WEAPONS[station.id].name.toUpperCase(),
    });
  }

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(54, 1.7, 0));
  await expect.poll(async () => page.evaluate(() => {
    const prompt = document.querySelector<HTMLElement>('#pickup-prompt');
    return {
      hidden: prompt?.hidden ?? false,
      targetId: prompt?.dataset.targetId ?? null,
      action: prompt?.querySelector<HTMLElement>('span')?.textContent ?? '',
      subject: prompt?.querySelector<HTMLElement>('strong')?.textContent ?? '',
    };
  })).toEqual({ hidden: true, targetId: null, action: '', subject: '' });
  expect(errors).toEqual([]);
});
