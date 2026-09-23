import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Measured live in DEFAULT Chrome 153 on 2026-08-28: pipeline creation can fail
// intermittently with Tint's "swizzle view instruction still has usages after lowering",
// the arena never commits, and the player is bounced to the menu - while the identical
// deploy retried moments later launches clean. Every green gate had been running Chrome
// with --enable-unsafe-webgpu, which masks it, so the owner's browser was the first
// default-flag Chrome ever to drive a published build.
//
// The solo failure path already documents a fresh Solo click as the recovery, so the fix
// performs that click for the player, bounded and only for renderer-class errors.
const legacyMain = readFileSync('src/legacy-main.ts', 'utf8');

describe('solo renderer auto-retry', () => {
  it('spends the retry budget only on renderer-class errors', () => {
    expect(legacyMain).toContain('soloRendererAutoRetriesRemaining > 0');
    expect(legacyMain).toContain(
      '/webgpu|pipeline|commandbuffer|queue completion|device lost|tint/i.test(error.message)',
    );
  });

  it('restores the budget on every explicit Solo click, so retries belong to an attempt', () => {
    const clickHandler = legacyMain.slice(
      legacyMain.indexOf("element<HTMLButtonElement>('#solo').addEventListener"),
    );
    const resetIndex = clickHandler.indexOf('soloRendererAutoRetriesRemaining = 4');
    const startIndex = clickHandler.indexOf("void startGame('solo')");
    expect(resetIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeLessThan(startIndex);
  });

  it('stops honestly after the retry budget - no fallback engine, no sticky record (owner 2026-08-30)', () => {
    // The Chrome 153 root cause is fixed by the chained-swizzle shim, and the
    // WebGL2 engine is retired. Exhausted retries reset the budget and tell
    // the player the truth on the menu; nothing may silently reroute the
    // session to a second renderer or persist a downgrade for next time.
    expect(legacyMain).toContain('The graphics driver kept refusing this deployment.');
    expect(legacyMain).not.toContain("searchParams.set('renderer', 'webgl2')");
    expect(legacyMain).not.toContain("localStorage.setItem('atomic-acres:renderer-fallback:v1'");
    const bootstrap = readFileSync('src/bootstrap.ts', 'utf8');
    expect(bootstrap).not.toContain('renderer-fallback:v1');
    expect(bootstrap).not.toContain('applyStickyRendererFallback');
  });

  it('keeps the honest failure message when the error is not renderer-class', () => {
    expect(legacyMain).toContain(
      'setStatus(`Deployment preparation failed: ${error.message}. Retry to build fresh assets.`',
    );
  });

  it('guards the delayed retry against a match that started or a prepare already running', () => {
    const retryBlock = legacyMain.slice(
      legacyMain.indexOf('Renderer hiccup while preparing deployment'),
      legacyMain.indexOf('Renderer hiccup while preparing deployment') + 600,
    );
    expect(retryBlock).toContain('if (matchStartPreparing || gameStarted) return;');
  });
});
