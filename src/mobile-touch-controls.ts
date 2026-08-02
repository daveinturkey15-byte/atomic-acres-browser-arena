import * as THREE from 'three';

/**
 * Mobile touch controls: a left virtual thumbstick for movement, a right
 * drag-to-look surface, and a compact set of action buttons (fire, jump,
 * reload, ADS, crouch, grenade). The module renders its own DOM overlay,
 * tracks multi-touch pointers, and exposes a single mutable state object the
 * game loop reads alongside keyboard and gamepad input.
 *
 * It is presentation/input only: it never authors damage, health, or match
 * state. All actions route through the same gameplay functions the keyboard
 * uses, so authority and multiplayer behaviour stay identical.
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
}>;

export type MobileTouchState = {
  moveX: number;
  moveY: number;
  lookDeltaX: number;
  lookDeltaY: number;
  firing: boolean;
  ads: boolean;
};

export const MOBILE_CONTROLS_STORAGE_KEY = 'atomic-acres-mobile-controls';

const STICK_RADIUS = 62;
const LOOK_SENSITIVITY = 0.0044;

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

export class MobileTouchControls {
  readonly state: MobileTouchState = { moveX: 0, moveY: 0, lookDeltaX: 0, lookDeltaY: 0, firing: false, ads: false };
  private root: HTMLElement | null = null;
  private stickKnob: HTMLElement | null = null;
  private stickPointerId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookPointerId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private enabled = false;
  private disposed = false;

  constructor(private readonly callbacks: MobileTouchCallbacks) {}

  mount(host: HTMLElement): void {
    if (this.root || this.disposed) return;
    const root = document.createElement('div');
    root.id = 'mobile-touch-controls';
    root.innerHTML = `
      <div class="mtc-stick" data-mtc="stick"><div class="mtc-stick-knob" data-mtc="knob"></div></div>
      <div class="mtc-look" data-mtc="look"></div>
      <div class="mtc-buttons">
        <button type="button" class="mtc-btn mtc-fire" data-mtc="fire">FIRE</button>
        <button type="button" class="mtc-btn mtc-jump" data-mtc="jump">JUMP</button>
        <button type="button" class="mtc-btn mtc-ads" data-mtc="ads">ADS</button>
        <button type="button" class="mtc-btn mtc-reload" data-mtc="reload">RLD</button>
        <button type="button" class="mtc-btn mtc-crouch" data-mtc="crouch">CRCH</button>
        <button type="button" class="mtc-btn mtc-grenade" data-mtc="grenade">GRND</button>
        <button type="button" class="mtc-btn mtc-melee" data-mtc="melee">KNIFE</button>
      </div>`;
    host.append(root);
    this.root = root;
    this.stickKnob = root.querySelector<HTMLElement>('[data-mtc="knob"]');
    this.bind();
    this.setEnabled(this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.root) this.root.hidden = !enabled;
    if (!enabled) this.resetInput();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Drains the accumulated look delta; call once per frame. */
  consumeLookDelta(): { x: number; y: number } {
    const delta = { x: this.state.lookDeltaX, y: this.state.lookDeltaY };
    this.state.lookDeltaX = 0;
    this.state.lookDeltaY = 0;
    return delta;
  }

  dispose(): void {
    this.disposed = true;
    this.root?.remove();
    this.root = null;
  }

  private resetInput(): void {
    this.state.moveX = 0;
    this.state.moveY = 0;
    this.state.lookDeltaX = 0;
    this.state.lookDeltaY = 0;
    this.state.firing = false;
    this.state.ads = false;
    this.stickPointerId = null;
    this.lookPointerId = null;
    if (this.stickKnob) this.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  private bind(): void {
    const root = this.root;
    if (!root) return;
    root.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    root.addEventListener('pointermove', (event) => this.onPointerMove(event));
    const release = (event: PointerEvent) => this.onPointerUp(event);
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
  }

  private onPointerDown(event: PointerEvent): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-mtc]');
    if (!target) return;
    const control = target.dataset.mtc;
    event.preventDefault();
    target.setPointerCapture?.(event.pointerId);
    switch (control) {
      case 'stick':
        this.stickPointerId = event.pointerId;
        this.stickOrigin = { x: event.clientX, y: event.clientY };
        break;
      case 'look':
        this.lookPointerId = event.pointerId;
        this.lookLast = { x: event.clientX, y: event.clientY };
        break;
      case 'fire':
        this.state.firing = true;
        this.callbacks.onFireDown();
        break;
      case 'ads':
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
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId === this.stickPointerId) {
      const dx = event.clientX - this.stickOrigin.x;
      const dy = event.clientY - this.stickOrigin.y;
      const magnitude = Math.hypot(dx, dy);
      const clamped = Math.min(magnitude, STICK_RADIUS);
      const scale = magnitude > 0 ? clamped / magnitude : 0;
      const nx = dx * scale / STICK_RADIUS;
      const ny = dy * scale / STICK_RADIUS;
      this.state.moveX = THREE.MathUtils.clamp(nx, -1, 1);
      this.state.moveY = THREE.MathUtils.clamp(ny, -1, 1);
      if (this.stickKnob) {
        this.stickKnob.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
      }
    } else if (event.pointerId === this.lookPointerId) {
      const dx = event.clientX - this.lookLast.x;
      const dy = event.clientY - this.lookLast.y;
      this.lookLast = { x: event.clientX, y: event.clientY };
      this.state.lookDeltaX += dx * LOOK_SENSITIVITY;
      this.state.lookDeltaY += dy * LOOK_SENSITIVITY;
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId === this.stickPointerId) {
      this.stickPointerId = null;
      this.state.moveX = 0;
      this.state.moveY = 0;
      if (this.stickKnob) this.stickKnob.style.transform = 'translate(-50%, -50%)';
    } else if (event.pointerId === this.lookPointerId) {
      this.lookPointerId = null;
    }
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-mtc]');
    const control = target?.dataset.mtc;
    if (control === 'fire' && this.state.firing) {
      this.state.firing = false;
      this.callbacks.onFireUp();
    } else if (control === 'ads' && this.state.ads) {
      this.state.ads = false;
      this.callbacks.onAdsUp();
    }
  }
}
