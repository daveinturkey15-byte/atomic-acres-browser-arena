import { describe, expect, it } from 'vitest';
import { createInitialShedState } from './destructible-world';
import { FIELD_SHED_DEFINITION } from './destructible-shed-presentation';
import { shedPlacementsForArena } from './destructible-shed-registry';
import {
  INTERACTIVE_WORLD_SCHEMA_VERSION,
  isInteractiveWorldProtocolMessage,
  isInteractiveWorldSnapshotMessage,
  isShedInteractionIntentMessage,
} from './interactive-world-protocol';
import { InteractiveWorldRuntime } from './interactive-world-runtime';

describe('strict interactive-world protocol', () => {
  it('admits only bounded canonical door intent fields', () => {
    const intent = {
      type: 'shed-interact-request',
      schemaVersion: INTERACTIVE_WORLD_SCHEMA_VERSION,
      by: 'player-a',
      arenaId: 'atomic-acres',
      placementId: 'atomic-shed-west',
      matchEpoch: 4,
      lifeId: 2,
      actionSequence: 1,
      nonce: 42,
    } as const;
    expect(isShedInteractionIntentMessage(intent)).toBe(true);
    expect(isInteractiveWorldProtocolMessage(intent)).toBe(true);
    expect(isShedInteractionIntentMessage({ ...intent, arenaId: 'farcrysis' })).toBe(true);
    expect(isShedInteractionIntentMessage({ ...intent, arenaId: 'high-seas' })).toBe(true);
    expect(isShedInteractionIntentMessage({ ...intent, clientAngleQ: 9_000 })).toBe(false);
    expect(isShedInteractionIntentMessage({ ...intent, actionSequence: 0 })).toBe(false);
    expect(isShedInteractionIntentMessage({ ...intent, arenaId: 'Nuke Town' })).toBe(false);
  });

  it('binds snapshots to a strict SHA-256 envelope and wire budget', () => {
    const runtime = new InteractiveWorldRuntime('atomic-acres', 4, [shedPlacementsForArena('atomic-acres')[0]!], true);
    const message = {
      type: 'interactive-world-snapshot',
      schemaVersion: INTERACTIVE_WORLD_SCHEMA_VERSION,
      by: 'host-a',
      envelope: runtime.stateEnvelope(),
      nonce: 9,
    } as const;
    expect(isInteractiveWorldSnapshotMessage(message)).toBe(true);
    expect(isInteractiveWorldSnapshotMessage({ ...message, envelope: { ...message.envelope, hash: '0'.repeat(64) } })).toBe(false);
    expect(isInteractiveWorldSnapshotMessage({ ...message, guestAuthority: true })).toBe(false);
    runtime.dispose();
  });

  it('rejects nested unknown shed keys before they reach runtime authority', () => {
    const placement = shedPlacementsForArena('atomic-acres')[0]!;
    const runtime = new InteractiveWorldRuntime('atomic-acres', 6, [placement], true);
    const envelope = runtime.stateEnvelope();
    const mutatedState = {
      ...createInitialShedState(FIELD_SHED_DEFINITION, placement, 6),
      clientCanFracture: true,
    };
    expect(isInteractiveWorldSnapshotMessage({
      type: 'interactive-world-snapshot', schemaVersion: 1, by: 'host-a', nonce: 1,
      envelope: { ...envelope, sheds: [mutatedState] },
    })).toBe(false);
    runtime.dispose();
  });
});
