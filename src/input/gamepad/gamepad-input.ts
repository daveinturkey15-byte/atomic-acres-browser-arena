/**
 * Gamepad input runtime (PASS 84 Lane E). Owns hot-plug tracking, model
 * detection, the remap profile, stick shaping, per-frame button edges, the
 * active input scheme (keyboard/mouse vs pad) and rumble. The game loop calls
 * `poll()` once per frame and reads one reused live `GamepadFrame`; nothing in
 * here touches gameplay state.
 *
 * Zero-allocation ownership (PASS 95 Luna blocking finding): the steady-state
 * poll allocates nothing — every buffer, snapshot array and vector the poll
 * touches is preallocated once in the constructor and mutated in place, and
 * `poll()` returns the same live frame object every connected frame. Treat the
 * frame as a live view that is only valid until the next poll: copy any
 * boolean/number you need to keep (do not retain the frame reference).
 * Connect/disconnect/promotion transitions and settings/rebind calls may still
 * allocate; per-frame gameplay polling does not.
 *
 * Browser-agnostic by construction: `getGamepads`, the event target, storage
 * and the clock are injected so the whole thing runs under vitest with a fake
 * pad, and under Playwright with `navigator.getGamepads` replaced.
 */

import {
  buttonPressed,
  clearGamepadSettings,
  normalizeGamepadSettings,
  readGamepadSettings,
  TRIGGER_PRESS_THRESHOLD,
  writeGamepadSettings,
  type GamepadSettings,
} from './curves';
import { selectInputScheme, type InputScheme } from './glyphs';
import { hotplugConnected, INITIAL_HOTPLUG_STATE, reduceHotplug, type HotplugPadSample, type HotplugState } from './hotplug';
import {
  clearPadBindingProfile,
  detectPadLayout,
  effectivePadLayout,
  isDefaultPadBindings,
  PAD_ACTIONS,
  rebindPadAction,
  resolvePadBindingProfile,
  savePadBindingProfile,
  type PadAction,
  type PadBindingProfile,
  type PadLayout,
  type PadRebindResult,
} from './mapping';
import { GamepadRumble, type RumbleKind, type RumblePadLike } from './rumble';

export type GamepadButtonLike = { pressed: boolean; touched?: boolean; value: number };
export type GamepadLike = {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
  timestamp?: number;
} & RumblePadLike;

export type GamepadFrame = Readonly<{
  connected: boolean;
  layout: PadLayout | null;
  /** Shaped left stick (x right, y down) after deadzone/curve. */
  move: Readonly<{ x: number; y: number }>;
  /** Shaped right stick (x right, y down; inverted if the setting says so, scaled by sensitivity). */
  look: Readonly<{ x: number; y: number }>;
  /** Raw (unshaped) look magnitude, for telemetry and assist weighting. */
  rawLookMagnitude: number;
  /** Raw d-pad held state (physical buttons 12–15), independent of semantic remaps. */
  dpad: Readonly<{ up: boolean; down: boolean; left: boolean; right: boolean }>;
  /** Raw d-pad press edges, for menu navigation. */
  dpadPressed: Readonly<{ up: boolean; down: boolean; left: boolean; right: boolean }>;
  held: (action: PadAction) => boolean;
  pressed: (action: PadAction) => boolean;
  released: (action: PadAction) => boolean;
  /** Analogue value for an action's button (trigger travel), 0 when unbound. */
  value: (action: PadAction) => number;
  /** True when this frame carried any stick or button input. */
  anyInput: boolean;
}>;

export type GamepadRuntimeDeps = Readonly<{
  getGamepads: () => readonly (GamepadLike | null)[];
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
}>;

export type GamepadTelemetry = Readonly<{
  connected: boolean;
  activeIndex: number | null;
  activeId: string | null;
  model: string | null;
  family: string | null;
  layoutId: string | null;
  mapping: string | null;
  connectCount: number;
  disconnectCount: number;
  scheme: InputScheme;
  lastPadInputAt: number;
  lastKeyboardMouseInputAt: number;
  settings: GamepadSettings;
  defaultBindings: boolean;
  rumble: ReturnType<GamepadRumble['telemetry']>;
  frames: number;
}>;

