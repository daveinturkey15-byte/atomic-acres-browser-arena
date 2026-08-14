export const EXPLOSIVE_BOLT_IMPACT_RECEIPT_CAPACITY = 32;

export type ExplosiveBoltImpactPaneAuthority = Readonly<{
  phase: 'intact';
  paneVisible: true;
  apertureOpen: false;
  movementSolid: true;
  ballisticSolid: true;
  aiLineOfSightSolid: true;
}>;

export type ExplosiveBoltImpactPaneSnapshot = Readonly<{
  id: string;
  broken: false;
  visible: true;
  activeWorldColliderPresent: true;
  rapierDynamicColliderCount: number;
  authority: ExplosiveBoltImpactPaneAuthority;
}>;

export type ExplosiveBoltImpactReceiptInput = Readonly<{
  matchEpoch: number;
  ownerId: string;
  actionNonce: number;
  authority: true;
  spawnedAt: number;
  impactedAt: number;
  impactWindowId: string;
  position: readonly [number, number, number];
  detonatesAt: number;
  pane: ExplosiveBoltImpactPaneSnapshot;
}>;

export type ExplosiveBoltImpactReceipt = ExplosiveBoltImpactReceiptInput & Readonly<{
  cursor: number;
}>;

export type ExplosiveBoltImpactObservationArm = Readonly<{
  cursor: number;
  matchEpoch: number;
  ownerId: string;
  impactWindowId: string;
  armedAt: number;
}>;

export type LocalExplosiveBoltActionIdentity = Readonly<{
  matchEpoch: number;
  ownerId: string;
  actionNonce: number;
  authority: boolean;
  spawnedAt: number;
}>;

export type ExplosiveBoltImpactObservationBinding = Readonly<{
  cursor: number;
  matchEpoch: number;
  ownerId: string;
  actionNonce: number;
  authority: true;
  spawnedAt: number;
  impactWindowId: string;
}>;

export type ExplosiveBoltImpactReceiptRead = Readonly<{
  status: 'accepted';
  reason: 'accepted';
  receipt: ExplosiveBoltImpactReceipt;
  actualImpactLatencyMs: number;
  observedAfterDetonation: boolean;
}> | Readonly<{
  status: 'pending';
  reason: 'missing';
  receipt: null;
}> | Readonly<{
  status: 'rejected';
  reason: 'pane-mismatch' | 'spawn-mismatch' | 'late-impact' | 'observation-before-impact';
  receipt: ExplosiveBoltImpactReceipt;
}> | Readonly<{
  status: 'rejected';
  reason: 'stale-cursor';
  receipt: null;
}>;

function validIdentity(value: string): boolean {
  return value.length > 0 && value.length <= 160;
}

