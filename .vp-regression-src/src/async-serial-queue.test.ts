import { describe, expect, it } from 'vitest';
import { AsyncSerialQueue } from './async-serial-queue';

function deferred(): Readonly<{ promise: Promise<void>; resolve: () => void }> {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return Object.freeze({ promise, resolve });
}

describe('async serial queue', () => {
  it('keeps renderer-style critical sections exclusive and restores shared pause state', async () => {
    const queue = new AsyncSerialQueue();
    const firstGate = deferred();
    const secondGate = deferred();
    let active = 0;
    let maximumActive = 0;
    let presentationPaused = false;
    const run = (gate: Promise<void>): Promise<void> => queue.run(async () => {
      const wasPaused = presentationPaused;
      presentationPaused = true;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        await gate;
      } finally {
        active -= 1;
        presentationPaused = wasPaused;
      }
    });

    const first = run(firstGate.promise);
    const second = run(secondGate.promise);
    await Promise.resolve();
    expect({ active, maximumActive, presentationPaused }).toEqual({
      active: 1, maximumActive: 1, presentationPaused: true,
    });
    firstGate.resolve();
    await first;
    await Promise.resolve();
    expect({ active, maximumActive, presentationPaused }).toEqual({
      active: 1, maximumActive: 1, presentationPaused: true,
    });
    secondGate.resolve();
    await second;
    expect({ active, maximumActive, presentationPaused }).toEqual({
      active: 0, maximumActive: 1, presentationPaused: false,
    });
  });

  it('does not poison later operations when one rejects', async () => {
    const queue = new AsyncSerialQueue();
    const failure = queue.run(async () => { throw new Error('synthetic prewarm failure'); });
    const recovery = queue.run(() => 'recovered');
    await expect(failure).rejects.toThrow('synthetic prewarm failure');
    await expect(recovery).resolves.toBe('recovered');
  });
});
