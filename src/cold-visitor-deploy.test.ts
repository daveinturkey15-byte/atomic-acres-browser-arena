import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeRequiredPlayerName } from './high-scores';

// The owner reported "the game doesn't work, i cant launch any map" on a build whose every
// automated gate was green. The cause was not the engine. A first-time visitor landed on an
// EMPTY callsign field with the deploy button fully enabled and inviting; clicking it did
// nothing but set a small status line, so the game read as broken.
//
// Every harness missed it for the same reason: each one filled the field in for itself.
// verify-arena-boot-cdp.mjs drives __ATOMIC_ACRES_DEBUG__ (which sets 'Boot Probe'), and
// verify-player-path-cdp.mjs types a callsign before clicking deploy. A gate that supplies
// the input a real user arrives WITHOUT cannot see the wall that user hits.
const legacyMain = readFileSync('src/legacy-main.ts', 'utf8');

describe('a cold visitor can deploy on the first click', () => {
  it('prefills the callsign when storage holds none', () => {
    expect(legacyMain).toContain("const DEFAULT_PLAYER_NAME = 'OPERATOR'");
    expect(legacyMain).toContain('if (!storedPlayerName) storedPlayerName = DEFAULT_PLAYER_NAME;');
  });

  it('prefills BEFORE the shell is rendered, or the field still paints empty', () => {
    const fallback = legacyMain.indexOf('if (!storedPlayerName) storedPlayerName = DEFAULT_PLAYER_NAME;');
    const render = legacyMain.indexOf('app.innerHTML = renderPass64Shell(createPass64ShellViewModel(storedPlayerName));');
    expect(fallback).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(-1);
    expect(fallback).toBeLessThan(render);
  });

  it('uses a default the name validator actually accepts', () => {
    // A default that normalises to null would reinstate the exact block it removes.
    expect(normalizeRequiredPlayerName('OPERATOR')).toBe('OPERATOR');
  });

  it('still requires a name at deploy, so clearing the field is caught', () => {
    // The requirement is not removed - only the empty START state that made it a wall.
    expect(legacyMain).toContain("setStatus('Enter a callsign before deployment.', 'error')");
  });
});
