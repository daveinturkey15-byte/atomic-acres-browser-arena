import { describe, expect, it } from 'vitest';
import { INITIAL_HOTPLUG_STATE, hotplugConnected, reduceHotplug, type HotplugState } from './hotplug';

const connect = (state: HotplugState, index: number, id: string, at = 1) => reduceHotplug(state, { type: 'connected', index, id, at });
const disconnect = (state: HotplugState, index: number, at = 2) => reduceHotplug(state, { type: 'disconnected', index, at });

describe('gamepad hot-plug state machine', () => {
  it('starts disconnected and activates the first pad that connects', () => {
    expect(hotplugConnected(INITIAL_HOTPLUG_STATE)).toBe(false);
    const one = connect(INITIAL_HOTPLUG_STATE, 0, 'Xbox');
    expect(one).toMatchObject({ activeIndex: 0, activeId: 'Xbox', connected: [0], connectCount: 1 });
    // A duplicate connect for the same slot is a no-op.
    expect(connect(one, 0, 'Xbox')).toBe(one);
  });

  it('keeps the active pad when a second one connects, then falls back on disconnect', () => {
    const two = connect(connect(INITIAL_HOTPLUG_STATE, 0, 'Xbox'), 1, 'DualShock');
    expect(two.activeIndex).toBe(0);
    expect(two.connected).toEqual([0, 1]);
    const afterActiveLeaves = disconnect(two, 0);
    expect(afterActiveLeaves).toMatchObject({ activeIndex: 1, activeId: 'DualShock', connected: [1], disconnectCount: 1 });
    const none = disconnect(afterActiveLeaves, 1);
    expect(none).toMatchObject({ activeIndex: null, activeId: null, connected: [] });
    expect(hotplugConnected(none)).toBe(false);
    // Disconnecting an unknown slot changes nothing.
    expect(disconnect(none, 4)).toBe(none);
  });

  it('reconciles against the polled list: pads that appear without an event join, pads that vanish drop', () => {
    const polled = reduceHotplug(INITIAL_HOTPLUG_STATE, {
      type: 'poll',
      at: 5,
      pads: [{ index: 2, id: 'Generic', connected: true, active: false }],
    });
    expect(polled).toMatchObject({ activeIndex: 2, activeId: 'Generic', connected: [2] });
    const gone = reduceHotplug(polled, { type: 'poll', at: 6, pads: [] });
    expect(gone).toMatchObject({ activeIndex: null, connected: [], disconnectCount: 1 });
    const notConnected = reduceHotplug(polled, { type: 'poll', at: 7, pads: [{ index: 2, id: 'Generic', connected: false, active: false }] });
    expect(notConnected.activeIndex).toBeNull();
  });

  it('promotes whichever pad the player is actually using', () => {
    const two = connect(connect(INITIAL_HOTPLUG_STATE, 0, 'Xbox'), 1, 'DualShock');
    const busy = reduceHotplug(two, {
      type: 'poll',
      at: 9,
      pads: [
        { index: 0, id: 'Xbox', connected: true, active: false },
        { index: 1, id: 'DualShock', connected: true, active: true },
      ],
    });
    expect(busy.activeIndex).toBe(1);
    const idle = reduceHotplug(busy, {
      type: 'poll',
      at: 10,
      pads: [
        { index: 0, id: 'Xbox', connected: true, active: false },
        { index: 1, id: 'DualShock', connected: true, active: false },
      ],
    });
    // Nobody is active: the last promoted pad stays.
    expect(idle.activeIndex).toBe(1);
  });

  it('updates the id when a slot is re-used by a different pad', () => {
    const one = connect(INITIAL_HOTPLUG_STATE, 0, 'Xbox');
    const swapped = reduceHotplug(one, { type: 'poll', at: 3, pads: [{ index: 0, id: 'DualShock', connected: true, active: false }] });
    expect(swapped).toMatchObject({ activeIndex: 0, activeId: 'DualShock', connectCount: 1 });
  });
});