function validCounter(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validIntactPane(pane: ExplosiveBoltImpactPaneSnapshot): boolean {
  return validIdentity(pane.id)
    && pane.broken === false
    && pane.visible === true
    && pane.activeWorldColliderPresent === true
    && validCounter(pane.rapierDynamicColliderCount)
    && pane.authority.phase === 'intact'
    && pane.authority.paneVisible === true
    && pane.authority.apertureOpen === false
    && pane.authority.movementSolid === true
    && pane.authority.ballisticSolid === true
    && pane.authority.aiLineOfSightSolid === true;
}

function freezePane(pane: ExplosiveBoltImpactPaneSnapshot): ExplosiveBoltImpactPaneSnapshot {
  return Object.freeze({
    id: pane.id,
    broken: false,
    visible: true,
    activeWorldColliderPresent: true,
    rapierDynamicColliderCount: pane.rapierDynamicColliderCount,
    authority: Object.freeze({
      phase: 'intact',
      paneVisible: true,
      apertureOpen: false,
      movementSolid: true,
      ballisticSolid: true,
      aiLineOfSightSolid: true,
    }),
  });
}

function validReceiptInput(input: ExplosiveBoltImpactReceiptInput): boolean {
  return validCounter(input.matchEpoch)
    && validIdentity(input.ownerId)
    && validCounter(input.actionNonce)
    && input.authority === true
    && validTime(input.spawnedAt)
    && validTime(input.impactedAt)
    && input.impactedAt >= input.spawnedAt
    && validIdentity(input.impactWindowId)
    && input.position.length === 3
    && input.position.every(Number.isFinite)
    && validTime(input.detonatesAt)
    && input.detonatesAt > input.impactedAt
    && input.impactWindowId === input.pane.id
    && validIntactPane(input.pane);
}

function receiptKey(matchEpoch: number, ownerId: string, actionNonce: number): string {
  return JSON.stringify([matchEpoch, ownerId, actionNonce]);
}

export function bindExplosiveBoltImpactObservation(
  arm: ExplosiveBoltImpactObservationArm,
  action: LocalExplosiveBoltActionIdentity | null,
): ExplosiveBoltImpactObservationBinding | null {
  if (!action
    || !validCounter(arm.cursor)
    || !validCounter(arm.matchEpoch)
    || !validIdentity(arm.ownerId)
    || !validIdentity(arm.impactWindowId)
    || !validTime(arm.armedAt)
    || !validCounter(action.matchEpoch)
    || !validIdentity(action.ownerId)
    || !validCounter(action.actionNonce)
    || !validTime(action.spawnedAt)
    || action.authority !== true
    || action.matchEpoch !== arm.matchEpoch
    || action.ownerId !== arm.ownerId
    || action.spawnedAt < arm.armedAt) return null;
  return Object.freeze({
    cursor: arm.cursor,
    matchEpoch: action.matchEpoch,
    ownerId: action.ownerId,
    actionNonce: action.actionNonce,
    authority: true,
    spawnedAt: action.spawnedAt,
    impactWindowId: arm.impactWindowId,
  });
}

export class ExplosiveBoltImpactReceiptLedger {
  private readonly receipts: ExplosiveBoltImpactReceipt[] = [];
  private readonly keys = new Set<string>();
  private nextCursor = 1;
  private minimumReadableCursor = 0;

  constructor(private readonly capacity = EXPLOSIVE_BOLT_IMPACT_RECEIPT_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 128) {
      throw new TypeError('Explosive-bolt impact receipt capacity is invalid');
    }
  }

  cursor(): number {
    return this.nextCursor - 1;
  }

  size(): number {
    return this.receipts.length;
  }

  acceptsCursor(cursor: number): boolean {
    return validCounter(cursor) && cursor >= this.minimumReadableCursor && cursor <= this.cursor();
  }

  clear(): void {
    this.receipts.length = 0;
    this.keys.clear();
    // Advance across an empty barrier so an arm/binding retained across a
    // match projectile reset cannot observe a later action, even if a random
    // action nonce is eventually reused.
    this.nextCursor += 1;
    this.minimumReadableCursor = this.cursor();
  }

  record(input: ExplosiveBoltImpactReceiptInput): ExplosiveBoltImpactReceipt | null {
    if (!validReceiptInput(input)) return null;
    const key = receiptKey(input.matchEpoch, input.ownerId, input.actionNonce);
    if (this.keys.has(key)) return null;
    const receipt: ExplosiveBoltImpactReceipt = Object.freeze({
      cursor: this.nextCursor++,
      matchEpoch: input.matchEpoch,
      ownerId: input.ownerId,
      actionNonce: input.actionNonce,
      authority: true,
      spawnedAt: input.spawnedAt,
      impactedAt: input.impactedAt,
      impactWindowId: input.impactWindowId,
      position: Object.freeze([...input.position]) as readonly [number, number, number],
      detonatesAt: input.detonatesAt,
      pane: freezePane(input.pane),
    });
    this.receipts.push(receipt);
    this.keys.add(key);
    while (this.receipts.length > this.capacity) {
      const retired = this.receipts.shift();
      if (retired) this.keys.delete(receiptKey(retired.matchEpoch, retired.ownerId, retired.actionNonce));
    }
    return receipt;
  }

  readExact(
    binding: ExplosiveBoltImpactObservationBinding,
    maxImpactLatencyMs: number,
    observedAt: number,
  ): ExplosiveBoltImpactReceiptRead {
    if (!this.acceptsCursor(binding.cursor)) {
      return Object.freeze({ status: 'rejected', reason: 'stale-cursor', receipt: null });
    }
    const receipt = this.receipts.find((candidate) => (
      candidate.cursor > binding.cursor
        && candidate.matchEpoch === binding.matchEpoch
        && candidate.ownerId === binding.ownerId
        && candidate.actionNonce === binding.actionNonce
    ));
    if (!receipt) return Object.freeze({ status: 'pending', reason: 'missing', receipt: null });
    if (receipt.impactWindowId !== binding.impactWindowId) {
      return Object.freeze({ status: 'rejected', reason: 'pane-mismatch', receipt });
    }
    if (receipt.spawnedAt !== binding.spawnedAt) {
      return Object.freeze({ status: 'rejected', reason: 'spawn-mismatch', receipt });
    }
    const actualImpactLatencyMs = receipt.impactedAt - receipt.spawnedAt;
    if (!Number.isFinite(maxImpactLatencyMs) || maxImpactLatencyMs < 0 || actualImpactLatencyMs > maxImpactLatencyMs) {
      return Object.freeze({ status: 'rejected', reason: 'late-impact', receipt });
    }
    if (!validTime(observedAt) || observedAt < receipt.impactedAt) {
      return Object.freeze({ status: 'rejected', reason: 'observation-before-impact', receipt });
    }
    return Object.freeze({
      status: 'accepted',
      reason: 'accepted',
      receipt,
      actualImpactLatencyMs,
      observedAfterDetonation: observedAt >= receipt.detonatesAt,
    });
  }
}
