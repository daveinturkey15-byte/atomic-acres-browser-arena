# Muse skeptic review — pass94 nuke-event lane (HF-490)

Scope: `origin/contrib/dave-gaming-pc/claude/pass93-candidate..HEAD`, base `7733d37b`.
HEAD `2f7855d2` / `bbeec8a5` — "add Nuketown horizon detonation lane".
REPORT: `docs/evidence/pass94/nuke-event/REPORT.md` (HF-490: distant horizon
mushroom cloud + match-end detonation). Read: full `src` diff (44 files,
+1092/−3261), `src/nuke-event/*`, `src/legacy-main.ts` hooks,
`src/camera-shake.ts`, `src/rendering/cold-session-precompile-reach.ts`.
No builds, no browsers, no GPU — static review only, as tasked.

## Claim-state ledger

| # | Claim | State | Evidence |
|---|---|---|---|
| 1 | Fence/tripwire: pipelines, precompile, uniforms, allocation | VERIFIED with findings (F1, F4) | below |
| 2 | Detonation trigger replicated-only + deterministic | MIXED: pure fn VERIFIED, call-site fallback OPEN (F2) | below |
| 3 | Camera-shake bound vs dt-clamp divergence gotcha | VERIFIED with note (F3) | below |
| 4 | No combat-noise read (flash/haze numbers quoted) | VERIFIED with note (F5) | below |
| 5 | Ray-march ≤0.6 ms p50 defensible; capture to settle | DESIGNED, NOT MEASURED — capture OPEN (F6) | below |

## (1) Fence / tripwire

- Two pipeline families, shared graph: `src/nuke-event/index.ts:39-42`
  (`NUKE_EVENT_PIPELINE_IDS`, exactly 2: `nuke-event-volume-tsl-v1`,
  `nuke-event-ring-tsl-v1`). One `MeshBasicNodeMaterial` volume graph
  (`:60-139`) shared by two meshes (`:208-231` background, `:231-240` event)
  plus one ring graph (`:141-159`). Two programs total — claim holds.
- Menu-time precompile reach: VERIFIED.
  `src/legacy-main.ts:37201-37202` (`nuke-overdrive-bolts` group:
  `prewarmNukePresentation(), nukeEvent.prewarm(...)`) and compat path
  `:37306-37307`. `prewarm()` (`index.ts:328-347`) forces all three meshes
  visible and does one `compileAndRender(this.root, ...)` (`:339`), so both
  families realise in a single menu-time submission before any fenced arena
  admission. No `WebGLRenderTarget`, no fullscreen pass, no RT in module.
  `cold-session-precompile-reach.ts:47-51` lists only `farcrysis` — nuketown2
  correctly relies on the menu-time prewarm, not cold-session relief.
- Uniform-only per-instance values: VERIFIED. Twelve `uniform(...)` fields
  (`:171-183`), no `InstancedBufferAttribute`, no `attribute(` in module.
  Per-mesh variance is three `onBeforeRender` binders (`:363-380`) writing
  shared uniforms (mode/opacity/origin/extents). See F1 for the fragility.
- Per-frame allocation: VERIFIED for the hot path. `update()` (`:308-326`)
  is arithmetic + `writeNukeEventTimeline` into a caller-owned record
  (`timeline.ts:72-102`); no `new` in the slice (test pins this,
  `nuke-event.test.ts:87-96`). One-shot allocations live only on the
  detonation edge (`triggerFromMatchEnd` → `onDetonation` → fresh frozen
  trauma state) and in `telemetry()` (`:349-361`, not frame-called).

## (2) Multiplayer trigger trace

- Pure admission fn VERIFIED deterministic:
  `timeline.ts:62-69` returns `snapshotHostTimeMs` iff
  `selectedArenaId === 'nuketown2'` and `state.phase === 'ended'`, rejects
  null/NaN/negative. No `performance.now`/`Date.now` in `timeline.ts`
  (pinned `nuke-event.test.ts:51-52`). Seed `nukeEventSeed` (`:51-56`) is a
  pure integer hash of the stamp — peers with the same stamp get the same
  noise (`index.ts:315` maps it to `volumeSeed`). Timeline
  `writeNukeEventTimeline` (`:89-102`) is a pure function of
  (triggerStamp, nowHostTimeMs). Single automatic call site
  (pinned `nuke-event.test.ts:80`): `legacy-main.ts:27695`.
