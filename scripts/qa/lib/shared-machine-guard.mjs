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

/** Free MiB on the smallest GPU, which is the one that has to fit Chrome. */
export function freeVramMib() {
  const out = execSync('nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits', { encoding: 'utf8' });
  const values = out.trim().split('\n').map((line) => Number.parseInt(line.trim(), 10)).filter(Number.isFinite);
  if (values.length === 0) throw new Error('nvidia-smi returned no readable memory.free value');
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
  attempts = 60,
  intervalMs = 30_000,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const free = freeVramMib();
    const queued = await comfyQueueDepth();
    if (free >= minFreeVramMib && queued === 0) {
      return { freeVramMib: free, comfyQueueDepth: queued, waitedAttempts: attempt };
    }
    console.log(`[${label}] waiting for the shared machine: ${free} MiB free, ComfyUI queue ${queued} (attempt ${attempt + 1}/${attempts})`);
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
