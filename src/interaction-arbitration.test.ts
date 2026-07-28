import { describe, expect, it } from 'vitest';
import { interactionPriority, primaryInteraction, type InteractionCandidate } from './interaction-arbitration';

const candidate = (kind: InteractionCandidate['kind'], targetId: string, proximityM: number): InteractionCandidate => ({
  kind,
  targetId,
  proximityM,
  prompt: kind.toUpperCase(),
});

describe('shared F interaction arbitration', () => {
  it('lets eligible doors and crates outrank both vehicle entry and exit', () => {
    expect(primaryInteraction([
      candidate('weapon-pickup', 'weapon', 0.2),
      candidate('shed-door', 'door', 0.1),
      candidate('care-package', 'crate', 0.05),
      candidate('support-enter-drone', 'drone', 48),
    ])).toMatchObject({ kind: 'care-package', targetId: 'crate' });
    expect(primaryInteraction([
      candidate('support-enter-chopper', 'chopper', 0),
      candidate('shed-door', 'door', 1),
    ])).toMatchObject({ kind: 'shed-door', targetId: 'door' });
    expect(primaryInteraction([
      candidate('support-exit', 'possessed-drone', 0),
      candidate('shed-door', 'door', 1),
    ])).toMatchObject({ kind: 'shed-door', targetId: 'door' });
    expect(primaryInteraction([
      candidate('support-exit', 'possessed-drone', 0),
      candidate('care-package', 'crate', 0.5),
    ])).toMatchObject({ kind: 'care-package', targetId: 'crate' });
    expect(interactionPriority('support-enter-drone')).toBeLessThan(interactionPriority('shed-door'));
    expect(interactionPriority('support-exit')).toBeLessThan(interactionPriority('shed-door'));
  });

  it('keeps weapon pickup above support controls as a world interaction', () => {
    expect(primaryInteraction([
      candidate('weapon-pickup', 'weapon', 0.1),
      candidate('support-enter-drone', 'drone', 48),
    ])).toMatchObject({ kind: 'weapon-pickup', targetId: 'weapon' });
    expect(primaryInteraction([
      candidate('weapon-pickup', 'weapon', 0.1),
      candidate('support-exit', 'possessed-drone', 0),
    ])).toMatchObject({ kind: 'weapon-pickup', targetId: 'weapon' });
    expect(interactionPriority('weapon-pickup')).toBeGreaterThan(interactionPriority('support-enter-drone'));
    expect(interactionPriority('weapon-pickup')).toBeGreaterThan(interactionPriority('support-exit'));
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
