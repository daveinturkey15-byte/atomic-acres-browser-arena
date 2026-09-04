// Adapter: Codex, for the hard adjudications only.
//
// RATIONED ON PURPOSE. Dave's Codex usage is limited, so this route is reserved
// for two jobs the cheap routes cannot do honestly:
//   1. CONTRACT CONFLICTS - a critic says the only fix breaks an immutable rule
//      (TSL-only, the cold-compile fence, the art-direction bounds). Somebody
//      has to decide, and it must not be the model that wants to make the
//      change.
//   2. THE FINAL PRE-REVIEW before a subject leaves the loop.
// The runner refuses to use this route for a routine cycle; see run-loop.mjs.
//
// Codex has no image attachment on this route, so it is registered as kind
// 'text': it adjudicates the tier-0 measurement JSON and the critics' written
// findings, never pixels. Calling it a vision critic would be exactly the
// unproven-pixels failure this whole loop exists to close.

import { spawn } from 'node:child_process';
import { scanForFailure } from './index.mjs';

export const DEFAULT_MODEL = 'gpt-5.6-luna';
export const DEFAULT_TIMEOUT_MS = 600_000;

export function createCodexAdapter({
  binary = 'codex',
  model = DEFAULT_MODEL,
  reasoningEffort = 'high',
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const baseArgs = ['exec', '--model', model, '-c', `model_reasoning_effort=${reasoningEffort}`];
  return {
    id: 'codex',
    kind: 'text',
    rationed: true,
    describe: () => `${binary} exec --model ${model} -c model_reasoning_effort=${reasoningEffort} (rationed: contract conflicts and final pre-review only)`,

    async available() {
      const result = await run(binary, ['--version'], { timeoutMs: 30_000, cwd });
      return { ok: result.code === 0, detail: result.code === 0 ? result.stdout.trim() : `exit ${result.code}: ${(result.stderr || result.stdout).slice(0, 200)}` };
    },

    argv({ text }) {
      return [...baseArgs, text];
    },

    async critique({ text, images = [], jsonText = null, timeoutMs: callTimeout = timeoutMs }) {
      if (images.length > 0) {
        // Fail loudly rather than silently dropping the images and returning
        // prose that reads like a visual judgement.
        return {
          ok: false, raw: null, text: null, route: this.id,
          meta: { error: 'codex adapter is kind:text and cannot receive images; route pixels to a vision adapter' },
        };
      }
      const prompt = jsonText ? `${text}\n\nMEASUREMENT JSON:\n${jsonText}` : text;
      const started = Date.now();
      const result = await run(binary, this.argv({ text: prompt }), { timeoutMs: callTimeout, cwd });
      const elapsedMs = Date.now() - started;
      const marker = scanForFailure(result.stderr) ?? (result.code === 0 ? null : `exit ${result.code}`);
      return {
        ok: result.code === 0 && marker === null && result.stdout.trim().length > 0,
        raw: result.stdout,
        text: result.stdout,
        route: this.id,
        meta: { elapsedMs, exitCode: result.code, failureMarker: marker, model, timedOut: result.timedOut },
      };
    },
  };
}

function run(binary, args, { timeoutMs, cwd } = {}) {
  return new Promise((resolvePromise) => {
    // stdin MUST be closed, not inherited or piped-and-left-open. With an open
    // stdin pipe the CLI sits in "Reading prompt from piped stdin (waiting for
    // EOF)" forever and the liveness probe times out looking like a dead route.
    const child = spawn(binary, args, { cwd, shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs) : null;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { if (timer) clearTimeout(timer); resolvePromise({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut }); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolvePromise({ code, stdout, stderr, timedOut }); });
  });
}
