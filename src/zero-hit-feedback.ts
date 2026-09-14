/**
 * HF-386: explicit zero-damage feedback when a shot strikes world geometry and
 * damages nobody.
 *
 * The owner's words: "it should have like an impact sound and marker and just
 * say zero damage or have like a little picture of nothing". This module owns
 * the "say zero damage / picture of nothing" half. It is deliberately,
 * structurally distinct from the real hitmarker so the two can never be
 * confused mid-firefight:
 * | property | the real hitmarker            | this indicator                    |
 * |----------|-------------------------------|-----------------------------------|
 * | shape    | white cross glyph + expanding ring | hollow circle + "0 NO DAMAGE" |
 * | colour   | white / gold                  | desaturated slate                 |
 * | position | dead centre of the viewport   | offset BELOW the crosshair        |
 * | motion   | sharp scale punch             | soft fade, never scales           |
 * | meaning  | confirmed damage on an actor  | the shot damaged nobody           |
 *
 * Presentation only: reading it never mutates match state, and it is rate
 * limited so a shotgun spread or a 280 ms autocannon cadence coalesces into
 * one legible cue instead of row spam.
 */

export const ZERO_HIT_ELEMENT_ID = 'zero-hit-feedback';
export const ZERO_HIT_VISIBLE_MS = 900;
/** Shotgun pellets land in one frame; the autocannon fires every 280 ms. One cue per 140 ms reads as per-shot without spamming. */
export const ZERO_HIT_MIN_INTERVAL_MS = 140;
export const ZERO_HIT_MAX_ROWS = 3;

const STYLE_ELEMENT_ID = `${ZERO_HIT_ELEMENT_ID}-styles`;

export type ZeroHitRowPlan = Readonly<{
  lane: number;
  glyphClass: string;
  label: string;
}>;

/**
 * Pure decision: may another zero-damage cue appear right now?
 * `lastPresentedAtMs` is the previous cue time; `visibleRowCount` counts rows
 * still inside their fade window.
 */
export function shouldPresentZeroHit(
  lastPresentedAtMs: number,
  nowMs: number,
  visibleRowCount: number,
): boolean {
  if (nowMs - lastPresentedAtMs < ZERO_HIT_MIN_INTERVAL_MS) return false;
  return visibleRowCount < ZERO_HIT_MAX_ROWS;
}

/** Lane spreads concurrent rows so overlapping cues stay individually legible. */
export function planZeroHitRow(existingRows: number): ZeroHitRowPlan {
  return Object.freeze({
    lane: (Math.max(0, existingRows) % ZERO_HIT_MAX_ROWS) - 1,
    glyphClass: 'zero-hit-glyph',
    label: '0 NO DAMAGE',
  });
}

const ZERO_HIT_CSS = `
#hud #${ZERO_HIT_ELEMENT_ID} {
  position: absolute;
  z-index: 19;
  left: 50%;
  top: calc(50% + 48px);
  width: 0;
  height: 0;
  pointer-events: none;
}
#hud #${ZERO_HIT_ELEMENT_ID} .zero-hit-row {
  --zero-lane: 0;
  position: absolute;
  left: calc(var(--zero-lane) * 26px);
  top: 0;
  transform: translateX(-50%);
  display: flex;
  gap: 7px;
  align-items: center;
  font: 700 13px/1 Inter, system-ui, sans-serif;
  letter-spacing: 0.14em;
  color: #8fa7b8;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  white-space: nowrap;
  animation: zeroHitFade ${ZERO_HIT_VISIBLE_MS}ms ease-out forwards;
}
/* The picture of nothing: a hollow ring, never a filled or crossed shape. */
#hud #${ZERO_HIT_ELEMENT_ID} .zero-hit-glyph {
  box-sizing: border-box;
  width: 13px;
  height: 13px;
  border: 2px solid currentColor;
  border-radius: 50%;
}
@keyframes zeroHitFade {
  0% { opacity: 0; }
  12% { opacity: 1; }
  70% { opacity: 0.92; }
  100% { opacity: 0; }
}
html[data-reduced-motion='true'] #hud #${ZERO_HIT_ELEMENT_ID} .zero-hit-row {
  animation: none;
  opacity: 0.75;
}
`;

function ensureStyles(document: Document): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = ZERO_HIT_CSS;
  document.head.append(style);
}

function ensureContainer(document: Document): HTMLElement | null {
  const hud = document.getElementById('hud');
  if (!hud) return null;
  let container = document.getElementById(ZERO_HIT_ELEMENT_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = ZERO_HIT_ELEMENT_ID;
    container.setAttribute('aria-hidden', 'true');
    hud.append(container);
  }
  return container;
}

/**
 * Present one zero-damage cue for a shot that struck world geometry and
 * damaged nobody. Returns false when throttled, over budget, or when no HUD
 * exists yet (menus). Never touches gameplay state.
 */
export function presentZeroDamageHit(nowMs: number = performance.now()): boolean {
  const doc = typeof document === 'undefined' ? undefined : document;
  if (!doc) return false;
  const container = ensureContainer(doc);
  if (!container) return false;
  if (!shouldPresentZeroHit(
    Number(container.dataset.lastPresentedAtMs ?? Number.NEGATIVE_INFINITY),
    nowMs,
    container.childElementCount,
  )) return false;
  ensureStyles(doc);
  const plan = planZeroHitRow(container.childElementCount);
  const row = doc.createElement('strong');
  row.classList.add('zero-hit-row');
  row.style.setProperty('--zero-lane', String(plan.lane));
  const glyph = doc.createElement('span');
  glyph.classList.add(plan.glyphClass);
  const label = doc.createElement('span');
  label.textContent = plan.label;
  row.append(glyph, label);
  container.append(row);
  container.dataset.lastPresentedAtMs = String(nowMs);
  while (container.childElementCount > ZERO_HIT_MAX_ROWS) container.firstElementChild?.remove();
  window.setTimeout(() => row.remove(), ZERO_HIT_VISIBLE_MS);
  return true;
}
