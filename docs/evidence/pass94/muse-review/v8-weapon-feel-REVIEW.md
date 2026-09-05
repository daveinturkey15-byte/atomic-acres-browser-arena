# Muse review — v8 weapon-feel (pass95 lane, branch `contrib/dave-gaming-pc/claude/v8-weapon-feel`)

Reviewer: Muse Spark 1.3 (skeptical second pair of eyes, no verifier ran before this).
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (452d7aba).
Report reviewed: `docs/evidence/pass95/weapon-feel/REPORT.md` (395 lines, honest claim-states).
Diff reviewed: 8 tracked files (+1338/−20); 4 untracked files left uncommitted (see F1).
No builds, no browsers, no GPU, no npm install — static review + committed evidence only.

## Verdict: DO-NOT-SHIP

Three reasons (each independently blocking for candidate 9):

1. **The 0-in-combat-pipeline requirement is red, not OPEN.** The lane's own
   untracked tripwire ran 07:28–07:30Z after the report and measured
   `pipelinesInCombat: 9` with 1 console error and 90/160 shots presented
   (`docs/evidence/pass95/weapon-feel/weapon-effect-pipeline-tripwire.json:14`).
   The probe exits 4 on any non-zero count. The report §5/§8 still says
   "not run". A red tripwire described as unrun must not enter a candidate.
2. **2 of the 5 brief asks are carried forward as OPEN, by the report's own
   table.** (2) viewmodel clip-0/no-recompile and (3) muzzle/shell/decal
   pooling + tripwire are explicitly unmeasured in this window
   (REPORT.md:22-24,242-274). What *was* measured (impact-debris alloc,
   recoil/spread table, damage-number default, W-1) is real but partial.
