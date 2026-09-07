import * as THREE from 'three';
import { applyRadialDeadzone } from './gameplay';

/**
 * Mobile touch controls: a left virtual thumbstick for movement, a second
 * right virtual thumbstick for look/aim (so both thumbs stay on sticks like
 * other mobile shooters), and safe-area-aware semantic action clusters for
 * weapons, stance, sprint, interaction, support, and pause. The module renders
 * its own DOM overlay, tracks multi-touch pointers, and exposes a single
 * mutable state object the game loop reads alongside keyboard and gamepad input.
 *
 * It is presentation/input only: it never authors damage, health, or match
 * state. All actions route through the same gameplay functions the keyboard
 * uses, so authority and multiplayer behaviour stay identical.
 *
 * The overlay only intercepts input during an active match (`setInMatch`):
 * outside gameplay it is fully hidden so menus, the lobby, and the options
 * toggle remain tappable.
 */

export type MobileTouchCallbacks = Readonly<{
  onFireDown: () => void;
  onFireUp: () => void;
  onJump: () => void;
  onReload: () => void;
  onAdsDown: () => void;
  onAdsUp: () => void;
  onCrouch: () => void;
  onProne: () => void;
  onGrenade: () => void;
  onMelee: () => void;
  onSwitchWeapon: () => void;
  onSupportCycle: () => void;
  onSupportActivate: () => void;
  onInteractDown: () => void;
  onInteractUp: () => void;
  onPause: () => void;
}>;

export type MobileTouchState = {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  firing: boolean;
  ads: boolean;
  sprinting: boolean;
  interacting: boolean;
};

export const MOBILE_TOUCH_ACTION_GROUPS = Object.freeze([
  Object.freeze({
    className: 'mtc-primary-actions',
    label: 'Aim and weapon actions',
    buttons: Object.freeze([
      Object.freeze({ id: 'fire', text: 'FIRE', ariaLabel: 'Fire weapon' }),
      Object.freeze({ id: 'ads', text: 'ADS', ariaLabel: 'Aim down sights' }),
      Object.freeze({ id: 'reload', text: 'RLD', ariaLabel: 'Reload weapon' }),
      Object.freeze({ id: 'switch-weapon', text: 'SWAP', ariaLabel: 'Switch weapon' }),
    ]),
  }),
  Object.freeze({
    className: 'mtc-combat-actions',
    label: 'Movement and combat actions',
    buttons: Object.freeze([
      Object.freeze({ id: 'jump', text: 'JUMP', ariaLabel: 'Jump' }),
      Object.freeze({ id: 'crouch', text: 'CRCH', ariaLabel: 'Toggle crouch' }),
      Object.freeze({ id: 'prone', text: 'PRONE', ariaLabel: 'Toggle prone' }),
      Object.freeze({ id: 'grenade', text: 'GRND', ariaLabel: 'Throw grenade' }),
      Object.freeze({ id: 'melee', text: 'KNIFE', ariaLabel: 'Melee attack' }),
    ]),
  }),
  Object.freeze({
    className: 'mtc-context-actions',
    label: 'Movement and field support actions',
    buttons: Object.freeze([
      Object.freeze({ id: 'sprint', text: 'RUN', ariaLabel: 'Hold to sprint' }),
      Object.freeze({ id: 'interact', text: 'USE', ariaLabel: 'Use or interact' }),
      Object.freeze({ id: 'support-cycle', text: 'SUP+', ariaLabel: 'Select next field support' }),
      Object.freeze({ id: 'support-activate', text: 'CALL', ariaLabel: 'Activate selected field support' }),
    ]),
  }),
  Object.freeze({
    className: 'mtc-system-actions',
    label: 'Match controls',
    buttons: Object.freeze([
      Object.freeze({ id: 'pause', text: 'PAUSE', ariaLabel: 'Pause match' }),
    ]),
  }),
] as const);

export const MOBILE_CONTROLS_STORAGE_KEY = 'atomic-acres-mobile-controls';

/**
 * HF-357: touch look speed is expressed in radians/second and integrated
 * against real frame time, so camera turn rate no longer depends on the
 * display refresh rate (previously a fixed 0.035 rad per rendered frame made
 * a 120Hz phone turn twice as fast as a 60Hz one, and jank directly slowed
 * aim). 2.1 rad/s reproduces the legacy 60Hz feel exactly at full deflection
 * (0.035 rad/frame * 60fps).
 */