const IDLE_DPAD = Object.freeze({ up: false, down: false, left: false, right: false });

const IDLE_FRAME: GamepadFrame = Object.freeze({
  connected: false,
  layout: null,
  move: Object.freeze({ x: 0, y: 0 }),
  look: Object.freeze({ x: 0, y: 0 }),
  rawLookMagnitude: 0,
  dpad: IDLE_DPAD,
  dpadPressed: IDLE_DPAD,
  held: () => false,
  pressed: () => false,
  released: () => false,
  value: () => 0,
  anyInput: false,
});

const ACTIVITY_DEADZONE = 0.18;

/** Shared empties so missing pad arrays never allocate a per-poll `[]`. */
const EMPTY_AXES: readonly number[] = Object.freeze([]);
const EMPTY_BUTTONS: readonly GamepadButtonLike[] = Object.freeze([]);
const EMPTY_GAMEPADS: readonly (GamepadLike | null)[] = Object.freeze([]);
/** Standard mapping: 17 buttons (0-16), 4 axes. Buffers cover index 31 (MAX_BUTTON_INDEX). */
const MAX_PREALLOC_BUTTONS = 32;
const MAX_PREALLOC_PADS = 8;
const ACTION_COUNT = PAD_ACTIONS.length;
/** Action -> dense index, built once so the hot path never calls indexOf. */
const ACTION_INDEX: Readonly<Record<PadAction, number>> = (() => {
  const record = {} as Record<PadAction, number>;
  for (let i = 0; i < PAD_ACTIONS.length; i += 1) record[PAD_ACTIONS[i]] = i;
  return record;
})();

type MutableSample = { -readonly [K in keyof HotplugPadSample]: HotplugPadSample[K] };
type LiveVec = { x: number; y: number };
type LiveDpad = { up: boolean; down: boolean; left: boolean; right: boolean };

/**
 * Writes a shaped stick into `out` with no allocation. Same math as
 * `shapeStick` in curves.ts (radial deadzone + outer saturation + exponent,
 * direction preserved); the exported helper stays for one-shot callers.
 */
function shapeStickInto(x: number, y: number, curve: { deadzone: number; outer: number; exponent: number }, out: LiveVec): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) { out.x = 0; out.y = 0; return; }
  const deadzone = Math.min(0.99, Math.max(0, curve.deadzone));
  const outer = Math.min(0.5, Math.max(0, curve.outer));
  const exponent = Math.max(0.01, curve.exponent);
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone || magnitude < 1e-8) { out.x = 0; out.y = 0; return; }
  const usable = Math.max(0.001, 1 - outer - deadzone);
  const normalized = Math.min(1, Math.max(0, (magnitude - deadzone) / usable));
  const shaped = Math.pow(normalized, exponent);
  out.x = (x / magnitude) * shaped;
  out.y = (y / magnitude) * shaped;
}