3. **The lane left its newest evidence uncommitted and its report stale.**
   `scripts/qa/probe-weapon-effect-pipelines-cdp.mjs` + the tripwire JSON +
   2 PNGs are untracked (`git status`), so the diff under review does not
   contain them, and the committed REPORT.md contradicts them ("tripwire was
   not re-run"). Candidate 9 needs a re-run report that quotes the 9-pipeline
   row and the console error, not a green claim.

## Check (1): recoil/spread host-authoritative, host≡guest — PASS with HF-511 caveat

- Single authority: every catalog row carries `policies.authority: 'host-shot-v1'`
  (`src/combat/weapon-catalog.ts`, e.g. carbine:46, railgun `host-railgun-v1`:113);
  `LEGACY_WEAPONS` projects `recoil.proneMultiplier` etc. from it
  (`src/combat/legacy-weapon-adapter.ts:121-122`); `computeSpread` /
  `computeRecoilImpulse` in `src/gameplay.ts` are the only resolvers used by the
  fire path (`src/legacy-main.ts:19458,19473,28278`), replay
  (`src/gameplay-replay.ts:176,181`), and the new instrument
  (`src/weapon-feel.ts:22`).
- Host and guest therefore match: both call the same functions with the same
  `LEGACY_WEAPONS` values. `src/weapon-feel.ts:9-10` is explicitly read-only
  ("the shot path does not import it, so it cannot become a second balance
  authority") — correct design.
- Caveat is HF-511, not a mismatch: `src/gameplay.ts:221`
  `if (context.prone) spread *= 0.62;` ignores the catalog's per-weapon
  `spread.proneMultiplier` (0.50–1.00) while prone *recoil* does read its
  per-weapon value (`src/gameplay.ts:352-353`). Host≡guest (both apply 0.62),
  but authored≠applied on 19/21 weapons. The lane measured it
  (`proneSpreadDivergence()`, `src/weapon-feel.ts:341-353`) and correctly
  reverted the 3-line adoption to protect the Pass 64 fixture. See F3.

## Check (2): muzzle flash / shells / decals pooled, zero per-frame alloc, 0 pipelines — FAIL

Tripwire evidence (untracked, quoted verbatim):

- `docs/evidence/pass95/weapon-feel/weapon-effect-pipeline-tripwire.json:14`
  `"pipelinesInCombat": 9` (requirement: 0; probe exits 4 otherwise).
- Same file: `"pipelinesAtBaseline": 486`, `"shaderModulesInCombat": 12`,
  `"shotsRequested": 160`, `"shotsPresented": 90`,
  `"matchPhase": "active"`, `"stagedBot": null`.
- Same file `:30-32`: 1 console error —
  `[Nuke Town Rebuild map selection failed] Error: WebGPU queue completion
  exceeded 12000 ms for submission 1 …`.
- `"vramBeforeMiB": 7280` → `"vramAfterMiB": 2622`, `admissionMs: 72880` —
  a contended-GPU sample (report itself warns ComfyUI shares the GPU), but
  contention does not explain 9 compiles away.

Pooling scope is narrower than the brief:

- What the lane proved: `ImpactPresentation` (decals + impact sparks) builds
  zero `Vector3/Quaternion/Matrix4/Color` across 1200 impacts and 3600 frames
  via a counting `three` mock (`src/weapon-effect-pooling.test.ts`), after the
  `src/impact-presentation.ts:21-38` scratch-hoist commit (e60bfbf1). The
  construction is sound: `HIDDEN_MATRIX` shared, `setMatrixAt`/`setColorAt`
  copy into buffers.
- What it did not touch: muzzle flash and shell casings live in
  `src/weapon-presentation.ts` (pooled `casings[16]`, shared
  `shellGeometry/brassMaterial`, reused `muzzleFlash` group — pool-shaped by
  construction) but have **no allocation gate**, and the in-combat path still
  falls back to `new`:
  `src/weapon-presentation.ts:3035` `?? new THREE.Vector3(0, 0.08, -1.15)`,
  `:3057` `?? new THREE.Vector3(0.12, 0.04, -0.48)`,
  `:4295` `?? new THREE.Vector3(0.12, 0.04, -0.48)`,
  `:4351` `?? new THREE.Vector3(0, 0.08, -1.15)`,
  plus per-frame `getWorldPosition(new THREE.Vector3())` at e.g. `:3879`,
  `:4682`, `:4694`, `:5576-5579`. One fallback per shot is not "zero
  per-frame allocation" for the muzzle/shell half of the ask.

## Check (3): viewmodel never clips (metric 0), clip-state ⇒ no recompile — OPEN (carried forward)

- The lane added no viewmodel change and ran no new capture — REPORT.md:242-266
  says so explicitly. No `viewmodel*` file is in the diff (only 8 files;
  `git diff --name-only` confirms).
- The existing mechanism is correctly described: `setPresentationVisible`
  never sets `root.visible = false` because the root carries
  `first-person-muzzle-light` (`src/weapon-presentation.ts:2568`) and the fill
  light; hiding them changes the LightsNode cache key and invalidates every
  program (`src/weapon-presentation.ts:3955-3976`, cites 251-pipeline probe
  `artifacts/qa/pipeline-compile/before-local-pass81.json`). Structural, not
  metric, enforcement — credible but un-re-measured here.
- "Clip metric 0" is therefore candidate-7 evidence, not re-proven. Acceptable
  as a carry-forward only if labeled as such; it cannot satisfy a "never
  clips" acceptance row for candidate 9 on its own.

## Check (4): W-1 fire-rate deadline — PASS (static; not re-run here)

- `src/hf504-multiplayer-audit-fixes.test.ts` untouched by the diff (zero hunks;
  `git diff … -- <that file>` empty), as are `src/gameplay.ts`,
  `src/combat/`, and every `viewmodel*` gate.
- The lane's only `legacy-main.ts` edit is the damage-number gate at
  `:23404`; `switchWeapon`/pickup/deadline paths untouched. Report's
  `[VERIFIED] 31 passed` (REPORT.md:300-310) is consistent with the diff.
- This reviewer did not re-execute vitest (lane contract: no builds; reviewer
  instruction: no builds/browsers/GPU). Treat as "no regression indicated",
  not independently re-verified.

## Check (5): any test loosened — NO

- `git diff --stat`: no existing test file modified; 3 new test files only
  (`weapon-feel`, `weapon-hit-feedback-defaults`, `weapon-effect-pooling`).
  No threshold, timeout, skip, or assertion weakened in the diff.
- New-test quality notes (not loosenings, but fix before candidate): F5–F7.

## Findings (file:line, why, smallest fix)

- **F1 (blocking). Untracked tripwire contradicts the report.**
  `docs/evidence/pass95/weapon-feel/weapon-effect-pipeline-tripwire.json:14`
  (`pipelinesInCombat: 9`) + `:30` (console error) + `:17`
  (`shotsPresented: 90` of 160) vs REPORT.md:270-274,361-363 ("not run", "no
  claim"). Untracked: that JSON + 2 PNGs +
  `scripts/qa/probe-weapon-effect-pipelines-cdp.mjs` (`git status` shows all
  four as `??`). Why: reviewers merge the diff, not the worktree; untracked
  evidence is invisible and the committed claim is false. Fix: commit the
  probe + JSON + PNGs (or delete and re-run), and amend §5/§8 to quote the
  9-pipeline row, the queue-completion error, and the 90/160 presentation
  shortfall; explain `stagedBot: null`.
- **F2 (blocking). Zero-alloc proof covers decals/sparks only.**
  `src/weapon-effect-pooling.test.ts:1-223` imports `./impact-presentation`
  only; muzzle/shells (`src/weapon-presentation.ts:2048,2165-2167,2646-2653,
  4289-4298`) unmeasured, with `new` fallbacks at `:3035,:3057,:4295,:4351`.
  Why: brief ask names all three vocabularies. Fix: extend the counting-mock
  gate to `WeaponPresentation.fire()`/`ejectCasing()`/`update()` (burst +
  frames windows as for impacts), or narrow the brief row to "impact debris
  only" with owner sign-off; hoist the four fallback vectors to module
  scratch in the same commit.
- **F3 (non-blocking, owner decision). HF-511 authored-vs-applied prone spread.**
  `src/gameplay.ts:221` (`*= 0.62`) vs catalog `spread.proneMultiplier`
  (`src/combat/weapon-catalog.ts`, e.g. m14-ebr row:229 `0.5`) and
  `src/weapon-feel.ts:63` mirror constant. Why: M14 EBR +24% looser and M40A5
  +19% looser prone than authored; railgun authored 1.00 gets a 38% bonus it
  was denied (REPORT.md:181-207). Fix (owner-gated, NOT this lane): adopt
  authored values + `gameplay-contract` baseline id + re-measure M14/M40A5, or
  delete `WeaponSpreadProfile.proneMultiplier`; either beats the current
  author/applied split. Lane's revert + `proneSpreadDivergence()` was correct.
- **F4 (blocking as acceptance). Viewmodel proof carried forward, not re-made.**
  REPORT.md:242-266. Why: "clipping stays 0" without a new capture cannot
  close a candidate-9 row. Fix: re-run the clip capture + ratchet suite and
  paste the metric, or mark the row OPEN in the acceptance manifest.
- **F5 (non-blocking). Band edges are post-hoc drift detectors, not targets.**
  `src/weapon-feel.ts:205-260` + REPORT.md:130-134 (report admits: "set after
  measuring"). Why: a gate authored from the baseline it guards catches drift
  but not a bad baseline. Fix: label bands `BASELINE-ANCHORED` in source and
  require owner/independent justification for any future edge change (already
  half-done via exemption reason-length gate
  `src/weapon-feel.test.ts:43`).
- **F6 (non-blocking). HF-511 gate fails when the bug is fixed.**
  `src/weapon-feel.test.ts:132` `expect(divergence.length).toBeGreaterThan(0)`.
  Why: adopting authored values (the desired outcome) reddens this gate; a
  flatten-to-constant also changes shape silently. Fix: assert the exact
  divergence table (or `authored` set) rather than non-emptiness, so both
  adoption and flattening are visible and only flattening fails.
- **F7 (non-blocking). Hit-feedback gate is a source scan + per-hit store read.**
  `src/weapon-hit-feedback-defaults.test.ts:78-80` greps `legacy-main.ts`
  text; `src/legacy-main.ts:23404` calls `damageNumbersEnabled()` per damage
  number (localStorage read when no session override;
  `src/player-feedback.ts` throw-safe but un-cached). Why: text match breaks
  on any reformat; per-hit storage I/O in a hit path. Fix: keep the behavioral
  tests, replace the `toContain` with a seam (exported `shouldDrawDamageNumbers`
  predicate), and cache the preference with a storage-event/subscription
  refresh instead of per-call `getItem`.
- **F8 (non-blocking). Full-suite row is inherited red.**
  REPORT.md:336-355: `src/audio-music-rotation-runtime.test.ts` timeout,
  A/B-proven pre-existing (fails with lane edits reverted). Why: candidate
  entry still needs a green full suite or a waived-with-cause row. Fix: file
  the timeout as infra flake with a re-run receipt; do not retime the test to
  green.

## UNFINISHED (brief numbered requirements vs diff)

Brief (REPORT.md §0) vs delivered:

1. Recoil/spread curves + table + recovery + ADS-vs-hip — **DONE**
   (`src/weapon-feel.ts`, `src/weapon-feel.test.ts`; 21-weapon measured table,
   bands, stance/ADS ordering contracts). HF-511 divergence documented, fix
   deliberately deferred to owner (correct call).
2. Viewmodel sway/bob/kick/reload/swap, clip 0, no recompile on clip change —
   **UNFINISHED this window** (no lane change, no new capture; gates cited
   green but not re-run).
3. Muzzle flash + shells + decals pooled, zero per-frame alloc, 0 in-combat
   pipelines — **PARTIALLY DONE**: impact-debris alloc fixed + gated
   (`src/impact-presentation.ts`, `src/weapon-effect-pooling.test.ts`);
   muzzle/shell alloc ungated; tripwire measured 9 pipelines + 1 console
   error and left untracked + unreported.
4. Hit marker / damage numbers off-by-default but supported / kill confirm —
   **DONE** (`src/player-feedback.ts`, `src/legacy-main.ts:23404`,
   `src/weapon-hit-feedback-defaults.test.ts`; presentation-only, persisted,
   throw-safe; marker/kill-confirm ungated).
5. W-1 fire-rate deadline no-regress — **DONE by non-interference**
   (no touched path; report quotes 31/31; not independently re-run here).

Also unfinished: commit the untracked probe + tripwire JSON + 2 PNGs and
correct §5/§8; decide HF-511 (adopt values vs delete field); re-run the
viewmodel clip capture; clear the inherited audio-rotation timeout for a
green full-suite row.

## Ratchet / hygiene

- `src/legacy-main.ts` stays 37,396 lines (ratchet respected; one line
  rewritten + one import widened). No ceiling change.
- `src/weapon-feel.ts` is observe-only (shot path never imports it) — no
  second balance authority. Good.
- No secrets printed; no existing tests weakened; only this review file is
  staged/committed by the reviewer.
