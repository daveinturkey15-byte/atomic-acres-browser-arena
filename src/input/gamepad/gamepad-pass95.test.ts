/**
 * PASS 95 gamepad lane — owner-ask acceptance: Bluetooth pads on PC and mobile.
 * Pins the brief's contract in one place: standard mapping table, deadzone,
 * last-device arbitration, settings round-trip (enable/sensitivity/invert/
 * deadzone), single-fetch zero-scratch poll, and d-pad/A/B menu navigation
 * that can start a Solo match.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_GAMEPAD_SETTINGS, normalizeGamepadSettings } from './curves';
import { GamepadInputRuntime, type GamepadFrame, type GamepadLike } from './gamepad-input';
import { detectPadLayout } from './mapping';
import { GamepadMenuNav } from './menu-nav';

class FakeStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

function makePad(index = 0): GamepadLike & { axes: number[]; buttons: { pressed: boolean; value: number }[] } {
  return {
    id: 'Xbox Wireless Controller 045e',
    index,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
}

function press(pad: { buttons: { pressed: boolean; value: number }[] }, index: number, value = 1): void {
  pad.buttons[index] = { pressed: true, value };
}

function release(pad: { buttons: { pressed: boolean; value: number }[] }, index: number): void {
  pad.buttons[index] = { pressed: false, value: 0 };
}

describe('PASS 95 gamepad mapping table (standard)', () => {
  it('binds the brief: RT fire, LT aim, A jump, X reload, Y swap, B crouch, MENU pause, sticks on 0/1 + 2/3', () => {
    const layout = detectPadLayout('Xbox Wireless Controller 045e', 'standard');
    expect(layout.buttons.fire).toBe(7);
    expect(layout.buttons.ads).toBe(6);
    expect(layout.buttons.jump).toBe(0);
    expect(layout.buttons.reload).toBe(2);
    expect(layout.buttons['switch-weapon']).toBe(3);
    expect(layout.buttons.crouch).toBe(1);
    expect(layout.buttons.melee).toBe(5);
    expect(layout.buttons.pause).toBe(9);
    expect(layout.axes).toMatchObject({ moveX: 0, moveY: 1, lookX: 2, lookY: 3 });
  });

  it('drives fire/aim/jump/reload/swap from the physical buttons', () => {
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    let clock = 1000;
    const runtime = new GamepadInputRuntime({ getGamepads: () => pads, storage: new FakeStorage(), now: () => clock });
    const tick = (): GamepadFrame => { clock += 16; return runtime.poll(clock); };
    const pad = makePad();
    pads[0] = pad;
    tick(); // connect baseline: held buttons seed as held, not pressed
    press(pad, 7, 0.9); // RT
    let frame = tick();
    expect(frame.held('fire')).toBe(true);
    expect(frame.pressed('fire')).toBe(true);
    release(pad, 7);
    press(pad, 6, 0.8); // LT
    frame = tick();
    expect(frame.held('ads')).toBe(true);
    release(pad, 6);
    press(pad, 0); // A
    frame = tick();
    expect(frame.pressed('jump')).toBe(true);
    release(pad, 0);
    press(pad, 2); // X
    frame = tick();
    expect(frame.pressed('reload')).toBe(true);
    release(pad, 2);
    press(pad, 3); // Y
    frame = tick();
    expect(frame.pressed('switch-weapon')).toBe(true);
    release(pad, 3);
    press(pad, 1); // B
    frame = tick();
    expect(frame.held('crouch')).toBe(true);
  });
});

describe('PASS 95 deadzone + sensitivity', () => {
  it('reads zero inside the deadzone and direction outside it', () => {
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    let clock = 2000;
    const runtime = new GamepadInputRuntime({ getGamepads: () => pads, storage: new FakeStorage(), now: () => clock });
    const tick = (): GamepadFrame => { clock += 16; return runtime.poll(clock); };
    const pad = makePad();
    pads[0] = pad;
    tick();
    pad.axes = [0.05, 0.05, 0, 0];
    expect(tick().move).toEqual({ x: 0, y: 0 });
    pad.axes = [0, 0, 1, 0];
    const look = tick().look;
    expect(look.x).toBeCloseTo(1, 5);
    expect(look.y).toBe(0);
  });

  it('scales shaped look by the sensitivity setting', () => {
    const mk = (sensitivity: number): GamepadFrame => {
      const pads: (GamepadLike | null)[] = [null, null, null, null];
      let clock = 3000;
      const storage = new FakeStorage();
      const runtime = new GamepadInputRuntime({ getGamepads: () => pads, storage, now: () => clock });
      runtime.updateSettings({ lookSensitivity: sensitivity });
      const tick = (): GamepadFrame => { clock += 16; return runtime.poll(clock); };
      const pad = makePad();
      pads[0] = pad;
      tick();
      pad.axes = [0, 0, 0.5, 0];
      return tick();
    };
    const base = mk(1).look.x;
    const doubled = mk(2).look.x;
    expect(base).toBeGreaterThan(0);
    expect(doubled).toBeCloseTo(base * 2, 6);
  });
});

describe('PASS 95 last-device arbitration', () => {
  it('hands the HUD scheme to whichever input was used last', () => {
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    let clock = 4000;
    const runtime = new GamepadInputRuntime({ getGamepads: () => pads, storage: new FakeStorage(), now: () => clock });
    const tick = (): GamepadFrame => { clock += 16; return runtime.poll(clock); };
    const pad = makePad();
    pads[0] = pad;
    tick();
    expect(runtime.currentScheme()).toBe('keyboard');
    pad.axes = [0, 0, 0.8, 0];
    tick();
    expect(runtime.currentScheme()).toBe('gamepad');
    clock += 16;
    runtime.notifyKeyboardMouse(clock);
    expect(runtime.currentScheme()).toBe('keyboard');
  });
});

describe('PASS 95 settings round-trip (enable, sensitivity, invert Y, deadzone)', () => {
  it('normalises junk to defaults and persists the four brief fields', () => {
    const junk = normalizeGamepadSettings({
      enabled: 'yes',
      lookSensitivity: 99,
      invertLookY: 1,
      moveCurve: { deadzone: 9, exponent: 0, outer: 0 },
      lookCurve: { deadzone: -2, exponent: 2, outer: 0 },
    });
    expect(junk.enabled).toBe(true);
    expect(junk.lookSensitivity).toBe(4);
    expect(junk.invertLookY).toBe(false);
    expect(junk.moveCurve.deadzone).toBe(0.6);
    const storage = new FakeStorage();
    let clock = 5000;
    const runtime = new GamepadInputRuntime({ getGamepads: () => [], storage, now: () => clock });
    runtime.updateSettings({ enabled: false, lookSensitivity: 2.5, invertLookY: true });
    expect(runtime.getSettings().enabled).toBe(false);
    expect(runtime.getSettings().lookSensitivity).toBe(2.5);
    expect(runtime.getSettings().invertLookY).toBe(true);
    clock += 16;
    const fresh = new GamepadInputRuntime({ getGamepads: () => [], storage, now: () => clock });
    expect(fresh.getSettings()).toEqual(runtime.getSettings());
    expect(DEFAULT_GAMEPAD_SETTINGS.enabled).toBe(true);
  });

  it('reports no pad input while disabled', () => {
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    let clock = 6000;
    const runtime = new GamepadInputRuntime({ getGamepads: () => pads, storage: new FakeStorage(), now: () => clock });
    runtime.updateSettings({ enabled: false });
    const tick = (): GamepadFrame => { clock += 16; return runtime.poll(clock); };
    const pad = makePad();
    pads[0] = pad;
    press(pad, 7, 1);
    const frame = tick();
    expect(frame.connected).toBe(false);
    expect(frame.anyInput).toBe(false);
    expect(runtime.currentScheme()).toBe('keyboard');
  });
});

describe('PASS 95 poll reuses buffers (no per-frame allocation)', () => {
  it('fetches getGamepads once per poll and swaps a fixed edge-buffer pair', () => {
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    let clock = 7000;
    let calls = 0;
    const storage = new FakeStorage();
    const runtime = new GamepadInputRuntime({
      getGamepads: () => { calls += 1; return pads; },
      storage,
      now: () => clock,
    });
    const tick = (): GamepadFrame => { clock += 16; return runtime.poll(clock); };
    const pad = makePad();
    pads[0] = pad;
    const before = calls;
    tick();
    expect(calls - before).toBe(1);
    tick();
    tick();
    const internal = runtime as unknown as {
      previousButtons: boolean[];
      scratchButtons: boolean[];
      scratchSamples: unknown[];
    };
    const first = internal.previousButtons;
    const second = internal.scratchButtons;
    expect(Array.isArray(first)).toBe(true);
    expect(Array.isArray(second)).toBe(true);
    // Ten more polls: the pair keeps swapping, never growing a third buffer.
    for (let i = 0; i < 10; i += 1) tick();
    const pair = new Set([internal.previousButtons, internal.scratchButtons]);
    expect(pair.has(first)).toBe(true);
    expect(pair.has(second)).toBe(true);
    expect(pair.size).toBe(2);
    expect(calls).toBe(13);
    const samples = internal.scratchSamples;
    tick();
    expect(internal.scratchSamples).toBe(samples);
  });
  it('reuses the same frame, vector and snapshot identities across 1000 polls', () => {
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    let clock = 7500;
    const runtime = new GamepadInputRuntime({ getGamepads: () => pads, storage: new FakeStorage(), now: () => clock });
    const tick = (): GamepadFrame => { clock += 16; return runtime.poll(clock); };
    const pad = makePad();
    pads[0] = pad;
    tick(); // connect baseline: held buttons seed as held, not pressed
    press(pad, 0);
    const first = tick();
    expect(first.pressed('jump')).toBe(true);
    const firstMove = first.move;
    const firstLook = first.look;
    const firstDpad = first.dpad;
    const firstDpadPressed = first.dpadPressed;
    const heldFn = first.held;
    const pressedFn = first.pressed;
    const releasedFn = first.released;
    const valueFn = first.value;
    const internal = runtime as unknown as {
      actionHeld: boolean[];
      actionWas: boolean[];
      actionValue: number[];
      scratchSamples: unknown[];
      samplePool: unknown[];
    };
    const { actionHeld, actionWas, actionValue, scratchSamples } = internal;
    const sampleZero = internal.samplePool[0];
    for (let i = 0; i < 1000; i += 1) {
      const frame = tick();
      // Same live frame and sub-objects every poll: no frame, vector,
      // d-pad, closure or snapshot allocation in steady state.
      expect(frame).toBe(first);
      expect(frame.move).toBe(firstMove);
      expect(frame.look).toBe(firstLook);
      expect(frame.dpad).toBe(firstDpad);
      expect(frame.dpadPressed).toBe(firstDpadPressed);
      expect(frame.held).toBe(heldFn);
      expect(frame.pressed).toBe(pressedFn);
      expect(frame.released).toBe(releasedFn);
      expect(frame.value).toBe(valueFn);
    }
    expect(internal.actionHeld).toBe(actionHeld);
    expect(internal.actionWas).toBe(actionWas);
    expect(internal.actionValue).toBe(actionValue);
    expect(internal.scratchSamples).toBe(scratchSamples);
    expect(internal.samplePool[0]).toBe(sampleZero);
    // Held edge settled after the first press frame; the live view is stable.
    expect(first.held('jump')).toBe(true);
    expect(first.pressed('jump')).toBe(false);
  });

  it('returns a live view: the frame tracks the latest poll, so retainers copy values', () => {
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    let clock = 8000;
    const runtime = new GamepadInputRuntime({ getGamepads: () => pads, storage: new FakeStorage(), now: () => clock });
    const tick = (): GamepadFrame => { clock += 16; return runtime.poll(clock); };
    const pad = makePad();
    pads[0] = pad;
    tick();
    press(pad, 0);
    const first = tick();
    expect(first.pressed('jump')).toBe(true);
    expect(first.held('jump')).toBe(true);
    // Copy what must survive: the frame itself is reused by the next poll.
    const heldCopy = first.held('jump');
    const pressedCopy = first.pressed('jump');
    release(pad, 0);
    tick();
    const latest = tick();
    expect(latest).toBe(first);
    expect(runtime.latestFrame()).toBe(first);
    // The live view reflects the release; the copies keep the snapshot.
    expect(first.held('jump')).toBe(false);
    expect(first.pressed('jump')).toBe(false);
    expect(heldCopy).toBe(true);
    expect(pressedCopy).toBe(true);
  });
});

// ---- Menu navigation: d-pad/A/B to a Solo start ---------------------------

class FakeMenuEl {
  id = '';
  hidden = false;
  disabled = false;
  focused = false;
  clicked = 0;
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  parentElement: FakeMenuEl | null = null;
  readonly classList = { contains: (_name: string): boolean => false };
  focus(): void { this.focused = true; }
  click(): void { this.clicked += 1; }
  getAttribute(): string | null { return null; }
  querySelectorAll(): FakeMenuEl[] { return []; }
}

function menuDoc(buttons: FakeMenuEl[]): {
  doc: {
    getElementById(id: string): FakeMenuEl | null;
    querySelectorAll(selectors: string): FakeMenuEl[];
    activeElement: FakeMenuEl | null;
  };
  menu: FakeMenuEl;
} {
  const menu = new FakeMenuEl();
  menu.id = 'menu';
  for (const button of buttons) button.parentElement = menu;
  const byId = new Map<string, FakeMenuEl>([['menu', menu]]);
  for (const button of buttons) byId.set(button.id, button);
  return {
    doc: {
      getElementById: (id: string): FakeMenuEl | null => byId.get(id) ?? null,
      querySelectorAll: (): FakeMenuEl[] => buttons,
      activeElement: null,
    },
    menu,
  };
}

function menuRuntime(pads: (GamepadLike | null)[], clock: { at: number }): GamepadInputRuntime {
  return new GamepadInputRuntime({
    getGamepads: () => pads,
    storage: new FakeStorage(),
    now: () => clock.at,
  });
}

function dpadPad(pressed: { up?: boolean; down?: boolean; left?: boolean; right?: boolean; a?: boolean; b?: boolean }): GamepadLike {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  if (pressed.up) buttons[12] = { pressed: true, value: 1 };
  if (pressed.down) buttons[13] = { pressed: true, value: 1 };
  if (pressed.left) buttons[14] = { pressed: true, value: 1 };
  if (pressed.right) buttons[15] = { pressed: true, value: 1 };
  if (pressed.a) buttons[0] = { pressed: true, value: 1 };
  if (pressed.b) buttons[1] = { pressed: true, value: 1 };
  return { id: 'Xbox', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons };
}

describe('PASS 95 menu navigation (d-pad/A/B to Solo)', () => {
  it('moves focus with the d-pad and starts Solo with A', () => {
    const solo = new FakeMenuEl();
    solo.id = 'solo';
    const host = new FakeMenuEl();
    host.id = 'host';
    const { doc } = menuDoc([solo, host]);
    const clock = { at: 9000 };
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    const runtime = menuRuntime(pads, clock);
    const nav = new GamepadMenuNav();
    const frameFor = (pad: GamepadLike): GamepadFrame => {
      pads[0] = pad;
      clock.at += 300;
      return runtime.poll(clock.at);
    };
    // Baseline with nothing pressed so edges arm.
    pads[0] = dpadPad({});
    clock.at += 300;
    runtime.poll(clock.at);
    // D-pad down focuses the first target; A activates Solo from its default.
    let frame = frameFor(dpadPad({ down: true }));
    expect(nav.update(doc as never, frame, clock.at, true)).toBe('move');
    expect(solo.focused || host.focused).toBe(true);
    pads[0] = dpadPad({});
    clock.at += 300;
    runtime.poll(clock.at);
    frame = frameFor(dpadPad({ a: true }));
    expect(nav.update(doc as never, frame, clock.at, true)).toBe('activate');
    expect(solo.clicked).toBe(1);
  });

  it('B backs out without activating', () => {
    const solo = new FakeMenuEl();
    solo.id = 'solo';
    const { doc } = menuDoc([solo]);
    const clock = { at: 9500 };
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    const runtime = menuRuntime(pads, clock);
    const nav = new GamepadMenuNav();
    pads[0] = dpadPad({});
    clock.at += 300;
    runtime.poll(clock.at);
    pads[0] = dpadPad({ b: true });
    clock.at += 300;
    const frame = runtime.poll(clock.at);
    expect(nav.update(doc as never, frame, clock.at, true)).toBe('back');
    expect(solo.clicked).toBe(0);
  });

  it('stays quiet in-match and without a pad', () => {
    const solo = new FakeMenuEl();
    solo.id = 'solo';
    const { doc } = menuDoc([solo]);
    const clock = { at: 9900 };
    const pads: (GamepadLike | null)[] = [null, null, null, null];
    const runtime = menuRuntime(pads, clock);
    const nav = new GamepadMenuNav();
    clock.at += 300;
    const idle = runtime.poll(clock.at);
    expect(nav.update(doc as never, idle, clock.at, true)).toBe('none');
    expect(nav.update(doc as never, idle, clock.at, false)).toBe('none');
  });
});
