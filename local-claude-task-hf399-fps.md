# Task: HF-399 — diagnose (and minimally fix) the 150->40 FPS regression on Quality/Atomic Acres

You are Claude Opus (orchestrator-delegated) in C:\Users\david\projects\aa-omp-pass84,
branch contrib/dave-gaming-pc/omp/pass84-overnight. READ docs/PASS84_OWNER_FEEDBACK_2026-09-02.md
row HF-399 first.

## Known facts
- Owner: 150 FPS on Quality historically; now ~40 on atomic-acres. Other maps
  unreported; WebGPU is the only backend (no WebGL2 fallback exists).
- Pass 81 added per-surface clip planes for the viewmodel
  (src/systems/viewmodel-surface-clip.ts + weapon-presentation usage). Clip
  planes multiply shader permutations - a plausible but UNVERIFIED suspect.
- Pass 82/83 removed the light-set churn (in-combat pipeline creations are 0 -
  do not regress that; a probe contract now pins it).

## Your job
1. MEASURE first. Boot atomic-acres Quality headless (channel:'chrome') with a
   rAF sampler; record fps + draw calls + pipeline creations + active clip-plane
   count per phase (menu, match active, near-wall vs open ground). Then run the
   same on a second arena (e.g. high-seas) as the control.
2. Attribute the gap with evidence (PerformanceObserver longtasks, renderer
   stats, clip-plane count x material permutations, per-frame allocations via
   heap deltas). Name the dominant cause in numbers.
3. Implement the SMALLEST fix that addresses the named cause. Mark every edit
   `// HF-399:`. Do NOT weaken any test, threshold, or the clip contract for
   HF-395 (another agent owns viewmodel clip correctness) - if the best fix
   touches the same lines, STOP and report the recommended patch instead.
4. Re-measure and report before/after fps under identical conditions.

## File ownership (hard)
- You may edit: src/rendering/arenas/**, src/systems/viewmodel-surface-clip.ts
  (read/measure; edits only if they don't conflict with HF-395 semantics),
  src/legacy-main.ts ONLY in the arena-transition/perf region with `// HF-399:`
  marks.
- Do NOT edit: weapon-presentation.ts, thermal files, lobby/netcode, baselines/.
- Do not git commit. Headless browsers only. Never kill Dave's processes.

## Report back
Root cause with numbers, the fix diff summary, before/after fps table, and
anything left open for the orchestrator.
