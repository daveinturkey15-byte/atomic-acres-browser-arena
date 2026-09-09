import * as THREE from 'three';
import type { ArenaId } from './map-selection';

/**
 * Pure helpers extracted verbatim from src/legacy-main.ts (HF-355 retry).
 *
 * Every function here is a pure move: it reads only its parameters and
 * `THREE.MathUtils` (an imported namespace). No closure capture over module
 * state, no DOM access, no network. Behaviour is unchanged — legacy-main.ts
 * still owns the deletion; this module becomes the canonical home once the
 * orchestrator rewires imports.
 */

/** legacy-main.ts:18081-18096 — segment/sphere closest-approach fraction. */
export function segmentSphereFraction(start: THREE.Vector3, delta: THREE.Vector3, centre: THREE.Vector3, radius: number): number | null {
  const denominator = delta.lengthSq();
  if (denominator < 1e-9) return null;
  const offsetX = centre.x - start.x;
  const offsetY = centre.y - start.y;
  const offsetZ = centre.z - start.z;
  const alpha = THREE.MathUtils.clamp(
    (offsetX * delta.x + offsetY * delta.y + offsetZ * delta.z) / denominator,
    0,
    1,
  );
  const nearestX = start.x + delta.x * alpha - centre.x;
  const nearestY = start.y + delta.y * alpha - centre.y;
  const nearestZ = start.z + delta.z * alpha - centre.z;
  return nearestX * nearestX + nearestY * nearestY + nearestZ * nearestZ <= radius * radius ? alpha : null;
}

/** legacy-main.ts:12819-12827 — deterministic FNV-style unit hash. */
export function deterministicWindowUnit(windowId: string, salt: number): number {
  let hash = 0x811c9dc5 ^ salt;
  for (let index = 0; index < windowId.length; index += 1) {
    hash ^= windowId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

/** legacy-main.ts:12829-12832 — canonical persistent debris id. */
export function persistentWindowDebrisId(windowId: string): string {
  const canonical = windowId.toLowerCase().replace(/[^a-z0-9:-]/g, '-').slice(0, 104);
  return `window-debris:${canonical}`;
}

/** legacy-main.ts:12834-12836 — pooled debris key. */
export function windowDebrisPoolKey(arenaId: ArenaId, windowId: string): string {
  return `${arenaId}:${persistentWindowDebrisId(windowId)}`;
}

/** legacy-main.ts:24141-24143 — HTML escaping. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

/** legacy-main.ts:24220-24227 — key-code display labels. */
export const KEY_CODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL',
  ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Tab: 'TAB', Enter: 'ENTER',
  Escape: 'ESC', Backspace: 'BACKSPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←',
  ArrowRight: '→', KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyC: 'C', KeyZ: 'Z',
  KeyR: 'R', KeyV: 'V', KeyG: 'G', KeyF: 'F', Digit1: '1', Digit2: '2', Digit3: '3',
  Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
});

/** legacy-main.ts:24228-24232 — human-readable key-code rendering. */
export function prettyKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return KEY_CODE_LABELS[code] ?? code;
}

/** legacy-main.ts:26702-26706 — nearest-rank quantile (empty → +Infinity). */
export function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * THREE.MathUtils.clamp(quantile, 0, 1))];
}

/** legacy-main.ts:4548-4553 — frame-time percentile (empty → 0). */
export function framePercentile(samples: readonly number[], percentile: number): number {
  if (samples.length === 0) return 0;
  const ordered = [...samples].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * percentile) - 1));
  return ordered[index]!;
}
