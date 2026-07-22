import { describe, expect, it, vi } from 'vitest';
import { copyTextWithFallback } from './clipboard';

describe('copyTextWithFallback', () => {
  it('uses the synchronous copy path while the click still owns user activation', async () => {
    const writeText = vi.fn(async () => undefined);
    const fallbackCopy = vi.fn(() => true);

    await expect(copyTextWithFallback('ROOM-123', writeText, fallbackCopy)).resolves.toBe('fallback');
    expect(fallbackCopy).toHaveBeenCalledWith('ROOM-123');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('uses the modern Clipboard API when synchronous copy is unavailable', async () => {
    const writeText = vi.fn(async () => undefined);
    const fallbackCopy = vi.fn(() => false);

    await expect(copyTextWithFallback('ROOM-123', writeText, fallbackCopy)).resolves.toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('ROOM-123');
  });

  it('reports failure when the available Clipboard API rejects', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard denied');
    });

    await expect(copyTextWithFallback('ROOM-123', writeText, () => false)).resolves.toBe('failed');
  });

  it('times out a Clipboard API promise that never settles', async () => {
    const writeText = vi.fn(() => new Promise<void>(() => undefined));

    await expect(copyTextWithFallback('ROOM-123', writeText, () => false, 5)).resolves.toBe('failed');
  });

  it('reports failure for empty text or when neither copy path exists', async () => {
    await expect(copyTextWithFallback('ROOM-123', undefined, () => false)).resolves.toBe('failed');
    await expect(copyTextWithFallback('', undefined, () => true)).resolves.toBe('failed');
  });
});
