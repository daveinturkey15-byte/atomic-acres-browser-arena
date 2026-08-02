import { describe, expect, it } from 'vitest';
import type { HitMessage } from './protocol';
import { projectStickyVictimFeedback } from './sticky-victim-feedback';

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
