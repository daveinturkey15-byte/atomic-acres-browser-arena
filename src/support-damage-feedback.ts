import * as THREE from 'three';
import type { KillstreakDamageEvent } from './killstreak-runtime';

export type SupportDamageScreenAnchor = Readonly<{
  visible: boolean;
  reason: 'visible' | 'behind-camera' | 'offscreen' | 'invalid-viewport';
  xPx: number;
  yPx: number;
  ndcDepth: number;
}>;

const MAX_SUPPORT_DAMAGE_FEEDBACK_SAMPLES = 24;
export const LOCAL_SUPPORT_SHOT_PRESENTATION_RECEIPT_CAPACITY = 64;
export const LOCAL_SUPPORT_SHOT_PRESENTATION_MATCH_WINDOW_MS = 500;
const LOCAL_SUPPORT_SHOT_PRESENTATION_RETENTION_MS = 2_000;

export type SupportDamageFeedbackSample = Readonly<{
  resultId: string;
  activationId: string;
  source: KillstreakDamageEvent['source'];
  targetId: string;
  targetLifeId: number;
  targetPosition: readonly number[];
  damage: number;
  atMs: number;
  visible: boolean;
  reason: SupportDamageScreenAnchor['reason'];
  xPx: number;
  yPx: number;
  reticleDistancePx: number | null;
  anchorSource: 'authoritative-target-position';
  reticleFallback: false;
}>;

export type SupportDamageFeedbackTelemetrySnapshot = Readonly<{
  received: number;
  visible: number;
  suppressedBehindCamera: number;
  suppressedOffscreen: number;
  suppressedInvalidViewport: number;
  reticleFallbacks: 0;
  recent: readonly SupportDamageFeedbackSample[];
  bounded: boolean;
}>;

export type PlannedSupportDamageFeedback = Readonly<{
  event: KillstreakDamageEvent;
  firstForShot: boolean;
}>;

type LocalSupportShotPresentationReceipt = Readonly<{
  activationId: string;
  source: 'chopper';
  presentedAtHostTimeMs: number;
}>;

/**
 * Bounded proof that this client actually rendered a possessed Chopper round.
 * Canonical hit feedback consumes the nearest matching proof instead of
 * inferring presentation merely because the player still owns a cockpit.
 */
export class LocalSupportShotPresentationReceipts {
  private readonly receipts: LocalSupportShotPresentationReceipt[] = [];

  record(receipt: LocalSupportShotPresentationReceipt): boolean {
    if (!receipt.activationId
      || receipt.source !== 'chopper'
      || !Number.isFinite(receipt.presentedAtHostTimeMs)
      || receipt.presentedAtHostTimeMs < 0) return false;
    this.prune(receipt.presentedAtHostTimeMs);
    this.receipts.push(Object.freeze({ ...receipt }));
    if (this.receipts.length > LOCAL_SUPPORT_SHOT_PRESENTATION_RECEIPT_CAPACITY) {
      this.receipts.splice(0, this.receipts.length - LOCAL_SUPPORT_SHOT_PRESENTATION_RECEIPT_CAPACITY);
    }
    return true;
  }

  consume(event: KillstreakDamageEvent, receivedAtHostTimeMs: number): boolean {
    if (event.source !== 'chopper' || !Number.isFinite(receivedAtHostTimeMs) || receivedAtHostTimeMs < 0) return false;
    this.prune(receivedAtHostTimeMs);
    let closestIndex = -1;
    let closestDeltaMs = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.receipts.length; index += 1) {
      const receipt = this.receipts[index]!;
      if (receipt.activationId !== event.activationId) continue;
      const deltaMs = Math.abs(receipt.presentedAtHostTimeMs - event.atMs);
      if (deltaMs <= LOCAL_SUPPORT_SHOT_PRESENTATION_MATCH_WINDOW_MS && deltaMs < closestDeltaMs) {
        closestIndex = index;
        closestDeltaMs = deltaMs;
      }
    }
    if (closestIndex < 0) return false;
    this.receipts.splice(closestIndex, 1);
    return true;
  }

  reset(): void {
    this.receipts.length = 0;
  }

  size(): number {
    return this.receipts.length;
  }

  private prune(nowHostTimeMs: number): void {
    for (let index = this.receipts.length - 1; index >= 0; index -= 1) {
      if (nowHostTimeMs - this.receipts[index]!.presentedAtHostTimeMs > LOCAL_SUPPORT_SHOT_PRESENTATION_RETENTION_MS) {
        this.receipts.splice(index, 1);
      }
    }
  }
}

/**
 * Splash damage fans one admitted Chopper round into several target receipts.
 * Presentation/audio must still run once for that round, while target-bound
 * damage numbers and authority remain one receipt per target.
 */
export function supportDamageShotKey(event: KillstreakDamageEvent): string {
  return `${event.activationId}\u0000${event.source}\u0000${event.atMs}\u0000${event.endpoint.join(',')}\u0000${event.tracerOrigin.join(',')}`;
}

