/**
 * shared-machine-guard.mjs - do not take the GPU out from under the owner.
 *
 * dave-gaming-pc is not a CI box. The owner runs ComfyUI, local llama.cpp
 * servers and his own game builds on the same GPU these QA harnesses need, and
 * a headless Chrome with WebGPU will happily allocate into whatever is left and
 * make somebody else's job fail - or fail itself, slowly and confusingly, which
 * is worse because it looks like a product bug.
 *
 * So every harness that launches a browser waits for BOTH:
 *   - at least `minFreeVramMib` free on the smallest GPU (default 3000), and
 *   - an empty ComfyUI queue (nothing running AND nothing pending).
 *
 * Free VRAM alone is not enough: ComfyUI between two nodes of one workflow can
 * momentarily look idle by memory and is about to allocate everything again.
 * The queue is the statement of intent, so both are required.
 *
 * A ComfyUI that is not running at all is the empty case, not an error - the
 * fetch failing means there is no queue to be behind.
 *
 * This module is shared rather than copied into each harness on purpose: the
 * guard is the thing that makes running QA here acceptable at all, and three
 * drifting copies of it is how one of them quietly stops waiting.
 */
import { execSync } from 'node:child_process';

/**
 * Free MiB on the smallest GPU, which is the one that has to fit Chrome.
 *
 * Returns null when the reading CANNOT BE TAKEN rather than throwing. nvidia-smi
 * is itself contended on a busy GPU and fails transiently - observed here on
 * 2026-09-02, mid-wait, while ComfyUI was loading a large model - and a probe
 * that throws turns "I could not see the GPU for one second" into "abandon the
 * whole run". An unreadable GPU is treated as NOT FREE by the caller, which is
 * the safe direction: it keeps waiting instead of launching blind.
 */
let reportedUnreadableReason = false;

export function freeVramMib() {
  let out;
  try {
    out = execSync('nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits', {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000,
    });
  } catch (error) {
    // Say WHY, once. A guard that reports "unreadable" forever without a reason
    // is indistinguishable from a broken machine, and the reason IS the fix -
    // here it was several orphaned QA processes from interrupted runs, all
    // polling nvidia-smi every 30 s against a GPU already at 63% util.
    if (!reportedUnreadableReason) {
      reportedUnreadableReason = true;
      console.log(`[guard] nvidia-smi unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
  const values = out.trim().split('\n').map((line) => Number.parseInt(line.trim(), 10)).filter(Number.isFinite);
  if (values.length === 0) return null;
  return Math.min(...values);
}

/** Running + pending ComfyUI jobs. Absent ComfyUI counts as zero. */
export async function comfyQueueDepth() {
  try {
    const response = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return 0;
    const queue = await response.json();
    return (queue.queue_running?.length ?? 0) + (queue.queue_pending?.length ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Block until the machine is free, or throw. Never launch a browser without it.
 *
 * Bounded rather than infinite: a harness that waits forever is a hung run
 * nobody can tell from a crashed one.
 */
export async function waitForSharedMachine({
  label = 'qa',
  minFreeVramMib = 3000,
  // How long to be patient for. The owner may be part-way through a ComfyUI
  // BATCH rather than one job - observed here on 2026-09-02, the running job id
  // rotating while the queue never emptied - so a fixed half hour is the
  // difference between a run that waits its turn and a run that gives up on a
  // machine that was always going to free up. Overridable per invocation, since
  // the right budget is the caller's deadline, not this module's guess.
  attempts = Number(process.env.QA_MACHINE_WAIT_ATTEMPTS ?? '60'),
  intervalMs = Number(process.env.QA_MACHINE_WAIT_INTERVAL_MS ?? '30000'),
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const free = freeVramMib();
    const queued = await comfyQueueDepth();
    if (free !== null && free >= minFreeVramMib && queued === 0) {
      return { freeVramMib: free, comfyQueueDepth: queued, waitedAttempts: attempt };
    }
    const reading = free === null ? 'unreadable (nvidia-smi failed)' : `${free} MiB free`;
    console.log(`[${label}] waiting for the shared machine: ${reading}, ComfyUI queue ${queued} (attempt ${attempt + 1}/${attempts})`);
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  throw new Error(
    `[${label}] the GPU never had ${minFreeVramMib} MiB free with an empty ComfyUI queue; not launching Chrome on a shared machine`,
  );
}

// Usable directly, so a shell chain can gate BETWEEN harnesses as well as
// inside them: `node scripts/qa/lib/shared-machine-guard.mjs --label boot-smoke`
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  const state = await waitForSharedMachine({
    label: arg('--label', 'qa'),
    minFreeVramMib: Number(arg('--min-vram', '3000')),
  });
  console.log(`[${arg('--label', 'qa')}] machine free: ${JSON.stringify(state)}`);
}
