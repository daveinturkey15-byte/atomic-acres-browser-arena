/**
 * PASS 95 — the DOM half of the netcode diagnostics overlay.
 *
 * Everything numeric lives in `src/netcode-diagnostics.ts`; this file is only
 * "put those strings on the screen without costing a frame". Three rules shape
 * it, and each one is asserted in `src/netcode-diagnostics-overlay.test.ts`:
 *
 *  1. NO RENDER PASS. It is plain DOM text in a fixed-position <pre>. It never
 *     draws to a canvas, never reads back from one, and never asks three.js for
 *     anything. The frame-pacing policy in AGENTS.md forbids reading the
 *     presented canvas; the cheapest way to be certain a diagnostics overlay
 *     never does that is for it not to know a canvas exists.
 *
 *  2. REPAINT ONLY WHEN THE TEXT CHANGES. `update()` is safe to call every
 *     frame; it early-outs on the model revision, then on a repaint interval,
 *     then on a line-by-line comparison. A 300 Hz caller and a 4 Hz caller do
 *     the same amount of DOM work.
 *
 *  3. NEVER STEAL INPUT. `pointer-events: none` and no focusable children, so
 *     the overlay cannot swallow a click during a firefight, and it is
 *     `aria-hidden` so a screen reader does not read a wall of numbers over the
 *     match.
 *
 * The toggle key is F3, chosen because the repository binds no gameplay action
 * to it (checked against `src/key-bindings.ts` and the keydown handler in
 * legacy-main) and because F3 is the netgraph key players already expect.
 */

import { renderDiagnosticsLines, type NetcodeDiagnosticsModel } from './netcode-diagnostics';

export const NETCODE_OVERLAY_ELEMENT_ID = 'netcode-diagnostics-overlay';
export const NETCODE_OVERLAY_TOGGLE_CODE = 'F3';

/**
 * 4 Hz. Fast enough that a spike is visible while it is happening, slow enough
 * that the numbers are readable — a 60 Hz rtt readout is an unreadable blur,
 * which is a real failure mode of naive netgraphs.
 */
export const NETCODE_OVERLAY_REPAINT_INTERVAL_MS = 250;

export type NetcodeOverlayHandle = {
  readonly element: HTMLElement;
  visible: boolean;
  setVisible(next: boolean): void;
  toggle(): boolean;
  /** Returns true when the DOM was actually written. */
  update(model: NetcodeDiagnosticsModel, nowMs: number): boolean;
  destroy(): void;
};

const OVERLAY_STYLE = [
  'position:fixed',
  'top:8px',
  'right:8px',
  'z-index:70',
  'margin:0',
  'padding:6px 8px',
  'max-width:min(46rem, 92vw)',
  'overflow:hidden',
  // Legibility over the bright tactical HUD: near-opaque dark plate, high
  // contrast text. AGENTS.md requires critical HUD text >= 9px at 1280x720;
  // 12px keeps this comfortably above that even though it is not critical HUD.
  'background:rgba(4,10,16,0.86)',
  'border:1px solid rgba(120,220,255,0.45)',
  'border-radius:4px',
  'color:#d8f4ff',
  'font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  'white-space:pre',
  'pointer-events:none',
  'user-select:none',
].join(';');

/**
 * Creates (or adopts) the overlay element. Idempotent: calling it twice returns
 * a handle onto the same element rather than stacking two overlays, which is
 * what happens when a hot reload re-runs the bootstrap.
 */
export function createNetcodeOverlay(doc: Document = document): NetcodeOverlayHandle {
  // Duck-typed rather than `instanceof HTMLElement`: this module is unit tested
  // in a plain Node process where the DOM constructors do not exist as globals,
  // and an `instanceof` against an undefined global is a ReferenceError, not a
  // false. The structural Document type is all the contract that is needed.
  const existing = doc.getElementById(NETCODE_OVERLAY_ELEMENT_ID);
  const element: HTMLElement = existing ?? doc.createElement('pre');
  element.id = NETCODE_OVERLAY_ELEMENT_ID;
  element.setAttribute('style', OVERLAY_STYLE);
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('data-testid', NETCODE_OVERLAY_ELEMENT_ID);
  element.hidden = true;
  if (!existing) (doc.body ?? doc.documentElement).appendChild(element);

  // Reused for the life of the session; renderDiagnosticsLines writes into it.
  const lines: string[] = [];
  let previousText = '';
  let lastRevision = -1;
  let lastPaintAtMs = Number.NEGATIVE_INFINITY;
  let visible = false;

  const handle: NetcodeOverlayHandle = {
    element,
    get visible() {
      return visible;
    },
    set visible(next: boolean) {
      handle.setVisible(next);
    },
    setVisible(next: boolean): void {
      visible = next;
      element.hidden = !next;
      // Force the next update to paint: while hidden the model kept moving.
      lastRevision = -1;
      lastPaintAtMs = Number.NEGATIVE_INFINITY;
    },
    toggle(): boolean {
      handle.setVisible(!visible);
      return visible;
    },
    update(model: NetcodeDiagnosticsModel, nowMs: number): boolean {
      if (!visible) return false;
      if (model.revision === lastRevision) return false;
      if (Number.isFinite(nowMs) && nowMs - lastPaintAtMs < NETCODE_OVERLAY_REPAINT_INTERVAL_MS) return false;
      renderDiagnosticsLines(model, nowMs, lines);
      const text = lines.join('\n');
      lastRevision = model.revision;
      lastPaintAtMs = Number.isFinite(nowMs) ? nowMs : lastPaintAtMs;
      if (text === previousText) return false;
      previousText = text;
      element.textContent = text;
      return true;
    },
    destroy(): void {
      element.remove();
      lines.length = 0;
      previousText = '';
    },
  };
  return handle;
}

/**
 * The toggle predicate, extracted so the keydown wiring in legacy-main is one
 * line and the RULE is testable without a keyboard. Repeats are refused: F3
 * held down must not strobe the overlay.
 */
export function isNetcodeOverlayToggle(event: Readonly<{ code: string; repeat: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }>): boolean {
  if (event.code !== NETCODE_OVERLAY_TOGGLE_CODE || event.repeat) return false;
  return !(event.ctrlKey || event.metaKey || event.altKey);
}
