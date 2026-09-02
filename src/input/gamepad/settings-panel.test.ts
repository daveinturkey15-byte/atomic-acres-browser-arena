import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAMEPAD_SETTINGS, GAMEPAD_SETTINGS_STORAGE_KEY } from './curves';
import { GamepadInputRuntime, type GamepadLike } from './gamepad-input';
import {
  GAMEPAD_PRESENCE_INTERVAL_MS,
  GAMEPAD_SETTINGS_IDS,
  bindGamepadSettingsPanel,
  gamepadSettingsMarkup,
} from './settings-panel';

describe('gamepad settings panel markup', () => {
  it('renders every control id the binder looks up, exactly once, inside one settings section', () => {
    const markup = gamepadSettingsMarkup();
    for (const id of Object.values(GAMEPAD_SETTINGS_IDS)) {
      expect(markup.match(new RegExp(`id="${id}"`, 'g')) ?? [], id).toHaveLength(1);
    }
    expect(markup.startsWith(`<section id="${GAMEPAD_SETTINGS_IDS.section}" class="settings-section"`)).toBe(true);
    expect(markup).toContain('TOUCH · STRONG');
    expect(markup).toContain('PAD · MEDIUM');
    expect(markup).toContain('MOUSE · NONE');
    expect(markup).toContain('RESET TO DEFAULTS');
  });

  // DoD 3 wants deadzone AND response curve per stick to be configurable, not
  // only three of the six numbers the settings model carries.
  it('exposes all six per-stick curve numbers as controls', () => {
    const markup = gamepadSettingsMarkup();
    for (const id of [
      GAMEPAD_SETTINGS_IDS.moveDeadzone,
      GAMEPAD_SETTINGS_IDS.moveOuter,
      GAMEPAD_SETTINGS_IDS.moveCurve,
      GAMEPAD_SETTINGS_IDS.lookDeadzone,
      GAMEPAD_SETTINGS_IDS.lookOuter,
      GAMEPAD_SETTINGS_IDS.lookCurve,
    ]) {
      expect(markup, id).toContain(`<input id="${id}" type="range"`);
    }
  });

  it('declines to bind when the section is absent', () => {
    const runtime = new GamepadInputRuntime({ getGamepads: () => [], storage: null, now: () => 0 });
    const doc = { getElementById: () => null, querySelector: () => null } as unknown as Document;
    expect(bindGamepadSettingsPanel(doc, runtime)).toBeNull();
  });
});

/**
 * Minimal fake DOM: the vitest environment is node (no jsdom), and the binder
 * only touches getElementById, dataset, value/checked, textContent, innerHTML,
 * classList, add/removeEventListener, querySelector(All) and closest.
 */
type Listener = (event: Event) => void;

class FakeEl {
  textContent = '';
  innerHTML = '';
  value = '';
  checked = false;
  readonly dataset: Record<string, string> = {};
  readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
    contains: (name: string) => this.classes.has(name),
  };
  readonly children = new Map<string, FakeEl>();
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
  dispatch(type: string, event: Partial<Event> = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ type, ...event } as Event);
  }
  querySelector(selector: string): FakeEl | null { return this.children.get(selector) ?? null; }
  querySelectorAll(selector: string): FakeEl[] {
    return selector === '[data-tier]' ? [...this.children.values()].filter((child) => 'tier' in child.dataset) : [];
  }
}

class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | null = null;
  observed: unknown = null;
  disconnected = false;
  constructor(private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    FakeIntersectionObserver.last = this;
  }
  observe(target: unknown): void { this.observed = target; }
  disconnect(): void { this.disconnected = true; }
  intersect(isIntersecting: boolean): void { this.callback([{ isIntersecting }]); }
}

class FakeStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

