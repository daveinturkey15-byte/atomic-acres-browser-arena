import * as THREE from 'three';

/**
 * Mobile touch controls: a left virtual thumbstick for movement, a second
 * right virtual thumbstick for look/aim (so both thumbs stay on sticks like
 * other mobile shooters), and a compact set of action buttons (fire, jump,
 * reload, ADS, crouch, grenade, knife). The module renders its own DOM
 * overlay, tracks multi-touch pointers, and exposes a single mutable state
 * object the game loop reads alongside keyboard and gamepad input.
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
  onGrenade: () => void;
  onMelee: () => void;
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
  interacting: boolean;
};

export const MOBILE_CONTROLS_STORAGE_KEY = 'atomic-acres-mobile-controls';

const STICK_RADIUS = 58;
const LOOK_STICK_SENSITIVITY = 0.035;

export function mobileTouchFireBypassesPointerLock(presentationActive: boolean, firing: boolean): boolean {
  return presentationActive && firing;
}

export function sustainedMobileLookDelta(x: number, y: number): Readonly<{ x: number; y: number }> {
  return Object.freeze({
    x: THREE.MathUtils.clamp(x, -1, 1) * LOOK_STICK_SENSITIVITY,
    y: THREE.MathUtils.clamp(y, -1, 1) * LOOK_STICK_SENSITIVITY,
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
    moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0, firing: false, ads: false, interacting: false,
  };
  private root: HTMLElement | null = null;
  private knobs: Record<StickId, HTMLElement | null> = { move: null, look: null };
  private stickPointers: Record<StickId, number | null> = { move: null, look: null };
  private firePointerId: number | null = null;
  private adsPointerId: number | null = null;
  private interactPointerId: number | null = null;
  private lookAxis = { x: 0, y: 0 };
  private stickOrigins: Record<StickId, { x: number; y: number }> = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
  private enabled = false;
  private inMatch = false;
  private disposed = false;

  constructor(private readonly callbacks: MobileTouchCallbacks) {}

  mount(host: HTMLElement): void {
    if (this.root || this.disposed) return;
    const root = document.createElement('div');
    root.id = 'mobile-touch-controls';
    root.hidden = true;
    root.innerHTML = `
      <div class="mtc-stick mtc-stick-move" data-mtc="stick-move"><div class="mtc-stick-knob" data-mtc="knob-move"></div></div>
      <div class="mtc-stick mtc-stick-look" data-mtc="stick-look"><div class="mtc-stick-knob" data-mtc="knob-look"></div></div>
      <div class="mtc-buttons">
        <button type="button" class="mtc-btn mtc-fire" data-mtc="fire">FIRE</button>
        <button type="button" class="mtc-btn mtc-jump" data-mtc="jump">JUMP</button>
        <button type="button" class="mtc-btn mtc-ads" data-mtc="ads">ADS</button>
        <button type="button" class="mtc-btn mtc-reload" data-mtc="reload">RLD</button>
        <button type="button" class="mtc-btn mtc-crouch" data-mtc="crouch">CRCH</button>
        <button type="button" class="mtc-btn mtc-grenade" data-mtc="grenade">GRND</button>
        <button type="button" class="mtc-btn mtc-melee" data-mtc="melee">KNIFE</button>
        <button type="button" class="mtc-btn mtc-interact" data-mtc="interact">USE</button>
        <button type="button" class="mtc-btn mtc-pause" data-mtc="pause">PAUSE</button>
      </div>`;
    host.append(root);
    this.root = root;
    this.knobs.move = root.querySelector<HTMLElement>('[data-mtc="knob-move"]');
    this.knobs.look = root.querySelector<HTMLElement>('[data-mtc="knob-look"]');
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
    this.root?.remove();
    this.root = null;
  }

  private applyVisibility(): void {
    if (this.root) this.root.hidden = !(this.enabled && this.inMatch);
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
    this.state.interacting = false;
    this.lookAxis.x = 0;
    this.lookAxis.y = 0;
    this.stickPointers.move = null;
    this.stickPointers.look = null;
    this.firePointerId = null;
    this.adsPointerId = null;
    this.interactPointerId = null;
    for (const id of ['move', 'look'] as const) {
      if (this.knobs[id]) this.knobs[id]!.style.transform = 'translate(-50%, -50%)';
    }
  }

  private bind(): void {
    const root = this.root;
    if (!root) return;
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
    target.setPointerCapture?.(event.pointerId);
    switch (control) {
      case 'stick-move':
        this.stickPointers.move = event.pointerId;
        this.stickOrigins.move = { x: event.clientX, y: event.clientY };
        break;
      case 'stick-look':
        this.stickPointers.look = event.pointerId;
        this.stickOrigins.look = { x: event.clientX, y: event.clientY };
        break;
      case 'fire':
        this.firePointerId = event.pointerId;
        this.state.firing = true;
        this.callbacks.onFireDown();
        break;
      case 'ads':
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
      case 'grenade':
        this.callbacks.onGrenade();
        break;
      case 'melee':
        this.callbacks.onMelee();
        break;
      case 'interact':
        this.interactPointerId = event.pointerId;
        this.state.interacting = true;
        this.callbacks.onInteractDown();
        break;
      case 'pause':
        this.callbacks.onPause();
        break;
    }
  }

  private applyStick(id: StickId, event: PointerEvent): void {
    const dx = event.clientX - this.stickOrigins[id].x;
    const dy = event.clientY - this.stickOrigins[id].y;
    const magnitude = Math.hypot(dx, dy);
    const clamped = Math.min(magnitude, STICK_RADIUS);
    const scale = magnitude > 0 ? clamped / magnitude : 0;
    const nx = THREE.MathUtils.clamp(dx * scale / STICK_RADIUS, -1, 1);
    const ny = THREE.MathUtils.clamp(dy * scale / STICK_RADIUS, -1, 1);
    if (id === 'move') {
      this.state.moveX = nx;
      this.state.moveY = ny;
    } else {
      // Push-and-hold aiming: sustained deflection turns/pitches the view.
      this.lookAxis.x = nx;
      this.lookAxis.y = ny;
    }
    if (this.knobs[id]) {
      this.knobs[id]!.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
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
    } else if (event.pointerId === this.interactPointerId && this.state.interacting) {
      this.interactPointerId = null;
      this.state.interacting = false;
      this.callbacks.onInteractUp();
    }
  }
}
