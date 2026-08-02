import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserCpuTaskLane,
  browserOwnsForegroundPresentation,
  scheduleBrowserPreparationIdleTask,
  waitForVisibleBrowserPreparation,
  yieldBrowserPreparationFrame,
  yieldVisibleBrowserPresentationFrame,
} from './browser-preparation-scheduler';

function manualMessageChannel(options: Readonly<{ throwOnPost?: boolean }> = {}): Readonly<{
  channel: MessageChannel;
  dispatchOne: () => void;
  pendingCount: () => number;
  port1Close: ReturnType<typeof vi.fn>;
  port2Close: ReturnType<typeof vi.fn>;
}> {
  const pending: unknown[] = [];
  const port1Close = vi.fn();
  const port2Close = vi.fn();
  const port1 = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    start: vi.fn(),
    close: port1Close,
  };
  const port2 = {
    onmessage: null,
    start: vi.fn(),
    close: port2Close,
    postMessage: (value: unknown) => {
      if (options.throwOnPost) throw new DOMException('closed port', 'InvalidStateError');
      pending.push(value);
    },
  };
  return {
    channel: { port1, port2 } as unknown as MessageChannel,
    dispatchOne: () => {
      if (pending.length === 0) throw new Error('No queued MessageChannel turn');
      const data = pending.shift();
      port1.onmessage?.({ data } as MessageEvent);
    },
    pendingCount: () => pending.length,
    port1Close,
    port2Close,
  };
}

