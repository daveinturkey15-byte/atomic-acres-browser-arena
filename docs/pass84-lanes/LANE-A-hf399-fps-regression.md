# Lane A — HF-399: 150 fps -> 40 fps on Quality, atomic-acres (pass 84)

Orchestrator: Claude Code (Fable 5.1), takeover record
`docs/PASS84_TAKEOVER_CLAUDE_2026-09-02.md`. Ledger row: HF-399 in
`docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`.

Worktree: `C:\Users\david\projects\aa-claude-hf399`
Branch: `contrib/dave-gaming-pc/claude/hf399-fps-regression` (base ac0bc5f2)

## Owner statement (verbatim, 2026-09-02 06:56 BST)
"I used to get 150FPS on quality mode now im getting 40 on atomic acres, we
need something to change so the FPS improves, not sure if its the level or
the engine or what? streamline, refine, refactor etc across all maps and
browsers and the whole game"

## Mechanical falsifier (from the ledger)
An instrumented Quality-mode run on the owner route shows a measured root
cause and a before/after presented-fps delta toward the historical number,
with zero in-combat pipeline creations retained.

## What is already known (do not re-derive, do verify)
- WebGPU is the only production backend. Owner plays Chrome on an RTX 5080.
- Pass 82/83 removed the light-set churn; in-combat pipeline creations are 0
  and `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`
  is the tripwire. Do not regress it.
- Suspects, all UNVERIFIED, in the order the evidence points:
  1. atomic-acres lawn field retune 2026-08-31: `src/nuketown-lawn-field.ts`
     places ~24,732 three-blade Bezier tufts with distance LOD and an SSS term
     via `src/rendering/instanced-grass-field.ts`; the 08-29 art pass also
     added ~4x tuft density, end-garden lawns, forest surround and ridged-FBM
     mountain rings. atomic-acres is the only arena with this field, which
     matches "40 on atomic acres" being arena-specific.
  2. Pass 81 viewmodel surface clip planes
     (`VIEWMODEL_SURFACE_CLIP_PLANE_COUNT = 4`,
     `src/systems/viewmodel-surface-clip.ts`) multiplying material
     permutations — but that is cross-arena, so it cannot alone explain an
     atomic-acres-only drop.
  3. Per-frame work in the arena update (weather/wind consumers, particle
     runtime, thermal ghosts, godrays), and anything that recomposes
     matrices per frame (see three r185 recompose gotcha: auto-updating nodes
     recompose every frame; pools and scene root were deep-frozen).
- `arenaVisualBudgetAudit()` returns drawCalls 0 in headless — unusable.
- Headless Chrome (channel:'chrome') acquires a real WebGPU device here and
  paces rAF at ~60 Hz. To measure render COST rather than a vsync cap, launch
  with `--disable-frame-rate-limit --disable-gpu-vsync` (in addition to the
  policy flags from `scripts/qa/lib/browser-launch-flags.mjs`), and record
  frame-time percentiles (p50/p95/p99 ms) from a rAF sampler, plus GPU-side
  evidence where you can get it (WebGPU timestamp queries if the renderer
  exposes them; otherwise `performance.now()` around `renderer.render`).
- Older builds are live for a real before/after: gh-pages channels
  `pass72-retained`, `pass81`, `pass82`, `pass83` under
  `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/<name>/`.
  Measuring `pass72-retained` vs `pass83` vs your local build on the SAME
  headless route gives a bisect without rebuilding history. Note that the
  08-31 lawn retune shipped in PASS 81.
- Probes must run ALONE on this machine. Another agent's vitest run faked 97
  stalls on a clean build. Check `nvidia-smi` and process list before each
  measurement; if another lane is building or running a browser, wait.

## Your job, in order
1. BUILD ONCE: `npm run build` in your worktree (one build at a time on this
   machine — check for other `vite`/`node` build processes first).
2. MEASURE FIRST. Serve `dist` on port 41941 (see
   `scripts/qa/run-with-preview-server.mjs` for the pattern; do not reuse
   another lane's port). Headless real Chrome, Quality profile selected the
   way a player selects it (find the graphics-settings path in
   `src/graphics-settings-registry.ts` / the menu; do not force a debug
   backdoor a real visitor lacks). Record per phase (menu, deployed idle,
   moving through the lawn, near a wall, open ground) for atomic-acres AND a
   control arena (test1 or high-seas): frame-time p50/p95/p99, draw-call and
   triangle counts from `renderer.info` if available, pipeline creations,
   active clip-plane count, heap delta per minute, long tasks
   (PerformanceObserver). Save JSON + one screenshot per phase under
   `artifacts/qa/hf399/`.
3. BISECT with the live channels (same route, same sampler): pass72-retained,
   pass81, pass83. Name the pass where the drop enters.
4. ATTRIBUTE in numbers. If it is the lawn field: measure with the field
   count scaled (a temporary env/query override is fine for measurement, but
   the shipped fix must be a real change). If it is clip planes: count
   permutations. If it is per-frame CPU: profile with CDP `Profiler` and
   name the top self-time functions.
5. FIX the named cause with the smallest change that restores most of the
   loss, marked `// HF-399:`. Preferred shapes: distance/frustum culling and
   LOD that actually removes draws, instancing that shares one pipeline,
   moving per-frame work to on-change, capping the field by Quality tier
   (the owner's "Quality" must not look worse — compare screenshots before
   claiming parity). Not acceptable: weakening a gate, raising a threshold,
   deleting the lawn, or touching viewmodel clip semantics (Lane B owns
   `viewmodel-surface-clip.ts` and `weapon-presentation.ts`).
6. RE-MEASURE identically, then run the pipeline tripwire (must stay 0
   in-combat creations), `npx tsc --noEmit`, and the focused vitest files for
   anything you touched (`npx vitest run <file>`; never the full suite).
7. Streamline what you touched: if you find dead code or duplicated
   per-frame logic in the perf path, remove it in a separate commit.

## File ownership (hard)
- You may edit: `src/rendering/arenas/**`, `src/nuketown-lawn-field.ts`,
  `src/rendering/instanced-grass-field.ts`, `src/graphics-settings-registry.ts`
  (measurement plumbing only), `src/legacy-main.ts` ONLY inside the
  arena-transition / per-frame update region with `// HF-399:` marks.
- Do NOT edit: `src/weapon-presentation.ts`, `src/systems/viewmodel-surface-clip.ts`,
  thermal files, lobby/netcode, spawn layouts, `baselines/`, any test
  threshold. If the best fix lands in a file you do not own, STOP and put
  the exact patch in your report.
- `src/legacy-main.ts` is LF. Any tool that rewrites it must preserve LF
  (Python: `newline=''`). 21 source-pinned tests break on CRLF.

## Machine rules
Headless only, `--mute-audio`, never a visible window. One browser at a
time, one build at a time. Never kill a process you did not start (ComfyUI,
ollama, llama.cpp, other agents' Chrome). `nvidia-smi` before GPU-heavy
runs. Commit to YOUR branch only, explicit paths (`git add <files>`; never
`-A`), one commit per landed item, message says what was measured.

## Report (final message = raw data for the orchestrator)
- Root cause, with the numbers that prove it and the pass where it entered.
- Before/after table: build x arena x phase -> p50/p95/p99 ms, draw calls.
- Screenshot pairs showing Quality still looks like Quality.
- Tripwire result (in-combat pipeline creations), tsc result, focused tests.
- Commits on your branch (hashes + one line each).
- Anything you could not verify, and any recommended patch outside your
  ownership. Claim-state every line: VERIFIED / CLAIMED / OPEN.