function makePad(id = 'Xbox Wireless Controller 045e'): GamepadLike & { buttons: { pressed: boolean; value: number }[] } {
  return {
    id,
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
}

function panelHarness(options: { withPad?: boolean } = {}) {
  const ids = GAMEPAD_SETTINGS_IDS;
  const elements = new Map<string, FakeEl>();
  for (const id of Object.values(ids)) elements.set(id, new FakeEl());
  const statusRow = elements.get(ids.statusRow)!;
  statusRow.children.set('b', new FakeEl());
  statusRow.children.set('span', new FakeEl());
  const assistRow = elements.get(ids.assistRow)!;
  for (const tier of ['touch', 'pad', 'mouse']) {
    const cell = new FakeEl();
    cell.dataset.tier = tier;
    assistRow.children.set(tier, cell);
  }
  const doc = {
    getElementById: (id: string) => elements.get(id) ?? null,
    querySelector: () => null,
  } as unknown as Document;

  const storage = new FakeStorage();
  let getGamepadsCalls = 0;
  const pad = options.withPad === false ? null : makePad();
  const pads: (GamepadLike | null)[] = [pad];
  let clock = 1000;
  const runtime = new GamepadInputRuntime({
    getGamepads: () => { getGamepadsCalls += 1; return pads; },
    storage,
    now: () => clock,
  });
  if (options.withPad !== false) runtime.poll(clock);
  const panel = bindGamepadSettingsPanel(doc, runtime, {
    intersectionObserver: FakeIntersectionObserver as unknown as typeof IntersectionObserver,
  })!;
  return {
    elements, doc, storage, runtime, panel, pads, pad,
    observer: () => FakeIntersectionObserver.last!,
    calls: () => getGamepadsCalls,
    el: (id: string) => elements.get(id)!,
    tick: (ms = 16) => { clock += ms; return runtime.poll(clock); },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('gamepad settings panel binding', () => {
  it('writes all six per-stick curve numbers, invert-Y and rumble from the controls', () => {
    const h = panelHarness();
    const ids = GAMEPAD_SETTINGS_IDS;
    h.el(ids.moveDeadzone).value = '0.19';
    h.el(ids.moveOuter).value = '0.07';
    h.el(ids.moveCurve).value = '1.85';
    h.el(ids.lookDeadzone).value = '0.11';
    h.el(ids.lookOuter).value = '0.13';
    h.el(ids.lookCurve).value = '2.25';
    h.el(ids.invertY).checked = true;
    h.el(ids.moveCurve).dispatch('input');
    h.el(ids.invertY).dispatch('change');
    expect(h.runtime.getSettings()).toMatchObject({
      moveCurve: { deadzone: 0.19, outer: 0.07, exponent: 1.85 },
      lookCurve: { deadzone: 0.11, outer: 0.13, exponent: 2.25 },
      invertLookY: true,
    });
    expect(h.storage.getItem(GAMEPAD_SETTINGS_STORAGE_KEY)).toContain('"exponent":1.85');

    // RESET STICKS restores every one of the six and clears persistence.
    h.el(ids.settingsReset).dispatch('click');
    expect(h.runtime.getSettings()).toEqual(DEFAULT_GAMEPAD_SETTINGS);
    expect(h.storage.getItem(GAMEPAD_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(h.el(ids.moveCurve).value).toBe(String(DEFAULT_GAMEPAD_SETTINGS.moveCurve.exponent));
    expect(h.el(ids.lookOuter).value).toBe(String(DEFAULT_GAMEPAD_SETTINGS.lookCurve.outer));
  });

  // PASS 84 skeptic finding: the presence timer used to start at module init
  // and never stop, so a 2 Hz navigator.getGamepads() walk ran for the life of
  // the page, duplicating the per-frame gameplay poll.
  it('polls pad presence only while the Options section is on screen', () => {
    vi.useFakeTimers();
    const h = panelHarness();
    const observer = h.observer();
    expect(observer.observed).toBe(h.el(GAMEPAD_SETTINGS_IDS.section));

    const hiddenBaseline = h.calls();
    vi.advanceTimersByTime(GAMEPAD_PRESENCE_INTERVAL_MS * 6);
    expect(h.calls(), 'a hidden Options panel must not poll the pad list').toBe(hiddenBaseline);

    observer.intersect(true);
    expect(h.calls(), 'becoming visible reconciles once immediately').toBe(hiddenBaseline + 1);
    vi.advanceTimersByTime(GAMEPAD_PRESENCE_INTERVAL_MS * 3);
    expect(h.calls()).toBe(hiddenBaseline + 4);

    observer.intersect(false);
    const hiddenAgain = h.calls();
    vi.advanceTimersByTime(GAMEPAD_PRESENCE_INTERVAL_MS * 6);
    expect(h.calls()).toBe(hiddenAgain);

    observer.intersect(true);
    h.panel.dispose();
    expect(observer.disconnected).toBe(true);
    const disposed = h.calls();
    vi.advanceTimersByTime(GAMEPAD_PRESENCE_INTERVAL_MS * 6);
    expect(h.calls(), 'dispose() must stop the timer').toBe(disposed);
  });

  it('drives a rebind from the row button through capture, persistence and reset', () => {
    const h = panelHarness();
    const ids = GAMEPAD_SETTINGS_IDS;
    const rows = h.el(ids.bindingRows);
    expect(rows.innerHTML, 'a connected pad renders one row per action').toContain('data-pad-action="grenade"');
    expect(h.el(ids.bindingsStatus).textContent).toBe('DEFAULT LAYOUT');
    const defaultGlyph = /data-pad-action="grenade"[\s\S]*?<kbd[^>]*>([^<]*)</u.exec(rows.innerHTML)?.[1];
    expect(defaultGlyph).toBe('LB');

    const clickRebind = (action: string): void => {
      rows.dispatch('click', {
        target: { closest: (selector: string) => (selector === 'button[data-pad-rebind]' ? { dataset: { padRebind: action } } : null) },
      } as unknown as Event);
    };
    clickRebind('grenade');
    expect(rows.innerHTML).toContain('PRESS A PAD BUTTON…');

    h.pad!.buttons[16] = { pressed: true, value: 1 };
    h.panel.poll();
    expect(rows.innerHTML).not.toContain('PRESS A PAD BUTTON…');
    expect(rows.innerHTML).toMatch(/data-pad-action="grenade"[\s\S]*?data-button="16"/u);
    expect(h.el(ids.bindingsStatus).textContent).toBe('CUSTOM LAYOUT');
    expect(h.storage.getItem('atomic-acres-gamepad-bindings.v1')).toContain('"grenade":16');
    expect(h.runtime.activeLayout()?.buttons.grenade).toBe(16);

    h.el(ids.bindingsReset).dispatch('click');
    expect(h.el(ids.bindingsStatus).textContent).toBe('DEFAULT LAYOUT');
    expect(h.runtime.activeLayout()?.buttons.grenade).toBe(4);
    expect(h.storage.getItem('atomic-acres-gamepad-bindings.v1')).toBeNull();
  });
});
