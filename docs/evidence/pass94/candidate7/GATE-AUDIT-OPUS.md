# Independent gate audit - candidate 7 (Claude Opus)

**Auditor:** Claude Opus, independent lane (no source, test, threshold, fence, budget or fixture modified).
**Range audited:** `3e2fd273` (HITL 5, last owner-tested build, 2026-09-04) -> `452d7aba` (candidate 7).
**Commits in range:** 651.
**Question:** was any gate weakened (verifier / threshold / fence / budget / timeout / test) to get green?
**Method:** git read-only (`git show <base>:<file>`, `git diff`, `git log -S`) plus file reads. No browsers, no GPU, no full test suite (another lane owns it). Machine under memory pressure; targeted runs only.

Claim-states used throughout: **[VERIFIED]** = I read the bytes at both ends of the range (or ran the check). **[OPEN]** = not proven here.

---

## 1. Constants table

Every "value at 3e2fd273" below was read with `git show 3e2fd273:<file>` / `git grep <sym> 3e2fd273`, not from a report.

| # | Gate | Current value | file:line (HEAD 452d7aba) | Value at 3e2fd273 | Changed? | Verdict |
|---|------|---------------|---------------------------|-------------------|----------|---------|
| 1 | WebGPU completion fence | `12_000` ms at every flush site; `PRESENTATION_STALL_MS = 12_000`; `waitForSubmittedWork` default still `4_000` | `src/rendering/render-runtime.ts:1175, 1873, 1898, 2026`; `src/legacy-main.ts:11090, 30151, 30208, 30237` | `12_000` at `render-runtime.ts:1174, 1866, 1891`, default `4_000` at `:2019`; **4** `flushWebGpuFrames(12_000)` sites in `legacy-main.ts` | no (4 sites at both ends) | **SAME** [VERIFIED] |
| 2 | In-combat pipeline tripwire (0) | `pipelinesInCombat = sampled.pipelines - combatBaseline`, baseline taken *after* warm-up | `scripts/qa/audit-graphics-profiles.mjs:224-227, 274-275, 315` | byte-identical (`git diff 3e2fd273...HEAD -- scripts/qa/audit-graphics-profiles.mjs` is empty) | no | **SAME** [VERIFIED] - but see the caveat below |
| 3 | nuketown2 pipeline budget (54) | `pipelineBudgetCeiling: 54`; asserted `toBe(54)`; `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS = 54` | `src/rendering/clustered-lights.ts:29`; `src/nuketown2-pipeline-budget.test.ts:170-173`; `src/nuketown2-materials/index.ts:142` | `NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS = 54` at `src/nuketown2-materials/index.ts:142`, asserted at `nuketown2-pipeline-budget.test.ts:253`. `clustered-lights.ts` did not exist. | ceiling no; **structure yes** | **SAME value / REFACTORED structure** [VERIFIED] - see signature below |
| 4 | `LINE_CEILING` legacy-main ratchet | `37_396` (`RATCHET_SLACK = 250`) | `src/legacy-main-size-ratchet.test.ts:78` (slack `:86`) | `37_396`, slack `250`, same lines | no | **SAME** [VERIFIED] |
| 5 | Coplanar SAME-MATERIAL-VISIBLE class at 0 | `expect(visible).toHaveLength(0)` over `auditNuketown2Coplanar()` rows | `src/nuketown2-fidelity.test.ts:3104-3120`; engine `src/nuketown2-coplanar-audit.ts` | **did not exist** - `3e2fd273` had only the CLI `scripts/qa/find-coplanar-pairs.ts`; no `src/**coplanar**` module and no `same-material-visible` string anywhere | added | **NEW** (a class previously dismissed as benign is now a hard zero) [VERIFIED] |
| 6 | Collider/visual parity: invisible colliders 0, walk-through beyond ledger 0 | `toEqual([])` both directions; ledger = 17 triaged entries; roster `ALL_ARENA_IDS = ARENA_IDS` (derived, not a literal list) | `src/collider-visual-parity-gate.test.ts:120, 137`; ledger `:28-99`; roster `scripts/qa/collider-visual-parity-core.ts:734` | identical - `git diff 3e2fd273...HEAD` over the gate, `collider-visual-parity-core.ts` and `ballistic-parity-ledger.ts` is **empty**; `reason:` count 17 at both ends | no | **SAME** [VERIFIED] |
| 7 | Corridor ratio band 1.825 +-3 % | ratio band `< 0.03`, absolute widths `< 0.05`; `REFERENCE_CORRIDOR_L = 0.553`, `REFERENCE_HOUSE_WIDTH_L = 0.303` | `src/nuketown2-fidelity.test.ts:2752, 2754, 2768, 2769, 2778` | `0.553` / `0.303` at `:2606, :2608`; `< 0.05` at `:2627-2628`; `< 0.03` at `:2637` | no | **SAME** [VERIFIED] |
| 8 | Verge ceilings (36 furniture / 51 aggregate) | `vergeFurniture.length <= 36`, `vergeBodies.length <= 51`, dressing ids excluded by reading `NUKETOWN2_GROUND_DRESSING` | `src/nuketown2-fidelity.test.ts:2820-2827` | one count, `vergeBodies.length <= 43`, at `:2664` | **yes**, in `6d3e1ad8` | **TIGHTER on the class the gate names, RAISED on the aggregate** - see analysis [VERIFIED] |
| 9 | Cold-admission smoke: 10,000 ms budgets and patience | `maximumColdTransitionMs = 10_000`, `maximumMenuDeploymentPrewarmMs = 10_000`; patience `60_000` / `90_000`; trials clamped to 3..5 | `scripts/qa/verify-pass65-cold-webgpu-admission.mjs:14, 15, 165, 222` | identical numbers, identical lines | budgets **no**; subject and assertion set **yes** | **SAME budgets, CHANGED SUBJECT** - see analysis [VERIFIED] |
| 10 | MP soak gate: 180 s / 120 ms RTT / 1 % loss / 1.5 m / one-RTT damage | `playDurationMs: 180_000`, `positionBoundM: 1.5`, `rttMs: 120`, `packetLossPct: 1`, `damageLatency <= rtt` | `scripts/qa/mp-soak-assertions.mjs:6, 8, 9, 79-86`; `scripts/qa/mp-soak-gate.mjs:82` | **did not exist** - `git ls-tree 3e2fd273 -- scripts/qa` lists only `pass25a-soak-*` and `run-network-chaos-soak.ts` | added | **NEW** [VERIFIED] |

