/**
 * Owner 2026-08-30: a single transient 503 from GitHub Pages on the rapier
 * chunk permanently killed map selection ("[Nuke Town map selection failed]
 * TypeError: Failed to fetch dynamically imported module") — the player saw
 * an unplayable build because one CDN hiccup was treated as fatal. Network
 * failures on dynamic chunks and streamed assets are retryable by spec (the
 * module map only caches successful resolutions), so every lazy load goes
 * through this bounded retry.
 */
export async function retryLoad<T>(
  label: string,
  load: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 450,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.warn(`[retry-load] ${label} attempt ${attempt}/${attempts} failed; retrying`, error);
      await wait(baseDelayMs * attempt);
    }
  }
  throw lastError;
}