export class GamepadInputRuntime {
  private hotplug: HotplugState = INITIAL_HOTPLUG_STATE;
  private settings: GamepadSettings;
  private bindings: PadBindingProfile;
  private baseLayout: PadLayout | null = null;
  private layout: PadLayout | null = null;
  private layoutKey: string | null = null;
  /** Layout-identity parts compared without building a per-poll key string. */
  private layoutId: string | null = null;
  private layoutMapping: string | null = null;
  private layoutAxesLen = -1;
  /** Bindings identity the cached effective layout was built from. */
  private layoutBindings: PadBindingProfile | null = null;
  /** Base layout the cached effective layout was built from. */
  private layoutEffectiveBase: PadLayout | null = null;
  private previousButtons: boolean[] = [];
  /** Reused across polls so presence sampling allocates no per-frame arrays. */
  private scratchSamples: HotplugPadSample[] = [];
  /** Second edge buffer: poll swaps the pair so no per-frame boolean arrays allocate after warmup. */
  private scratchButtons: boolean[] = [];
  /** Hotplug sample objects, preallocated once and mutated in place. */
  private readonly samplePool: MutableSample[] = [];
  /** Per-action held/was/value snapshot for the live frame, preallocated once. */
  private readonly actionHeld: boolean[] = [];
  private readonly actionWas: boolean[] = [];
  private readonly actionValue: number[] = [];
  /** Live frame vectors, preallocated once and mutated in place. */
  private readonly frameMove: LiveVec = { x: 0, y: 0 };
  private readonly frameLook: LiveVec = { x: 0, y: 0 };
  private readonly frameDpad: LiveDpad = { up: false, down: false, left: false, right: false };
  private readonly frameDpadPressed: LiveDpad = { up: false, down: false, left: false, right: false };
  private liveRawLookMagnitude = 0;
  /** Stable frame callbacks, bound once: the hot poll never creates closures. */
  private readonly frameHeld = (action: PadAction): boolean => this.actionHeld[ACTION_INDEX[action]] === true;
  private readonly framePressed = (action: PadAction): boolean =>
    this.actionHeld[ACTION_INDEX[action]] === true && this.actionWas[ACTION_INDEX[action]] !== true;
  private readonly frameReleased = (action: PadAction): boolean =>
    this.actionHeld[ACTION_INDEX[action]] !== true && this.actionWas[ACTION_INDEX[action]] === true;
  private readonly frameValue = (action: PadAction): number => this.actionValue[ACTION_INDEX[action]] ?? 0;
  /** The single reused live frame returned by every connected poll. */
  private readonly liveFrame: GamepadFrame;
  private lastPadInputAt = 0;
  private lastKeyboardMouseInputAt = 0;
  private scheme: InputScheme = 'keyboard';
  private frames = 0;
  private lastFrame: GamepadFrame = IDLE_FRAME;
  private readonly rumbleAdapter: GamepadRumble;
  private readonly now: () => number;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  private readonly getGamepads: () => readonly (GamepadLike | null)[];
  /** Reused reducer event; a stable poll must not allocate an event object. */
  private readonly pollEvent: { type: 'poll'; pads: HotplugPadSample[]; at: number };
  private readonly schemeListeners = new Set<(scheme: InputScheme, layout: PadLayout | null) => void>();
  private readonly padListeners = new Set<(connected: boolean, layout: PadLayout | null) => void>();
  private captureBaseline: boolean[] | null = null;
  private detachListeners: (() => void) | null = null;

  constructor(deps: GamepadRuntimeDeps) {
    this.getGamepads = deps.getGamepads;
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
    this.now = deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.settings = readGamepadSettings(this.storage);
    this.bindings = resolvePadBindingProfile(this.storage);
    // Preallocate once: edge buffers at full button capacity, per-action
    // snapshots, and the hotplug sample pool. Lengths start at zero use; the
    // backing capacity is retained so steady-state polls never grow.
    for (let i = 0; i < MAX_PREALLOC_BUTTONS; i += 1) {
      this.previousButtons.push(false);
      this.scratchButtons.push(false);
    }
    this.previousButtons.length = 0;
    this.scratchButtons.length = 0;
    for (let a = 0; a < ACTION_COUNT; a += 1) {
      this.actionHeld.push(false);
      this.actionWas.push(false);
      this.actionValue.push(0);
    }
    for (let s = 0; s < MAX_PREALLOC_PADS; s += 1) {
      this.samplePool.push({ index: -1, id: '', connected: false, active: false });
    }
    this.pollEvent = { type: 'poll', pads: this.scratchSamples, at: 0 };
    this.liveFrame = {
      connected: true,
      layout: null,
      move: this.frameMove,
      look: this.frameLook,
      rawLookMagnitude: 0,
      dpad: this.frameDpad,
      dpadPressed: this.frameDpadPressed,
      held: this.frameHeld,
      pressed: this.framePressed,
      released: this.frameReleased,
      value: this.frameValue,
      anyInput: false,
    };
    this.rumbleAdapter = new GamepadRumble(() => this.activePad());
    this.rumbleAdapter.setEnabled(this.settings.rumble);
  }

