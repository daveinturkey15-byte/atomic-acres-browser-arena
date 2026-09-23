# HF-438 — graphics fold, PASS 92 lane evidence

Lane: AI2 (GLM 5.3 Flash via OMP), branch
`contrib/dave-gaming-pc/claude/fold-raytraced-into-quality-max`. The RAY TRACED
preset is retired; its reflection trace folds into QUALITY (light tier) and
MAX (full tier). Committed as `5165c168` (removal), `146beb09` (fold),
`507a396d` (pin re-derivation) + this evidence commit.

## Method (VERIFIED)

`scripts/qa/audit-graphics-profiles.mjs`, one fresh headless Chrome per row
(`channel: 'chrome'`, cold shader cache), 2560x1440, real WebGPU backend
confirmed per row (`backend: "webgpu"` in every row), the real Options surface
driven as the owner drives it (select → SAVE GRAPHICS → arena → solo).
Arena: `atomic-acres`. Sample: `--sample-ms 10000` (short sample, lane rule
"short samples are fine"). Served from `npm run build` output via
`vite preview` on 127.0.0.1:4274 (started by this lane, PID recorded, stopped
by PID after the run — exit after 4 m22 s of service).

Pre-browser gates (lane rules): ComfyUI queue at `127.0.0.1:8188` empty AND
nvidia-smi ≥ 3000 MiB free — polled up to 10 times; gates opened on attempt 5
(14,777 MiB free, queue empty). One browser at a time. Ports 4271/4273 were
not touched.

## The measured post-fold ladder — §3-R table source

All rows: `backend: webgpu`, `admissionOutcome: admitted`, `errors: 0`,
`pipelinesInCombat: 0`, peak completion latency 87-425.5 ms against the
12,000 ms fence.

| Preset | Cold admission (s) | Pipelines @admission | Pipelines in combat | Median ms | p95 ms | p99 ms | Rate Hz | Draws | Tris |
|---|---|---|---|---|---|---|---|---|---|
| performance | 24.1 | 297 | 0 | 14.6 | 36.4 | 45.7 | 53.7 | 152 | 289k |
| balanced | 31.1 | 375 | 0 | 10.2 | 26.3 | 35.0 | 79.0 | 186 | 540k |
| high (QUALITY, light trace) | 34.5 | 375 | 0 | 12.3 | 26.8 | 29.0 | 71.8 | 190 | 536k |
| max (full trace) | 40.2 | 478 | 0 | 29.0 | 60.2 | 63.9 | 31.6 | 373 | 688k |

### Pipeline-count delta (the audit-script figure the fold was required to record)

- QUALITY (atomic-acres): 374 → **375** (+1). **MEASURED.**
- MAX (atomic-acres): 478 → **478** (±0 — the count is unchanged by the fold
  on this arena; the trace's stage rides the existing composite-pass pipeline
  structure rather than adding a new pipeline variant here). **MEASURED.**
- Menu precompile: `pipelinesAtMenu: 0` on every row (this headless flow does
  not idle in the menu long enough to exercise it); the admission fence held —
  **zero pipelines compiled during combat on every row**. **MEASURED.**

### Claim-states

- Every figure in the table: **MEASURED**, n=1, one 10 s window, one arena,
  one session, on an otherwise quiet GPU (ComfyUI queue empty before and
  after every row; `comfyBusyAfter` false or null-not-busy).
- The QUALITY and MAX frame times below vs their pre-fold §3 values are
  **NOT comparable** as a fold-cost measurement: different session, different
  machine load, different head (§3's own honesty rule — single-cell
  comparisons under ~15% carry no signal). The fold's per-frame cost on
  QUALITY/MAX frame time is **OPEN** (needs the §7 repeats protocol:
  3-5 repeats per cell on a quiet machine).
- The pipeline deltas above ARE the fold's cold-compile story at admission
  and are **MEASURED** directly.

## RTX explainer falsifier

`node scripts/qa/verify-rtx-explainer-headless.mjs` against the same dist:
**0 issues, 0 page errors** (`rtx-explainer-receipt.json`, schema
`hf418-rtx-explainer/1`). Selecting RTX opens the explainer, restores the
previous mode, persists byte-identical graphics settings, and leaves the
handler live. The RTX entry was not changed by this lane beyond its copy
re-derivation (it never changed the renderer).
