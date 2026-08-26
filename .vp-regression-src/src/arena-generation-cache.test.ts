import { describe, expect, it, vi } from 'vitest';
import { evictExactFailedArenaGeneration } from './arena-generation-cache';

describe('failed arena generation cache', () => {
  it('evicts and retires a failed cold generation so retry constructs fresh authority', () => {
    const cache = new Map<string, { generation: number }>();
    const construct = vi.fn((generation: number) => ({ generation }));
    const retire = vi.fn();
    const first = construct(1);
    cache.set('atomic-acres', first);

    expect(evictExactFailedArenaGeneration(cache, 'atomic-acres', first, retire)).toBe(true);
    expect(cache.has('atomic-acres')).toBe(false);
    expect(retire).toHaveBeenCalledExactlyOnceWith(first);

    const retry = construct(2);
    cache.set('atomic-acres', retry);
    expect(retry).not.toBe(first);
    expect(construct).toHaveBeenCalledTimes(2);
  });

  it('does not let a stale failed cleanup evict or retire its successor', () => {
    const cache = new Map<string, { generation: number }>();
    const stale = { generation: 1 };
    const successor = { generation: 2 };
    const retire = vi.fn();
    cache.set('gun-range', successor);

    expect(evictExactFailedArenaGeneration(cache, 'gun-range', stale, retire)).toBe(false);
    expect(cache.get('gun-range')).toBe(successor);
    expect(retire).not.toHaveBeenCalled();
  });
});
