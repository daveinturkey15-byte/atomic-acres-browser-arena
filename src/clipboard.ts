export type ClipboardCopyResult = 'clipboard' | 'fallback' | 'failed';

export async function copyTextWithFallback(
  text: string,
  writeText: ((value: string) => Promise<void>) | undefined,
  fallbackCopy: (value: string) => boolean,
): Promise<ClipboardCopyResult> {
  if (!text) return 'failed';

  if (writeText) {
    try {
      await writeText(text);
      return 'clipboard';
    } catch {
      // Older browsers and restrictive clipboard policies can reject this path.
    }
  }

  return fallbackCopy(text) ? 'fallback' : 'failed';
}
