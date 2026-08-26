import { describe, expect, it } from 'vitest';
import {
  primaryHoldInteraction,
  interactionPriority,
  primaryInteraction,
  primaryTapInteraction,
  type InteractionCandidate,
} from './interaction-arbitration';

const candidate = (kind: InteractionCandidate['kind'], targetId: string, proximityM: number): InteractionCandidate => ({
  kind,
  targetId,
  proximityM,
  prompt: kind.toUpperCase(),
});

describe('shared F interaction arbitration', () => {
  it('keeps every eligible nearby world action ahead of drone/chopper entry and exit', () => {
    const worldKinds = ['care-package', 'shed-door', 'timed-map-weapon', 'test-bay-weapon', 'weapon-pickup', 'test-bay-support'] as const;
    const supportKinds = ['support-enter-drone', 'support-enter-chopper', 'support-exit'] as const;
    for (const worldKind of worldKinds) {
      for (const supportKind of supportKinds) {
        expect(primaryInteraction([
          candidate(supportKind, `support-${supportKind}`, 0),
          candidate(worldKind, `world-${worldKind}`, 1),
        ])).toMatchObject({ kind: worldKind, targetId: `world-${worldKind}` });
        expect(interactionPriority(worldKind)).toBeGreaterThan(interactionPriority(supportKind));
      }
    }
  });

  it('falls back to support exit when nearby world candidates are ineligible', () => {
    expect(primaryInteraction([
      candidate('support-exit', 'possessed-drone', 0),
      { ...candidate('care-package', 'crate', 0.1), enabled: false },
      { ...candidate('shed-door', 'door', 0.1), enabled: false },
      { ...candidate('timed-map-weapon', 'timed-special', 0.1), enabled: false },
      { ...candidate('test-bay-weapon', 'training-weapon', 0.1), enabled: false },
      { ...candidate('weapon-pickup', 'weapon', 0.1), enabled: false },
      { ...candidate('test-bay-support', 'training-support', 0.1), enabled: false },
    ])).toMatchObject({ kind: 'support-exit', targetId: 'possessed-drone' });
  });

  it('keeps drone and chopper entry globally available when no world action is eligible', () => {
    for (const kind of ['support-enter-drone', 'support-enter-chopper'] as const) {
      expect(primaryInteraction([
        candidate(kind, 'global-support', 999),
      ])).toMatchObject({ kind, targetId: 'global-support' });
    }
  });

  it('selects exactly one equal-priority platform by proximity and stable identity', () => {
    expect(primaryInteraction([
      candidate('support-enter-chopper', 'chopper-z', 18),
      candidate('support-enter-drone', 'drone-a', 7),
    ])?.targetId).toBe('drone-a');
    expect(primaryInteraction([
      candidate('support-enter-drone', 'drone-z', 7),
      candidate('support-enter-chopper', 'chopper-a', 7),
    ])?.targetId).toBe('chopper-a');
  });

  it('rejects malformed candidates instead of producing a stale prompt', () => {
    expect(primaryInteraction([
      candidate('weapon-pickup', '', 1),
      candidate('shed-door', 'door', Number.NaN),
    ])).toBeNull();
  });

  it('projects independent deterministic tap and hold winners from one candidate set', () => {
    const candidates = [
      candidate('support-enter-drone', 'drone-z', 0),
      candidate('support-enter-chopper', 'chopper-a', 0),
      candidate('weapon-pickup', 'weapon-z', 0.2),
      candidate('shed-door', 'door-a', 2),
    ];
    expect(primaryTapInteraction(candidates)).toMatchObject({ kind: 'shed-door', targetId: 'door-a' });
    expect(primaryHoldInteraction(candidates)).toMatchObject({ kind: 'support-enter-chopper', targetId: 'chopper-a' });
  });

  it('prefers a test-bay weapon over overlapping support pads while keeping both tap interactions', () => {
    const winner = primaryTapInteraction([
      candidate('test-bay-support', 'chopper', 0.1),
      candidate('test-bay-weapon', 'm14-ebr', 1.9),
    ]);
    expect(winner).toMatchObject({ kind: 'test-bay-weapon', targetId: 'm14-ebr' });
  });
});
