# PASS 95 — Load-time remerge (rehearsal-scope only)

**Machine** `dave-gaming-pc` · **Harness** OMP (Meta Muse Spark 1.3)
**Worktree** `C:/Users/david/projects/aa-muse-loadtime`
**Branch** `contrib/dave-gaming-pc/claude/load-time-remerge`
**Base** `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `3e2fd273`
**Prior lane** `origin/contrib/dave-gaming-pc/claude/load-time-verified` (10 commits, DO-NOT-SHIP as a whole)
**Prior REPORT** `docs/evidence/pass94/load-time/REPORT.md` on that branch (304 lines, read in full)

Claim states: `[VERIFIED]` = measured/gated in this worktree on this machine;
`[PRIOR-VERIFIED]` = measured in the prior lane, quoted, not re-run here;
`[DESIGNED]` = implemented + unit-gated, needs a headed capture;
`[OPEN]` = not resolved here. No browser/GPU probes ran in this lane
(owner is running ComfyUI; task fence: no browsers, no GPU).

## 1. What was re-landed (safe rehearsal scope only)

`[VERIFIED]` Files added verbatim from the prior head
(`git show origin/contrib/dave-gaming-pc/claude/load-time-verified:<path>`):

- `src/weapon-rehearsal-scheduler.ts` (205 lines, post-fix shape: deferred
  scheduler inputs are `readState/writeState/isPreparing/prepare/report` —
  no `exercise`/`backend`, so a forced submission is unreachable from a
  gameplay frame)
- `src/weapon-rehearsal-scheduler.test.ts` (120 lines, incl. the two
  regression tests for one-slice-per-frame walk and combat no-op)
- `scripts/qa/probe-weapon-switch-latency-cdp.mjs` (282 lines; handles null
  cadence and null rehearsal fields, so it runs without the cadence module)

`[VERIFIED]` `src/legacy-main.ts` ported hunks (same semantics as prior
`c7bfadf3` + `d57871de`, re-anchored to this base):

- scheduler import; `exercisePreparedWebGpuWeaponSwitchesFor(ids?)` scoping
  the admission state walk to `plan.admissionWeaponIds` with a
  non-retained-weapon guard; loop over `rehearsalIds` with
  `markWeaponRehearsed` per slice;
- `weaponRehearsalState/generation/pending` + `scheduleDeferredWeaponRehearsal`
  (prepare-only deferred path);
- admission plan creation at match start from `weaponPrewarmCatalogForArena`
  + loadout + `arenaPickupWeaponIds`;
- `weaponRehearsalWindow()` / `weaponRehearsalWindowForSwitch()` +
  `switchWeapon` synchronous-barrier commit path;
- per-frame `scheduleDeferredWeaponRehearsal` drive in `frame()`;
- `lastMatchAdmissionProfile` gains `admissionWeaponIds/rehearsedWeaponIds/
  deferredWeaponIds`, `begin` bumps generation and clears state.

`[VERIFIED]` No ratchet change needed: `src/legacy-main.ts` is 37,318 lines
(`wc -l`), ceiling stays `37_396`. No new render pipeline: the deferred path
calls only `prepareBrowserWeapon` (the asset/GPU-readiness half the menu
window already used); the state walk still runs only inside admission.

## 2. What was left out, and why

- **Adaptive admission cadence wait** (`src/admission-cadence-wait.ts` +
  tests, +88-line legacy wiring): `[PRIOR-VERIFIED]` zero measured saving.
  Prior REPORT §4: `stable-cadence-wait` deltas +5.3/+3.4/+34.4 ms across
  three arenas; every after-run `exitReason: "ceiling-timeout"`,
  `achievedWaitMs: 5,001–5,049`; `resets == samples` (72/72) because every
  admission warm frame runs ~68 ms against a 50 ms long-task threshold, so 30
  consecutive stable frames are unreachable. Safe but dead weight; the brief
  explicitly requires "no cadence wait". Left out entirely.
- **Anything that moved the tripwire to 1**: nothing in the prior lane did.
  `[PRIOR-VERIFIED]` (REPORT §6) the in-combat pipeline count is 1 on the
  merge base too (`renderPipeline_MeshBasicMaterial_774`, first-death
  transparent, `_renderTransparents`, never in a stall) — pre-existing, not
  attributable to the deferred warm-up, needs its own lane. This remerge adds
  no pipeline creation path, so it cannot move that count; re-measurement is
  `[OPEN]` (needs the headed 75 s probe, not run here).
- **Brief terms with no counterpart in the lane**: the queue brief names
  "asset/geometry build deferral" and "menu-time precompile ordering". The
  lane's actual diff contains neither: no change to
  `src/rendering/cold-session-precompile-reach.ts` (reach test passes
  verbatim below) and no geometry-build deferral outside the weapon rehearsal
  scope above. Nothing was invented to match those words; this is recorded so
  the next lane does not go looking for them.

## 3. Prior measured win (quoted, not re-measured here)

`[PRIOR-VERIFIED]` prior REPORT §2, `probe-arena-switch-matrix`
(`--max-edges 1 --session-edges 1`, ComfyUI idle, 1600x900, hardware WebGPU):

- atomic-acres `weapon-switch-rehearsal` **5,161.8 → 721.7 ms (-4,440.1)**,
  total admission **16,947.0 → 12,570.2 (-4,376.8)**;
- nuketown2 `weapon-switch-rehearsal` **4,426.8 → 749.1 (-3,677.7)**,
  total admission **15,402.8 → 12,502.4 (-2,900.4)**;
- gun-range: nothing deferrable by design (hot set = whole roster),
  +684.7 ms run variance on an unchanged path.
- `[PRIOR-VERIFIED]` weapon switching still instant: max sync cost
  1.605 → 1.575 ms, 12/12 cycles committed, `reachableDeferred: []`.

`[DESIGNED]` this remerge preserves that mechanism; the numbers above are
inherited, not re-captured (no browser in this lane). Re-capture with the two
probe scripts is `[OPEN]`.

## 4. Gates (quoted)

```
$ npx tsc --noEmit
TSC_EXIT=0
```

(no output; re-ran clean after restoring the `matchAdmissionMarks`
declaration dropped by a mid-edit renumber — the error, fix, and clean
re-run are all recorded here, the gate was never weakened).

```
$ npx vitest run src/rendering/cold-session-precompile-reach.test.ts src/pipeline-metrics.test.ts src/graphics-profile-contract.test.ts src/legacy-main-size-ratchet.test.ts src/weapon-rehearsal-scheduler.test.ts src/presentation-prewarm-contract.test.ts
 Test Files  6 passed (6)
      Tests  54 passed (54)