- BUT the call site injects a local clock (F2): `{ phase:
  privateLobbySnapshot?.phase ?? matchState.phase, snapshotHostTimeMs:
  privateLobbySnapshot?.snapshotHostTimeMs ?? matchState.endsAt }`.
  `matchState.endsAt` is local frame time (`:27557`, `:27564` `endsAt: now`;
  solo init `:17824` `activeAt + durationMs` from `performance.now`).
  Solo: fine (single authority). Private lobby guest pre-heartbeat: local
  expiry stamp fires first, then the replicated stamp re-triggers and reseeds
  mid-event (dedup only on equality, `index.ts:292`). Visual timeline jump +
  second shake impulse. QA path `debugTrigger` (`:300-306`) is correctly
  isolated (only caller `legacy-main.ts:33867`).

## (3) Camera-shake bound vs dt-clamp gotcha

- VERIFIED bounded: detonation adds one impulse through the existing trauma
  path (`legacy-main.ts:6543`: `addCameraShakeTrauma({ source: 'nuke', now:
  performance.now(), seed, strength: 1 })`). Nuke preset
  (`camera-shake.ts:300-306`): trauma 1, ceiling 1, decay 0.42/s (slowest in
  table), positional 0.42/0.36/0.26 m, rotational 0.048/0.040/0.070 rad,
  amplitude = trauma². Hard ceiling `CAMERA_SHAKE_MAX_TRAUMA = 1` (`:209`),
  test pins 40 stacked nukes never exceed it.
- Divergence gotcha inherited-fixed: trauma decay clamps dt to 0.25 s
  (`:410-415`); spring integrator clamps gap to
  `CAMERA_SHAKE_MAX_GAP_SECONDS = 0.25` and substeps at
  `CAMERA_SHAKE_MAX_SUBSTEP_SECONDS = 1/120` (`:131-143`). No direct
  `camera.position` write in the lane — the only writer is the existing
  sampler (`legacy-main.ts:27267-27274`). No 30 km recurrence by construction.
- Note (F3): `now: performance.now()` at receipt differs per peer by network
  latency while the cloud timeline runs on host time (`legacy-main.ts:31540`
  `nukeEvent.update(debugCaptureFixedVisualTimeMs ?? currentHostTimeMs())`).
  Shake envelopes diverge by ~latency × 0.42 trauma — small, but the noise
  time axis is receipt-relative, not stamp-relative.

## (4) Combat-noise read — the numbers

- `update()` (`index.ts:320`): `_exposureScale = 1 + flashStrength×0.32 +
  fireballStrength×0.06`. At t=0 (flash 1, fireball 1): **1.38× global
  exposure**, decaying to 1.0 as flash hits 0 at 1 s
  (`timeline.ts:94` `flashStrength = 1 − smooth01(elapsed)`) and fireball
  bleeds to 0.58 by 8 s, 0 by ~26 s (`:95-97`). Brief, whole-frame, but no
  aim/weapon path touched — presentation exposure only (`legacy-main.ts:4338`).
- Fog drift (`:321-324`): `orangeDrift = active ? fade×0.3 : 0`;
  G ×(1−0.084 max), B ×(1−0.174 max), R untouched — subtle warm cast,
  `fade` holds 1 until 30 s then releases by 60 s (`timeline.ts:100`).
  Lighting gate churn (`:325`, `legacy-main.ts:4288`): `lightingStep =
  floor(elapsed×8)+1` forces `applyLightingConditionUniforms` recompute 8×/s
  for the 60 s event — cheap (comparisons + occasional writes), not a fence
  risk.
- Geometry: cloud at `[0, 112, 680]` (`:44-48`), half-extents ≤132 m,
  background opacity 0.34, alpha ≤0.92 (`:135,365`); ring `3 + progress×68`
  (`:318`) → max 71 m radius at 680 m; far plane 900 (`timeline.ts:12`,
  `legacy-main.ts:29817`); additive, depth-write off, renderOrders 4/5/6;
  arena-gated (`:267-270`, `:29804`). At 680 m with a ≤1.38× sub-second flash
  this reads as horizon dressing, not combat noise. No collider/spawn/damage
  authority added.

## (5) Ray-march cost

- Shader: 40 steps (`timeline.ts:13`, loop `index.ts:89`), per step
  ~10 smoothstep/exp + 3 trig noise bands (`:119-122`) + haze exp, BackSide
  box, `frustumCulled = false` (`:225,235,248`) → always drawn when the arena
  is active, even looking away/indoors (F4).
- 0.6 ms budget (`timeline.ts:16`) / 0.42 ms design estimate (REPORT §ledger):
  NOT MEASURED — arithmetic only (40 × ~9% coverage ≈ 3.6
  full-frame-equivalent layers). Directionally plausible for a distant box on
  target desktop (no post pass, cheap ALU, low coverage on street sightline),
  but TSL `Loop` unroll, resolution scaling, balcony-FOV coverage, and the
  always-draw cost are unmeasured. Capture to settle (exact-SHA,
  native-WebGPU, 2560×1440): frame-pacing p50/p95 with cloud on/off on
  `nuketown2-nuke-street`, plus pixel-coverage counter per review station and
  a look-away/indoors control proving the always-draw waste (or its absence).

