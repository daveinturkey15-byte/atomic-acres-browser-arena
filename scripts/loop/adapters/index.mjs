// Reference-grounded loop - the model adapter interface.
//
// Every critic route implements exactly this, so the runner never learns which
// model it is talking to and a route can be swapped without touching the loop:
//
//   {
//     id: string,                      // stable route id used in the journal
//     kind: 'vision' | 'text',
//     describe(): string,              // one line for the journal and the log
//     async available(): {ok, detail}, // cheap liveness probe, no quota spend
//     async critique({ text, images, jsonPath, timeoutMs }):
//        { ok, raw, text, route, meta }
//   }
//
// The runner is responsible for validating what comes back (critic-schema.mjs)
// and for the probe receipt. An adapter never decides whether a critic passed:
// an adapter that could grade itself would be the same failure mode as a
// critic that scores its own memory of quality.
//
// EXIT 0 IS NOT SUCCESS. AGENTS.md records six of eleven workers reporting
// success having done nothing - quota rejections that still exit 0. Every
// adapter here therefore scans its own output for failure markers and returns
// ok:false on a hit, and the probe token is the real receipt on top of that.

export const FAILURE_MARKERS = Object.freeze([
  'quota', 'rate limit', 'rate-limit', 'insufficient_quota', 'unauthorized', 'unauthenticated',
  '401 ', '403 ', '429 ', 'not authenticated', 'no credentials', 'context deadline exceeded',
  'model not found', 'econnrefused', 'etimedout',
]);

export function scanForFailure(output) {
  const haystack = String(output ?? '').toLowerCase();
  for (const marker of FAILURE_MARKERS) {
    if (haystack.includes(marker)) return marker;
  }
  return null;
}

export function assertAdapter(adapter) {
  for (const key of ['id', 'kind', 'describe', 'available', 'critique']) {
    if (adapter[key] === undefined) throw new TypeError(`adapter ${adapter.id ?? '<unnamed>'} is missing ${key}`);
  }
  return adapter;
}

export async function loadAdapter(name, options = {}) {
  switch (name) {
    case 'fixture': return assertAdapter((await import('./fixture.mjs')).createFixtureAdapter(options));
    case 'qwen-local': return assertAdapter((await import('./qwen-local.mjs')).createQwenLocalAdapter(options));
    case 'omp-gemini': return assertAdapter((await import('./omp-gemini.mjs')).createOmpGeminiAdapter(options));
    case 'omp-muse': return assertAdapter((await import('./omp-muse.mjs')).createOmpMuseAdapter(options));
    case 'codex': return assertAdapter((await import('./codex.mjs')).createCodexAdapter(options));
    default: throw new RangeError(`unknown adapter "${name}" (fixture | qwen-local | omp-gemini | omp-muse | codex)`);
  }
}

export const ADAPTER_NAMES = Object.freeze(['fixture', 'qwen-local', 'omp-gemini', 'omp-muse', 'codex']);
