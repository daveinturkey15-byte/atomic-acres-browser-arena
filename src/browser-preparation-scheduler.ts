const VISIBLE_FRAME_FALLBACK_MS = 250;

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export type BrowserCpuTaskLaneTelemetry = Readonly<{
  queuedTasks: number;
  channelActive: boolean;
  messagePending: boolean;
  postedTurns: number;
  completedTasks: number;
  fallbackTasks: number;
  cleanupCount: number;
}>;

type BrowserCpuTaskLaneDependencies = Readonly<{
  createMessageChannel: () => MessageChannel | null;
  scheduleTimer: (task: () => void) => void;
}>;

function defaultMessageChannel(): MessageChannel | null {
  return typeof globalThis.MessageChannel === 'function' ? new globalThis.MessageChannel() : null;
}

/**
 * Browser task lane for CPU/decode preparation that must progress in a hidden
 * tab. One callback is admitted per MessageChannel turn, so chained work still
 * yields to other browser task sources without inheriting hidden timer clamps.
 */
export class BrowserCpuTaskLane {
  private readonly queue: Array<() => void> = [];
  private channel: MessageChannel | null = null;
  private messagePending = false;
  private postedTurns = 0;
  private completedTasks = 0;
  private fallbackTasks = 0;
  private cleanupCount = 0;

  constructor(private readonly dependencies: BrowserCpuTaskLaneDependencies = {
    createMessageChannel: defaultMessageChannel,
    scheduleTimer: (task) => { globalThis.setTimeout(task, 0); },
  }) {}

  schedule(task: () => void): void {
    this.queue.push(task);
    this.postNextTurn();
  }

  telemetry(): BrowserCpuTaskLaneTelemetry {
    return Object.freeze({
      queuedTasks: this.queue.length,
      channelActive: this.channel !== null,
      messagePending: this.messagePending,
      postedTurns: this.postedTurns,
      completedTasks: this.completedTasks,
      fallbackTasks: this.fallbackTasks,
      cleanupCount: this.cleanupCount,
    });
  }

  private openChannel(): MessageChannel | null {
    if (this.channel) return this.channel;
    try {
      const channel = this.dependencies.createMessageChannel();
      if (!channel) return null;
      this.channel = channel;
      channel.port1.onmessage = () => this.runOneTurn();
      channel.port1.start();
      return channel;
    } catch {
      this.closeChannel();
      return null;
    }
  }

  private postNextTurn(): void {
    if (this.messagePending || this.queue.length === 0) return;
    const channel = this.openChannel();
    if (!channel) {
      this.fallbackQueuedTasks();
      return;
    }
    try {
      channel.port2.postMessage(undefined);
      this.messagePending = true;
      this.postedTurns += 1;
    } catch {
      // Remove the exact queued callbacks before timer fallback. A failed port
      // must never retain a second path that can resolve the same operation.
      this.fallbackQueuedTasks();
    }
  }

  private runOneTurn(): void {
    this.messagePending = false;
    const task = this.queue.shift();
    if (!task) {
      this.closeChannel();
      return;
    }
    try {
      task();
    } finally {
      this.completedTasks += 1;
      if (this.queue.length > 0) this.postNextTurn();
      else this.scheduleDrainCleanup();
    }
  }

  private scheduleDrainCleanup(): void {
    const drainedChannel = this.channel;
    queueMicrotask(() => {
      if (this.channel === drainedChannel && this.queue.length === 0 && !this.messagePending) {
        this.closeChannel();
      }
    });
  }

  private fallbackQueuedTasks(): void {
    const queued = this.queue.splice(0, this.queue.length);
    this.closeChannel();
    for (const task of queued) {
      this.fallbackTasks += 1;
      this.dependencies.scheduleTimer(() => {
        try {
          task();
        } finally {
          this.completedTasks += 1;
        }
      });
    }
  }

  private closeChannel(): void {
    const channel = this.channel;
    this.channel = null;
    this.messagePending = false;
    if (!channel) return;
    try { channel.port1.onmessage = null; } catch { /* Best-effort shutdown of a failed browser port. */ }
    try { channel.port1.close(); } catch { /* The peer port still receives its own close attempt. */ }
    try { channel.port2.close(); } catch { /* The queue has already transferred or drained. */ }
    this.cleanupCount += 1;
  }
}

const browserCpuTaskLane = new BrowserCpuTaskLane();

export function scheduleBrowserCpuTask(task: () => void): void {
  browserCpuTaskLane.schedule(task);
}

export function yieldBrowserCpuTask(): Promise<void> {
  return new Promise<void>((resolve) => scheduleBrowserCpuTask(resolve));
}

