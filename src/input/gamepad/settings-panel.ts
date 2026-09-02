/**
 * Gamepad section of the Options panel (PASS 84 Lane E): live pad status,
 * per-stick inner/outer deadzone + response-curve sliders, invert-Y, rumble
 * switch, the fairness
 * tier read-out and pad button remapping with reset-to-defaults. The markup
 * lives in the shell (`pass64-shell.ts`); this module only binds it.
 */

import { DEFAULT_GAMEPAD_SETTINGS, STICK_CURVE_LIMITS, type GamepadSettings } from './curves';
import type { GamepadInputRuntime } from './gamepad-input';
import { PAD_ACTION_LABELS, PAD_ACTIONS, padButtonGlyph, type PadAction, type PadLayout } from './mapping';

export const GAMEPAD_SETTINGS_IDS = Object.freeze({
  section: 'gamepad-settings',
  status: 'gamepad-status',
  statusRow: 'gamepad-status-row',
  moveDeadzone: 'gamepad-move-deadzone',
  moveOuter: 'gamepad-move-outer',
  moveCurve: 'gamepad-move-curve',
  lookDeadzone: 'gamepad-look-deadzone',
  lookOuter: 'gamepad-look-outer',
  lookCurve: 'gamepad-look-curve',
  invertY: 'gamepad-invert-y',
  rumble: 'gamepad-rumble',
  bindingRows: 'gamepad-binding-rows',
  bindingsStatus: 'gamepad-bindings-status',
  bindingsReset: 'gamepad-bindings-reset',
  settingsReset: 'gamepad-settings-reset',
  assistRow: 'gamepad-assist-row',
});

/** Options panel markup; rendered by the shell so the surface inventory sees one root id. */
export function gamepadSettingsMarkup(): string {
  const ids = GAMEPAD_SETTINGS_IDS;
  const dz = STICK_CURVE_LIMITS.deadzone;
  const ex = STICK_CURVE_LIMITS.exponent;
  const ou = STICK_CURVE_LIMITS.outer;
  const d = DEFAULT_GAMEPAD_SETTINGS;
  return `<section id="${ids.section}" class="settings-section" aria-labelledby="gamepad-settings-title">
      <header><b id="gamepad-settings-title">GAMEPAD</b><span id="${ids.status}">NO PAD DETECTED · PRESS ANY BUTTON</span><button id="${ids.settingsReset}" type="button">RESET STICKS</button></header>
      <div class="gamepad-status-row" id="${ids.statusRow}" data-connected="false"><b>DISCONNECTED</b><span>Plug in or pair a pad, then press any button. Works mid-match; no click or mouse capture needed.</span></div>
      <div class="settings-grid">
        <label>MOVE STICK DEADZONE<input id="${ids.moveDeadzone}" type="range" min="${dz.min}" max="${dz.max}" step="0.01" value="${d.moveCurve.deadzone}"></label>
        <label>MOVE OUTER DEADZONE<input id="${ids.moveOuter}" type="range" min="${ou.min}" max="${ou.max}" step="0.01" value="${d.moveCurve.outer}"></label>
        <label>MOVE RESPONSE CURVE<input id="${ids.moveCurve}" type="range" min="${ex.min}" max="${ex.max}" step="0.05" value="${d.moveCurve.exponent}"></label>
        <label>LOOK STICK DEADZONE<input id="${ids.lookDeadzone}" type="range" min="${dz.min}" max="${dz.max}" step="0.01" value="${d.lookCurve.deadzone}"></label>
        <label>LOOK OUTER DEADZONE<input id="${ids.lookOuter}" type="range" min="${ou.min}" max="${ou.max}" step="0.01" value="${d.lookCurve.outer}"></label>
        <label>LOOK RESPONSE CURVE<input id="${ids.lookCurve}" type="range" min="${ex.min}" max="${ex.max}" step="0.05" value="${d.lookCurve.exponent}"></label>
        <label class="setting-check"><input id="${ids.invertY}" type="checkbox"> INVERT LOOK Y</label>
        <label class="setting-check"><input id="${ids.rumble}" type="checkbox" checked> RUMBLE (FIRE / HIT / DAMAGE)</label>
      </div>
      <div class="gamepad-assist-row" id="${ids.assistRow}" role="group" aria-label="Aim assist by input">
        <div data-tier="touch"><b>TOUCH · STRONG</b>slow 40% inside 2.4°, friction 0.6</div>
        <div data-tier="pad"><b>PAD · MEDIUM</b>slow 55% inside 1.6°, friction 0.35</div>
        <div data-tier="mouse"><b>MOUSE · NONE</b>no assist</div>
      </div>
      <header><b>PAD BUTTONS</b><span id="${ids.bindingsStatus}">DEFAULT LAYOUT</span><button id="${ids.bindingsReset}" type="button">RESET TO DEFAULTS</button></header>
      <div class="key-binding-grid" id="${ids.bindingRows}"></div>
      <p class="gamepad-note">Aim assist is fixed by input for fairness in shared lobbies: touch gets the strongest, pad medium, mouse none. Rebind a button by clicking REBIND then pressing the pad button; conflicts are rejected. Layouts are remembered per pad type on this browser.</p>
    </section>`;
}

