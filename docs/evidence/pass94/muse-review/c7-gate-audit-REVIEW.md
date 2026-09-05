# Muse review of the candidate-7 gate audit (Claude Opus)

**Reviewer:** Muse Spark 1.3, skeptical lane. Read-only re-derivation; no builds, no browsers, no GPU, no test execution.
**Audit under review:** `docs/evidence/pass94/candidate7/GATE-AUDIT-OPUS.md` (426 lines).
**Range re-checked:** `3e2fd273` (HITL 5) .. `452d7aba` (candidate 7).
**This checkout:** `91b7afa3` = `452d7aba` + 6 doc-only commits.
`git diff 452d7aba...HEAD -- '*.test.ts' '*.test.mjs' scripts/qa` is empty, so every
test/QA re-derivation below applies to the audited head exactly.
**Repo state note:** `git status` shows one pre-existing untracked file,
`full_test_diff.txt`, which I did not create, stage, or delete. Otherwise clean.

## 1. Constants table, re-derived (`git show 3e2fd273:<file>` vs HEAD)

| # | Gate | Audit row says | My reading | Row correct? |
|---|------|---------------|------------|--------------|
| 1 | WebGPU fence 12 s | `12_000` every flush site; `PRESENTATION_STALL_MS=12_000`; default `4_000`; 4 `legacy-main` sites at both ends | `src/rendering/render-runtime.ts:1175` (`PRESENTATION_STALL_MS = 12_000`), `:1873` + `:1898` (`waitForSubmittedWork(12_000)`), `:2026` (`timeoutMs = 4_000` default) at HEAD; base `:1174`/`:1866`/`:1891`/`:2019` same values. `legacy-main.ts` `flushWebGpuFrames(12_000)` at `:11090`, `:30151`, `:30208`, `:30237` at HEAD; base `:11099`, `:30030`, `:30091`, `:30117` — 4 sites both ends. SAME values. | **Yes, with line-citation correction D1** |
| 2 | In-combat tripwire 0 | script byte-identical; measured, never asserted | `git diff 3e2fd273...HEAD -- scripts/qa/audit-graphics-profiles.mjs` empty (0 lines). Repo-wide `pipelinesInCombat`/`combatBaseline` matches only `scripts/qa/audit-graphics-profiles.mjs:226,274-275,315` and `scripts/qa/measure-baked-indirect.mjs:230`. No `toBe(0)`/`toEqual(0)` on either symbol in any test. Unenforced at both ends. | **Yes** |
| 3 | Pipeline budget 54 | ceiling byte-identical; `clustered-lights.ts` new; refactor signature recorded | `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS = 54` at `src/nuketown2-materials/index.ts:142` both ends. `pipelineBudgetCeiling: 54` at `src/rendering/clustered-lights.ts:29` (file absent at base: `git ls-tree 3e2fd273 -- src/rendering/clustered-lights.ts` empty). Base asserts at `src/nuketown2-pipeline-budget.test.ts:253`; HEAD at `:118` + `:172-173`. Stale test name at `:110` ("measured 40-graph ceiling", asserts 54) as quoted. | **Yes** |
| 4 | `LINE_CEILING` 37,396 / slack 250 | same lines | `src/legacy-main-size-ratchet.test.ts:78` (`37_396`), `:86` (`250`) identical at both ends. | **Yes, modulo trivial drift D4** |
| 5 | Coplanar SAME-MATERIAL-VISIBLE 0 | NEW class, hard zero | No `src/**coplanar**` at base; `git grep "same-material-visible" 3e2fd273` returns nothing. HEAD: `src/nuketown2-coplanar-audit.ts:86,344,377` + pin `src/nuketown2-fidelity.test.ts:3104-3120` (`toHaveLength(0)` at `:3118-3119`). | **Yes** |
| 6 | Parity: invisible 0 / walk-through beyond ledger 0, ledger 17 | empty diff, 17 reasons both ends | `git diff 3e2fd273...452d7aba -- src/collider-visual-parity-gate.test.ts scripts/qa/collider-visual-parity-core.ts scripts/qa/ballistic-parity-ledger.ts` empty. `ACCEPTED_WALK_THROUGH` `reason:` count 17 at both ends (`src/collider-visual-parity-gate.test.ts:28-99`). `toEqual([])` both directions at `:120`, `:137`. | **Yes, with path correction D2** |
| 7 | Corridor 1.825 ±3 % | `0.553`/`0.303`, `<0.05`, `<0.03` both ends | HEAD `src/nuketown2-fidelity.test.ts:2747-2748` refs, `:2768-2769` (`< 0.05`), `:2778` (`< 0.03`); base `:2606`/`:2608`, `:2627-2628`, `:2637` same. `0.553/0.303 = 1.82508…` recomputed. | **Yes** |
| 8 | Verge 36 / 51 | furniture TIGHTER (eff. 43→36), aggregate RAISED 43→51, +8 = +8 decals, zero headroom per commit | HEAD `src/nuketown2-fidelity.test.ts:2825` (`<= 36` furniture), `:2827` (`<= 51` aggregate), dressing excluded via `NUKETOWN2_GROUND_DRESSING` at `:2823`. Base single `<= 43` count. Numbers and mechanism as the audit describes. | **Yes** |
| 9 | Cold admission 10,000 ms ×2, patience 60/90 s | budgets SAME, subject CHANGED, 3 assertions dropped | HEAD `scripts/qa/verify-pass65-cold-webgpu-admission.mjs:14-15` (`10_000` ×2), `:165`/`:222` (60 s/90 s); base `:12-13`, `:163`/`:220` same values. Diff `+25/-18`: `COLD_ARENA_ID='nuketown2'`, `SECOND_ARENA_ID='raid2'`; removed `originalArtLoaded` from playable check, `atomicQualityStreaming !== 'ready'`, `qualityArtRootVisible`. Added authority triple (`authoritativeArenaRoots === 1`, root-is-gameplay-root, `duplicateArenaRoots === false`). | **Yes** |
| 10 | Soak 180 s / 120 ms / 1 % / 1.5 m / one-RTT | NEW gate | `scripts/qa/mp-soak-assertions.mjs:6` (`180_000`), `:8` (`1.5`), `:9` (`120`), `:79-86` (loss + `damageLatency <= rtt`); `scripts/qa/mp-soak-gate.mjs:42-48,78`. Base `scripts/qa` has only `pass25a-soak-*` + `run-network-chaos-soak.ts`. | **Yes** |

