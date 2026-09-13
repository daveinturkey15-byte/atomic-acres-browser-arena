/**
 * Hot-plug state machine (PASS 84 Lane E). Pure reducer: the runtime feeds it
 * `gamepadconnected` / `gamepaddisconnected` events and one `poll` per frame
 * with what `navigator.getGamepads()` actually returned. The poll is the
 * source of truth — Chrome only surfaces a pad after its first button press
 * and some browsers never fire the connect event for a pad that was already
 * plugged in when the page loaded — so a pad that appears without an event
 * still becomes active, and a pad that vanishes without an event still drops.
 *
 * With several pads present, the one the player is actually using wins: any
 * stick or button activity on a non-active pad promotes it.
 */

export type HotplugPadSample = Readonly<{
  index: number;
  id: string;
  connected: boolean;
  /** True when this sample carried input beyond the deadzone or a pressed button. */
  active: boolean;
}>;

export type HotplugEvent =
  | Readonly<{ type: 'connected'; index: number; id: string; at: number }>
  | Readonly<{ type: 'disconnected'; index: number; at: number }>
  | Readonly<{ type: 'poll'; pads: readonly HotplugPadSample[]; at: number }>;

export type HotplugState = Readonly<{
  activeIndex: number | null;
  activeId: string | null;
  /** Connected pad indices in connection order (oldest first). */
  connected: readonly number[];
  ids: Readonly<Record<number, string>>;
  connectCount: number;
  disconnectCount: number;
  lastChangeAt: number;
}>;

export const INITIAL_HOTPLUG_STATE: HotplugState = Object.freeze({
  activeIndex: null,
  activeId: null,
  connected: Object.freeze([]),
  ids: Object.freeze({}),
  connectCount: 0,
  disconnectCount: 0,
  lastChangeAt: 0,
});

function withActive(state: HotplugState, index: number | null, at: number): HotplugState {
  return Object.freeze({
    ...state,
    activeIndex: index,
    activeId: index === null ? null : state.ids[index] ?? null,
    lastChangeAt: at,
  });
}

function addPad(state: HotplugState, index: number, id: string, at: number): HotplugState {
  if (state.connected.includes(index)) {
    if (state.ids[index] === id) return state;
    return Object.freeze({ ...state, ids: Object.freeze({ ...state.ids, [index]: id }), activeId: state.activeIndex === index ? id : state.activeId });
  }
  const next: HotplugState = Object.freeze({
    ...state,
    connected: Object.freeze([...state.connected, index]),
    ids: Object.freeze({ ...state.ids, [index]: id }),
    connectCount: state.connectCount + 1,
    lastChangeAt: at,
  });
  // The newest pad becomes active only when nothing else is in use.
  return next.activeIndex === null ? withActive(next, index, at) : next;
}

function removePad(state: HotplugState, index: number, at: number): HotplugState {
  if (!state.connected.includes(index)) return state;
  const ids = { ...state.ids };
  delete ids[index];
  const connected = state.connected.filter((candidate) => candidate !== index);
  const next: HotplugState = Object.freeze({
    ...state,
    connected: Object.freeze(connected),
    ids: Object.freeze(ids),
    disconnectCount: state.disconnectCount + 1,
    lastChangeAt: at,
  });
  if (state.activeIndex !== index) return next;
  // Fall back to the most recently connected remaining pad, else nothing.
  return withActive(next, connected.length > 0 ? connected[connected.length - 1] : null, at);
}

export function reduceHotplug(state: HotplugState, event: HotplugEvent): HotplugState {
  if (event.type === 'connected') return addPad(state, event.index, event.id, event.at);
  if (event.type === 'disconnected') return removePad(state, event.index, event.at);
  // Poll path: zero transient allocations in steady state. No Set, no array
  // methods, no closures — linear scans over tiny (<=8) lists, and the input
  // state object is returned untouched when nothing changed. addPad/removePad
  // /withActive still allocate on real transitions (connect, disconnect, or
  // activity promotion), which are rare by construction.
  const pads = event.pads;
  let next = state;
  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    if (!pad.connected) continue;
    next = addPad(next, pad.index, pad.id, event.at);
  }
  // Removal scan without a presence Set. Removal shifts the array, so the
  // index only advances when the slot was kept.
  let slot = 0;
  while (slot < next.connected.length) {
    const index = next.connected[slot];
    let present = false;
    for (let j = 0; j < pads.length; j += 1) {
      const pad = pads[j];
      if (pad.connected && pad.index === index) { present = true; break; }
    }
    if (present) { slot += 1; continue; }
    next = removePad(next, index, event.at);
  }
  let busy: HotplugPadSample | null = null;
  for (let k = 0; k < pads.length; k += 1) {
    const pad = pads[k];
    if (pad.connected && pad.active && pad.index !== next.activeIndex) { busy = pad; break; }
  }
  if (busy) next = withActive(next, busy.index, event.at);
  return next;
}

export function hotplugConnected(state: HotplugState): boolean {
  return state.activeIndex !== null;
}
