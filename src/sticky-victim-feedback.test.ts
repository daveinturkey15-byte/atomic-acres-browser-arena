import { describe, expect, it } from 'vitest';
import type { HitMessage } from './protocol';
import {
  STICKY_VICTIM_URGENT_ALERT_DURATION_MS,
  STICKY_VICTIM_URGENT_ALERT_MAX_ACTIONS,
  StickyVictimUrgentAlertController,
  projectStickyVictimFeedback,
} from './sticky-victim-feedback';

function result(overrides: Partial<HitMessage> = {}): HitMessage {
  return {
    type: 'hit',
    by: 'host-1',
    target: 'guest-1',
    damage: 100,
    kind: 'explosive',
    explosiveSource: 'grenade',
    stuck: true,
    actionNonce: 31,
    nonce: 91,
    hostAuthority: {
      hostId: 'host-1',
      targetLifeId: 4,
      appliedDamage: 79.8,
      resultingHealth: 20.2,
      stickyAttachment: { targetId: 'guest-1', targetLifeId: 4 },
    },
    ...overrides,
  };
}

describe('sticky victim feedback projection', () => {
  it('admits one exact 500 ms urgent alert per attachment in the current life', () => {
    const controller = new StickyVictimUrgentAlertController();
    controller.reset(4);
    const input = {
      source: 'semtex' as const, targetId: 'guest-1', targetLifeId: 4, actionNonce: 31, nowMs: 1_000,
    };
    expect(STICKY_VICTIM_URGENT_ALERT_DURATION_MS).toBe(500);
    expect(controller.admit(input)).toMatchObject({
      label: 'STUCK', admittedAtMs: 1_000, expiresAtMs: 1_500,
    });
    expect(controller.admit({ ...input, nowMs: 1_050 })).toBeNull();
    expect(controller.admit({ ...input, targetLifeId: 5, actionNonce: 32 })).toBeNull();
    controller.reset(5);
    expect(controller.admit({ ...input, targetLifeId: 5, actionNonce: 32, nowMs: 2_000 }))
      .toMatchObject({ expiresAtMs: 2_500 });
  });

  it('bounds same-life attachment receipts and evicts the oldest deterministically', () => {
    const controller = new StickyVictimUrgentAlertController();
    controller.reset(4);
    const admit = (actionNonce: number) => controller.admit({
      source: 'explosive-crossbow', targetId: 'guest-1', targetLifeId: 4, actionNonce, nowMs: actionNonce,
    });
    expect(STICKY_VICTIM_URGENT_ALERT_MAX_ACTIONS).toBe(128);
    for (let actionNonce = 0; actionNonce <= STICKY_VICTIM_URGENT_ALERT_MAX_ACTIONS; actionNonce += 1) {
      expect(admit(actionNonce), `action ${actionNonce}`).not.toBeNull();
    }
    expect(admit(STICKY_VICTIM_URGENT_ALERT_MAX_ACTIONS)).toBeNull();
    expect(admit(0)).not.toBeNull();
  });
  it('projects one clear semantic label for each canonical sticky source', () => {
    expect(projectStickyVictimFeedback(result(), 'guest-1', 4)).toEqual({
      label: 'STUCK', source: 'semtex', targetId: 'guest-1', targetLifeId: 4, actionNonce: 31, resultNonce: 91,
    });
    expect(projectStickyVictimFeedback(result({ explosiveSource: 'explosive-crossbow' }), 'guest-1', 4)).toEqual({
      label: 'STUCK', source: 'explosive-crossbow', targetId: 'guest-1', targetLifeId: 4, actionNonce: 31, resultNonce: 91,
    });
  });

  it('rejects non-sticky, noncanonical, stale-life and wrong-victim projections', () => {
    expect(projectStickyVictimFeedback(result({ stuck: undefined }), 'guest-1', 4)).toBeNull();
    expect(projectStickyVictimFeedback(result({ hostAuthority: undefined }), 'guest-1', 4)).toBeNull();
    expect(projectStickyVictimFeedback(result(), 'guest-1', 5)).toBeNull();
    expect(projectStickyVictimFeedback(result(), 'other-guest', 4)).toBeNull();
    expect(projectStickyVictimFeedback(result({
      hostAuthority: {
        ...result().hostAuthority!,
        stickyAttachment: { targetId: 'guest-1', targetLifeId: 3 },
      },
    }), 'guest-1', 4)).toBeNull();
    expect(projectStickyVictimFeedback(result({ explosiveSource: 'nuke' }), 'guest-1', 4)).toBeNull();
  });
});
