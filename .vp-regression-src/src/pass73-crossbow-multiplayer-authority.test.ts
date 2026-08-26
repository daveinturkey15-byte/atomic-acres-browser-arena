import { describe, expect, it } from 'vitest';
import { EXPLOSIVE_BOLT_ARM_DELAY_MS } from './combat/ordnance';
import {
  admitCanonicalCrossbowGlassBreak,
  admitCrossbowGlassMutation,
  type CrossbowGlassPhase,
} from './crossbow-glass-authority';
import { admitGlassImpact, createGlassState, type GlassState } from './glass-authority';
import { isGameMessage, type WindowBreakMessage } from './protocol';
import { crossbowBlastLineOfSightColliders, windowBreakPathBlocked } from './window-breaks';
import type { Box2, Point3 } from './collision';

type PeerGlass = Map<string, GlassState>;

const epoch = 73;
const actionNonce = 7_301;
const hostId = 'host-pass73';
const paneIds = ['impact-pane', 'in-radius-pane', 'occluded-pane'] as const;

function peerGlass(matchEpoch = epoch): PeerGlass {
  return new Map(paneIds.map((paneId) => [paneId, createGlassState(paneId, matchEpoch)]));
}

function mutatePane(
  panes: PeerGlass,
  paneId: string,
  phase: CrossbowGlassPhase,
  nonce: number,
  tick: number,
): void {
  const state = panes.get(paneId);
  if (!state) throw new Error(`missing pane ${paneId}`);
  const result = admitGlassImpact(state, {
    isHost: true,
    matchEpoch: epoch,
    expectedRevision: state.revision,
    impactId: `crossbow:${phase}:${hostId}:${nonce}:${state.revision}`,
    tick,
    profile: phase === 'impact' ? 'bullet' : 'explosion',
  });
  expect(result.accepted).toBe(true);
  panes.set(paneId, result.state);
}

function canonicalMessage(
  paneId: string,
  phase: CrossbowGlassPhase,
  nonce: number,
  origin: readonly [number, number, number],
): WindowBreakMessage {
  const message: WindowBreakMessage = {
    type: 'window-break',
    by: hostId,
    windowId: paneId,
    origin: [...origin],
    kind: phase === 'impact' ? 'shot' : 'explosive',
    weapon: 'explosive-crossbow',
    crossbowPhase: phase,
    ...(phase === 'explosion' ? { crossbowBlastRadiusM: 3.5 as const } : {}),
    actionNonce,
    hostAuthority: { hostId, stickyAttachment: null },
    nonce,
  };
  expect(isGameMessage(message)).toBe(true);
  return message;
}

function admitOnGuest(
  guest: PeerGlass,
  message: WindowBreakMessage,
  admittedPhaseKeys: Set<string>,
  paneDistanceM: number,
): boolean {
  const phase = message.crossbowPhase!;
  const phaseKey = `${message.windowId}:${phase}`;
  const admission = admitCanonicalCrossbowGlassBreak({
    receiverRole: 'client',
    hostAuthorityValid: message.hostAuthority?.hostId === hostId,
    weapon: message.weapon!,
    fireKind: 'projectile',
    phase,
    actionNonce: message.actionNonce!,
    actionCurrent: true,
    actionWeapon: 'explosive-crossbow',
    actionNonceObserved: actionNonce,
    eventReplay: false,
    panePhaseAlreadyAdmitted: admittedPhaseKeys.has(phaseKey),
    originInsideArena: true,
    paneDistanceM,
    blastRadiusM: message.crossbowBlastRadiusM ?? 3.5,
  });
  if (!admission.accepted) return false;
  admittedPhaseKeys.add(phaseKey);
  mutatePane(guest, message.windowId, phase, message.nonce, phase === 'impact' ? 201 : 211);
  return true;
}

function authorityBearingState(state: GlassState | undefined): Readonly<Record<string, unknown>> | null {
  if (!state) return null;
  return {
    schemaVersion: state.schemaVersion,
    paneId: state.paneId,
    matchEpoch: state.matchEpoch,
    revision: state.revision,
    phase: state.phase,
    damageQ: state.damageQ,
    breachRevision: state.breachRevision,
    rememberedImpactIds: state.rememberedImpactIds,
  };
}

