/**
 * A tiny non-poisoning FIFO for renderer mutations that must never overlap.
 * A failed operation rejects its own caller while later work can still run.
 */
export class AsyncSerialQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
