// Adapter: a vision critic hosted through OMP (default Gemini Flash).
//
// VERIFIED 2026-09-04 on this machine: `omp --help` (v18.1.1) documents
// "ARGUMENTS  MESSAGES  Messages to send (prefix files with @)", so images
// attach as @path, and `omp -p ... --model google-antigravity/gemini-3.8-flash-high
// --no-session` answers with exit 0.
//
// STATUS OF THIS ROUTE: NOT YET ADMITTED AS A CRITIC. Across three real calls
// on 2026-09-04 it never returned the required JSON object, never answered the
// probe token, and repeatedly grounded its critique in the REPOSITORY rather
// than the pixels - naming the commit that produced the reference image,
// quoting a function and line number out of a source file, and citing sibling
// evidence files with line ranges. It was given none of those; they are
// fabricated citations, which is the same failure this repository already
// recorded when a Gemini-authored reference document cited four URLs that did
// not resolve. Every one of those rounds was journalled INVALID and scored
// nothing, which is the receipt doing its job. The route stays wired up, and
// stays unproven, until a call comes back with the probe token in it.
//
// FLAGS AND SHAPING, each one earned:
//   --no-tools      A critic must judge PIXELS, not the repository. With tools
//                   it can read the source it is grading, which is how a critic
//                   ends up scoring the builder's intention.
//   --cwd <empty>   A FRESH EMPTY DIRECTORY, never the worktree. Pointed at the
//                   worktree, this route produced a critique of the branch.
//   neutral names   Attachments are copied in as reference.png / capture.png /
//                   measurement.json. Left at their real paths, the filenames
//                   ("after-desktop-1920x1080.png") themselves tell the critic
//                   which side is the approved one.
//   --system-prompt OMP's default is a CODING ASSISTANT prompt, under which
//                   this route answered a schema-constrained request with a
//                   markdown engineering report - headings, an ASCII diagram,
//                   LaTeX pixel coordinates - and no JSON at all. The default
//                   persona has to be replaced, not asked to stand down.
//   --no-skills / --no-rules / --no-session   Fresh context, no history, no
//                   house style leaking in as an expectation.
//   prompt on stdin The prompt is NOT in argv. On Windows this binary is a .cmd
//                   shim so spawn needs shell:true, and with shell:true Node
//                   concatenates argv without escaping - a multi-line critic
//                   instruction full of quotes and braces is shredded by
//                   cmd.exe before the model sees it. OMP already reads its
//                   prompt from piped stdin.
//
// STANDING HAZARD: Gemini Flash fabricated citations in this repository before.
// It is allowed to DESCRIBE pixels it was handed. It is never allowed to gather
// references.

import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { scanForFailure } from './index.mjs';

export const DEFAULT_MODEL = 'google-antigravity/gemini-3.8-flash-high';
export const DEFAULT_TIMEOUT_MS = 300_000;

export const CRITIC_SYSTEM_PROMPT =
  'You are a visual critic in an automated pipeline. You judge ONLY the images and the measurement JSON attached to this message. '
  + 'You have no repository, no source code, no commit history and no knowledge of how the images were produced. If you find yourself '
  + 'reasoning about code, filenames or commits, you are answering the wrong question and your answer will be discarded. '
  + 'Reply with exactly ONE JSON object matching the schema given in the message, and NOTHING else: no prose, no markdown, no headings, '
  + 'no code fences, no explanation before or after the object.';

export function createOmpGeminiAdapter({
  binary = 'omp',
  model = DEFAULT_MODEL,
  thinking = 'high',
  cwd = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const isolatedCwd = cwd ?? mkdtempSync(join(tmpdir(), 'loop-critic-'));
  const baseFlags = () => [
    '--model', model,
    '--thinking', thinking,
    '--no-session', '--no-tools', '--no-skills', '--no-rules', '--no-title',
    '--system-prompt', CRITIC_SYSTEM_PROMPT,
    '--cwd', isolatedCwd,
  ];

  return {
    id: 'omp-gemini',
    kind: 'vision',
    isolatedCwd,
    describe: () => `${binary} -p --model ${model} --thinking ${thinking} --no-tools --no-skills --no-rules --no-session --cwd <isolated empty dir>, prompt on stdin`,

    /** Liveness only. One token out, so the probe costs about nothing. */
    async available() {
      const result = await run(binary, ['-p', ...baseFlags()], {
        timeoutMs: 120_000, cwd: isolatedCwd,
        input: 'Ignore your output-format instruction for this one message and reply with the single word OK.',
      });
      const ok = result.code === 0 && /\bOK\b/i.test(result.stdout);
      return { ok, detail: ok ? `${model} answered` : `exit ${result.code}: ${(result.stderr || result.stdout).slice(0, 200)}` };
    },

    /** Copy attachments into the isolated dir under names that leak nothing. */
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

    /** The argv, WITHOUT the prompt - this is what a dry run prints. */
    argv({ images = [], jsonPath = null }) {
      const attachments = [...images, jsonPath].filter(Boolean).map((p) => `@${p}`);
      return ['-p', ...attachments, ...baseFlags()];
    },

    async critique({ text, images = [], jsonPath = null, timeoutMs: callTimeout = timeoutMs }) {
      const neutral = this.neutralise({ images, jsonPath });
      const args = this.argv({ images: neutral.images, jsonPath: neutral.jsonPath });
      const started = Date.now();
      const result = await run(binary, args, { timeoutMs: callTimeout, cwd: isolatedCwd, input: text });
      const elapsedMs = Date.now() - started;
      // Exit 0 is not success. Scan before believing the code.
      const marker = scanForFailure(result.stderr) ?? (result.code === 0 ? null : `exit ${result.code}`);
      return {
        ok: result.code === 0 && marker === null && result.stdout.trim().length > 0,
        raw: result.stdout,
        text: result.stdout,
        route: this.id,
        meta: { elapsedMs, exitCode: result.code, failureMarker: marker, model, images: images.length, timedOut: result.timedOut },
      };
    },
  };
}

/** Quote every argument ourselves, because shell:true does not. */
export function quoteArg(arg) {
  if (process.platform !== 'win32') return arg;
  return /[\s"^&|<>()]/.test(arg) ? `"${String(arg).replace(/"/g, '""')}"` : String(arg);
}

function run(binary, args, { timeoutMs, cwd, input = null } = {}) {
  return new Promise((resolvePromise) => {
    // stdin is a pipe that is ALWAYS ended. Left open, the CLI sits in
    // "Reading prompt from piped stdin (waiting for EOF)" forever and the
    // liveness probe times out looking exactly like a dead route.
    const child = spawn(binary, args.map(quoteArg), {
      cwd, shell: process.platform === 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs) : null;
    child.stdin.on('error', () => { /* the child may exit before we finish writing */ });
    if (input !== null) child.stdin.write(input);
    child.stdin.end();
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => { if (timer) clearTimeout(timer); resolvePromise({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut }); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolvePromise({ code, stdout, stderr, timedOut }); });
  });
}
