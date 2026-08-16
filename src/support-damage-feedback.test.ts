import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_SUPPORT_SHOT_PRESENTATION_RECEIPT_CAPACITY,
  LocalSupportShotPresentationReceipts,
  SupportDamageFeedbackTelemetry,
  planSupportDamageFeedback,
  projectSupportDamageAnchor,
} from './support-damage-feedback';

function reviewCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 200);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe('support damage feedback projection', () => {
  it('coalesces one round of splash presentation without coalescing target receipts', () => {
    const first = {
      resultId: 'result-1', activationId: 'activation-1', source: 'chopper', ownerId: 'owner',
      targetId: 'target-a', targetLifeId: 1, targetPosition: [0, 0, -10], damage: 18,
      origin: [0, 8, 0], endpoint: [0, 0, -10], tracerOrigin: [0, 7, -1], atMs: 1_000,
    } as const;
    const sameShot = { ...first, resultId: 'result-2', targetId: 'target-b', damage: 9 } as const;
    const nextShot = { ...first, resultId: 'result-3', targetId: 'target-c', atMs: 1_080 } as const;
    const plan = planSupportDamageFeedback([first, sameShot, nextShot]);
    expect(plan.map(({ event, firstForShot }) => ({ resultId: event.resultId, firstForShot }))).toEqual([
      { resultId: 'result-1', firstForShot: true },
      { resultId: 'result-2', firstForShot: false },
      { resultId: 'result-3', firstForShot: true },
    ]);
    expect(plan.map(({ event }) => event.targetId)).toEqual(['target-a', 'target-b', 'target-c']);
  });

  it('suppresses duplicate Chopper ballistics only after consuming an actual bounded local presentation receipt', () => {
    const receipts = new LocalSupportShotPresentationReceipts();
    const event = {
      resultId: 'result-1', activationId: 'activation-1', source: 'chopper', ownerId: 'owner',
      targetId: 'target-a', targetLifeId: 1, targetPosition: [0, 0, -10], damage: 18,
      origin: [0, 8, 0], endpoint: [0, 0, -10], tracerOrigin: [0, 7, -1], atMs: 1_000,
    } as const;
    expect(receipts.consume(event, 1_050)).toBe(false);
    expect(receipts.record({ activationId: 'other-activation', source: 'chopper', presentedAtHostTimeMs: 1_000 })).toBe(true);
    expect(receipts.record({ activationId: event.activationId, source: 'chopper', presentedAtHostTimeMs: 980 })).toBe(true);
    expect(receipts.consume(event, 1_050)).toBe(true);
    expect(receipts.consume(event, 1_050)).toBe(false);
    expect(receipts.size()).toBe(1);
  });

  it('expires unmatched local receipts and keeps the queue bounded', () => {
    const receipts = new LocalSupportShotPresentationReceipts();
    for (let index = 0; index <= LOCAL_SUPPORT_SHOT_PRESENTATION_RECEIPT_CAPACITY; index += 1) {
      receipts.record({ activationId: `activation-${index}`, source: 'chopper', presentedAtHostTimeMs: 10_000 + index });
    }
    expect(receipts.size()).toBe(LOCAL_SUPPORT_SHOT_PRESENTATION_RECEIPT_CAPACITY);
    receipts.record({ activationId: 'fresh', source: 'chopper', presentedAtHostTimeMs: 20_000 });
    expect(receipts.size()).toBe(1);
    receipts.reset();
    expect(receipts.size()).toBe(0);
  });

  it('anchors feedback to the admitted target instead of the caller reticle', () => {
    const camera = reviewCamera();
    const centre = projectSupportDamageAnchor(new THREE.Vector3(0, 0, -10), camera, { width: 1920, height: 1080 });
    const rightTarget = projectSupportDamageAnchor(new THREE.Vector3(4, 0, -10), camera, { width: 1920, height: 1080 });
    expect(centre).toMatchObject({ visible: true, xPx: 960, yPx: 540 });
    expect(rightTarget.visible).toBe(true);
    expect(rightTarget.xPx).toBeGreaterThan(centre.xPx + 300);
    expect(rightTarget.yPx).toBeCloseTo(centre.yPx, 5);
  });

  it('never substitutes the reticle for off-screen or behind-camera targets', () => {
    const camera = reviewCamera();
    expect(projectSupportDamageAnchor(new THREE.Vector3(40, 0, -10), camera, { width: 1280, height: 720 }))
      .toMatchObject({ visible: false, reason: 'offscreen' });
    expect(projectSupportDamageAnchor(new THREE.Vector3(0, 0, 8), camera, { width: 1280, height: 720 }))
      .toMatchObject({ visible: false, reason: 'behind-camera' });
  });

  it('records target-bound visible and suppressed results without a reticle fallback', () => {
    const camera = reviewCamera();
    const telemetry = new SupportDamageFeedbackTelemetry();
    const event = {
      resultId: 'result-1', activationId: 'activation-1', source: 'chopper', ownerId: 'owner',
      targetId: 'victim', targetLifeId: 4, targetPosition: [4, 0, -10], damage: 10,
      origin: [0, 8, 0], endpoint: [4, 0, -10], tracerOrigin: [0, 7, -1], atMs: 1_000,
    } as const;
    const visible = projectSupportDamageAnchor(new THREE.Vector3(...event.targetPosition), camera, { width: 1_920, height: 1_080 });
    expect(telemetry.record(event, visible, { width: 1_920, height: 1_080 })).toMatchObject({
      source: 'chopper',
      targetId: 'victim',
      targetPosition: [4, 0, -10],
      visible: true,
      anchorSource: 'authoritative-target-position',
      reticleFallback: false,
    });
    expect(telemetry.snapshot().recent[0]!.reticleDistancePx).toBeGreaterThan(300);

    const hidden = projectSupportDamageAnchor(new THREE.Vector3(0, 0, 8), camera, { width: 1_920, height: 1_080 });
    telemetry.record({ ...event, resultId: 'result-2', source: 'drone-swarm', targetPosition: [0, 0, 8] }, hidden, { width: 1_920, height: 1_080 });
    expect(telemetry.snapshot()).toMatchObject({
      received: 2,
      visible: 1,
      suppressedBehindCamera: 1,
      suppressedOffscreen: 0,
      reticleFallbacks: 0,
      bounded: true,
    });
    expect(telemetry.snapshot().recent[1]).toMatchObject({
      source: 'drone-swarm',
      targetId: 'victim',
      visible: false,
      reason: 'behind-camera',
      reticleDistancePx: null,
      reticleFallback: false,
    });

    for (let index = 0; index < 30; index += 1) {
      telemetry.record({ ...event, resultId: `bounded-${index}`, source: 'piloted-drone' }, visible, { width: 1_920, height: 1_080 });
    }
    expect(telemetry.snapshot()).toMatchObject({ received: 32, visible: 31, reticleFallbacks: 0, bounded: true });
    expect(telemetry.snapshot().recent).toHaveLength(24);
    telemetry.reset();
    expect(telemetry.snapshot()).toMatchObject({ received: 0, visible: 0, recent: [] });
  });
});