export const MOBILE_LOOK_FULL_RATE_RAD_PER_SEC = 2.1;

/**
 * HF-357: acceleration/release shaping mirrors the gamepad right-stick curve
 * (`integrateGamepadLookRate` in gameplay.ts — replicated locally rather than
 * imported because the gamepad curve bakes in its own max-rate/ADS/flick
 * model, while the touch stick keeps its legacy 2.1 rad/s ceiling and the
 * caller-side ADS sensitivity scale). Constants are kept equal to the gamepad
 * ones so both sticks share one feel: quick build-up for target acquisition,
 * faster release so letting go leaves no tail.
 */
const MOBILE_LOOK_ACCELERATION_RAD_PER_SEC2 = 22;
const MOBILE_LOOK_RELEASE_RAD_PER_SEC2 = 29;

/** Legacy per-frame cadence assumed for callers that do not pass dt yet. */
const MOBILE_LOOK_FALLBACK_DT = 1 / 60;

const clampLookDt = (dt: number): number =>
  Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : MOBILE_LOOK_FALLBACK_DT;

export type MobileLookRate = Readonly<{ x: number; y: number }>;

/**
 * Advances the smoothed look angular velocity (rad/s) toward the held stick
 * deflection. Pure and frame-rate independent: integrating at 120Hz covers the
 * same angle as integrating at 60Hz.
 */
export function integrateMobileLookRate(
  current: MobileLookRate,
  input: Readonly<{ x: number; y: number }>,
  dt = MOBILE_LOOK_FALLBACK_DT,
): MobileLookRate {
  const safeDt = clampLookDt(dt);
  const integrateAxis = (value: number, target: number): number => {
    const building = (value === 0 || Math.sign(value) === Math.sign(target))
      && Math.abs(target) > Math.abs(value);
    const slew = (building ? MOBILE_LOOK_ACCELERATION_RAD_PER_SEC2 : MOBILE_LOOK_RELEASE_RAD_PER_SEC2) * safeDt;
    const difference = target - value;
    return Math.abs(difference) <= slew ? target : value + Math.sign(difference) * slew;
  };
  return Object.freeze({
    x: integrateAxis(current.x, THREE.MathUtils.clamp(input.x, -1, 1) * MOBILE_LOOK_FULL_RATE_RAD_PER_SEC),
    y: integrateAxis(current.y, THREE.MathUtils.clamp(input.y, -1, 1) * MOBILE_LOOK_FULL_RATE_RAD_PER_SEC),
  });
}

export type TouchStickBounds = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/** Projects a press anywhere inside a visible stick onto gamepad-shaped axes. */
export function touchStickAxis(
  clientX: number,
  clientY: number,
  bounds: TouchStickBounds,
  deadzone = 0.14,
): Readonly<{ x: number; y: number }> {
  const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
  const dx = clientX - (bounds.left + bounds.width / 2);
  const dy = clientY - (bounds.top + bounds.height / 2);
  const magnitude = Math.hypot(dx, dy);
  const clamped = Math.min(magnitude, radius);
  const scale = magnitude > 0 ? clamped / magnitude : 0;
  return applyRadialDeadzone(dx * scale / radius, dy * scale / radius, deadzone, 1.6);
}

export function mobileTouchFireBypassesPointerLock(presentationActive: boolean, firing: boolean): boolean {
  return presentationActive && firing;
}

/**
 * PASS 84 Lane E: the overlay shows only while the toggle is on, a match is
 * live and no gamepad is connected. A connected pad suppresses the overlay
 * instead of fighting it for the same thumbs; disconnecting restores it.
 */
export function mobileOverlayVisible(enabled: boolean, inMatch: boolean, gamepadSuppressed: boolean): boolean {
  return enabled && inMatch && !gamepadSuppressed;
}

export function shouldSuppressMobileBrowserSelection(presentationActive: boolean, editableTarget: boolean): boolean {
  return presentationActive && !editableTarget;
}

/**
 * Steady-state look delta for a held deflection over one frame of `dt`
 * seconds. HF-357: the default dt keeps the legacy 60Hz numbers
 * (full deflection = 0.035 rad) for callers not yet passing frame time.
 */
