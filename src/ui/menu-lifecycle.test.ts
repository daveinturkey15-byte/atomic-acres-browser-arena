import { describe, expect, it } from 'vitest';
import { INITIAL_MENU_LIFECYCLE_STATE, reduceMenuLifecycle, type MenuLifecycleEvent } from './menu-lifecycle';

function events(...sequence: MenuLifecycleEvent[]) {
  return sequence.reduce(reduceMenuLifecycle, INITIAL_MENU_LIFECYCLE_STATE);
}

describe('active-match menu and pointer-lock lifecycle', () => {
  it('holds the deployment surface until match-ready and ignores premature pointer requests', () => {
    const deploying = events(
      { type: 'match-start' },
      { type: 'pointer-request', source: 'match-start' },
    );
    expect(deploying).toMatchObject({
      surface: 'deploying',
      pointerLock: 'unlocked',
      reason: 'match-start',
      visibilityChangeCount: 0,
      pointerRequestCount: 0,
    });

    const state = events(
      { type: 'match-start' },
      { type: 'match-ready' },
      { type: 'pointer-request', source: 'match-start' },
      { type: 'pointer-lost', focusTransition: false, overlay: null, pauseAllowed: true },
      { type: 'pointer-rejected' },
    );
    expect(state).toMatchObject({
      surface: 'hidden',
      pointerLock: 'unlocked',
      reason: 'pointer-transient-null',
      visibilityChangeCount: 1,
      pauseOpenCount: 0,
      pointerRequestCount: 1,
    });

    const rejected = events(
      { type: 'match-start' },
      { type: 'match-ready' },
      { type: 'pointer-request', source: 'match-start' },
      { type: 'pointer-rejected' },
    );
    expect(rejected).toMatchObject({
      surface: 'hidden',
      pointerLock: 'denied',
      reason: 'pointer-rejected',
      visibilityChangeCount: 1,
      pauseOpenCount: 0,
      pointerRejectCount: 1,
    });
  });

  it('opens pause only after a focused loss from an acquired lock', () => {
    const paused = events(
      { type: 'match-start' },
      { type: 'match-ready' },
      { type: 'pointer-request', source: 'match-start' },
      { type: 'pointer-acquired' },
      { type: 'pointer-lost', focusTransition: false, overlay: null, pauseAllowed: true },
    );
    expect(paused).toMatchObject({
      surface: 'paused-match',
      pointerLock: 'unlocked',
      reason: 'escape',
      visibilityChangeCount: 2,
      pauseOpenCount: 1,
    });
  });

  it('keeps focus loss, chat, targeting, death and match end from opening pause', () => {
    const base = events(
      { type: 'match-start' },
      { type: 'match-ready' },
      { type: 'pointer-request', source: 'match-start' },
      { type: 'pointer-acquired' },
    );
    const focusLost = reduceMenuLifecycle(base, { type: 'focus-lost' });
    const pointerLost = reduceMenuLifecycle(focusLost, {
      type: 'pointer-lost', focusTransition: true, overlay: null, pauseAllowed: true,
    });
    const focused = reduceMenuLifecycle(pointerLost, { type: 'focus-gained' });
    expect(focused).toMatchObject({ surface: 'hidden', pointerLock: 'unlocked', reason: 'focus-return', pauseOpenCount: 0 });

    for (const overlay of ['chat', 'tactical-map'] as const) {
      expect(reduceMenuLifecycle(base, {
        type: 'pointer-lost', focusTransition: false, overlay, pauseAllowed: true,
      })).toMatchObject({ surface: 'hidden', reason: overlay, pauseOpenCount: 0 });
    }
    expect(reduceMenuLifecycle(base, {
      type: 'pointer-lost', focusTransition: false, overlay: null, pauseAllowed: false,
    })).toMatchObject({ surface: 'hidden', pauseOpenCount: 0 });
  });

  it('closes pause before a resume request and never bounces open when that request rejects', () => {
    const resumed = events(
      { type: 'match-start' },
      { type: 'match-ready' },
      { type: 'pointer-request', source: 'match-start' },
      { type: 'pointer-acquired' },
      { type: 'pointer-lost', focusTransition: false, overlay: null, pauseAllowed: true },
      { type: 'resume' },
      { type: 'pointer-request', source: 'resume' },
      { type: 'pointer-rejected' },
    );
    expect(resumed).toMatchObject({
      surface: 'hidden',
      pointerLock: 'denied',
      reason: 'pointer-rejected',
      visibilityChangeCount: 3,
      pauseOpenCount: 1,
      pointerRequestCount: 2,
      pointerRejectCount: 1,
    });
  });

  it('holds an intentional pause if a stale request acquires after the pause opened', () => {
    const raced = events(
      { type: 'match-start' },
      { type: 'match-ready' },
      { type: 'pointer-request', source: 'canvas' },
      { type: 'pause-requested', reason: 'escape' },
      { type: 'pointer-acquired' },
    );
    expect(raced).toMatchObject({
      surface: 'paused-match',
      pointerLock: 'unlocked',
      reason: 'escape',
      visibilityChangeCount: 2,
      pauseOpenCount: 1,
    });
  });

  it('preserves the paused menu across focus changes and restores pre-match preview ownership', () => {
    const paused = events(
      { type: 'match-start' },
      { type: 'match-ready' },
      { type: 'pause-requested', reason: 'debug-pause' },
      { type: 'focus-lost' },
      { type: 'focus-gained' },
    );
    expect(paused).toMatchObject({ surface: 'paused-match', reason: 'focus-return', pauseOpenCount: 1 });
    expect(reduceMenuLifecycle(paused, { type: 'return-pre-match' })).toMatchObject({
      surface: 'pre-match', pointerLock: 'unlocked', reason: 'return-pre-match',
    });
  });

  it('survives twenty deployment starts without an unsolicited menu-open transition', () => {
    let state = INITIAL_MENU_LIFECYCLE_STATE;
    for (let start = 0; start < 20; start += 1) {
      state = reduceMenuLifecycle(state, { type: 'match-start' });
      expect(state).toMatchObject({
        surface: 'deploying',
        matchStartCount: start + 1,
        pauseOpenCount: 0,
      });
      state = reduceMenuLifecycle(state, { type: 'match-ready' });
      expect(state).toMatchObject({ surface: 'hidden', pauseOpenCount: 0 });

      if (start % 3 === 0) {
        state = reduceMenuLifecycle(state, { type: 'pointer-request', source: 'match-start' });
        state = reduceMenuLifecycle(state, { type: 'pointer-rejected' });
      } else if (start % 3 === 1) {
        state = reduceMenuLifecycle(state, { type: 'pointer-request', source: 'match-start' });
        state = reduceMenuLifecycle(state, {
          type: 'pointer-lost', focusTransition: false, overlay: null, pauseAllowed: true,
        });
        state = reduceMenuLifecycle(state, { type: 'pointer-acquired' });
      }

      expect(state).toMatchObject({ surface: 'hidden', pauseOpenCount: 0 });
      state = reduceMenuLifecycle(state, { type: 'return-pre-match' });
    }

    expect(state).toMatchObject({
      surface: 'pre-match',
      matchStartCount: 20,
      matchReadyCount: 20,
      pauseOpenCount: 0,
      visibilityChangeCount: 40,
    });
  });
});
