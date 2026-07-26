export type MenuSurface = 'pre-match' | 'hidden' | 'paused-match' | 'error';

export type PointerLockPhase = 'unlocked' | 'requesting' | 'locked' | 'denied' | 'focus-suspended';

export type PointerLockRequestSource = 'match-start' | 'respawn' | 'resume' | 'canvas' | 'chat-close' | 'targeting-close';

export type MenuLifecycleReason =
  | 'initial'
  | 'match-start'
  | 'pointer-request'
  | 'pointer-acquired'
  | 'pointer-rejected'
  | 'pointer-transient-null'
  | 'escape'
  | 'focus-loss'
  | 'focus-return'
  | 'chat'
  | 'tactical-map'
  | 'resume'
  | 'debug-pause'
  | 'return-pre-match'
  | 'fatal-error';

export type MenuLifecycleState = Readonly<{
  surface: MenuSurface;
  pointerLock: PointerLockPhase;
  reason: MenuLifecycleReason;
  requestSource: PointerLockRequestSource | null;
  eventCount: number;
  transitionCount: number;
  visibilityChangeCount: number;
  pauseOpenCount: number;
  pointerRequestCount: number;
  pointerRejectCount: number;
}>;

export type MenuLifecycleEvent =
  | Readonly<{ type: 'match-start' }>
  | Readonly<{ type: 'pointer-request'; source: PointerLockRequestSource }>
  | Readonly<{ type: 'pointer-acquired' }>
  | Readonly<{ type: 'pointer-rejected' }>
  | Readonly<{
      type: 'pointer-lost';
      focusTransition: boolean;
      overlay: 'chat' | 'tactical-map' | null;
      pauseAllowed: boolean;
    }>
  | Readonly<{ type: 'focus-lost' }>
  | Readonly<{ type: 'focus-gained' }>
  | Readonly<{ type: 'pause-requested'; reason: 'escape' | 'debug-pause' }>
  | Readonly<{ type: 'resume' }>
  | Readonly<{ type: 'return-pre-match' }>
  | Readonly<{ type: 'fatal-error' }>;

export const INITIAL_MENU_LIFECYCLE_STATE: MenuLifecycleState = Object.freeze({
  surface: 'pre-match',
  pointerLock: 'unlocked',
  reason: 'initial',
  requestSource: null,
  eventCount: 0,
  transitionCount: 0,
  visibilityChangeCount: 0,
  pauseOpenCount: 0,
  pointerRequestCount: 0,
  pointerRejectCount: 0,
});

function menuVisible(surface: MenuSurface): boolean {
  return surface !== 'hidden';
}

function transition(
  current: MenuLifecycleState,
  patch: Partial<MenuLifecycleState>,
): MenuLifecycleState {
  const surface = patch.surface ?? current.surface;
  const pointerLock = patch.pointerLock ?? current.pointerLock;
  const reason = patch.reason ?? current.reason;
  const requestSource = patch.requestSource === undefined ? current.requestSource : patch.requestSource;
  const changed = surface !== current.surface
    || pointerLock !== current.pointerLock
    || reason !== current.reason
    || requestSource !== current.requestSource;
  return Object.freeze({
    ...current,
    ...patch,
    surface,
    pointerLock,
    reason,
    requestSource,
    eventCount: current.eventCount + 1,
    transitionCount: current.transitionCount + (changed ? 1 : 0),
    visibilityChangeCount: current.visibilityChangeCount
      + (menuVisible(surface) === menuVisible(current.surface) ? 0 : 1),
  });
}

