import { describe, expect, it, vi } from 'vitest';
import { copyTextWithFallback } from './clipboard';

describe('copyTextWithFallback', () => {
  it('copies the lobby code with the modern Clipboard API', async () => {
    const writeText = vi.fn(async () => undefined);
    const fallbackCopy = vi.fn(() => true);

    await expect(copyTextWithFallback('ROOM-123', writeText, fallbackCopy)).resolves.toBe('clipboard');
    expect(writeText).toHaveBeenCalledWith('ROOM-123');
    expect(fallbackCopy).not.toHaveBeenCalled();
  });

  it('falls back when the Clipboard API is unavailable', async () => {
    const fallbackCopy = vi.fn(() => true);

    await expect(copyTextWithFallback('ROOM-123', undefined, fallbackCopy)).resolves.toBe('fallback');
    expect(fallbackCopy).toHaveBeenCalledWith('ROOM-123');
  });

  it('falls back when the Clipboard API rejects the write', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard denied');
    });
    const fallbackCopy = vi.fn(() => true);

    await expect(copyTextWithFallback('ROOM-123', writeText, fallbackCopy)).resolves.toBe('fallback');
    expect(fallbackCopy).toHaveBeenCalledWith('ROOM-123');
  });

  it('times out a Clipboard API promise that never settles and then falls back', async () => {
    const writeText = vi.fn(() => new Promise<void>(() => undefined));
    const fallbackCopy = vi.fn(() => true);

    await expect(copyTextWithFallback('ROOM-123', writeText, fallbackCopy, 5)).resolves.toBe('fallback');
    expect(fallbackCopy).toHaveBeenCalledWith('ROOM-123');
  });

  it('reports failure for empty text or when neither copy path exists', async () => {
    await expect(copyTextWithFallback('ROOM-123', undefined, () => false)).resolves.toBe('failed');
    await expect(copyTextWithFallback('', undefined, () => true)).resolves.toBe('failed');
  });
});
