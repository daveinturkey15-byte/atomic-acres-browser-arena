import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserOwnsForegroundPresentation,
  scheduleBrowserPreparationIdleTask,
  waitForVisibleBrowserPreparation,
  yieldBrowserPreparationFrame,
  yieldVisibleBrowserPresentationFrame,
} from './browser-preparation-scheduler';

type VisibilityDocument = {
  visibilityState: DocumentVisibilityState;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

function visibilityDocument(initial: DocumentVisibilityState): Readonly<{
  document: VisibilityDocument;
  setVisibility: (visibility: DocumentVisibilityState) => void;
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
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('browser preparation scheduler', () => {
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