  /** Subscribes to hot-plug events; safe to call once per page. */
  attach(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): void {
    if (this.detachListeners) return;
    const onConnected = (event: Event) => {
      const pad = (event as GamepadEvent).gamepad ?? (event as CustomEvent<{ gamepad?: GamepadLike }>).detail?.gamepad ?? null;
      if (pad && typeof pad.index === 'number') {
        this.applyHotplug(reduceHotplug(this.hotplug, { type: 'connected', index: pad.index, id: String(pad.id ?? ''), at: this.now() }));
      }
      // Some browsers hand back an event without a pad; the next poll reconciles.
    };
    const onDisconnected = (event: Event) => {
      const pad = (event as GamepadEvent).gamepad ?? (event as CustomEvent<{ gamepad?: GamepadLike }>).detail?.gamepad ?? null;
      if (pad && typeof pad.index === 'number') {
        this.applyHotplug(reduceHotplug(this.hotplug, { type: 'disconnected', index: pad.index, at: this.now() }));
      } else {
        this.reconcile(this.now());
      }
    };
    target.addEventListener('gamepadconnected', onConnected);
    target.addEventListener('gamepaddisconnected', onDisconnected);
    this.detachListeners = () => {
      target.removeEventListener('gamepadconnected', onConnected);
      target.removeEventListener('gamepaddisconnected', onDisconnected);
    };
  }

  detach(): void {
    this.detachListeners?.();
    this.detachListeners = null;
  }

  private safeGamepads(): readonly (GamepadLike | null)[] {
    try {
      return this.getGamepads() ?? EMPTY_GAMEPADS;
    } catch {
      return EMPTY_GAMEPADS;
    }
  }

  /**
   * Presence samples for the hotplug reducer. Reuses the preallocated pool:
   * no per-pad objects, no freezes, no layout lookups. Activity is any axis
   * beyond the deadzone or any button past the trigger threshold (a superset
   * of the old layout-mapped check — promotion only needs "this pad is in
   * use", and the layout is resolved separately in refreshLayout).
   */
  private samplePads(pads: readonly (GamepadLike | null)[]): HotplugPadSample[] {
    const samples = this.scratchSamples;
    let count = 0;
    for (let slot = 0; slot < pads.length; slot += 1) {
      const pad = pads[slot];
      if (!pad) continue;
      const index = typeof pad.index === 'number' ? pad.index : slot;
      let active = false;
      const axes = pad.axes;
      if (axes) {
        for (let a = 0; a < axes.length; a += 1) {
          const v = axes[a];
          if (v > ACTIVITY_DEADZONE || v < -ACTIVITY_DEADZONE) { active = true; break; }
        }
      }
      if (!active) {
        const padButtons = pad.buttons;
        if (padButtons) {
          for (let b = 0; b < padButtons.length; b += 1) {
            if (buttonPressed(padButtons[b], TRIGGER_PRESS_THRESHOLD)) { active = true; break; }
          }
        }
      }
      const connected = pad.connected !== false;
      const id = pad.id ?? '';
      let sample = this.samplePool[count];
      if (sample === undefined) {
        sample = { index, id, connected, active };
        this.samplePool[count] = sample;
      } else {
        sample.index = index;
        sample.id = id;
        sample.connected = connected;
        sample.active = active;
      }
      samples[count] = sample;
      count += 1;
    }
    samples.length = count;
    return samples;
  }

  private reconcile(at: number): readonly (GamepadLike | null)[] {
    const pads = this.safeGamepads();
    this.pollEvent.pads = this.samplePads(pads);
    this.pollEvent.at = at;
    this.applyHotplug(reduceHotplug(this.hotplug, this.pollEvent), pads);
    return pads;
  }

