import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DAMAGE_NUMBERS_DEFAULT_ENABLED,
  DAMAGE_NUMBERS_STORAGE_KEY,
  damageNumberPresentation,
  damageNumbersEnabled,
  resetDamageNumberPreference,
  setDamageNumbersEnabled,
} from './player-feedback';
import { createKillConfirmPulseState, sampleKillConfirmPulse, triggerKillConfirmPulse } from './kill-confirm-pulse';

const legacyMain = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

/** Node-environment test files have no `localStorage`; the default still holds. */
const storageAvailable = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
})();

beforeEach(() => {
  if (storageAvailable) localStorage.removeItem(DAMAGE_NUMBERS_STORAGE_KEY);
  resetDamageNumberPreference();
});

describe('HF-512 damage numbers default off, fully supported', () => {
  it('is off with nothing stored', () => {
    expect(DAMAGE_NUMBERS_DEFAULT_ENABLED).toBe(false);
    expect(damageNumbersEnabled()).toBe(false);
  });

  it('turns on and back off within a session', () => {
    setDamageNumbersEnabled(true);
    expect(damageNumbersEnabled()).toBe(true);
    setDamageNumbersEnabled(false);
    expect(damageNumbersEnabled()).toBe(false);
  });

  it('persists the choice when a store exists', () => {
    if (!storageAvailable) {
      // No store: the fallback must be the default, never a throw.
      setDamageNumbersEnabled(true);
      resetDamageNumberPreference();
      expect(damageNumbersEnabled()).toBe(false);
      return;
    }
    setDamageNumbersEnabled(true);
    resetDamageNumberPreference();
    expect(damageNumbersEnabled(), 'the preference survives a session reset').toBe(true);
    setDamageNumbersEnabled(false);
    resetDamageNumberPreference();
    expect(damageNumbersEnabled()).toBe(false);
  });

  it('ignores a corrupt stored value rather than throwing into a hit path', () => {
    if (!storageAvailable) return;
    localStorage.setItem(DAMAGE_NUMBERS_STORAGE_KEY, 'yes-please');
    resetDamageNumberPreference();
    expect(damageNumbersEnabled()).toBe(false);
  });

  it('changes only whether the row is DRAWN, never what damage was dealt', () => {
    // Presentation is a projection of an authoritative number. A peer with the
    // numbers switched off must still compute the identical row, or two clients
    // would disagree about the damage they both received from the host.
    const off = damageNumberPresentation(37, 'head', 100);
    setDamageNumbersEnabled(true);
    const on = damageNumberPresentation(37, 'head', 100);
    expect(on).toEqual(off);
    expect(on?.amount).toBe(37);
    expect(on?.critical).toBe(true);
  });

  it('gates the legacy-main draw on the preference', () => {
    expect(legacyMain).toContain(
      'const presentation = damageNumbersEnabled() ? damageNumberPresentation(damage, zone, healthBefore) : null;',
    );
  });
});

describe('HF-512 the confirmation cues that stay on', () => {
  it('keeps the hitmarker, headshot and kill-confirm classes ungated', () => {
    // The hitmarker is the cue the damage numbers are allowed to replace, so it
    // must never share their switch.
    const marker = legacyMain.slice(
      legacyMain.indexOf('function showHitmarker('),
      legacyMain.indexOf('function showDamageNumber('),
    );
    expect(marker).toContain("marker.classList.remove('show', 'headshot', 'kill-confirm')");
    expect(marker).toContain("if (headshot) marker.classList.add('headshot')");
    expect(marker).toContain('triggerKillConfirmPulse(');
    expect(marker).not.toContain('damageNumbersEnabled');
  });

  it('pulses the kill confirm on an elimination and decays back to rest', () => {
    let state = createKillConfirmPulseState(1);
    state = triggerKillConfirmPulse(state, 1_000);
    // Sample inside the 40 ms attack ramp, not on its first sample where the
    // envelope is still exactly zero.
    const atPeak = sampleKillConfirmPulse(state, 1_040);
    expect(atPeak.presentation.active).toBe(true);
    expect(atPeak.presentation.opacity).toBeGreaterThan(0);
    expect(atPeak.presentation.scale).toBeGreaterThan(0);
    // The scale envelope decays faster than the glow, so the pop reads as a snap.
    const settling = sampleKillConfirmPulse(state, 1_140);
    expect(settling.presentation.scale).toBeLessThan(atPeak.presentation.scale);
    expect(settling.presentation.scale).toBeLessThan(settling.presentation.opacity);
    const later = sampleKillConfirmPulse(state, 3_000);
    expect(later.presentation.active).toBe(false);
    expect(later.presentation.opacity).toBe(0);
  });
});