## Findings (file:line, why, smallest fix)

- F0 — OUT-OF-LANE REVERTS (largest issue, not the nuke module): HEAD's two
  commits vs `pass93-candidate` touch 44 `src` files (+1092/−3261) and
  111 files overall, mostly deletions/reverts unrelated to HF-490:
  `src/nuketown2-pipeline-budget.test.ts` deleted (301-line HF-477 fence);
  `src/legacy-main-size-ratchet.test.ts:78` ceiling 37396→37371 with the
  2026-09-04 candidate-4b history row removed; `src/legacy-main.ts`
  `configurePlayableArenaVisuals` five review-state resets moved back below
  the WebGPU block (revert of the DEPLOY-FENCE ORDERING FIX) and
  `setArenaReviewCamera` `findAuthoredArenaReviewCamera` fallback removed;
  `src/nuketown2-arena.ts`/`layout`/`materials`/`fidelity` reverts;
  `docs/evidence/pass94/candidate4b/*` deleted. Why: one worktree = one
  bounded outcome (AGENTS.md); silently dropping another lane's fences and
  its history row reads as regression, and the REPORT never discloses it.
  Fix: rebase the lane onto current `origin/pass93-candidate` tip so the diff
  is nuke-only, or restore the unrelated files and disclose the revert as its
  own lane with owner sign-off.
- F1 — Shared volume material + per-mesh uniform rebinding:
  `src/nuke-event/index.ts:208-240` assigns one `volumeMaterial` to both
  meshes while `:363-375` mutate the same uniform objects per
  `onBeforeRender`. Why: correct only under strict sequential draw order
  (4→5); a reorder/batch collapses background/event into one mode.
  Fix: `volumeMaterial.clone()` per mesh sharing the node graph (two material
  instances, one program), or per-mesh uniform instances.
- F2 — Local-clock fallback in the trigger call:
  `src/legacy-main.ts:27695` `?? matchState.endsAt`. Why: breaks the
  "replicated-only" contract for lobby guests pre-heartbeat (double
  detonation + reseed). Fix: in non-solo modes trigger only when
  `privateLobbySnapshot` is present; keep `matchState.endsAt` documented as
  the solo-local authority.
- F3 — Shake clock vs event clock: `src/legacy-main.ts:6543`
  `now: performance.now()` vs `:31540` host-time timeline. Why: peer shake
  phases diverge by receipt latency (small: ~latency×0.42 trauma). Fix: seed
  already stamp-derived; additionally derive the trauma `now`/elapsed base
  from `triggerAtHostTimeMs` so envelopes agree, or record the delta as
  accepted.
- F4 — Always-draw horizon volume: `src/nuke-event/index.ts:225,235`
  `frustumCulled = false` on both volume meshes. Why: full 40-step cost even
  when the player faces away or is indoors. Fix: enable culling with a proper
  bounding sphere, or CPU facing/visibility gate in `update()` before setting
  `visible`.
- F5 — Exposure spike unclamped: `:320` peaks 1.38×. Why: whole-frame flash
  at match end is the lane's intent, but 1.38× with no cap is the only
  whole-screen effect in the lane. Fix: cap at ~1.25× (tune from capture), or
  keep with HITL sign-off on the review-station capture.
- F6 — Cost claim unmeasured (constraint, not fault): `timeline.ts:13-16`.
  Why: 0.42/0.6 ms is arithmetic, no GPU ran. Fix: the §5 capture before
  promoting the budget to VERIFIED.

## Verdict: SHIP-WITH-FIXES

1. The nuke module itself is well-fenced (2 pipelines, menu-time precompile,
   uniform-only, allocation-free frame, replicated-pure admission fn,
   inherited shake clamps, horizon-only read) — but the lane as committed is
   not nuke-only: it silently reverts unrelated pass93-candidate fences (F0),
   which must be rebased out or separately signed off.
2. The end-to-end trigger is not yet replicated-only because of the
   `matchState.endsAt` fallback (F2) — one-line scoping fix, then the
   multiplayer claim holds.
3. The performance claim is designed, not measured (F6), compounded by the
   always-draw volume (F4) — needs the named native-WebGPU capture plus the
  culling/clone hardening (F1/F4) before the budget is release evidence.

Smallest shippable delta: rebase to nuke-only (F0) + trigger scoping (F2) +
material clone + culling (F1/F4) + §5 capture; F3/F5 disposable via recorded
acceptance if the capture looks clean.
