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

/**
 * Waits for a browser-visible task turn without ever authoring a hidden
 * presentation frame. CPU/network/decode preparation uses the timer-backed
 * helper above; renderer submissions use this foreground ownership barrier.
 */
function browserPreparationAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Browser presentation wait aborted', 'AbortError');
}

export function waitForVisibleBrowserPreparation(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(browserPreparationAbortReason(signal));
  if (typeof document === 'undefined'
    || typeof document.addEventListener !== 'function'
    || typeof document.removeEventListener !== 'function'
    || browserOwnsForegroundPresentation()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const foregroundWindow = typeof window !== 'undefined'
      && typeof window.addEventListener === 'function'
      && typeof window.removeEventListener === 'function'
      ? window
      : null;
    let settled = false;
    const cleanup = (): void => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      foregroundWindow?.removeEventListener('focus', onWindowFocus);
      signal?.removeEventListener('abort', onAbort);
    };
    const finishIfForeground = (): void => {
      if (settled || !browserOwnsForegroundPresentation()) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onVisibilityChange = (): void => finishIfForeground();
    const onWindowFocus = (): void => finishIfForeground();
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(browserPreparationAbortReason(signal!));
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    foregroundWindow?.addEventListener('focus', onWindowFocus);
    signal?.addEventListener('abort', onAbort, { once: true });
    // Ownership can change while the browser queues visibility/focus delivery.
    // Recheck after every listener is attached so the wait cannot miss that
    // transition even on engines with unusual focus-event ordering.
    if (signal?.aborted) onAbort();
    else finishIfForeground();
  });
}

/** One actual compositor boundary, retried if visibility changes before rAF. */
export async function yieldVisibleBrowserPresentationFrame(signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) throw browserPreparationAbortReason(signal);
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return performance.now();
  }
  while (true) {
    await waitForVisibleBrowserPreparation(signal);
    const frame = await new Promise<number | null>((resolve, reject) => {
      const foregroundWindow = typeof window !== 'undefined'
        && typeof window.addEventListener === 'function'
        && typeof window.removeEventListener === 'function'
        ? window
        : null;
      const canObserveVisibility = typeof document.addEventListener === 'function'
        && typeof document.removeEventListener === 'function';
      let settled = false;
      let frameHandle: number | null = null;
      const cleanup = (): void => {
        if (canObserveVisibility) document.removeEventListener('visibilitychange', onOwnershipChange);
        foregroundWindow?.removeEventListener('focus', onOwnershipChange);
        foregroundWindow?.removeEventListener('blur', onOwnershipChange);
        signal?.removeEventListener('abort', onAbort);
      };
      const cancelRequestedFrame = (): void => {
        if (frameHandle === null || typeof cancelAnimationFrame !== 'function') return;
        cancelAnimationFrame(frameHandle);
        frameHandle = null;
      };
      const retryAfterOwnershipLoss = (): void => {
        if (settled) return;
        settled = true;
        cancelRequestedFrame();
        cleanup();
        resolve(null);
      };
      const onOwnershipChange = (): void => {
        if (!browserOwnsForegroundPresentation()) retryAfterOwnershipLoss();
      };
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        cancelRequestedFrame();
        cleanup();
        reject(browserPreparationAbortReason(signal!));
      };
      if (canObserveVisibility) document.addEventListener('visibilitychange', onOwnershipChange);
      foregroundWindow?.addEventListener('focus', onOwnershipChange);
      foregroundWindow?.addEventListener('blur', onOwnershipChange);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      // Close the foreground-to-rAF ownership race after the listeners exist.
      if (!browserOwnsForegroundPresentation()) {
        retryAfterOwnershipLoss();
        return;
      }
      frameHandle = requestAnimationFrame((at) => {
        if (settled) return;
        frameHandle = null;
        if (!browserOwnsForegroundPresentation()) {
          retryAfterOwnershipLoss();
          return;
        }
        settled = true;
        cleanup();
        resolve(at);
      });
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