describe('Pass 73 crossbow host/guest glass authority', () => {
  it('replicates direct-before-fuse and admitted blast panes exactly once while cover stays intact', () => {
    const host = peerGlass();
    const guest = peerGlass();
    const guestAdmittedPhaseKeys = new Set<string>();

    expect(admitCrossbowGlassMutation(false)).toEqual({
      accepted: false,
      reason: 'presentation-only-prediction',
    });
    expect(guest.get('impact-pane')?.revision).toBe(0);
    expect(admitCrossbowGlassMutation(true).accepted).toBe(true);

    const impactAtMs = 500;
    const fuseAtMs = impactAtMs + EXPLOSIVE_BOLT_ARM_DELAY_MS;
    const impact = canonicalMessage('impact-pane', 'impact', 9_001, [0, 1.4, 0]);
    mutatePane(host, impact.windowId, 'impact', impact.nonce, 100);
    expect(admitOnGuest(guest, impact, guestAdmittedPhaseKeys, 0.02)).toBe(true);
    expect(impactAtMs).toBeLessThan(fuseAtMs);
    expect(host.get('impact-pane')).toMatchObject({ revision: 1, phase: 'breached' });
    expect(authorityBearingState(guest.get('impact-pane'))).toEqual(authorityBearingState(host.get('impact-pane')));
    expect(guest.get('impact-pane')?.lastMutationTick).not.toBe(host.get('impact-pane')?.lastMutationTick);

    const impactRevision = guest.get('impact-pane')!.revision;
    expect(admitOnGuest(guest, impact, guestAdmittedPhaseKeys, 0.02)).toBe(false);
    expect(guest.get('impact-pane')!.revision).toBe(impactRevision);

    const impactPane: Box2 = { minX: -0.2, maxX: 0.2, minY: 0.6, maxY: 2.2, minZ: -0.05, maxZ: 0.05 };
    const inRadiusPane: Box2 = { minX: 1.95, maxX: 2.05, minY: 0.6, maxY: 2.2, minZ: -0.2, maxZ: 0.2 };
    const occludedPane: Box2 = { minX: -0.2, maxX: 0.2, minY: 0.6, maxY: 2.2, minZ: 2.45, maxZ: 2.55 };
    const wall: Box2 = { minX: -0.8, maxX: 0.8, minY: 0, maxY: 3, minZ: 0.9, maxZ: 1.2 };
    const ids = new Map<Box2, string>([
      [impactPane, 'impact-pane'], [inRadiusPane, 'in-radius-pane'], [occludedPane, 'occluded-pane'],
    ]);
    const colliders = crossbowBlastLineOfSightColliders(
      [impactPane, inRadiusPane, occludedPane, wall],
      'impact-pane',
      (collider) => ids.get(collider) ?? null,
    );
    const origin: Point3 = { x: 0, y: 1.4, z: 0 };
    const inRadiusCentre: Point3 = { x: 2, y: 1.4, z: 0 };
    const occludedCentre: Point3 = { x: 0, y: 1.4, z: 2.5 };
    expect(windowBreakPathBlocked(origin, inRadiusCentre, colliders)).toBe(false);
    expect(windowBreakPathBlocked(origin, occludedCentre, colliders)).toBe(true);

    const blast = canonicalMessage('in-radius-pane', 'explosion', 9_002, [0, 1.4, 0]);
    mutatePane(host, blast.windowId, 'explosion', blast.nonce, 110);
    expect(admitOnGuest(guest, blast, guestAdmittedPhaseKeys, 2)).toBe(true);
    expect(host.get('in-radius-pane')).toMatchObject({ revision: 1, phase: 'detached' });
    expect(authorityBearingState(guest.get('in-radius-pane'))).toEqual(authorityBearingState(host.get('in-radius-pane')));
    expect(guest.get('in-radius-pane')?.lastMutationTick).not.toBe(host.get('in-radius-pane')?.lastMutationTick);
    expect(host.get('occluded-pane')).toMatchObject({ revision: 0, phase: 'intact' });
    expect(guest.get('occluded-pane')).toEqual(host.get('occluded-pane'));
  });

  it('resets on a new epoch and fails closed for stale or late canonical replays', () => {
    const reset = peerGlass(epoch + 1);
    const stale = reset.get('impact-pane')!;
    const oldImpact = canonicalMessage('impact-pane', 'impact', 9_003, [0, 1.4, 0]);
    const lateJoinAdmission = admitCanonicalCrossbowGlassBreak({
      receiverRole: 'client',
      hostAuthorityValid: true,
      weapon: 'explosive-crossbow',
      fireKind: 'projectile',
      phase: 'impact',
      actionNonce,
      actionCurrent: false,
      actionWeapon: null,
      actionNonceObserved: null,
      eventReplay: false,
      panePhaseAlreadyAdmitted: false,
      originInsideArena: true,
      paneDistanceM: 0.02,
      blastRadiusM: 3.5,
    });
    expect(lateJoinAdmission).toEqual({ accepted: false, reason: 'stale-action' });
    expect(admitGlassImpact(stale, {
      isHost: true,
      matchEpoch: epoch,
      expectedRevision: 0,
      impactId: `stale:${oldImpact.nonce}`,
      tick: 1,
      profile: 'bullet',
    }).reason).toBe('wrong-epoch');
    expect(reset.get('impact-pane')).toMatchObject({ matchEpoch: epoch + 1, revision: 0, phase: 'intact' });
  });
});