  private applyHotplug(next: HotplugState, pads: readonly (GamepadLike | null)[] | null = null): void {
    const wasConnected = hotplugConnected(this.hotplug);
    const previousActive = this.hotplug.activeIndex;
    this.hotplug = next;
    const connected = hotplugConnected(next);
    if (connected !== wasConnected || previousActive !== next.activeIndex) {
      this.captureBaseline = null;
      if (!connected) {
        this.baseLayout = null;
        this.layout = null;
        this.layoutKey = null;
        this.layoutId = null;
        this.layoutMapping = null;
        this.layoutAxesLen = -1;
        this.layoutBindings = null;
        this.lastPadInputAt = 0;
      }
      // Seed from the already-fetched pad list: refreshLayout(pad) below must
      // not re-fetch, or a connect poll costs two getGamepads() walks.
      // A button already held at the moment a pad connects (or is promoted by
      // activity) is "held", not "pressed": seed the edge baseline from the
      // live sample so the first frame cannot fire or jump without a fresh press.
      const pad = connected ? this.activePad(pads) : null;
      this.refreshLayout(pad);
      if (pad && this.layout) this.buttonStates(pad, this.layout, this.previousButtons);
      for (const listener of this.padListeners) listener(connected, this.layout);
      this.updateScheme();
    }
  }
  /**
   * Per-physical-index pressed truth for edge detection. Fire and ADS use the
   * analogue trigger threshold; everything else the digital one, so shared
   * buttons (reload/interact) see one consistent press. Writes into `target`
   * (the reused `previousButtons` buffer) so polls allocate no edge arrays.
   * Indices beyond the pad's button array read as released without growing
   * the buffer (the old code grew it by assignment; edge reads treat both as
   * "not held", so the behaviour is identical with a fixed capacity).
   */
  private buttonStates(pad: GamepadLike, layout: PadLayout, target: boolean[]): boolean[] {
    const buttons = pad.buttons ?? EMPTY_BUTTONS;
    const count = buttons.length;
    target.length = count;
    for (let i = 0; i < count; i += 1) target[i] = buttonPressed(buttons[i]);
    const fireIndex = layout.buttons.fire;
    if (fireIndex !== null && fireIndex >= 0 && fireIndex < count) {
      target[fireIndex] = buttonPressed(buttons[fireIndex], TRIGGER_PRESS_THRESHOLD);
    }
    const adsIndex = layout.buttons.ads;
    if (adsIndex !== null && adsIndex !== fireIndex && adsIndex >= 0 && adsIndex < count) {
      target[adsIndex] = buttonPressed(buttons[adsIndex], TRIGGER_PRESS_THRESHOLD);
    }
    return target;
  }

  private activePad(pads: readonly (GamepadLike | null)[] | null = null): GamepadLike | null {
    const index = this.hotplug.activeIndex;
    if (index === null) return null;
    const list = pads ?? this.safeGamepads();
    for (let i = 0; i < list.length; i += 1) {
      const pad = list[i];
      if (pad && (typeof pad.index === 'number' ? pad.index : -1) === index) return pad;
    }
    return index >= 0 && index < list.length ? (list[index] ?? null) : null;
  }

  private refreshLayout(pad: GamepadLike | null = this.activePad()): void {
    if (!pad) {
      this.baseLayout = null;
      this.layout = null;
      this.layoutKey = null;
      this.layoutId = null;
      this.layoutMapping = null;
      this.layoutAxesLen = -1;
      this.layoutBindings = null;
      this.layoutEffectiveBase = null;
      return;
    }
    // Identity compare without the old per-poll `${id}|${mapping}|${n}` string.
    const id = pad.id ?? '';
    const mapping = pad.mapping ?? '';
    const axesLen = pad.axes?.length ?? 4;
    if (id !== this.layoutId || mapping !== this.layoutMapping || axesLen !== this.layoutAxesLen || !this.baseLayout) {
      this.layoutId = id;
      this.layoutMapping = mapping;
      this.layoutAxesLen = axesLen;
      this.layoutKey = `${id}|${mapping}|${axesLen}`;
      this.baseLayout = detectPadLayout(id, mapping, axesLen);
    }
    // effectivePadLayout allocates when overrides exist: rebuild only when the
    // base layout or the bindings identity actually changed.
    if (this.layout === null || this.layoutBindings !== this.bindings || this.layoutEffectiveBase !== this.baseLayout) {
      this.layout = effectivePadLayout(this.baseLayout, this.bindings);
      this.layoutBindings = this.bindings;
      this.layoutEffectiveBase = this.baseLayout;
    }
  }

