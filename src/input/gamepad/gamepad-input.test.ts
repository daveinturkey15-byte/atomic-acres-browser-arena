import { describe, expect, it } from 'vitest';
import { GAMEPAD_SETTINGS_STORAGE_KEY } from './curves';
import { GamepadInputRuntime, type GamepadLike } from './gamepad-input';

class FakeStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

type Listener = (event: Event) => void;
class FakeTarget {
  readonly listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    this.listeners.get(type)?.delete(listener as Listener);
  }
  dispatch(type: string, gamepad: GamepadLike | null): void {
    const event = { type, gamepad } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function makePad(id: string, mapping = 'standard', index = 0): GamepadLike & { axes: number[]; buttons: { pressed: boolean; value: number }[] } {
  return {
    id,
    index,
    connected: true,
    mapping,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
}

function harness() {
  const pads: (GamepadLike | null)[] = [null, null, null, null];
  let clock = 1000;
  const storage = new FakeStorage();
  const target = new FakeTarget();
  const runtime = new GamepadInputRuntime({ getGamepads: () => pads, storage, now: () => clock });
  runtime.attach(target as unknown as Window);
  return {
    pads,
    storage,
    target,
    runtime,
    tick: (ms = 16) => { clock += ms; return runtime.poll(clock); },
    now: () => clock,
  };
}

describe('GamepadInputRuntime', () => {
  it('is idle without a pad, activates one that appears on a poll, and maps sticks through the curves', () => {
    const h = harness();
    expect(h.tick().connected).toBe(false);
    const pad = makePad('Xbox Wireless Controller 045e');
    h.pads[0] = pad;
    pad.axes = [0, 0, 1, 0];
    const frame = h.tick();
    expect(frame.connected).toBe(true);
    expect(frame.layout?.family).toBe('xbox');
    expect(frame.look.x).toBeCloseTo(1, 6);
    expect(frame.move).toEqual({ x: 0, y: 0 });
    expect(frame.anyInput).toBe(true);
    expect(h.runtime.currentScheme()).toBe('gamepad');
    pad.axes = [0.05, 0.05, 0, 0];
    const dead = h.tick();
    expect(dead.move).toEqual({ x: 0, y: 0 });
    expect(dead.anyInput).toBe(false);
  });

  it('reports press/hold/release edges per semantic action and analogue trigger travel', () => {
    const h = harness();
    const pad = makePad('Xbox');
    h.pads[0] = pad;
    h.tick();
    pad.buttons[7] = { pressed: false, value: 0.3 };
    let frame = h.tick();
    expect(frame.held('fire')).toBe(true);
    expect(frame.pressed('fire')).toBe(true);
    expect(frame.value('fire')).toBeCloseTo(0.3, 6);
    frame = h.tick();
    expect(frame.held('fire')).toBe(true);
    expect(frame.pressed('fire')).toBe(false);
    pad.buttons[7] = { pressed: false, value: 0 };
    frame = h.tick();
    expect(frame.held('fire')).toBe(false);
    expect(frame.released('fire')).toBe(true);
    // Face buttons need the digital threshold; reload and interact share one press.
    pad.buttons[2] = { pressed: true, value: 1 };
    frame = h.tick();
    expect(frame.pressed('reload')).toBe(true);
    expect(frame.pressed('interact')).toBe(true);
    expect(frame.value('emote')).toBe(0);
  });

  it('handles connect and disconnect events mid-session and notifies listeners', () => {
    const h = harness();
    const changes: Array<[boolean, string | null]> = [];
    h.runtime.onPadChange((connected, layout) => changes.push([connected, layout?.family ?? null]));
    const pad = makePad('Wireless Controller 054c');
    h.pads[0] = pad;
    h.target.dispatch('gamepadconnected', pad);
    expect(h.runtime.connected()).toBe(true);
    expect(h.runtime.activeLayout()?.family).toBe('playstation');
    expect(changes).toEqual([[true, 'playstation']]);
    pad.axes = [0, 0, -1, 0];
    expect(h.tick().look.x).toBeCloseTo(-1, 6);
    h.pads[0] = null;
    h.target.dispatch('gamepaddisconnected', pad);
    expect(h.runtime.connected()).toBe(false);
    expect(h.tick().connected).toBe(false);
    expect(changes).toEqual([[true, 'playstation'], [false, null]]);
    expect(h.runtime.currentScheme()).toBe('keyboard');
    // An event without a pad payload falls back to reconciliation.
    h.pads[1] = makePad('Xbox', 'standard', 1);
    h.target.dispatch('gamepaddisconnected', null);
    expect(h.runtime.connected()).toBe(true);
    expect(h.runtime.telemetry()).toMatchObject({ activeIndex: 1, family: 'xbox', connectCount: 2, disconnectCount: 1 });
  });

  it('switches the HUD scheme to whichever input was used last', () => {
    const h = harness();
    const schemes: string[] = [];
    h.runtime.onSchemeChange((scheme) => schemes.push(scheme));
    const pad = makePad('Xbox');
    h.pads[0] = pad;
    h.tick();
    expect(h.runtime.currentScheme()).toBe('keyboard');
    pad.axes = [0, 0, 0.8, 0];
    h.tick();
    expect(h.runtime.currentScheme()).toBe('gamepad');
    pad.axes = [0, 0, 0, 0];
    h.tick();
    h.runtime.notifyKeyboardMouse();
    expect(h.runtime.currentScheme()).toBe('keyboard');
    pad.buttons[0] = { pressed: true, value: 1 };
    h.tick();
    expect(h.runtime.currentScheme()).toBe('gamepad');
    expect(schemes).toEqual(['gamepad', 'keyboard', 'gamepad']);
  });

  it('applies invert-Y and persisted settings, and remaps through the capture flow', () => {
    const h = harness();
    const pad = makePad('Xbox');
    h.pads[0] = pad;
    h.tick();
    h.runtime.updateSettings({ invertLookY: true, rumble: false });
    pad.axes = [0, 0, 0, 1];
    expect(h.tick().look.y).toBeCloseTo(-1, 6);
    expect(h.storage.getItem('atomic-acres-gamepad-settings.v1')).toContain('"invertLookY":true');
    expect(h.runtime.telemetry().rumble.enabled).toBe(false);

    expect(h.runtime.beginButtonCapture()).toBe(true);
    expect(h.runtime.sampleButtonCapture()).toBeNull();
    pad.buttons[16] = { pressed: true, value: 1 };
    expect(h.runtime.sampleButtonCapture()).toBe(16);
    expect(h.runtime.rebind('emote', 16)).toMatchObject({ ok: true });
    expect(h.runtime.activeLayout()?.buttons.emote).toBe(16);
    expect(h.runtime.bindingsAreDefault()).toBe(false);
    expect(h.storage.getItem('atomic-acres-gamepad-bindings.v1')).toContain('"emote":16');
    // A conflicting rebind is refused and the layout is unchanged.
    expect(h.runtime.rebind('jump', 3)).toMatchObject({ ok: false, reason: 'conflict' });
    expect(h.runtime.activeLayout()?.buttons.jump).toBe(0);
    h.runtime.resetBindings();
    expect(h.runtime.bindingsAreDefault()).toBe(true);
    expect(h.storage.getItem('atomic-acres-gamepad-bindings.v1')).toBeNull();
    const fresh = new GamepadInputRuntime({ getGamepads: () => h.pads, storage: h.storage, now: () => h.now() });
    expect(fresh.getSettings().invertLookY).toBe(true);
  });

  it('routes rumble to the active pad only when a pad and actuator exist', () => {
    const h = harness();
    expect(h.runtime.rumble('fire')).toBe(false);
    let effects = 0;
    const pad = makePad('Xbox');
    (pad as { vibrationActuator?: unknown }).vibrationActuator = { playEffect: async () => { effects += 1; return 'complete'; } };
    h.pads[0] = pad;
    h.tick();
    expect(h.runtime.rumble('fire')).toBe(true);
    expect(effects).toBe(1);
    h.runtime.updateSettings({ rumble: false });
    expect(h.runtime.rumble('damage')).toBe(false);
    expect(effects).toBe(1);
  });

  it('follows the pad the player is actually using when several are connected', () => {
    const h = harness();
    const xbox = makePad('Xbox', 'standard', 0);
    const ps = makePad('Wireless Controller 054c', 'standard', 1);
    h.pads[0] = xbox;
    h.pads[1] = ps;
    h.tick();
    expect(h.runtime.telemetry().activeIndex).toBe(0);
    ps.axes = [0, 0, 0.9, 0];
    const frame = h.tick();
    expect(h.runtime.telemetry().activeIndex).toBe(1);
    expect(frame.layout?.family).toBe('playstation');
    expect(frame.look.x).toBeGreaterThan(0.5);
  });

  // PASS 84 skeptic finding: the connect transition used to clear the edge
  // baseline, so the first poll after a connect saw previous = [] and reported
  // a press for every button that was already down — a pad paired with the
  // trigger held fired a shot the player never asked for.
  it('a button already held when the pad connects is held, not pressed, on the first frame', () => {
    const h = harness();
    const pad = makePad('Xbox');
    pad.buttons[7] = { pressed: true, value: 1 };
    pad.buttons[0] = { pressed: true, value: 1 };
    h.pads[0] = pad;
    h.target.dispatch('gamepadconnected', pad);
    const first = h.tick();
    expect(first.connected).toBe(true);
    expect(first.held('fire')).toBe(true);
    expect(first.pressed('fire'), 'a held trigger at connect time must not report a press edge').toBe(false);
    expect(first.pressed('jump')).toBe(false);
    // A genuine release/press after the connect is still an edge.
    pad.buttons[7] = { pressed: false, value: 0 };
    h.tick();
    pad.buttons[7] = { pressed: true, value: 1 };
    expect(h.tick().pressed('fire')).toBe(true);
  });

  it('promoting a second pad by activity does not fire its already-held trigger', () => {
    const h = harness();
    const xbox = makePad('Xbox', 'standard', 0);
    const ps = makePad('Wireless Controller 054c', 'standard', 1);
    h.pads[0] = xbox;
    h.pads[1] = ps;
    h.tick();
    expect(h.runtime.telemetry().activeIndex).toBe(0);
    ps.buttons[7] = { pressed: true, value: 1 };
    const promoted = h.tick();
    expect(h.runtime.telemetry().activeIndex).toBe(1);
    expect(promoted.held('fire')).toBe(true);
    expect(promoted.pressed('fire')).toBe(false);
  });

  it('reset-to-defaults clears the persisted settings key through the shared helper', () => {
    const h = harness();
    h.runtime.updateSettings({ invertLookY: true });
    expect(h.storage.getItem(GAMEPAD_SETTINGS_STORAGE_KEY)).not.toBeNull();
    expect(h.runtime.resetSettings().invertLookY).toBe(false);
    expect(h.storage.getItem(GAMEPAD_SETTINGS_STORAGE_KEY)).toBeNull();
    expect([...h.storage.data.keys()]).toEqual([]);
  });
});