type VisibilityDocument = {
  visibilityState: DocumentVisibilityState;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

function visibilityDocument(initial: DocumentVisibilityState): Readonly<{
  document: VisibilityDocument;
  setVisibility: (visibility: DocumentVisibilityState) => void;
  listenerCount: () => number;
}> {
  let current = initial;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const fakeDocument: VisibilityDocument = {
    get visibilityState() { return current; },
    addEventListener: (_type, listener) => { listeners.add(listener); },
    removeEventListener: (_type, listener) => { listeners.delete(listener); },
  };
  return {
    document: fakeDocument,
    setVisibility: (visibility) => {
      current = visibility;
      for (const listener of listeners) {
        if (typeof listener === 'function') listener(new Event('visibilitychange'));
        else listener.handleEvent(new Event('visibilitychange'));
      }
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('browser preparation scheduler', () => {
  it('runs one CPU callback per MessageChannel turn in FIFO order and closes both drained ports', async () => {
    const manual = manualMessageChannel();
    const createMessageChannel = vi.fn(() => manual.channel);
    const scheduleTimer = vi.fn();
    const lane = new BrowserCpuTaskLane({ createMessageChannel, scheduleTimer });
    const order: string[] = [];

    lane.schedule(() => order.push('first'));
    lane.schedule(() => order.push('second'));

    expect(createMessageChannel).toHaveBeenCalledTimes(1);
    expect(manual.pendingCount()).toBe(1);
    expect(lane.telemetry()).toMatchObject({ queuedTasks: 2, postedTurns: 1, channelActive: true });
    manual.dispatchOne();
    await Promise.resolve();

    expect(order).toEqual(['first']);
    expect(manual.pendingCount()).toBe(1);
    expect(lane.telemetry()).toMatchObject({ queuedTasks: 1, postedTurns: 2, channelActive: true });
    manual.dispatchOne();
    await Promise.resolve();

    expect(order).toEqual(['first', 'second']);
    expect(lane.telemetry()).toMatchObject({
      queuedTasks: 0,
      completedTasks: 2,
      channelActive: false,
      cleanupCount: 1,
    });
    expect(manual.port1Close).toHaveBeenCalledTimes(1);
    expect(manual.port2Close).toHaveBeenCalledTimes(1);
    expect(scheduleTimer).not.toHaveBeenCalled();
  });

  it('removes a failed-post callback before exact-once timer fallback', () => {
    const manual = manualMessageChannel({ throwOnPost: true });
    const timers: Array<() => void> = [];
    const lane = new BrowserCpuTaskLane({
      createMessageChannel: () => manual.channel,
      scheduleTimer: (task) => { timers.push(task); },
    });
    const task = vi.fn();

    lane.schedule(task);

    expect(lane.telemetry()).toMatchObject({
      queuedTasks: 0,
      channelActive: false,
      fallbackTasks: 1,
      completedTasks: 0,
      cleanupCount: 1,
    });
    expect(timers).toHaveLength(1);
    expect(manual.pendingCount()).toBe(0);
    timers[0]!();
    expect(task).toHaveBeenCalledTimes(1);
    expect(lane.telemetry().completedTasks).toBe(1);
  });

  it('falls back cleanly when MessageChannel is unavailable or construction fails', () => {
    const timers: Array<() => void> = [];
    const task = vi.fn();
    const unavailable = new BrowserCpuTaskLane({
      createMessageChannel: () => null,
      scheduleTimer: (scheduled) => { timers.push(scheduled); },
    });
    unavailable.schedule(task);
    expect(unavailable.telemetry()).toMatchObject({ queuedTasks: 0, fallbackTasks: 1, channelActive: false });

    const failed = new BrowserCpuTaskLane({
      createMessageChannel: () => { throw new Error('constructor rejected'); },
      scheduleTimer: (scheduled) => { timers.push(scheduled); },
    });
    failed.schedule(task);
    expect(failed.telemetry()).toMatchObject({ queuedTasks: 0, fallbackTasks: 1, channelActive: false });

    for (const scheduled of timers) scheduled();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('reports foreground ownership only for a visible focused browser document', () => {
    vi.stubGlobal('document', { visibilityState: 'visible', hasFocus: () => false });
    expect(browserOwnsForegroundPresentation()).toBe(false);
    vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => true });
    expect(browserOwnsForegroundPresentation()).toBe(false);
    vi.stubGlobal('document', { visibilityState: 'visible', hasFocus: () => true });
    expect(browserOwnsForegroundPresentation()).toBe(true);
  });

  it('does not request a suspended animation frame when preparation begins hidden', async () => {
    const visibility = visibilityDocument('hidden');
    const suspendedAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal('document', visibility.document);
    vi.stubGlobal('requestAnimationFrame', suspendedAnimationFrame);

    await yieldBrowserPreparationFrame();

    expect(suspendedAnimationFrame).not.toHaveBeenCalled();
  });

  it('releases a visible preparation frame when the page becomes hidden', async () => {
    const visibility = visibilityDocument('visible');
    const suspendedAnimationFrame = vi.fn(() => 7);
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('document', visibility.document);
    vi.stubGlobal('requestAnimationFrame', suspendedAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const pending = yieldBrowserPreparationFrame();

    visibility.setVisibility('hidden');
    await pending;

    expect(suspendedAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });

  it('does not release a presentation owner while the browser is hidden', async () => {
    const visibility = visibilityDocument('hidden');
    vi.stubGlobal('document', visibility.document);
    let completed = false;
    const pending = waitForVisibleBrowserPreparation().then(() => { completed = true; });

    await Promise.resolve();
    expect(completed).toBe(false);
    visibility.setVisibility('visible');
    await pending;

    expect(completed).toBe(true);
  });

  it('rechecks foreground ownership after every listener is registered', async () => {
    let visibility: DocumentVisibilityState = 'hidden';
    const listeners = new Set<EventListenerOrEventListenerObject>();
    vi.stubGlobal('document', {
      get visibilityState() { return visibility; },
      hasFocus: () => true,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.add(listener);
        // Model an engine that updates ownership before it dispatches the
        // queued visibility event. The post-registration read must release the
        // waiter without depending on that later event.
        visibility = 'visible';
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener),
    });

    await expect(waitForVisibleBrowserPreparation()).resolves.toBeUndefined();
    expect(listeners.size).toBe(0);
  });

  it('cancels a hidden foreground wait and removes its ownership listeners', async () => {
    const visibility = visibilityDocument('hidden');
    const abort = new AbortController();
    const reason = new DOMException('superseded admission', 'AbortError');
    vi.stubGlobal('document', visibility.document);

    const pending = waitForVisibleBrowserPreparation(abort.signal);
    expect(visibility.listenerCount()).toBe(1);
    abort.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(visibility.listenerCount()).toBe(0);
  });

  it('requests an actual compositor frame only after presentation regains the foreground', async () => {
    const visibility = visibilityDocument('hidden');
    let frameCallback: FrameRequestCallback | null = null;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 17;
    });
    vi.stubGlobal('document', visibility.document);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    const pending = yieldVisibleBrowserPresentationFrame();

    await Promise.resolve();
    expect(requestFrame).not.toHaveBeenCalled();
    visibility.setVisibility('visible');
    for (let turn = 0; turn < 3 && !frameCallback; turn += 1) await Promise.resolve();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    (frameCallback as FrameRequestCallback | null)?.(123.5);

    await expect(pending).resolves.toBe(123.5);
  });

  it('cancels and retries the real frame across hidden and focus ownership oscillation', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    let focused = true;
    const documentListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const windowListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    const listenersFor = (
      target: Map<string, Set<EventListenerOrEventListenerObject>>,
      type: string,
    ): Set<EventListenerOrEventListenerObject> => {
      const existing = target.get(type);
      if (existing) return existing;
      const created = new Set<EventListenerOrEventListenerObject>();
      target.set(type, created);
      return created;
    };
    const dispatch = (
      target: Map<string, Set<EventListenerOrEventListenerObject>>,
      type: string,
    ): void => {
      for (const listener of [...listenersFor(target, type)]) {
        const event = new Event(type);
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      }
    };
    vi.stubGlobal('document', {
      get visibilityState() { return visibility; },
      hasFocus: () => focused,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => listenersFor(documentListeners, type).add(listener),
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => listenersFor(documentListeners, type).delete(listener),
    });
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => listenersFor(windowListeners, type).add(listener),
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => listenersFor(windowListeners, type).delete(listener),
    });
    let nextFrameHandle = 0;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      nextFrameHandle += 1;
      frameCallbacks.set(nextFrameHandle, callback);
      return nextFrameHandle;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    let completed = false;
    const pending = yieldVisibleBrowserPresentationFrame().then((at) => {
      completed = true;
      return at;
    });

    for (let turn = 0; turn < 4 && requestFrame.mock.calls.length < 1; turn += 1) await Promise.resolve();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    focused = false;
    dispatch(documentListeners, 'visibilitychange');
    dispatch(windowListeners, 'blur');
    await Promise.resolve();
    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(completed).toBe(false);

    visibility = 'visible';
    dispatch(documentListeners, 'visibilitychange');
    await Promise.resolve();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    focused = true;
    dispatch(windowListeners, 'focus');
    for (let turn = 0; turn < 4 && requestFrame.mock.calls.length < 2; turn += 1) await Promise.resolve();
    expect(requestFrame).toHaveBeenCalledTimes(2);

    focused = false;
    dispatch(windowListeners, 'blur');
    await Promise.resolve();
    expect(cancelFrame).toHaveBeenCalledWith(2);
    focused = true;
    dispatch(windowListeners, 'focus');
    for (let turn = 0; turn < 4 && requestFrame.mock.calls.length < 3; turn += 1) await Promise.resolve();
    expect(requestFrame).toHaveBeenCalledTimes(3);

    // Even if a browser delivers callbacks that were already cancelled, they
    // cannot become a hidden or stale successful presentation boundary.
    frameCallbacks.get(1)?.(101);
    frameCallbacks.get(2)?.(202);
    await Promise.resolve();
    expect(completed).toBe(false);
    frameCallbacks.get(3)?.(303);

    await expect(pending).resolves.toBe(303);
    expect([...documentListeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
    expect([...windowListeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it('aborts a requested presentation frame without accepting it as success', async () => {
    const visibility = visibilityDocument('visible');
    const abort = new AbortController();
    const reason = new DOMException('admission replaced', 'AbortError');
    const requestFrame = vi.fn(() => 41);
    const cancelFrame = vi.fn();
    vi.stubGlobal('document', visibility.document);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const pending = yieldVisibleBrowserPresentationFrame(abort.signal);

    for (let turn = 0; turn < 4 && requestFrame.mock.calls.length < 1; turn += 1) await Promise.resolve();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    abort.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(visibility.listenerCount()).toBe(0);
  });

  it('waits for window focus when a visible document does not own presentation', async () => {
    let focused = false;
    const documentListeners = new Set<EventListenerOrEventListenerObject>();
    const windowListeners = new Set<EventListenerOrEventListenerObject>();
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: () => focused,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => documentListeners.add(listener),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => documentListeners.delete(listener),
    });
    vi.stubGlobal('window', {
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => windowListeners.add(listener),
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => windowListeners.delete(listener),
    });
    let completed = false;
    const pending = waitForVisibleBrowserPreparation().then(() => { completed = true; });

    await Promise.resolve();
    expect(completed).toBe(false);
    focused = true;
    for (const listener of windowListeners) {
      if (typeof listener === 'function') listener(new Event('focus'));
      else listener.handleEvent(new Event('focus'));
    }
    await pending;

    expect(completed).toBe(true);
    expect(documentListeners.size).toBe(0);
    expect(windowListeners.size).toBe(0);
  });

  it('moves a suspended visible idle task to the timer lane when hidden', async () => {
    const visibility = visibilityDocument('visible');
    const requestIdleCallback = vi.fn(() => 11);
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal('document', visibility.document);
    vi.stubGlobal('window', { requestIdleCallback, cancelIdleCallback });
    let completed = false;
    const completion = new Promise<void>((resolve) => {
      scheduleBrowserPreparationIdleTask(() => {
        completed = true;
        resolve();
      });
    });

    expect(completed).toBe(false);
    visibility.setVisibility('hidden');
    await completion;

    expect(completed).toBe(true);
    expect(cancelIdleCallback).toHaveBeenCalledWith(11);
  });

  it('runs a starved visible idle task from the independent timer backstop', async () => {
    vi.useFakeTimers();
    const visibility = visibilityDocument('visible');
    const requestIdleCallback = vi.fn(() => 13);
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal('document', visibility.document);
    vi.stubGlobal('window', { requestIdleCallback, cancelIdleCallback });
    const task = vi.fn();

    scheduleBrowserPreparationIdleTask(task, 25);
    await vi.advanceTimersByTimeAsync(25);

    expect(task).toHaveBeenCalledTimes(1);
    expect(cancelIdleCallback).toHaveBeenCalledWith(13);
  });
});