export function sustainedMobileLookDelta(
  x: number,
  y: number,
  dt = MOBILE_LOOK_FALLBACK_DT,
): Readonly<{ x: number; y: number }> {
  const safeDt = clampLookDt(dt);
  return Object.freeze({
    x: THREE.MathUtils.clamp(x, -1, 1) * MOBILE_LOOK_FULL_RATE_RAD_PER_SEC * safeDt,
    y: THREE.MathUtils.clamp(y, -1, 1) * MOBILE_LOOK_FULL_RATE_RAD_PER_SEC * safeDt,
  });
}

export function isTouchCapableDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return ('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0;
}

export function readMobileControlsPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(MOBILE_CONTROLS_STORAGE_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
  } catch {
    // Storage-disabled contexts fall back to device detection.
  }
  return isTouchCapableDevice();
}

export function writeMobileControlsPreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(MOBILE_CONTROLS_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Persistence is best-effort; the runtime toggle still applies this session.
  }
}

type StickId = 'move' | 'look';

export class MobileTouchControls {
  readonly state: MobileTouchState = {
    moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0,
    firing: false, ads: false, sprinting: false, interacting: false,
  };
  private root: HTMLElement | null = null;
  private knobs: Record<StickId, HTMLElement | null> = { move: null, look: null };
  private stickPointers: Record<StickId, number | null> = { move: null, look: null };
  private firePointerId: number | null = null;
  private adsPointerId: number | null = null;
  private sprintPointerId: number | null = null;
  private interactPointerId: number | null = null;
  private lookAxis = { x: 0, y: 0 };

  private enabled = false;
  private inMatch = false;
  private gamepadSuppressed = false;
  private disposed = false;

  constructor(private readonly callbacks: MobileTouchCallbacks) {}

  mount(host: HTMLElement): void {
    if (this.root || this.disposed) return;
    const root = document.createElement('div');
    root.id = 'mobile-touch-controls';
    root.hidden = true;
    const actionGroups = MOBILE_TOUCH_ACTION_GROUPS.map((group) => `
      <div class="mtc-action-group ${group.className}" role="group" aria-label="${group.label}">
        ${group.buttons.map((button) => `<button type="button" class="mtc-btn mtc-${button.id}" data-mtc="${button.id}" aria-label="${button.ariaLabel}">${button.text}</button>`).join('')}
      </div>`).join('');
    root.innerHTML = `
      <div class="mtc-stick mtc-stick-move" data-mtc="stick-move"><div class="mtc-stick-knob" aria-hidden="true"></div></div>
      <div class="mtc-stick mtc-stick-look" data-mtc="stick-look"><div class="mtc-stick-knob" aria-hidden="true"></div></div>
      ${actionGroups}`;
    host.append(root);
    this.root = root;
    this.knobs.move = root.querySelector<HTMLElement>('.mtc-stick-move .mtc-stick-knob');
    this.knobs.look = root.querySelector<HTMLElement>('.mtc-stick-look .mtc-stick-knob');
    this.bind();
    this.applyVisibility();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetInput();
    this.applyVisibility();
  }