## 2. Ten no-finding test files, hunks read myself

Sampled from the diff the audit marked clean; scope `3e2fd273...452d7aba` (same files at HEAD):

| File | Hunk verdict | Matches audit §2.2? |
|------|--------------|---------------------|
| `src/private-match.test.ts` | Two inversions `true→false` (`:98`, `:114`) + one new `false` assertion. Stricter. | Yes |
| `src/local-reload-authority.test.ts` | `requestId`/`cancelRequestId` threaded through; frozen equality gains fields. Tighter. | Yes |
| `src/map-selection.test.ts` | Catalog reorder (HF-495) + NEW exact `SELECTABLE_ARENAS` order assertion; `ARENA_SELECTIONS.length` still 11, names still unique. Neutral + new pin. | Yes |
| `src/build-identity-handshake.test.ts` | PASS 93→94 rotation; source-pin re-pointed `legacy-main.ts` → `mp-lobby-authority-views.ts` (`activeAtHostTimeMs`, `hostTimeToGuestMono` present at target). 1:1, no assertion lost. | Yes |
| `src/changelog.test.ts` | PASS 93→94 rotation; old "arenas load again in stock Chrome" assertion re-homed onto `pass93` entry, not deleted. | Yes |
| `src/project-map.test.ts` | `PASS 92→93` backup rotation, `PASS 93→94` live rotation. Same shape. | Yes |
| `src/release-topology.test.ts` | Same rotation (`pass92Backup→pass93Backup`, live `pass93→pass94`). Pins still exact. | Yes |
| `src/combat/weapon-catalog.test.ts` | `MULTIPLAYER_PROTOCOL_VERSION` `18→19`, same shape. | Yes |
| `src/network-lifecycle.test.ts` | Same `18→19` bump, same shape. | Yes |
| `src/spawn-layout-quality.test.ts` | Source-pin re-pointed to `mp-lobby-authority-views.ts` for the moved line; `ffa` assertion string unchanged. | Yes |

