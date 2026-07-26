import { describe, expect, it } from 'vitest';
import { interactionPriority, primaryInteraction, type InteractionCandidate } from './interaction-arbitration';

const candidate = (kind: InteractionCandidate['kind'], targetId: string, proximityM: number): InteractionCandidate => ({
  kind,
  targetId,
  proximityM,
  prompt: kind.toUpperCase(),
});

describe('shared F interaction arbitration', () => {
  it('always lets an active support exit/entry outrank nearby doors, crates and pickups', () => {
    expect(primaryInteraction([
      candidate('weapon-pickup', 'weapon', 0.2),
      candidate('shed-door', 'door', 0.1),
      candidate('care-package', 'crate', 0.05),
      candidate('support-enter-drone', 'drone', 48),
    ])).toMatchObject({ kind: 'support-enter-drone', targetId: 'drone' });
    expect(primaryInteraction([
      candidate('support-enter-chopper', 'chopper', 1),
      candidate('support-exit', 'possessed-drone', 99),
    ])).toMatchObject({ kind: 'support-exit', targetId: 'possessed-drone' });
    expect(interactionPriority('support-exit')).toBeGreaterThan(interactionPriority('support-enter-drone'));
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
});