  /**
   * Gates the overlay to live gameplay. Outside an active match the overlay
   * is hidden and intercepts nothing, so menus, lobbies and options remain
   * fully tappable even when the mobile-controls toggle is on.
   */
  setInMatch(inMatch: boolean): void {
    if (this.inMatch === inMatch) return;
    this.inMatch = inMatch;
    if (!inMatch) this.resetInput();
    this.applyVisibility();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * PASS 84 Lane E: a connected gamepad hides the overlay and releases every
   * held touch so the pad and the thumbsticks never fight; disconnecting
   * restores the overlay in the same match.
   */
  setGamepadSuppressed(suppressed: boolean): void {
    if (this.gamepadSuppressed === suppressed) return;
    this.gamepadSuppressed = suppressed;
    if (suppressed) this.resetInput();
    this.applyVisibility();
  }

  isGamepadSuppressed(): boolean {
    return this.gamepadSuppressed;
  }

  /** Releases every owned pointer before viewport/orientation geometry changes. */
  resetForViewportChange(): void {
    this.resetInput();
  }

  /** Drains the accumulated look delta; call once per frame. */
  consumeLookDelta(): { x: number; y: number } {
    const held = sustainedMobileLookDelta(this.lookAxis.x, this.lookAxis.y);
    const delta = { x: this.state.lookDeltaX + held.x, y: this.state.lookDeltaY + held.y };
    this.state.lookDeltaX = 0;
    this.state.lookDeltaY = 0;
    return delta;
  }

  dispose(): void {
    this.disposed = true;
    this.resetInput();
    this.root?.remove();
    this.root = null;
  }

  private applyVisibility(): void {
    if (this.root) this.root.hidden = !mobileOverlayVisible(this.enabled, this.inMatch, this.gamepadSuppressed);
  }

  private resetInput(): void {
    this.state.moveX = 0;
    this.state.moveY = 0;
    this.state.lookDeltaX = 0;
    this.state.lookDeltaY = 0;
    if (this.state.firing) this.callbacks.onFireUp();
    if (this.state.ads) this.callbacks.onAdsUp();
    if (this.state.interacting) this.callbacks.onInteractUp();
    this.state.firing = false;
    this.state.ads = false;
    this.state.sprinting = false;
    this.state.interacting = false;
    this.lookAxis.x = 0;
    this.lookAxis.y = 0;
    this.stickPointers.move = null;
    this.stickPointers.look = null;
    this.firePointerId = null;
    this.adsPointerId = null;
    this.sprintPointerId = null;
    this.interactPointerId = null;
    for (const id of ['move', 'look'] as const) {
      if (this.knobs[id]) this.knobs[id]!.style.transform = 'translate(-50%, -50%)';
    }
  }

  private bind(): void {
    const root = this.root;
    if (!root) return;
    // PASS 85 Lane AE - THE PAUSE TAP FELL THROUGH ONTO THE MENU IT UNCOVERED.
    //
    // Measured on emulated phone/tablet profiles: tapping the overlay's PAUSE
    // button opened the pause menu AND the project-map modal on top of it, so
    // the pause surface arrived already unusable - the options tab and the
    // RESUME button both sat under a full-screen modal (z 28/29 over the menu's
    // z 20) and could not be tapped at all.
    //
    // Cause, isolated: a touch tap is TWO things. The overlay acts on
    // `pointerdown`, which synchronously hides the overlay and shows the menu;
    // then, on `touchend`, the browser synthesises a compatibility `click` at
    // the same coordinates and hit-tests it against the DOM AS IT IS BY THEN -
    // the overlay is gone, so the click lands on whatever the menu put there.
    // The mobile PAUSE button sits at the top-right safe-area corner, which is
    // exactly where the menu header's project-map button is. Proof: dispatching
    // only `pointerdown` leaves the modal closed; a real touch tap at the same
    // point opens it.
    //
    // `event.preventDefault()` in `onPointerDown` does NOT stop this. Per the
    // Pointer Events spec, cancelling a pointerdown does not suppress the
    // compatibility mouse events; only cancelling `touchstart` does. Hence this
    // listener, which must be non-passive to be allowed to cancel anything.
    //
    // Every control is cancelled, not just PAUSE: any control that changes the
    // surface has the same trap waiting, and the overlay's own handlers are
    // pointer-based, so nothing here needs the synthesised click.
    root.addEventListener('touchstart', (event) => {
      if ((event.target as HTMLElement | null)?.closest('[data-mtc]')) event.preventDefault();
    }, { passive: false });
    root.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    root.addEventListener('pointermove', (event) => this.onPointerMove(event));
    const release = (event: PointerEvent) => this.onPointerUp(event);
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    root.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private onPointerDown(event: PointerEvent): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-mtc]');
    if (!target) return;
    const control = target.dataset.mtc;
    event.preventDefault();
    switch (control) {
      case 'stick-move':
        if (this.stickPointers.move !== null) return;
        target.setPointerCapture?.(event.pointerId);
        this.stickPointers.move = event.pointerId;
        this.applyStick('move', event, target);
        break;
      case 'stick-look':
        if (this.stickPointers.look !== null) return;
        target.setPointerCapture?.(event.pointerId);
        this.stickPointers.look = event.pointerId;
        this.applyStick('look', event, target);
        break;
      case 'fire':
        if (this.firePointerId !== null) return;
        target.setPointerCapture?.(event.pointerId);
        this.firePointerId = event.pointerId;
        this.state.firing = true;
        this.callbacks.onFireDown();
        break;
      case 'ads':
        if (this.adsPointerId !== null) return;
        target.setPointerCapture?.(event.pointerId);
        this.adsPointerId = event.pointerId;
        this.state.ads = true;
        this.callbacks.onAdsDown();
        break;
      case 'jump':
        this.callbacks.onJump();
        break;
      case 'reload':
        this.callbacks.onReload();
        break;
      case 'crouch':
        this.callbacks.onCrouch();
        break;
      case 'prone':
        this.callbacks.onProne();
        break;
      case 'grenade':
        this.callbacks.onGrenade();
        break;
      case 'melee':
        this.callbacks.onMelee();
        break;
      case 'switch-weapon':
        this.callbacks.onSwitchWeapon();
        break;
      case 'support-cycle':
        this.callbacks.onSupportCycle();
        break;
      case 'support-activate':
        this.callbacks.onSupportActivate();
        break;
      case 'sprint':
        if (this.sprintPointerId !== null) return;
        target.setPointerCapture?.(event.pointerId);
        this.sprintPointerId = event.pointerId;
        this.state.sprinting = true;
        break;
      case 'interact':
        if (this.interactPointerId !== null) return;
        target.setPointerCapture?.(event.pointerId);
        this.interactPointerId = event.pointerId;
        this.state.interacting = true;
        this.callbacks.onInteractDown();
        break;
      case 'pause':
        this.callbacks.onPause();
        break;
    }
  }

