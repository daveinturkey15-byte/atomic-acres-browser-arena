const VISIBLE_FRAME_FALLBACK_MS = 250;

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function documentIsBackgrounded(): boolean {
  return typeof document !== 'undefined' && document.visibilityState !== 'visible';
}

export function browserOwnsForegroundPresentation(): boolean {
  if (documentIsBackgrounded()) return false;
  return typeof document === 'undefined'
    || typeof document.hasFocus !== 'function'
    || document.hasFocus();
}

/**
 * Yields preparation to a real presentation frame while one is available, but
 * never makes asset/decode work depend on requestAnimationFrame. Browsers may
 * suspend a previously requested frame when the page becomes hidden.
 */
export function yieldBrowserPreparationFrame(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (documentIsBackgrounded() || typeof requestAnimationFrame !== 'function') {
    return new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }
  return new Promise<void>((resolve) => {
    let settled = false;
    let frameHandle: number | null = null;
    let fallbackHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    const canObserveVisibility = typeof document.addEventListener === 'function'
      && typeof document.removeEventListener === 'function';
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (fallbackHandle !== null) globalThis.clearTimeout(fallbackHandle);
      if (frameHandle !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameHandle);
      if (canObserveVisibility) document.removeEventListener('visibilitychange', onVisibilityChange);
      resolve();
    };
    const onVisibilityChange = (): void => {
      if (documentIsBackgrounded()) finish();
    };
    if (canObserveVisibility) document.addEventListener('visibilitychange', onVisibilityChange);
    fallbackHandle = globalThis.setTimeout(finish, VISIBLE_FRAME_FALLBACK_MS);
    frameHandle = requestAnimationFrame(() => finish());
  });
}

/**
 * Waits for a browser-visible task turn without ever authoring a hidden
 * presentation frame. CPU/network/decode preparation uses the timer-backed
 * helper above; renderer submissions use this foreground ownership barrier.
 */
export function waitForVisibleBrowserPreparation(): Promise<void> {
  if (typeof document === 'undefined'
    || typeof document.addEventListener !== 'function'
    || typeof document.removeEventListener !== 'function'
    || browserOwnsForegroundPresentation()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const foregroundWindow = typeof window !== 'undefined'
      && typeof window.addEventListener === 'function'
      && typeof window.removeEventListener === 'function'
      ? window
      : null;
    const finishIfForeground = (): void => {
      if (!browserOwnsForegroundPresentation()) return;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      foregroundWindow?.removeEventListener('focus', onWindowFocus);
      resolve();
    };
    const onVisibilityChange = (): void => finishIfForeground();
    const onWindowFocus = (): void => finishIfForeground();
    document.addEventListener('visibilitychange', onVisibilityChange);
    foregroundWindow?.addEventListener('focus', onWindowFocus);
  });
}

/** One actual compositor boundary, retried if visibility changes before rAF. */
export async function yieldVisibleBrowserPresentationFrame(): Promise<number> {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return performance.now();
  }
  while (true) {
    await waitForVisibleBrowserPreparation();
    const frame = await new Promise<Readonly<{ at: number; visible: boolean }>>((resolve) => {
      requestAnimationFrame((at) => resolve({ at, visible: browserOwnsForegroundPresentation() }));
    });
    if (frame.visible) return frame.at;
  }
}

/**
 * Keeps noncritical asset preparation on the browser idle lane while visible,
 * then immediately transfers ownership to a timer task if the page is hidden.
 */
export function scheduleBrowserPreparationIdleTask(task: () => void, timeoutMs = 2_000): void {
  if (typeof document === 'undefined' || typeof window === 'undefined' || documentIsBackgrounded()) {
    globalThis.setTimeout(task, 0);
    return;
  }
  const idleWindow = window as IdleCapableWindow;
  if (typeof idleWindow.requestIdleCallback !== 'function') {
    globalThis.setTimeout(task, 0);
    return;
  }
  let settled = false;
  let idleHandle: number | null = null;
  let fallbackHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  const canObserveVisibility = typeof document.addEventListener === 'function'
    && typeof document.removeEventListener === 'function';
  const run = (): void => {
    if (settled) return;
    settled = true;
    if (idleHandle !== null && typeof idleWindow.cancelIdleCallback === 'function') {
      idleWindow.cancelIdleCallback(idleHandle);
    }
    if (fallbackHandle !== null) globalThis.clearTimeout(fallbackHandle);
    if (canObserveVisibility) document.removeEventListener('visibilitychange', onVisibilityChange);
    task();
  };
  const onVisibilityChange = (): void => {
    if (documentIsBackgrounded()) globalThis.setTimeout(run, 0);
  };
  if (canObserveVisibility) document.addEventListener('visibilitychange', onVisibilityChange);
  idleHandle = idleWindow.requestIdleCallback.call(idleWindow, run, { timeout: timeoutMs });
  // requestIdleCallback's own timeout is browser-scheduled and can still be
  // starved in an occluded window. Share ownership with one real timer; the
  // once guard keeps the normal idle-first path unchanged.
  fallbackHandle = globalThis.setTimeout(run, timeoutMs);
}