export function reduceMenuLifecycle(
  current: MenuLifecycleState,
  event: MenuLifecycleEvent,
): MenuLifecycleState {
  if (event.type === 'match-start') {
    return transition(current, {
      surface: 'hidden',
      pointerLock: 'unlocked',
      reason: 'match-start',
      requestSource: null,
    });
  }
  if (event.type === 'pointer-request') {
    if (current.surface === 'pre-match' || current.surface === 'error') return transition(current, {});
    return transition(current, {
      surface: 'hidden',
      pointerLock: 'requesting',
      reason: 'pointer-request',
      requestSource: event.source,
      pointerRequestCount: current.pointerRequestCount + 1,
    });
  }
  if (event.type === 'pointer-acquired') {
    if (current.surface === 'pre-match' || current.surface === 'error') return transition(current, {});
    if (current.surface === 'paused-match') {
      return transition(current, {
        surface: 'paused-match',
        pointerLock: 'unlocked',
        requestSource: null,
      });
    }
    return transition(current, {
      surface: 'hidden',
      pointerLock: 'locked',
      reason: 'pointer-acquired',
      requestSource: null,
    });
  }
  if (event.type === 'pointer-rejected') {
    if (current.pointerLock !== 'requesting') return transition(current, {});
    return transition(current, {
      surface: 'hidden',
      pointerLock: 'denied',
      reason: 'pointer-rejected',
      requestSource: null,
      pointerRejectCount: current.pointerRejectCount + 1,
    });
  }
  if (event.type === 'pointer-lost') {
    if (current.surface === 'pre-match' || current.surface === 'error') return transition(current, {});
    if (event.overlay) {
      return transition(current, {
        surface: 'hidden',
        pointerLock: 'unlocked',
        reason: event.overlay,
        requestSource: null,
      });
    }
    if (event.focusTransition) {
      return transition(current, {
        surface: current.surface === 'paused-match' ? 'paused-match' : 'hidden',
        pointerLock: 'focus-suspended',
        reason: 'focus-loss',
        requestSource: null,
      });
    }
    if (current.pointerLock !== 'locked' || !event.pauseAllowed) {
      return transition(current, {
        surface: current.surface === 'paused-match' ? 'paused-match' : 'hidden',
        pointerLock: 'unlocked',
        reason: current.pointerLock === 'requesting' ? 'pointer-transient-null' : current.reason,
        requestSource: null,
      });
    }
    return transition(current, {
      surface: 'paused-match',
      pointerLock: 'unlocked',
      reason: 'escape',
      requestSource: null,
      pauseOpenCount: current.pauseOpenCount + 1,
    });
  }
  if (event.type === 'focus-lost') {
    if (current.surface === 'pre-match' || current.surface === 'error') return transition(current, {});
    return transition(current, {
      surface: current.surface === 'paused-match' ? 'paused-match' : 'hidden',
      pointerLock: 'focus-suspended',
      reason: 'focus-loss',
      requestSource: null,
    });
  }
  if (event.type === 'focus-gained') {
    if (current.pointerLock !== 'focus-suspended') return transition(current, {});
    return transition(current, {
      surface: current.surface === 'paused-match' ? 'paused-match' : 'hidden',
      pointerLock: 'unlocked',
      reason: 'focus-return',
      requestSource: null,
    });
  }
  if (event.type === 'pause-requested') {
    if (current.surface === 'pre-match' || current.surface === 'error') return transition(current, {});
    return transition(current, {
      surface: 'paused-match',
      pointerLock: 'unlocked',
      reason: event.reason,
      requestSource: null,
      pauseOpenCount: current.pauseOpenCount + (current.surface === 'paused-match' ? 0 : 1),
    });
  }
  if (event.type === 'resume') {
    if (current.surface !== 'paused-match') return transition(current, {});
    return transition(current, {
      surface: 'hidden',
      pointerLock: 'unlocked',
      reason: 'resume',
      requestSource: null,
    });
  }
  if (event.type === 'return-pre-match') {
    return transition(current, {
      surface: 'pre-match',
      pointerLock: 'unlocked',
      reason: 'return-pre-match',
      requestSource: null,
    });
  }
  return transition(current, {
    surface: 'error',
    pointerLock: 'unlocked',
    reason: 'fatal-error',
    requestSource: null,
  });
}
