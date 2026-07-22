export type ClipboardCopyResult = 'clipboard' | 'fallback' | 'failed';

export async function copyTextWithFallback(
  text: string,
  writeText: ((value: string) => Promise<void>) | undefined,
  fallbackCopy: (value: string) => boolean,
  timeoutMs = 1_000,
): Promise<ClipboardCopyResult> {
  if (!text) return 'failed';

  // Run the synchronous path while the click still owns a user activation.
  // Some browsers expose Clipboard.writeText but leave its permission promise pending.
  if (fallbackCopy(text)) return 'fallback';
  if (!writeText) return 'failed';

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => reject(new Error('clipboard write timed out')), timeoutMs);
      writeText(text).then(
        () => {
          globalThis.clearTimeout(timeout);
          resolve();
        },
        (error) => {
          globalThis.clearTimeout(timeout);
          reject(error);
        },
      );
    });
    return 'clipboard';
  } catch {
    return 'failed';
  }
}
