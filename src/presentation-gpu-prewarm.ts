/**
 * The reentrancy wrapper four presentation pools had copied verbatim. Semantics
 * are unchanged: return early if this generation is already warm; otherwise
 * drain any in-flight prewarm (swallowing its rejection and clearing the slot),
 * re-checking the generation after each drain; then run one prewarm, always
 * clearing the slot in a finally.
 */
export type GpuPrewarmSlot = {
  gpuPrewarmGeneration: number | null;
  gpuPrewarmPromise: Promise<void> | null;
};

export async function runPooledGpuPrewarm(
  slot: GpuPrewarmSlot,
  sceneGeneration: number,
  perform: () => Promise<void>,
): Promise<void> {
  if (slot.gpuPrewarmGeneration === sceneGeneration) return;
  while (slot.gpuPrewarmPromise) {
    const pending = slot.gpuPrewarmPromise;
    try {
      await pending;
    } catch {
      if (slot.gpuPrewarmPromise === pending) slot.gpuPrewarmPromise = null;
    }
    if (slot.gpuPrewarmGeneration === sceneGeneration) return;
  }
  const operation = perform();
  slot.gpuPrewarmPromise = operation;
  try {
    await operation;
  } finally {
    if (slot.gpuPrewarmPromise === operation) slot.gpuPrewarmPromise = null;
  }
}