  private updateScheme(): void {
    const next = selectInputScheme(hotplugConnected(this.hotplug), this.lastPadInputAt, this.lastKeyboardMouseInputAt);
    if (next === this.scheme) return;
    this.scheme = next;
    for (const listener of this.schemeListeners) listener(next, this.layout);
  }

  /** Keyboard or mouse activity: hands the HUD prompts back to key labels. */
  notifyKeyboardMouse(at = this.now()): void {
    this.lastKeyboardMouseInputAt = Math.max(this.lastKeyboardMouseInputAt, at);
    this.updateScheme();
  }

  /**
   * Hot-plug reconciliation without consuming a frame. The menu does not run
   * the gameplay poll, so the Options panel calls this on a slow timer to show
   * a pad that was already connected when the page loaded.
   */
  reconcilePresence(at = this.now()): void {
    this.reconcile(at);
  }

  /**
   * One frame of input. Reconciles hot-plug state against the live pad list
   * first. Steady-state polling allocates nothing: sticks shape into the
   * preallocated vectors, edges land in the preallocated action snapshots,
   * and the returned frame is always the same live object (mutated in place).
   * The browser's own `getGamepads()` return is the only per-frame structure
   * the poll walks; it is never copied into a fresh container.
   */
  poll(at = this.now()): GamepadFrame {
    this.frames += 1;
    const pads = this.reconcile(at);
    const index = this.hotplug.activeIndex;
    let pad: GamepadLike | null = null;
    if (index !== null) {
      for (let i = 0; i < pads.length; i += 1) {
        const candidate = pads[i];
        if (candidate && (typeof candidate.index === 'number' ? candidate.index : -1) === index) { pad = candidate; break; }
      }
      if (!pad && index >= 0 && index < pads.length) pad = pads[index] ?? null;
    }
    if (!pad || !this.settings.enabled) {
      this.previousButtons.length = 0;
      this.scratchButtons.length = 0;
      this.lastFrame = IDLE_FRAME;
      return IDLE_FRAME;
    }
    this.refreshLayout(pad);
    const layout = this.layout!;
    const axes = pad.axes ?? EMPTY_AXES;
    const moveXRaw = axes[layout.axes.moveX] ?? 0;
    const moveYRaw = axes[layout.axes.moveY] ?? 0;
    const lookXRaw = axes[layout.axes.lookX] ?? 0;
    const lookYRaw = axes[layout.axes.lookY] ?? 0;
    shapeStickInto(moveXRaw, moveYRaw, this.settings.moveCurve, this.frameMove);
    shapeStickInto(lookXRaw, lookYRaw, this.settings.lookCurve, this.frameLook);
    const sensitivity = this.settings.lookSensitivity;
    this.frameLook.x *= sensitivity;
    if (this.settings.invertLookY) this.frameLook.y = -this.frameLook.y;
    this.frameLook.y *= sensitivity;
    const padButtons = pad.buttons ?? EMPTY_BUTTONS;
    const previous = this.previousButtons;
    // Per-action snapshot into the preallocated arrays (no closures, no maps).
    for (let a = 0; a < ACTION_COUNT; a += 1) {
      const action = PAD_ACTIONS[a];
      const buttonIndex = layout.buttons[action];
      if (buttonIndex === null) {
        this.actionHeld[a] = false;
        this.actionWas[a] = false;
        this.actionValue[a] = 0;
        continue;
      }
      const button = buttonIndex >= 0 && buttonIndex < padButtons.length ? padButtons[buttonIndex] : undefined;
      const held = (action === 'fire' || action === 'ads')
        ? buttonPressed(button, TRIGGER_PRESS_THRESHOLD)
        : buttonPressed(button);
      this.actionHeld[a] = held;
      this.actionWas[a] = buttonIndex >= 0 && buttonIndex < previous.length && previous[buttonIndex] === true;
      if (!button) {
        this.actionValue[a] = 0;
      } else if (Number.isFinite(button.value)) {
        const pressedOne = button.pressed ? 1 : 0;
        this.actionValue[a] = button.value > pressedOne ? button.value : pressedOne;
      } else {
        this.actionValue[a] = button.pressed ? 1 : 0;
      }
    }
    // Raw d-pad (physical 12–15) rides alongside the semantic map so menus work under any remap.
    const dpadUp = buttonPressed(padButtons[12]);
    const dpadDown = buttonPressed(padButtons[13]);
    const dpadLeft = buttonPressed(padButtons[14]);
    const dpadRight = buttonPressed(padButtons[15]);
    this.frameDpad.up = dpadUp;
    this.frameDpad.down = dpadDown;
    this.frameDpad.left = dpadLeft;
    this.frameDpad.right = dpadRight;
    this.frameDpadPressed.up = dpadUp && previous[12] !== true;
    this.frameDpadPressed.down = dpadDown && previous[13] !== true;
    this.frameDpadPressed.left = dpadLeft && previous[14] !== true;
    this.frameDpadPressed.right = dpadRight && previous[15] !== true;
    // anyInput matches the legacy semantics exactly: any physical button past
    // the digital threshold, or fire/ads past the analogue trigger threshold
    // (triggers often sit below the digital threshold while held).
    let physicalAny = false;
    for (let i = 0; i < padButtons.length; i += 1) {
      if (buttonPressed(padButtons[i])) { physicalAny = true; break; }
    }
    const anyInput = this.frameMove.x !== 0 || this.frameMove.y !== 0
      || this.frameLook.x !== 0 || this.frameLook.y !== 0 || physicalAny
      || this.actionHeld[ACTION_INDEX.fire] === true || this.actionHeld[ACTION_INDEX.ads] === true;
    if (anyInput) {
      this.lastPadInputAt = Math.max(this.lastPadInputAt, at);
      this.updateScheme();
    }
    // Swap the edge pair instead of allocating: the action snapshots above
    // already captured this frame's edges, so the swap only re-seeds the
    // baseline for the next poll.
    this.buttonStates(pad, layout, this.scratchButtons);
    const finished = this.scratchButtons;
    this.scratchButtons = this.previousButtons;
    this.previousButtons = finished;
    this.liveRawLookMagnitude = Math.min(1, Math.hypot(lookXRaw, lookYRaw));
    const live = this.liveFrame as unknown as {
      layout: PadLayout | null;
      rawLookMagnitude: number;
      anyInput: boolean;
    };
    live.layout = layout;
    live.rawLookMagnitude = this.liveRawLookMagnitude;
    live.anyInput = anyInput;
    this.lastFrame = this.liveFrame;
    return this.liveFrame;
  }