type PanelDocument = Pick<Document, 'getElementById' | 'querySelector'>;

function byId<T extends HTMLElement>(doc: PanelDocument, id: string): T | null {
  return doc.getElementById(id) as T | null;
}

export type GamepadSettingsPanel = Readonly<{
  refresh: () => void;
  /** Called from the frame loop so a capture-in-progress can see the pressed button. */
  poll: () => void;
  dispose: () => void;
}>;

export type GamepadSettingsPanelOptions = Readonly<{
  currentTier?: () => 'mouse' | 'pad' | 'touch';
  /**
   * Visibility observer for the section (defaults to the page's
   * IntersectionObserver). The slow pad-presence timer runs only while the
   * Options surface is actually on screen; injected for tests.
   */
  intersectionObserver?: typeof IntersectionObserver | null;
}>;

/** How often the Options panel re-checks `navigator.getGamepads()` while visible. */
export const GAMEPAD_PRESENCE_INTERVAL_MS = 500;

export function bindGamepadSettingsPanel(
  doc: PanelDocument,
  runtime: GamepadInputRuntime,
  options: GamepadSettingsPanelOptions = {},
): GamepadSettingsPanel | null {
  const ids = GAMEPAD_SETTINGS_IDS;
  const section = byId<HTMLElement>(doc, ids.section);
  if (!section) return null;
  const status = byId<HTMLElement>(doc, ids.status);
  const statusRow = byId<HTMLElement>(doc, ids.statusRow);
  const moveDeadzone = byId<HTMLInputElement>(doc, ids.moveDeadzone);
  const moveOuter = byId<HTMLInputElement>(doc, ids.moveOuter);
  const moveCurve = byId<HTMLInputElement>(doc, ids.moveCurve);
  const lookDeadzone = byId<HTMLInputElement>(doc, ids.lookDeadzone);
  const lookOuter = byId<HTMLInputElement>(doc, ids.lookOuter);
  const lookCurve = byId<HTMLInputElement>(doc, ids.lookCurve);
  const sliders = [moveDeadzone, moveOuter, moveCurve, lookDeadzone, lookOuter, lookCurve];
  const invertY = byId<HTMLInputElement>(doc, ids.invertY);
  const rumble = byId<HTMLInputElement>(doc, ids.rumble);
  const rows = byId<HTMLElement>(doc, ids.bindingRows);
  const bindingsStatus = byId<HTMLElement>(doc, ids.bindingsStatus);
  const bindingsReset = byId<HTMLButtonElement>(doc, ids.bindingsReset);
  const settingsReset = byId<HTMLButtonElement>(doc, ids.settingsReset);
  const assistRow = byId<HTMLElement>(doc, ids.assistRow);
  let captureAction: PadAction | null = null;

  const writeSettingsInputs = (settings: GamepadSettings): void => {
    if (moveDeadzone) moveDeadzone.value = String(settings.moveCurve.deadzone);
    if (moveOuter) moveOuter.value = String(settings.moveCurve.outer);
    if (moveCurve) moveCurve.value = String(settings.moveCurve.exponent);
    if (lookDeadzone) lookDeadzone.value = String(settings.lookCurve.deadzone);
    if (lookOuter) lookOuter.value = String(settings.lookCurve.outer);
    if (lookCurve) lookCurve.value = String(settings.lookCurve.exponent);
    if (invertY) invertY.checked = settings.invertLookY;
    if (rumble) rumble.checked = settings.rumble;
  };

  const renderRows = (): void => {
    if (!rows) return;
    const layout: PadLayout | null = runtime.activeLayout();
    const base = runtime.baseActiveLayout();
    if (!layout || !base) {
      rows.innerHTML = '<div class="key-binding-row"><span class="binding-action">Connect a pad to see and change its buttons.</span></div>';
      if (bindingsStatus) bindingsStatus.textContent = 'NO PAD';
      return;
    }
    rows.innerHTML = PAD_ACTIONS.map((action) => {
      const index = layout.buttons[action];
      const capturing = captureAction === action;
      const defaultIndex = base.buttons[action];
      const changed = index !== defaultIndex;
      const label = capturing ? 'PRESS A PAD BUTTON…' : padButtonGlyph(layout, index);
      return `<div class="key-binding-row${capturing ? ' capturing' : ''}" data-pad-action="${action}">
      <span class="binding-action">${PAD_ACTION_LABELS[action]}${changed ? ' <small>(CUSTOM)</small>' : ''}</span>
      <kbd class="pad-glyph" data-family="${layout.family}" data-button="${index ?? ''}" data-unbound="${index === null ? 'true' : 'false'}">${label}</kbd>
      <button type="button" data-pad-rebind="${action}">${capturing ? 'CANCEL' : 'REBIND'}</button>
    </div>`;
    }).join('');
    if (bindingsStatus) bindingsStatus.textContent = runtime.bindingsAreDefault() ? 'DEFAULT LAYOUT' : 'CUSTOM LAYOUT';
  };

  const renderStatus = (): void => {
    const layout = runtime.activeLayout();
    const telemetry = runtime.telemetry();
    const connected = telemetry.connected && layout !== null;
    if (statusRow) {
      statusRow.dataset.connected = String(connected);
      const cap = statusRow.querySelector('b');
      const text = statusRow.querySelector('span');
      if (cap) cap.textContent = connected ? `${layout!.displayName.toUpperCase()} · ${layout!.family.toUpperCase()} FACES` : 'DISCONNECTED';
      if (text) {
        text.textContent = connected
          ? `${telemetry.activeId ?? ''} · mapping ${telemetry.mapping === 'standard' ? 'standard' : 'fallback table'} · prompts follow the last input used`
          : 'Plug in or pair a pad, then press any button. Works mid-match; no click or mouse capture needed.';
      }
    }
    if (status) status.textContent = connected ? `${layout!.displayName.toUpperCase()} CONNECTED` : 'NO PAD DETECTED · PRESS ANY BUTTON';
    if (assistRow) {
      const tier = options.currentTier?.() ?? (connected ? 'pad' : 'mouse');
      assistRow.querySelectorAll<HTMLElement>('[data-tier]').forEach((cell) => {
        cell.dataset.active = String(cell.dataset.tier === tier);
      });
    }
  };

  const refresh = (): void => {
    writeSettingsInputs(runtime.getSettings());
    renderStatus();
    renderRows();
  };

  const onRowsClick = (event: Event): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-pad-rebind]');
    if (!button) return;
    const action = button.dataset.padRebind as PadAction | undefined;
    if (!action || !PAD_ACTIONS.includes(action)) return;
    if (captureAction === action) {
      captureAction = null;
      runtime.cancelButtonCapture();
    } else if (runtime.beginButtonCapture()) {
      captureAction = action;
    }
    renderRows();
  };
  rows?.addEventListener('click', onRowsClick);

  const onBindingsReset = (): void => {
    runtime.resetBindings();
    captureAction = null;
    runtime.cancelButtonCapture();
    refresh();
  };
  bindingsReset?.addEventListener('click', onBindingsReset);

  const onSettingsReset = (): void => {
    runtime.resetSettings();
    refresh();
  };
  settingsReset?.addEventListener('click', onSettingsReset);

  const sliderValue = (input: HTMLInputElement | null, fallback: number): number => {
    const value = Number(input?.value);
    return input && Number.isFinite(value) ? value : fallback;
  };
  const onSlider = (): void => {
    const current = runtime.getSettings();
    runtime.updateSettings({
      moveCurve: {
        deadzone: sliderValue(moveDeadzone, current.moveCurve.deadzone),
        outer: sliderValue(moveOuter, current.moveCurve.outer),
        exponent: sliderValue(moveCurve, current.moveCurve.exponent),
      },
      lookCurve: {
        deadzone: sliderValue(lookDeadzone, current.lookCurve.deadzone),
        outer: sliderValue(lookOuter, current.lookCurve.outer),
        exponent: sliderValue(lookCurve, current.lookCurve.exponent),
      },
      invertLookY: invertY?.checked ?? current.invertLookY,
      rumble: rumble?.checked ?? current.rumble,
    });
  };
  for (const input of sliders) input?.addEventListener('input', onSlider);
  for (const input of [invertY, rumble]) input?.addEventListener('change', onSlider);

  const offPad = runtime.onPadChange(() => refresh());
  const offScheme = runtime.onSchemeChange(() => renderStatus());

  const poll = (): void => {
    if (captureAction === null) return;
    const index = runtime.sampleButtonCapture();
    if (index === null) return;
    const result = runtime.rebind(captureAction, index);
    if (result.ok) {
      captureAction = null;
      renderRows();
      return;
    }
    const row = rows?.querySelector<HTMLElement>(`[data-pad-action="${captureAction}"]`);
    if (row) {
      row.classList.add('conflict-flash');
      setTimeout(() => row.classList.remove('conflict-flash'), 500);
    }
    // Keep capturing so the player can try another button.
    runtime.beginButtonCapture();
  };

  // The lobby and pause menus do not run the gameplay input poll, so a capture
  // in progress drives its own animation-frame loop, and pad presence is
  // reconciled on a slow timer so an already-connected pad shows up before a
  // match starts.
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  let captureLoopActive = false;
  const captureLoop = (): void => {
    if (captureAction === null || !raf) {
      captureLoopActive = false;
      return;
    }
    poll();
    raf(captureLoop);
  };
  const ensureCaptureLoop = (): void => {
    if (captureLoopActive || captureAction === null || !raf) return;
    captureLoopActive = true;
    raf(captureLoop);
  };
  // Presence polling costs a `navigator.getGamepads()` walk per tick, so it
  // runs only while this section is on screen (lobby/pause Options tab) and
  // stops the moment the menu hides; gameplay has its own per-frame poll.
  let presenceTimer: ReturnType<typeof setInterval> | null = null;
  const startPresence = (): void => {
    if (presenceTimer !== null || typeof setInterval !== 'function') return;
    runtime.reconcilePresence();
    presenceTimer = setInterval(() => runtime.reconcilePresence(), GAMEPAD_PRESENCE_INTERVAL_MS);
  };
  const stopPresence = (): void => {
    if (presenceTimer === null) return;
    clearInterval(presenceTimer);
    presenceTimer = null;
  };
  const Observer = options.intersectionObserver === undefined
    ? (typeof IntersectionObserver === 'function' ? IntersectionObserver : null)
    : options.intersectionObserver;
  let visibility: IntersectionObserver | null = null;
  if (Observer) {
    visibility = new Observer((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) startPresence();
      else stopPresence();
    });
    visibility.observe(section);
  } else {
    startPresence();
  }
  const rowsClickWithCapture = (event: Event): void => {
    onRowsClick(event);
    ensureCaptureLoop();
  };
  rows?.removeEventListener('click', onRowsClick);
  rows?.addEventListener('click', rowsClickWithCapture);

  refresh();
  return Object.freeze({
    refresh,
    poll,
    dispose: () => {
      rows?.removeEventListener('click', rowsClickWithCapture);
      bindingsReset?.removeEventListener('click', onBindingsReset);
      settingsReset?.removeEventListener('click', onSettingsReset);
      for (const input of sliders) input?.removeEventListener('input', onSlider);
      for (const input of [invertY, rumble]) input?.removeEventListener('change', onSlider);
      visibility?.disconnect();
      stopPresence();
      captureAction = null;
      offPad();
      offScheme();
    },
  });
}