export function planSupportDamageFeedback(
  events: readonly KillstreakDamageEvent[],
): readonly PlannedSupportDamageFeedback[] {
  const seen = new Set<string>();
  return Object.freeze(events.map((event) => {
    const key = supportDamageShotKey(event);
    const firstForShot = !seen.has(key);
    if (firstForShot) seen.add(key);
    return Object.freeze({ event, firstForShot });
  }));
}

/**
 * Bounded evidence for owner support feedback. This records only presentation
 * decisions; target identity, target position, damage, and authority remain
 * owned by the admitted combat result.
 */
export class SupportDamageFeedbackTelemetry {
  private received = 0;
  private visible = 0;
  private suppressedBehindCamera = 0;
  private suppressedOffscreen = 0;
  private suppressedInvalidViewport = 0;
  private readonly recent: SupportDamageFeedbackSample[] = [];

  record(
    event: KillstreakDamageEvent,
    anchor: SupportDamageScreenAnchor,
    viewport: Readonly<{ width: number; height: number }>,
  ): SupportDamageFeedbackSample {
    this.received += 1;
    if (anchor.visible) this.visible += 1;
    else if (anchor.reason === 'behind-camera') this.suppressedBehindCamera += 1;
    else if (anchor.reason === 'offscreen') this.suppressedOffscreen += 1;
    else this.suppressedInvalidViewport += 1;
    const sample = Object.freeze({
      resultId: event.resultId,
      activationId: event.activationId,
      source: event.source,
      targetId: event.targetId,
      targetLifeId: event.targetLifeId,
      targetPosition: Object.freeze([...event.targetPosition]),
      damage: event.damage,
      atMs: event.atMs,
      visible: anchor.visible,
      reason: anchor.reason,
      xPx: anchor.xPx,
      yPx: anchor.yPx,
      reticleDistancePx: anchor.visible
        ? Math.hypot(anchor.xPx - viewport.width / 2, anchor.yPx - viewport.height / 2)
        : null,
      anchorSource: 'authoritative-target-position' as const,
      reticleFallback: false as const,
    });
    this.recent.push(sample);
    if (this.recent.length > MAX_SUPPORT_DAMAGE_FEEDBACK_SAMPLES) {
      this.recent.splice(0, this.recent.length - MAX_SUPPORT_DAMAGE_FEEDBACK_SAMPLES);
    }
    return sample;
  }

  reset(): void {
    this.received = 0;
    this.visible = 0;
    this.suppressedBehindCamera = 0;
    this.suppressedOffscreen = 0;
    this.suppressedInvalidViewport = 0;
    this.recent.length = 0;
  }

  snapshot(): SupportDamageFeedbackTelemetrySnapshot {
    return Object.freeze({
      received: this.received,
      visible: this.visible,
      suppressedBehindCamera: this.suppressedBehindCamera,
      suppressedOffscreen: this.suppressedOffscreen,
      suppressedInvalidViewport: this.suppressedInvalidViewport,
      reticleFallbacks: 0,
      recent: Object.freeze([...this.recent]),
      bounded: this.recent.length <= MAX_SUPPORT_DAMAGE_FEEDBACK_SAMPLES,
    });
  }
}

/**
 * Projects the host-authored impact-time target position into the caller's
 * current view. Support hit feedback is emitted only at this anchor: it never
 * falls back to the reticle when the target is behind or outside the viewport.
 */
export function projectSupportDamageAnchor(
  targetPosition: THREE.Vector3,
  camera: THREE.Camera,
  viewport: Readonly<{ width: number; height: number }>,
): SupportDamageScreenAnchor {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)
    || viewport.width <= 0 || viewport.height <= 0) {
    return Object.freeze({ visible: false, reason: 'invalid-viewport', xPx: 0, yPx: 0, ndcDepth: 0 });
  }
  camera.updateMatrixWorld(true);
  const cameraSpace = targetPosition.clone().applyMatrix4(camera.matrixWorldInverse);
  if (!Number.isFinite(cameraSpace.z) || cameraSpace.z >= -Math.max(0.001, (camera as THREE.PerspectiveCamera).near ?? 0.01)) {
    return Object.freeze({ visible: false, reason: 'behind-camera', xPx: 0, yPx: 0, ndcDepth: 1 });
  }
  const ndc = targetPosition.clone().project(camera);
  const xPx = (ndc.x * 0.5 + 0.5) * viewport.width;
  const yPx = (-ndc.y * 0.5 + 0.5) * viewport.height;
  const visible = Number.isFinite(ndc.x) && Number.isFinite(ndc.y) && Number.isFinite(ndc.z)
    && ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1 && ndc.z >= -1 && ndc.z <= 1;
  return Object.freeze({
    visible,
    reason: visible ? 'visible' : 'offscreen',
    xPx,
    yPx,
    ndcDepth: ndc.z,
  });
}