export function browserCpuTaskLaneTelemetry(): BrowserCpuTaskLaneTelemetry {
  return browserCpuTaskLane.telemetry();
}

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
    return yieldBrowserCpuTask();
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
      if (documentIsBackgrounded()) scheduleBrowserCpuTask(finish);
    };
    if (canObserveVisibility) document.addEventListener('visibilitychange', onVisibilityChange);
    fallbackHandle = globalThis.setTimeout(finish, VISIBLE_FRAME_FALLBACK_MS);
    frameHandle = requestAnimationFrame(() => finish());
  });
}

const FOREGROUND_WAIT_FALLBACK_MS = 8_000;

/**
 * Waits for a browser-visible task turn without ever authoring a hidden
 * presentation frame. CPU/network/decode preparation uses the timer-backed
 * helper above; renderer submissions use this foreground ownership barrier.
 * A bounded fallback timer prevents indefinite hangs when the browser does
 * not report focus (RDP, occluded windows, some Windows configurations).
 */
export function waitForVisibleBrowserPreparation(signal?: AbortSignal): Promise<void> {
  if (typeof document === 'undefined'
    || typeof document.addEventListener !== 'function'
    || typeof document.removeEventListener !== 'function'
    || browserOwnsForegroundPresentation()) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const foregroundWindow = typeof window !== 'undefined'
      && typeof window.addEventListener === 'function'
      && typeof window.removeEventListener === 'function'
      ? window
      : null;
    const cleanup = (): void => {
      globalThis.clearTimeout(fallbackHandle);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      foregroundWindow?.removeEventListener('focus', onWindowFocus);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal?.reason);
    };
    const finishIfForeground = (): void => {
      if (!browserOwnsForegroundPresentation()) return;
      finish();
    };
    const onVisibilityChange = (): void => finishIfForeground();
    const onWindowFocus = (): void => finishIfForeground();
    const fallbackHandle = globalThis.setTimeout(finish, FOREGROUND_WAIT_FALLBACK_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    foregroundWindow?.addEventListener('focus', onWindowFocus);
    // Recheck after registration: ownership may have changed between the
    // initial gate and the listener wiring.
    finishIfForeground();
  });
}

/** One actual compositor boundary, retried if visibility changes before rAF. */
export async function yieldVisibleBrowserPresentationFrame(signal?: AbortSignal): Promise<number> {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return performance.now();
  }
  const foregroundWindow = typeof window !== 'undefined'
    && typeof window.addEventListener === 'function'
    && typeof window.removeEventListener === 'function'
    ? window
    : null;
  while (true) {
    if (signal?.aborted) throw signal.reason;
    await waitForVisibleBrowserPreparation(signal);
    // Resolves with the frame time on a valid foreground boundary, or null when
    // ownership is lost mid-frame so the outer loop waits and requests again. A
    // cancelled request never resolves, even if the browser still fires it.
    const frame = await new Promise<number | null>((resolve, reject) => {
      let settled = false;
      let frameHandle = 0;
      const cleanup = (): void => {
        document.removeEventListener('visibilitychange', onForegroundLoss);
        foregroundWindow?.removeEventListener('blur', onForegroundLoss);
        signal?.removeEventListener('abort', onAbort);
      };
      const cancelPending = (): void => {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameHandle);
      };
      const onForegroundLoss = (): void => {
        if (settled || browserOwnsForegroundPresentation()) return;
        settled = true;
        cancelPending();
        cleanup();
        resolve(null);
      };
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        cancelPending();
        cleanup();
        reject(signal?.reason);
      };
      frameHandle = requestAnimationFrame((at) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(browserOwnsForegroundPresentation() ? at : null);
      });
      document.addEventListener('visibilitychange', onForegroundLoss);
      foregroundWindow?.addEventListener('blur', onForegroundLoss);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    if (frame !== null) return frame;
  }
}

/**
 * Keeps noncritical asset preparation on the browser idle lane while visible,
 * then immediately transfers ownership to a timer task if the page is hidden.
 */
export function scheduleBrowserPreparationIdleTask(task: () => void, timeoutMs = 2_000): void {
  if (typeof document === 'undefined' || typeof window === 'undefined' || documentIsBackgrounded()) {
    scheduleBrowserCpuTask(task);
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
    if (documentIsBackgrounded()) scheduleBrowserCpuTask(run);
  };
  if (canObserveVisibility) document.addEventListener('visibilitychange', onVisibilityChange);
  idleHandle = idleWindow.requestIdleCallback.call(idleWindow, run, { timeout: timeoutMs });
  // requestIdleCallback's own timeout is browser-scheduled and can still be
  // starved in an occluded window. Share ownership with one real timer; the
  // once guard keeps the normal idle-first path unchanged.
  fallbackHandle = globalThis.setTimeout(run, timeoutMs);
}