  private applyStick(id: StickId, event: PointerEvent, stick?: HTMLElement): void {
    const base = stick ?? this.root?.querySelector<HTMLElement>(`[data-mtc="stick-${id}"]`);
    if (!base) return;
    const bounds = base.getBoundingClientRect();
    const axis = touchStickAxis(event.clientX, event.clientY, bounds, id === 'look' ? 0.1 : 0.14);
    const nx = THREE.MathUtils.clamp(axis.x, -1, 1);
    const ny = THREE.MathUtils.clamp(axis.y, -1, 1);
    if (id === 'move') {
      this.state.moveX = nx;
      this.state.moveY = ny;
    } else {
      // Push-and-hold aiming: sustained deflection turns/pitches the view.
      this.lookAxis.x = nx;
      this.lookAxis.y = ny;
    }
    if (this.knobs[id]) {
      const knob = this.knobs[id]!;
      const travel = Math.max(0, (Math.min(bounds.width, bounds.height) - Math.max(knob.offsetWidth, knob.offsetHeight)) / 2 - 4);
      knob.style.transform = `translate(calc(-50% + ${nx * travel}px), calc(-50% + ${ny * travel}px))`;
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId === this.stickPointers.move) this.applyStick('move', event);
    else if (event.pointerId === this.stickPointers.look) this.applyStick('look', event);
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId === this.stickPointers.move) {
      this.stickPointers.move = null;
      this.state.moveX = 0;
      this.state.moveY = 0;
      if (this.knobs.move) this.knobs.move.style.transform = 'translate(-50%, -50%)';
    } else if (event.pointerId === this.stickPointers.look) {
      this.stickPointers.look = null;
      this.lookAxis.x = 0;
      this.lookAxis.y = 0;
      if (this.knobs.look) this.knobs.look.style.transform = 'translate(-50%, -50%)';
    } else if (event.pointerId === this.firePointerId && this.state.firing) {
      this.firePointerId = null;
      this.state.firing = false;
      this.callbacks.onFireUp();
    } else if (event.pointerId === this.adsPointerId && this.state.ads) {
      this.adsPointerId = null;
      this.state.ads = false;
      this.callbacks.onAdsUp();
    } else if (event.pointerId === this.sprintPointerId && this.state.sprinting) {
      this.sprintPointerId = null;
      this.state.sprinting = false;
    } else if (event.pointerId === this.interactPointerId && this.state.interacting) {
      this.interactPointerId = null;
      this.state.interacting = false;
      this.callbacks.onInteractUp();
    }
  }
}
