import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SupportDamageFeedbackTelemetry, projectSupportDamageAnchor } from './support-damage-feedback';

function reviewCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 200);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

describe('support damage feedback projection', () => {
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
