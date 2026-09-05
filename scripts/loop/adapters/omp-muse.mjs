// Adapter: Meta Muse Spark 1.3 through OMP.
//
// This is a vision critic route, not a builder route. It deliberately follows
// the isolated OMP shape used by the Gemini adapter: neutral attachment names,
// a fresh empty cwd, no session/rules/skills/tools/LSP, and a system prompt
// that makes the image-only boundary explicit.

import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { scanForFailure } from './index.mjs';

export const DEFAULT_MODEL = 'meta-contributor/muse-spark-1.3';
export const DEFAULT_TIMEOUT_MS = 300_000;

export const CRITIC_SYSTEM_PROMPT =
  'You are a visual critic in an automated pipeline. You judge ONLY the images and the measurement JSON attached to this message. '
  + 'You have no repository, no source code, no commit history and no knowledge of how the images were produced. If you find yourself '
  + 'reasoning about code, filenames or commits, you are answering the wrong question and your answer will be discarded. '
  + 'Reply with exactly ONE JSON object matching the schema given in the message, and NOTHING else: no prose, no markdown, no headings, '
  + 'no code fences, no explanation before or after the object.';

export function createOmpMuseAdapter({
  binary = 'omp',
  model = DEFAULT_MODEL,
  cwd = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const isolatedCwd = cwd ?? mkdtempSync(join(tmpdir(), 'loop-muse-critic-'));
  const baseFlags = () => [
    '--model', model,
    '--no-session', '--no-tools', '--no-skills', '--no-lsp', '--no-rules', '--no-title',
    '--allow-home',
    '--system-prompt', CRITIC_SYSTEM_PROMPT,
    '--cwd', isolatedCwd,
  ];

  return {
    id: 'omp-muse',
    kind: 'vision',
    isolatedCwd,
    describe: () => `${binary} -p --model ${model} --no-session --no-skills --no-lsp --allow-home --cwd <isolated empty dir>, prompt on stdin`,

    /** Liveness only. It does not attach images or consume a critic result. */
    async available() {
      const result = await run(binary, ['-p', ...baseFlags()], {
        timeoutMs: 120_000,
        cwd: isolatedCwd,
        input: 'Ignore your output-format instruction for this one message and reply with the single word OK.',
      });
      // Muse's OMP text mode may expose only its progress sentinel ("Working...")
      // for this tiny liveness turn. It is still a reachability check only; the
      // real image call below must pass the probe and four-row schema.
      const marker = scanForFailure(result.stderr);
      const ok = result.code === 0 && marker === null && result.stdout.trim().length > 0;
      return {
        ok,
        detail: ok ? `${model} reachable (OMP liveness output received)` : `exit ${result.code}: ${(result.stderr || result.stdout).slice(0, 200)}`,
      };
    },

    /** Copy attachments into the isolated cwd under neutral names. */
    neutralise({ images = [], jsonPath = null }) {
      const copied = images.map((source, index) => {
        const dest = join(isolatedCwd, `${index === 0 ? 'reference' : `capture-${index}`}${extname(source) || '.png'}`);
        copyFileSync(source, dest);
        return dest;
      });
      let json = null;
      if (jsonPath) {
        json = join(isolatedCwd, 'measurement.json');
        copyFileSync(jsonPath, json);
      }
      return { images: copied, jsonPath: json };
    },

    /** Build OMP argv without the prompt; the prompt is written to stdin. */
    argv({ images = [], jsonPath = null }) {
      const attachments = [...images, jsonPath].filter(Boolean).map((path) => `@${path}`);
      return ['-p', ...attachments, ...baseFlags()];
    },

    async critique({ text, images = [], jsonPath = null, timeoutMs: callTimeout = timeoutMs }) {
      const neutral = this.neutralise({ images, jsonPath });
      const args = this.argv({ images: neutral.images, jsonPath: neutral.jsonPath });
      const started = Date.now();
      const result = await run(binary, args, { timeoutMs: callTimeout, cwd: isolatedCwd, input: text });
      const elapsedMs = Date.now() - started;
      const marker = scanForFailure(result.stderr) ?? (result.code === 0 ? null : `exit ${result.code}`);
      return {
        ok: result.code === 0 && marker === null && result.stdout.trim().length > 0,
        raw: result.stdout,
        text: result.stdout,
        route: this.id,
        meta: {
          elapsedMs,
          exitCode: result.code,
          failureMarker: marker,
          model,
          images: images.length,
          timedOut: result.timedOut,
        },
      };
    },
  };
}

/** Quote every argument ourselves because shell:true does not. */
export function quoteArg(arg) {
  if (process.platform !== 'win32') return arg;
  return /[\s"^&|<>()]/.test(arg) ? `"${String(arg).replace(/"/g, '""')}"` : String(arg);
}

function run(binary, args, { timeoutMs, cwd, input = null } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(binary, args.map(quoteArg), {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs) : null;
    child.stdin.on('error', () => { /* the child may exit before stdin is written */ });
    if (input !== null) child.stdin.write(input);
    child.stdin.end();
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({ code, stdout, stderr, timedOut });
    });
  });
}
