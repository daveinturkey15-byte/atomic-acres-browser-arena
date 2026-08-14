import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const controlled = readFileSync(
  new URL('../tests/e2e/pass71-controlled-support-native.spec.ts', import.meta.url),
  'utf8',
);

function block(startMarker: string, endMarker: string, from = 0): string {
  const start = main.indexOf(startMarker, from);
  const end = main.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('trusted current-frame Chopper QA aim main integration', () => {
  it('arms only from the real trusted capture-phase canvas LMB without writing fire or damage', () => {
    const arm = block(
      'function armDebugChopperGunnerQaAimFromTrustedCapture(',
      '\nfunction resetKillstreakPossessionPresentation(',
    );
    for (const token of [
      'event instanceof MouseEvent',
      'event.isTrusted !== true',
      'event.button !== 0',
      'event.eventPhase !== Event.CAPTURING_PHASE',
      'event.currentTarget !== window',
      'event.target !== canvas',
      'document.pointerLockElement !== canvas',
      "possession?.kind !== 'chopper-gunner'",
      "candidate.kind === 'chopper'",
      "candidate.gunController === 'owner-player'",
      'targetLifeId: target.lifeId',
      'deadlineAtMs: requested.deadlineAtMs',
    ]) expect(arm).toContain(token);
    for (const forbidden of [
      'requestKillstreakControl',
      'requestPossessedChopper',
      'setLocalTriggerHeld',
      'triggerHeld =',
      'applyKillstreakDamageEvent',
      'applyBotDamage',
      'damageEvents.push',
    ]) expect(arm).not.toContain(forbidden);
  });

  it('recomputes current identity/pose after override and exact throttle, then presents and admits native held fire', () => {
    const update = block('function updateKillstreakPossession(', '\nfunction updatePass65KillstreakRuntime(');
    const override = update.indexOf('debugChopperEvidenceControlOverrideActive) return;');
    const throttle = update.indexOf('now - lastKillstreakControlSentAt < 50) return;');
    const resolve = update.indexOf('resolveChopperGunnerQaAim(request, {');
    const currentPose = update.indexOf('entity: qaEntity,', resolve);
    const align = update.indexOf('player.yaw = alignedQaAim.yaw;', resolve);
    const presentation = update.lastIndexOf('presentLocalPossessedSupportGun(now, possession, entity);');
    const admission = update.indexOf("requestKillstreakControl(entity.id, 'pilot-control', {");
    const receipt = update.indexOf('chopperGunnerQaAimReceipt(', admission);
    expect(override).toBeGreaterThan(-1);
    expect(override).toBeLessThan(throttle);
    expect(throttle).toBeLessThan(resolve);
    expect(resolve).toBeLessThan(currentPose);
    expect(currentPose).toBeLessThan(align);
    expect(align).toBeLessThan(presentation);
    expect(presentation).toBeLessThan(admission);
    expect(admission).toBeLessThan(receipt);
    expect(update).toContain('fire: triggerHeld,');
    expect(update).toContain('if (deferQaShotPresentation && alignedQaRequest && alignedQaAim) {');
    expect(update).not.toContain('requestPossessedChopperEvidenceControl');
    expect(update).not.toContain('requestPossessedChopperMissile');
  });

  it('invalidates the one-shot synchronously on release and every possession/match reset boundary', () => {
    const trigger = block('function setLocalTriggerHeld(', '\nfunction sendLocalReloadCancel(');
    expect(trigger).toContain('if (!held) {');
    expect(trigger).toContain('clearDebugChopperGunnerQaAimRequest();');
    const reset = block('function resetKillstreakPossessionPresentation(', '\nfunction presentLocalPossessedSupportGun(');
    expect(reset).toContain('clearDebugChopperGunnerQaAimRequest();');
    const clear = block('function clearFieldSupport()', '\nfunction updatePhysics(');
    expect(clear).toContain('resetDebugChopperGunnerQaAimEvidence();');
    expect(main).toContain('nextDebugChopperGunnerQaAimEdgeSequence();');
  });

  it('keeps the observer aim-free and binds exact receipt geometry/lives after admission within 2500ms', () => {
    const transaction = controlled.slice(
      controlled.indexOf("const key = '__PASS71_CHOPPER_SPLASH_OBSERVER__'"),
      controlled.indexOf('const missileArmReceipt'),
    );
    expect(transaction.match(/armPossessedChopperAimTarget\(/gu)).toHaveLength(1);
    expect(transaction).toContain('debug.readPossessedChopperAlignedAimReceipt()');
    expect(transaction).not.toContain('aimPossessedChopperAtTarget');
    expect(transaction).toContain('sample.atMs >= aim.controlAdmissionAtMs');
    expect(transaction).toContain('sample.targetLifeId === staged.primaryTargetLifeId');
    expect(transaction).toContain('sample.targetLifeId === staged.splashTargetLifeId');
    expect(transaction).toContain('observer.deadlineAtMs = observer.trustedTriggerAtMs + 2_500;');
    expect(transaction).toContain('debug.clearPossessedChopperAimTarget();');
    expect(controlled).toContain('splashReceipt.primary.origin).toEqual(splashReceipt.aim.origin)');
    expect(controlled).toContain('splashReceipt.primary.endpoint).toEqual(splashReceipt.aim.endpoint)');
    expect(controlled).toContain('splashReceipt.aim.radialDistanceM).toBeLessThanOrEqual');
  });

  it('holds admitted fire false for a full product cadence before staging the one-shot target', () => {
    const toggle = controlled.indexOf('toggleChopperGunnerControl()');
    const dwellAdmission = controlled.indexOf(
      'requestPossessedChopperEvidenceControl({ fire: false })',
      toggle,
    );
    const dwellWait = controlled.indexOf(
      'window.setTimeout(resolveDelay, cadenceMs)',
      dwellAdmission,
    );
    const dwellRelease = controlled.indexOf('releasePossessedChopperEvidenceControl();', dwellWait);
    const stage = controlled.indexOf('stagePossessedChopperSplashTargets()', dwellRelease);
    expect(toggle).toBeGreaterThan(-1);
    expect(toggle).toBeLessThan(dwellAdmission);
    expect(dwellAdmission).toBeLessThan(dwellWait);
    expect(dwellWait).toBeLessThan(dwellRelease);
    expect(dwellRelease).toBeLessThan(stage);
    expect(controlled).toContain(
      'gunCadenceDwell.elapsedMs).toBeGreaterThanOrEqual(CHOPPER_GUN_PROFILE.cadenceMs)',
    );
    expect(controlled).toContain('currentActivationId: gunCadenceDwell.activationId');
    expect(controlled).toContain('gunCadenceDwell.remainingLifetimeMs).toBeGreaterThan(5_000)');
    expect(controlled).toContain('expect(stagedSplash.entityId).toBe(gunCadenceDwell.entityId)');
    expect(controlled).toContain('expect(stagedSplash.activationId).toBe(gunCadenceDwell.activationId)');
  });

  it('uses the shared actual-gun selector for both MG helpers while keeping missile helpers explicit', () => {
    const debugImplementation = main.indexOf('debugWindow.__ATOMIC_ACRES_DEBUG__ = {');
    expect(debugImplementation).toBeGreaterThan(-1);
    for (const [start, end] of [
      ['  aimPossessedChopperAtTrainingDummy: (targetId) => {', '\n  aimPossessedChopperAtTarget:'],
      ['  aimPossessedChopperAtTarget: (targetId) => {', '\n  aimPossessedChopperMissileAtTarget:'],
    ] as const) {
      const aim = block(start, end, debugImplementation);
      expect(aim).toContain('chopperGunnerAuthoritativeRay(');
      expect(aim).toContain('chopperGunnerAuthoritativeTargetAlongRay(');
      expect(aim).toContain('CHOPPER_GUN_PROFILE.maximumRangeM');
      expect(aim).toContain('CHOPPER_GUNNER_SPLASH_POLICY.splashRadiusM');
      expect(aim).not.toContain('chopperMissileGroundTarget');
      expect(aim).not.toContain('requestKillstreakControl');
    }
    expect(main).toContain('aimPossessedChopperMissileAtTarget: (targetId) => {');
    expect(main).toContain('aimPossessedChopperMissileAtTrainingDummy: (targetId) => {');
  });

  it('stages exact target lives through the same prospective primary selector', () => {
    const debugImplementation = main.indexOf('debugWindow.__ATOMIC_ACRES_DEBUG__ = {');
    const stage = block(
      '  stagePossessedChopperSplashTargets: () => {',
      '\n  stagePossessedChopperMissileTarget:',
      debugImplementation,
    );
    expect(stage).toContain('chopperGunnerAuthoritativeTargetAlongRay(');
    expect(stage).toContain('hit.target.id !== stagedBots[0]!.id');
    expect(stage).toContain('primaryTargetLifeId: stagedBots[0]!.continuity');
    expect(stage).toContain('splashTargetLifeId: stagedBots[1]!.continuity');
    expect(stage).toContain('prospectiveWorld.hasLineOfSight?.(');
  });
});
