/**
 * Gamepad input runtime (PASS 84 Lane E). Owns hot-plug tracking, model
 * detection, the remap profile, stick shaping, per-frame button edges, the
 * active input scheme (keyboard/mouse vs pad) and rumble. The game loop calls
 * `poll()` once per frame and reads one immutable `GamepadFrame`; nothing in
 * here touches gameplay state.
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
  shapeStick,
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

export class GamepadInputRuntime {
  private hotplug: HotplugState = INITIAL_HOTPLUG_STATE;
  private settings: GamepadSettings;
  private bindings: PadBindingProfile;
  private baseLayout: PadLayout | null = null;
  private layout: PadLayout | null = null;
  private layoutKey: string | null = null;
  private previousButtons: boolean[] = [];
  /** Reused across polls so presence sampling allocates no per-frame arrays. */
  private scratchSamples: HotplugPadSample[] = [];
  /** Second edge buffer: poll swaps the pair so no per-frame boolean arrays allocate after warmup. */
  private scratchButtons: boolean[] = [];
  private lastPadInputAt = 0;
  private lastKeyboardMouseInputAt = 0;
  private scheme: InputScheme = 'keyboard';
  private frames = 0;
  private lastFrame: GamepadFrame = IDLE_FRAME;
  private readonly rumbleAdapter: GamepadRumble;
  private readonly now: () => number;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  private readonly getGamepads: () => readonly (GamepadLike | null)[];
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
      return this.getGamepads() ?? [];
    } catch {
      return [];
    }
  }

  private samplePads(pads: readonly (GamepadLike | null)[]): HotplugPadSample[] {
    const samples = this.scratchSamples;
    samples.length = 0;
    pads.forEach((pad, slot) => {
      if (!pad) return;
      const index = typeof pad.index === 'number' ? pad.index : slot;
      const layout = detectPadLayout(String(pad.id ?? ''), String(pad.mapping ?? ''), pad.axes?.length ?? 4);
      const axisActive = [layout.axes.moveX, layout.axes.moveY, layout.axes.lookX, layout.axes.lookY]
        .some((axis) => Math.abs(pad.axes?.[axis] ?? 0) > ACTIVITY_DEADZONE);
      const buttonActive = (pad.buttons ?? []).some((button) => buttonPressed(button, TRIGGER_PRESS_THRESHOLD));
      samples.push(Object.freeze({ index, id: String(pad.id ?? ''), connected: pad.connected !== false, active: axisActive || buttonActive }));
    });
    return samples;
  }

  private reconcile(at: number): readonly (GamepadLike | null)[] {
    const pads = this.safeGamepads();
    this.applyHotplug(reduceHotplug(this.hotplug, { type: 'poll', pads: this.samplePads(pads), at }), pads);
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
   */
  private buttonStates(pad: GamepadLike, layout: PadLayout, target: boolean[] = []): boolean[] {
    const buttons = pad.buttons ?? [];
    target.length = buttons.length;
    for (let i = 0; i < buttons.length; i += 1) target[i] = buttonPressed(buttons[i]);
    for (const action of ['fire', 'ads'] as const) {
      const buttonIndex = layout.buttons[action];
      if (buttonIndex !== null) target[buttonIndex] = buttonPressed(pad.buttons?.[buttonIndex], TRIGGER_PRESS_THRESHOLD);
    }
    return target;
  }

  private activePad(pads: readonly (GamepadLike | null)[] | null = null): GamepadLike | null {
    const index = this.hotplug.activeIndex;
    if (index === null) return null;
    const list = pads ?? this.safeGamepads();
    return list.find((pad) => pad && (typeof pad.index === 'number' ? pad.index : -1) === index)
      ?? list[index]
      ?? null;
  }

  private refreshLayout(pad: GamepadLike | null = this.activePad()): void {
    if (!pad) {
      this.baseLayout = null;
      this.layout = null;
      this.layoutKey = null;
      return;
    }
    const key = `${pad.id}|${pad.mapping}|${pad.axes?.length ?? 4}`;
    if (key !== this.layoutKey || !this.baseLayout) {
      this.layoutKey = key;
      this.baseLayout = detectPadLayout(String(pad.id ?? ''), String(pad.mapping ?? ''), pad.axes?.length ?? 4);
    }
    this.layout = effectivePadLayout(this.baseLayout, this.bindings);
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

  /** One frame of input. Reconciles hot-plug state against the live pad list first. */
  poll(at = this.now()): GamepadFrame {
    this.frames += 1;
    const pads = this.reconcile(at);
    const index = this.hotplug.activeIndex;
    const pad = index === null ? null : pads.find((candidate) => candidate && (typeof candidate.index === 'number' ? candidate.index : -1) === index) ?? pads[index] ?? null;
    if (!pad || !this.settings.enabled) {
      this.previousButtons.length = 0;
      this.scratchButtons.length = 0;
      this.lastFrame = IDLE_FRAME;
      return IDLE_FRAME;
    }
    this.refreshLayout(pad);
    const layout = this.layout!;
    const axes = pad.axes ?? [];
    const rawMove = { x: axes[layout.axes.moveX] ?? 0, y: axes[layout.axes.moveY] ?? 0 };
    const rawLook = { x: axes[layout.axes.lookX] ?? 0, y: axes[layout.axes.lookY] ?? 0 };
    const move = shapeStick(rawMove.x, rawMove.y, this.settings.moveCurve);
    const shapedLook = shapeStick(rawLook.x, rawLook.y, this.settings.lookCurve);
    const sensitivity = this.settings.lookSensitivity;
    const look = {
      x: shapedLook.x * sensitivity,
      y: (this.settings.invertLookY ? -shapedLook.y : shapedLook.y) * sensitivity,
    };
    const buttons = (pad.buttons ?? []).map((button) => buttonPressed(button));
    const triggerValue = (action: PadAction): number => {
      const buttonIndex = layout.buttons[action];
      if (buttonIndex === null) return 0;
      const button = pad.buttons?.[buttonIndex];
      if (!button) return 0;
      return Number.isFinite(button.value) ? Math.max(button.pressed ? 1 : 0, button.value) : (button.pressed ? 1 : 0);
    };
    const isHeld = (action: PadAction): boolean => {
      const buttonIndex = layout.buttons[action];
      if (buttonIndex === null) return false;
      if (action === 'fire' || action === 'ads') return buttonPressed(pad.buttons?.[buttonIndex], TRIGGER_PRESS_THRESHOLD);
      return buttons[buttonIndex] === true;
    };
    const previous = this.previousButtons;
    const actionIndex = (action: PadAction): number => PAD_ACTIONS.indexOf(action);
    const wasHeldByIndex = (index: number): boolean => {
      const buttonIndex = layout.buttons[PAD_ACTIONS[index]];
      return buttonIndex !== null && previous[buttonIndex] === true;
    };
    // Per-frame edge snapshot: owned by this frame so retained frames stay
    // valid after the shared baseline buffers swap underneath them.
    const heldList: boolean[] = PAD_ACTIONS.map((action) => isHeld(action));
    const wasList: boolean[] = PAD_ACTIONS.map((_, index) => wasHeldByIndex(index));
    // Raw d-pad (physical 12–15) rides alongside the semantic map so menus work under any remap.
    const dpadRaw = (i: number): boolean => buttonPressed(pad.buttons?.[i]);
    const dpad = Object.freeze({
      up: dpadRaw(12),
      down: dpadRaw(13),
      left: dpadRaw(14),
      right: dpadRaw(15),
    });
    const dpadWas = (i: number): boolean => previous[i] === true;
    const dpadPressed = Object.freeze({
      up: dpad.up && !dpadWas(12),
      down: dpad.down && !dpadWas(13),
      left: dpad.left && !dpadWas(14),
      right: dpad.right && !dpadWas(15),
    });
    const anyInput = move.x !== 0 || move.y !== 0 || shapedLook.x !== 0 || shapedLook.y !== 0 || buttons.some(Boolean)
      || heldList[actionIndex('fire')] === true || heldList[actionIndex('ads')] === true;
    if (anyInput) {
      this.lastPadInputAt = Math.max(this.lastPadInputAt, at);
      this.updateScheme();
    }
    // Swap the edge pair instead of allocating: the snapshot above keeps this
    // frame's closures valid while the old baseline buffer becomes next frame's scratch.
    this.buttonStates(pad, layout, this.scratchButtons);
    const finished = this.scratchButtons;
    this.scratchButtons = this.previousButtons;
    this.previousButtons = finished;
    const frame: GamepadFrame = Object.freeze({
      connected: true,
      layout,
      move: Object.freeze(move),
      look: Object.freeze(look),
      rawLookMagnitude: Math.min(1, Math.hypot(rawLook.x, rawLook.y)),
      dpad,
      dpadPressed,
      held: (action) => heldList[actionIndex(action)] === true,
      pressed: (action) => heldList[actionIndex(action)] === true && wasList[actionIndex(action)] !== true,
      released: (action) => heldList[actionIndex(action)] !== true && wasList[actionIndex(action)] === true,
      value: triggerValue,
      anyInput,
    });
    this.lastFrame = frame;
    return frame;
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
