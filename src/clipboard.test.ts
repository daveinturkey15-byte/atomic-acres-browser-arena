import { describe, expect, it, vi } from 'vitest';
import { copyTextWithFallback } from './clipboard';

describe('copyTextWithFallback', () => {
  it('uses the modern clipboard path without invoking the fallback', async () => {
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

  it('reports failure when neither clipboard path succeeds', async () => {
    await expect(copyTextWithFallback('ROOM-123', undefined, () => false)).resolves.toBe('failed');
    await expect(copyTextWithFallback('', undefined, () => true)).resolves.toBe('failed');
  });
});