No loosening in any of the ten. Scoped sweep corroborates §2.0:
`git diff 3e2fd273...452d7aba -- '*.test.ts' '*.test.mjs' | grep -E "^\+.*(it|test|describe)\.(skip|only|todo)"`
returns nothing (0). (`vitest.config.*` not in range diff; `package.json` +4 lines are two
new `qa:mp-*` script pairs only.) The 5 skip-like hits visible at HEAD (`...HEAD`) are the audit's
own doc prose plus the 2 pre-existing `it.skip`s in `src/killstreak-demo-published-media.test.ts:14,21`,
present at both ends.

## 3. F1–F6 against the code

- **F1 (LOOSER, topology lower bound deleted) — CONFIRMED.** Base
  `src/nuketown2-pipeline-budget.test.ts:285-309` holds the eight-pair `mustDiffer` table
  (`garageDoor`/`roofGlazing`, `drive`/`kerb`, `drive`/`block`, `kerb`/`block`, `fence`/`trim`,
  `lawn`/`planter`, `lawn`/`ground`, `coachGlass`/`asphalt`); HEAD has no `mustDiffer`, no
  `TOPOLOGY` test, and no arena-role `not.toBe` anywhere (only surviving `not.toBe` is
  `src/nuketown2-pipeline-budget.test.ts:138`, vehicle-forge constants). Replacement
  (`new Set(keys).size <= 8`, `:106`) bounds from above. Agree: restore before publish.
- **F2 (roster floors 9→8) — CONFIRMED as described, [OPEN] stands.**
  `MINIMUM_SELECTABLE_ARENAS` 9→8 (`scripts/qa/arena-roster.mjs:60→62`),
  `MINIMUM_EYE_CLEARANCE_ARENAS` 9→8 (`scripts/qa/eye-clearance-roster.mjs:55→57`),
  `MINIMUM_SWEPT_ARENAS` 9→8 (`scripts/qa/sweep-eye-clearance-spots.ts:223→225`),
  plus the two contract pins at 8. Cause verified: `src/map-selection.ts:416`
  (`test2` `selectable: false`, HF-495). Exclusion positively asserted
  (`cross-browser-gate-contract.test.mjs:140`, `eye-clearance-sweep-contract.test.mjs:123`,
  `src/arena-selectability.test.ts:29-33,124`). `MINIMUM_ARENA_IDS = 11` unmoved
  (`scripts/qa/arena-roster.mjs:57`). Commit `09980a5a` body is one line + Codex trailer,
  no quoted owner directive — the ownership question is correctly left [OPEN].
- **F3 (cold-smoke coverage) — CONFIRMED, with citation correction D3.**
  Drop verified in `git diff 3e2fd273...452d7aba --
  scripts/qa/verify-pass65-cold-webgpu-admission.mjs`. But the surviving-coverage pointer is
  wrong (see D3).
- **F4 (allowlist −2/+5) — CONFIRMED.** Diff shows exactly the two removals and five additions
  listed; new-file reasons read. Three of the five new reasons do cite HF-495
  (`capture-lane-ab-time-of-day.mjs`, `hf410-near-plane-ab-diff.mjs`, `publish-lane-ab-frames.mjs`),
  as flagged. Category argument (bounded A/B experiments) verified by reading each reason.
- **F5 (fingerprints re-pinned) — CONFIRMED on substance, claim-state correction D5.**
  All four hashes changed as listed (`src/graphics-profile-contract.test.ts:47-53` vs base);
  doc diff touches exactly the four hash cells (`docs/GRAPHICS_PROFILES_2026-09-03.md`).
  Cause (`graphics.clusteredLighting` joining the control set,
  `src/pass65-settings-inventory.test.ts:44,57`) verified present. I did **not** re-execute the
  test (this review ran zero tests by design); the "14 passed" is the OPUS lane's measurement,
  hash equality by reading.