### Row 2 caveat - the tripwire is a measurement, not a failing assertion

`pipelinesInCombat` is computed and written into the evidence row, and the prose in
`src/graphics-settings-registry.test.ts:257` and `src/rendering/raytracing/raytracing-profile.ts:608`
says "the tripwire requires zero pipelines compiled in combat". A repository-wide grep for
`pipelinesInCombat` / `inCombatPipelines` / `combatBaseline` finds it in exactly two files, both
measurement scripts (`audit-graphics-profiles.mjs`, `measure-baked-indirect.mjs`); no test asserts
it equals 0. So the tripwire is enforced by a human reading the evidence JSON, not by CI. That is
**unchanged across the range** - it was equally unenforced at `3e2fd273` - so it is not a weakening
introduced by these 651 commits, but it is **[OPEN]** as a gate: a lane could regress in-combat
pipeline compilation and nothing would go red.

### Row 3 signature - what the pipeline-budget refactor moved

`src/nuketown2-pipeline-budget.test.ts` went 310 -> 191 lines. The ceiling itself (`54`) is
byte-identical at both ends and is now asserted twice (`toBe(54)` on the new
`NUKETOWN2_CLUSTERED_LIGHTING_SETTINGS.pipelineBudgetCeiling`, and the original
`toBeLessThanOrEqual(NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS)` over the built arena). What moved:

* **Dropped:** the two `materialGraphKey` instrument tests ("is blind to node identity and
  sensitive to baked constants", "feeds the uniform the same linear value the literal carried"),
  which used nuketown2 swatch materials. **Replaced, not lost:** HEAD's "measures constants and
  uniforms differently" (`:138-139`) asserts the same two properties of the same function against
  the vehicle-forge fixture.
* **Dropped:** `expect(distinct.size, 'graphs must be shared, not one per material').toBeLessThan(rows.length)`.
  **Implied at HEAD:** `keys.length >= 60` (`:117`) with `new Set(keys).size <= 54` (`:118`) forces
  sharing strictly.
* **Dropped:** the named role-pair identities (`sidingA === sidingB`, `drive === driveDecal`, the
  painted-metal family). **Replaced by a stronger aggregate:** `>= 18` registry roles collapsing to
  `<= 8` graphs (`:106-107`). The aggregate is harder to satisfy than the pairs were, but the test
  no longer pins *which* roles share, so a future change could re-partition the families and still
  pass. Minor loss of specificity; **not** a threshold weakening.
* Nothing is `.skip`ped, `.only`ed, or inverted.
* Cosmetic drift worth one line: the test at `:110` is named "keeps the complete built arena below
  the measured 40-graph ceiling" while asserting against `54`. The name is stale, the assertion is
  the same one that stood at `3e2fd273`.

### Row 8 analysis - the verge split is tighter where it counts, and the aggregate is a documented ratchet

At `3e2fd273` the gate was a single count of every mesh name containing `" verge "`, ratcheted at
**43**. That 43 was, per `6d3e1ad8`'s own accounting, 36 pieces of furniture plus 7
`NUKETOWN2_GROUND_DRESSING` lawn decals that share the prefix. `6d3e1ad8` (the HF-491 roadside
bays) re-tiled the same square metres of stem verge lawn from 3 tiles into 11, adding 8 decals and
zero props.

* **Furniture axis: strictly TIGHTER.** 43 effective -> 36, and the exclusion is now computed by
  reading the arena's own `NUKETOWN2_GROUND_DRESSING` table rather than by a name pattern, so a
  prop cannot be renamed into the dressing gap.
* **Aggregate axis: RAISED, 43 -> 51.** This is honestly a ratchet raise, not a tightening, and I
  would not repeat the commit message's flat "strictly TIGHTER" without that qualifier. What makes
  it defensible rather than a weakening: (a) the raise is exactly +8, matching the +8 lawn tiles,
  with zero headroom; (b) the class the gate exists to police - waist-high props closing the
  corridor at eye level - is now bound at 36 instead of 43; (c) the laundering route the single
  count allowed (delete a lawn tile, add a prop, stay at 43) is closed. Net: **not a weakening**,
  but the aggregate line is a raise and should be read as one.
* **[OPEN]:** I did not execute this test, so "zero headroom" (that the built arena measures
  exactly 36 and exactly 51) is the commit's claim, not my measurement.

### Row 9 analysis - the cold smoke kept its budgets and changed its subject

`scripts/qa/verify-pass65-cold-webgpu-admission.mjs` is the only QA script in this list whose diff
is non-empty (+25 / -18). The two 10,000 ms budgets, the 60 s / 90 s patience and the 3..5 trial
clamp are untouched. What changed is what the smoke *runs*:

* Cold arena `atomic-acres` -> `nuketown2`; second arena `skyline-terminal` -> `raid2`.
* **Assertions removed:** `after.originalArtLoaded` (dropped from the playable-arena check and not
  replaced), `after.atomicQualityStreaming !== 'ready'`, and
  `!after.blenderEnvironment.qualityArtRootVisible`.
* **Assertions added:** a playable-scene authority triple - `authoritativeArenaRoots === 1`,
  `authoritativeArenaRootIsGameplayRoot === true`, `duplicateArenaRoots === false` - plus
  `proceduralRootActuallyVisible` and `overlappingPrimaryArenaRoots` tightened from truthiness to
  strict `!== false`.
* **Exact-count tripwires moved with content, still exact:** menu prewarm `phases.length` 3 -> 4;
  the effect-prewarm group list 8 -> 10 entries with `death-drops` -> `death-drops-glass`, still
  compared as an ordered `JSON.stringify` equality.

Two of the three removed assertions (`atomicQualityStreaming`, `qualityArtRootVisible`) are
Atomic-Acres-specific concepts that cannot be asserted on a nuketown2 run, so their removal follows
from the subject change. `originalArtLoaded` is **not** arena-specific and was simply dropped.
Verdict: the numeric budgets are **SAME**; the *coverage* of Atomic Acres' cold Quality-art path by
this smoke is **LOOSER** (it is no longer exercised here at all). Whether another gate picks that
path up is resolved in section 2.

## 2. Test-file diff audit

_(in progress)_

## 3. Cross-check against the candidate-7 REPORT

_(in progress)_

## 4. Final table and overall verdict

_(in progress)_