  /** Starts listening for the next newly pressed physical button on the active pad. */
  beginButtonCapture(): boolean {
    const pad = this.activePad();
    if (!pad) return false;
    this.captureBaseline = (pad.buttons ?? []).map((button) => buttonPressed(button, TRIGGER_PRESS_THRESHOLD));
    return true;
  }

  cancelButtonCapture(): void {
    this.captureBaseline = null;
  }

  /** Returns the first button that went from released to pressed since capture began, or null. */
  sampleButtonCapture(): number | null {
    if (!this.captureBaseline) return null;
    const pad = this.activePad();
    if (!pad) return null;
    const buttons = pad.buttons ?? [];
    for (let index = 0; index < buttons.length; index += 1) {
      if (buttonPressed(buttons[index], TRIGGER_PRESS_THRESHOLD) && !this.captureBaseline[index]) {
        this.captureBaseline = null;
        return index;
      }
    }
    // A button released after capture began may be pressed again later.
    this.captureBaseline = buttons.map((button, index) => this.captureBaseline![index] === true && buttonPressed(button, TRIGGER_PRESS_THRESHOLD));
    return null;
  }

  // ---- Settings + bindings ------------------------------------------------

  getSettings(): GamepadSettings {
    return this.settings;
  }

  /**
   * Normalises on the way IN, not only on the way to storage: an out-of-limit
   * curve from any non-range writer used to sit in the live settings until the
   * next reload silently clamped it.
   */
  updateSettings(patch: Partial<Omit<GamepadSettings, 'version'>>): GamepadSettings {
    this.settings = normalizeGamepadSettings({ ...this.settings, ...patch });
    this.rumbleAdapter.setEnabled(this.settings.rumble);
    writeGamepadSettings(this.settings, this.storage);
    return this.settings;
  }