- **F6 (NUL-byte binary QA script) — CONFIRMED.**
  `scripts/qa/mp-evidence-analyse.mjs` is 19,255 bytes with a raw NUL at offset 4354;
  `git diff 3e2fd273...HEAD --stat` shows `Bin 0 -> 19255 bytes`. Fix (`\x00-\x1f` escapes)
  is correct.
- **F7/F8 (not in my brief, checked anyway) — both match.** F7: `toHaveLength(1)→(2)` plus new
  exact-source pin (`src/presentation-prewarm-contract.test.ts:673-676`). F8: diagnostics-overlay
  branch with substitute assertion (`src/ui/surface-registry.test.ts:72-77`) plus new overlay
  contract test. Descriptions accurate.
- **M1/M2/M3 + §3.2 corroborations — CONFIRMED.** REPORT lines found
  (`docs/evidence/pass94/candidate7/REPORT.md:89,108,111,129`). `f74f25bf` is not an ancestor of
  `3e2fd273` (verified). Coplanar CLI↔vitest shared core
  (`src/nuketown2-coplanar-audit.ts`), ratchet-driven lane exclusions, and SHA parentage
  (`452d7aba` parent `ae795724`) all check out.

## 4. Disagreements (all corrections, none overturning)

- **D1 — Row 1 line citation.** The audit's HEAD line list
  (`src/rendering/render-runtime.ts:1175, 1873, 1898, 2026`) mixes a third category into a
  "flush site" list: `:2026` is `async waitForSubmittedWork(timeoutMs = 4_000)` — the unchanged
  *default*, not a 12,000 ms site (base `:2019` likewise). The 12,000 ms sites are `:1175`
  (`PRESENTATION_STALL_MS`), `:1873`, `:1898`. Values all SAME; citation only.
- **D2 — Row 6 / final-table path shorthand.** The audit names `ballistic-parity-ledger.ts` (and
  `collider-visual-parity-core.ts`) without the `scripts/qa/` prefix; no such files exist under
  `src/` at either end (verified: `git show 3e2fd273:src/ballistic-parity-ledger.ts` is fatal).
  Correct paths: `scripts/qa/ballistic-parity-ledger.ts`, `scripts/qa/collider-visual-parity-core.ts`.
  The substance (empty diff, 17 `reason:` entries in `ACCEPTED_WALK_THROUGH` both ends) re-verified
  correct.
- **D3 — F3 surviving-coverage pointer.** "still asserted in `src/blender-environment.test.ts`"
  is wrong at HEAD: `grep -n originalArtLoaded src/blender-environment.test.ts` returns nothing,
  and repo-wide only `src/legacy-main.ts:34851` (runtime) and
  `src/presentation-prewarm-contract.test.ts:1244` (a status-term list, not a cold-session
  assertion) match. The [OPEN] stands — strengthened, if anything: I found no cold-session
  browser smoke asserting `originalArtLoaded` anywhere.
- **D4 — Trivia.** Row 4 "same lines": base carries an extra `lines: 37_396,` history entry at
  `:286` absent at HEAD; ceiling/slack values and assertion lines identical. No finding.

## 5. Verdict: CONFIRMED-WITH-CORRECTIONS

1. **Every re-derivable value matches:** the 12 s fence, 10 s ×2 cold budgets, 54-pipeline ceiling,
   37,396-line ratchet, corridor band, parity gate + 17-entry ledger, verge 36/51 split mechanics,
   soak constants, and the F1 deletion / F2 lowering / F4 exemptions / F5 re-pin / F6 NUL byte all
   reproduce from `git show`/`git diff` exactly as the audit reports.
2. **The ten-spot-check finds no hidden loosening,** and the scoped skip/only sweep is genuinely
   zero in the audit range — the audit's "no finding" set holds where I sampled.
3. **The four corrections (D1–D4) are citation-level:** one mislisted line, one path shorthand, one
   wrong surviving-coverage pointer, one trivial line drift. None changes a verdict, a threshold, or
   the publish advice (restore the F1 topology pin; get owner word on F2 parking and F5
   re-measurement; fix the F6 NUL byte).
