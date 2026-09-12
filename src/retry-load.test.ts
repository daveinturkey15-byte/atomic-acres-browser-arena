import { describe, expect, it, vi } from 'vitest';
import { retryLoad } from './retry-load';

const instantWait = () => Promise.resolve();

describe('retryLoad (owner 2026-08-30: transient CDN 503 must not kill map selection)', () => {
  it('returns the first successful result without retrying', async () => {
    const load = vi.fn().mockResolvedValue('module');
    await expect(retryLoad('rapier', load, 3, 1, instantWait)).resolves.toBe('module');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries through transient failures and succeeds', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue('module');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(retryLoad('rapier', load, 3, 1, instantWait)).resolves.toBe('module');
    } finally {
      warn.mockRestore();
    }
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('throws the final error once attempts are exhausted', async () => {
    const failure = new TypeError('Failed to fetch dynamically imported module');
    const load = vi.fn().mockRejectedValue(failure);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(retryLoad('rapier', load, 3, 1, instantWait)).rejects.toBe(failure);
    } finally {
      warn.mockRestore();
    }
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('backs off linearly between attempts', async () => {
    const delays: number[] = [];
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('one'))
      .mockRejectedValueOnce(new Error('two'))
      .mockResolvedValue('ok');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await retryLoad('glb', load, 3, 450, (ms) => { delays.push(ms); return Promise.resolve(); });
    } finally {
      warn.mockRestore();
    }
    expect(delays).toEqual([450, 900]);
  });
});
