/**
 * Gamepad menu navigation (PASS 95 gamepad lane). D-pad moves focus across the
 * visible deployment-menu controls, A confirms, B backs out — so a pad alone
 * can reach the Solo button and start a match. Bluetooth pads work through the
 * same path: by the time a frame exists the browser has already normalised the
 * pad, and the d-pad is read from raw physical buttons 12–15, independent of
 * the player's semantic remap.
 *
 * Pure DOM + frame edges: no timers, no pointer lock, allocation-free per
 * update (one cached target list, refreshed only when the menu changes).
 */

import type { GamepadFrame } from './gamepad-input';

export type MenuNavTarget = {
  element: HTMLElement;
  id: string;
};

type MenuNavDoc = {
  getElementById(id: string): HTMLElement | null;
  querySelectorAll(selectors: string): ArrayLike<HTMLElement>;
  activeElement?: Element | null;
};

const NAV_SELECTORS = '#menu button:not([disabled]), #menu input:not([disabled]), #menu select:not([disabled])';

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  if ((element as HTMLButtonElement).disabled) return false;
  if (element.getAttribute?.('aria-hidden') === 'true') return false;
  let node: HTMLElement | null = element;
  while (node) {
    if (node.hidden) return false;
    const style = (node as HTMLElement).style;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    node = node.parentElement;
  }
  return true;
}

/** Visible, enabled menu controls in DOM order. Cached by the navigator. */
export function collectMenuNavTargets(doc: MenuNavDoc): MenuNavTarget[] {
  const nodes = doc.querySelectorAll(NAV_SELECTORS);
  const targets: MenuNavTarget[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const element = nodes[i];
    if (!element || !isVisible(element)) continue;
    targets.push({ element, id: element.id ?? '' });
  }
  return targets;
}

export type MenuNavAction = 'move' | 'activate' | 'back' | 'none';

const REPEAT_INITIAL_MS = 240;
const REPEAT_HELD_MS = 130;

/**
 * Focus navigator over the deployment menu. Call `update` once per
 * gamepad frame while the menu is open; ignored while in-match.
 */
export class GamepadMenuNav {
  private lastMoveAt = -Infinity;
  private focusIndex = -1;
  private cacheKey = '';
  private targets: MenuNavTarget[] = [];

  update(doc: MenuNavDoc, frame: GamepadFrame, at: number, menuOpen: boolean): MenuNavAction {
    if (!menuOpen || !frame.connected) return 'none';
    const menu = doc.getElementById('menu');
    if (!menu || menu.classList.contains('hidden')) return 'none';
    const key = `${menu.dataset?.['navState'] ?? ''}|${menu.querySelectorAll?.('button')?.length ?? this.targets.length}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.targets = collectMenuNavTargets(doc);
      this.focusIndex = -1;
    } else if (this.targets.length === 0) {
      this.targets = collectMenuNavTargets(doc);
    }
    if (this.targets.length === 0) return 'none';

    // B (crouch) backs out: Escape-equivalent on pause, no-op on the top menu.
    if (frame.pressed('crouch')) {
      const back = doc.getElementById('resume') ?? doc.getElementById('match-resume');
      if (back && isVisible(back)) {
        back.focus();
        back.click();
        return 'back';
      }
      return 'back';
    }
    // A (jump) activates whatever has focus (defaults to Solo on first press).
    if (frame.pressed('jump')) {
      const current = this.current(doc);
      current.element.focus();
      current.element.click();
      return 'activate';
    }
    const down = frame.dpadPressed.down || frame.pressed('prone');
    const up = frame.dpadPressed.up || frame.pressed('support-activate');
    const next = frame.dpadPressed.right || frame.pressed('support-next');
    const prev = frame.dpadPressed.left || frame.pressed('support-prev');
    const held =
      frame.dpad.down || frame.dpad.up || frame.dpad.left || frame.dpad.right;
    const direction = down || next ? 1 : up || prev ? -1 : 0;
    if (direction === 0) return 'none';
    const gap = at - this.lastMoveAt;
    const budget = this.lastMoveAt === -Infinity ? 0 : held ? REPEAT_HELD_MS : REPEAT_INITIAL_MS;
    if (gap < budget) return 'none';
    this.lastMoveAt = at;
    this.focusIndex = (this.focusIndex + direction + this.targets.length) % this.targets.length;
    const target = this.targets[this.focusIndex];
    target.element.focus();
    return 'move';
  }

  /** Focused target, defaulting to Solo so the first A press starts a match. */
  private current(doc: MenuNavDoc): MenuNavTarget {
    if (this.focusIndex >= 0 && this.focusIndex < this.targets.length) {
      return this.targets[this.focusIndex];
    }
    const soloIndex = this.targets.findIndex((target) => target.id === 'solo');
    if (soloIndex >= 0) {
      this.focusIndex = soloIndex;
      return this.targets[soloIndex];
    }
    const active = (doc.activeElement as HTMLElement | null) ?? null;
    const activeIndex = active ? this.targets.findIndex((target) => target.element === active) : -1;
    this.focusIndex = activeIndex >= 0 ? activeIndex : 0;
    return this.targets[this.focusIndex];
  }
}