```

Note: the brief pattern `src/cold-session-precompile-reach*.test.ts`
matches nothing on this base; the real path is
`src/rendering/cold-session-precompile-reach.test.ts` (run above, 3/3 pass —
no new pipeline entered the reach). `weapon-rehearsal-scheduler.test.ts`
8/8 pass, including the combat no-op and one-slice-per-frame regression
cover. `legacy-main-size-ratchet` passes with no ceiling change.
Headed probes (`probe-arena-switch-matrix`, `probe-weapon-switch-latency`,
`pass74:arena-boot-smoke`, full suite) were NOT run here: no-browser fence.
That is `[OPEN]`, not a pass.

## 5. Standing checks

- Three.js source priority (HF-481): no new Three.js API in this change, so
  points 1–3 (docs → pmndrs MCP → source/examples) were not consulted and no
  recipe was written. Installed version checked: `package.json:227`
  `"three": "0.185.1"`. Measurement for anything adopted: inherited prior
  numbers in §3, re-capture `[OPEN]`.
- Per-instance material values: none added (no material code touched).
- 12 s WebGPU fence: untouched (no change to `flushWebGpuFrames(12_000)`
  call sites; presentation-prewarm contract passes).
- Secrets: none printed, none committed.

## 6. OPEN

1. Re-capture admission + weapon-switch + 75 s pipeline probes headed on this
   base (needs GPU-idle window; ComfyUI was running).
2. In-combat pipeline count 1 (pre-existing first-death transparent) needs its
   own lane — not this one.
3. Full `npx vitest run` not executed here; targeted gates only.