  resetSettings(): GamepadSettings {
    this.settings = readGamepadSettings(null);
    this.rumbleAdapter.setEnabled(this.settings.rumble);
    clearGamepadSettings(this.storage);
    return this.settings;
  }

  getBindings(): PadBindingProfile {
    return this.bindings;
  }

  rebind(action: PadAction, index: number): PadRebindResult {
    const base = this.baseLayout;
    if (!base) return Object.freeze({ ok: false, reason: 'invalid' });
    const result = rebindPadAction(this.bindings, base, action, index);
    if (result.ok) {
      this.bindings = result.profile;
      savePadBindingProfile(this.bindings, this.storage);
      this.refreshLayout();
    }
    return result;
  }

  resetBindings(): void {
    this.bindings = Object.freeze({});
    clearPadBindingProfile(this.storage);
    this.refreshLayout();
  }

  bindingsAreDefault(): boolean {
    return this.baseLayout ? isDefaultPadBindings(this.baseLayout, this.bindings) : Object.keys(this.bindings).length === 0;
  }

  // ---- Accessors ----------------------------------------------------------

  connected(): boolean {
    return hotplugConnected(this.hotplug);
  }

  activeLayout(): PadLayout | null {
    return this.layout;
  }

  /** The un-remapped layout, for the settings UI to show defaults beside overrides. */
  baseActiveLayout(): PadLayout | null {
    return this.baseLayout;
  }

  currentScheme(): InputScheme {
    return this.scheme;
  }

  latestFrame(): GamepadFrame {
    return this.lastFrame;
  }

  onSchemeChange(listener: (scheme: InputScheme, layout: PadLayout | null) => void): () => void {
    this.schemeListeners.add(listener);
    return () => this.schemeListeners.delete(listener);
  }

  onPadChange(listener: (connected: boolean, layout: PadLayout | null) => void): () => void {
    this.padListeners.add(listener);
    return () => this.padListeners.delete(listener);
  }

  rumble(kind: RumbleKind, at = this.now()): boolean {
    return this.rumbleAdapter.pulse(kind, at);
  }

  telemetry(): GamepadTelemetry {
    return Object.freeze({
      connected: this.connected(),
      activeIndex: this.hotplug.activeIndex,
      activeId: this.hotplug.activeId,
      model: this.layout?.displayName ?? null,
      family: this.layout?.family ?? null,
      layoutId: this.layout?.layoutId ?? null,
      mapping: this.layoutKey?.split('|')[1] ?? null,
      connectCount: this.hotplug.connectCount,
      disconnectCount: this.hotplug.disconnectCount,
      scheme: this.scheme,
      lastPadInputAt: this.lastPadInputAt,
      lastKeyboardMouseInputAt: this.lastKeyboardMouseInputAt,
      settings: this.settings,
      defaultBindings: this.bindingsAreDefault(),
      rumble: this.rumbleAdapter.telemetry(),
      frames: this.frames,
    });
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
