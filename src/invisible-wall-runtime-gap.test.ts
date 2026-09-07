import { describe, expect, it } from 'vitest';
import {
  evaluateInvisibleWallRuntimeGap,
  INVISIBLE_WALL_RUNTIME_GAP_MESSAGE,
} from './invisible-wall-runtime-gap';

/**
 * Pass 80: the invisible-wall regression window is proven unreachable in the
 * normal boot path but UNGUARDED — if activeWorldColliders()' early-return
 * ever runs on the LIVE arena while interactiveWorldRuntime is null, hidden
 * house colliders come back as invisible walls. These tests simulate that
 * null-runtime state against the pure decision rule legacy-main.ts wires into
 * its early-return branch.
 */
describe('invisible-wall runtime gap guard', () => {
  it('fires when the live arena has runtime-replaced statics and no interactive runtime', () => {
    expect(evaluateInvisibleWallRuntimeGap({
      sameArena: true,
      runtimeReplacedStaticCount: 8,
      hasInteractiveRuntime: false,
      alreadyLogged: false,
    })).toEqual({ shouldLog: true });
  });

  it('is one-shot: never fires again once the latch is set', () => {
    expect(evaluateInvisibleWallRuntimeGap({
      sameArena: true,
      runtimeReplacedStaticCount: 8,
      hasInteractiveRuntime: false,
      alreadyLogged: true,
    })).toEqual({ shouldLog: false });
  });

  it('stays silent while the interactive runtime is live', () => {
    expect(evaluateInvisibleWallRuntimeGap({
      sameArena: true,
      runtimeReplacedStaticCount: 8,
      hasInteractiveRuntime: true,
      alreadyLogged: false,
    })).toEqual({ shouldLog: false });
  });

  it('stays silent when the arena has no runtime-replaced statics', () => {
    expect(evaluateInvisibleWallRuntimeGap({
      sameArena: true,
      runtimeReplacedStaticCount: 0,
      hasInteractiveRuntime: false,
      alreadyLogged: false,
    })).toEqual({ shouldLog: false });
  });

  it('stays silent for a non-live arena (the early-return serves it by design)', () => {
    expect(evaluateInvisibleWallRuntimeGap({
      sameArena: false,
      runtimeReplacedStaticCount: 8,
      hasInteractiveRuntime: false,
      alreadyLogged: false,
    })).toEqual({ shouldLog: false });
  });

  it('logs the exact regression-window message', () => {
    expect(INVISIBLE_WALL_RUNTIME_GAP_MESSAGE).toBe(
      '[invisible-wall] active arena has runtime-replaced statics but no interactive runtime; hidden house colliders are live',
    );
  });
});
