# Muse review — nuketown2-art-ready-signal (pass95 lane, candidate-9 gate)

Scope: branch `contrib/dave-gaming-pc/claude/nuketown2-art-ready-signal` @ `70afd55c`,
diff vs `origin/contrib/dave-gaming-pc/claude/v7-gate-audit-fixes` (merge-base `235432d5`).
Report: `docs/evidence/pass95/nuketown2-art-ready-signal/REPORT.md`.
Checks run by reviewer: `node --test scripts/qa/cold-admission-art-assertions.test.mjs` (2/2 pass),
`npx vitest run src/arena-art-ready.test.ts src/pipeline-metrics.test.ts src/legacy-main-size-ratchet.test.ts` (8/8 pass),
`npx vitest run src/nuketown2-pipeline-budget.test.ts` (9/10, sole failure `painted metal: panelled vs plain` = preserved base failure).
`src/legacy-main.ts` newline count confirmed 37396. Browser smoke not run (matches report OPEN; first-45-minute no-browser rule).

## (1) Art contract derived from live registry — STRUCTURE PASS, DETECTOR VACUOUS

`src/arena-art-ready.ts:36-43,67-83` traverses the live authored root on every `snapshot()`
(`materialsIn` + `Set` dedupe). No arena-name allowlist; `src/nuketown2-arena.ts:3593`
publishes `createArenaArtReadyContract('nuketown2', builder.root, scene)` for the actual
root; `src/map.ts:60-61` makes it optional so other arenas are unaffected. That half is correct.

F1 — placeholder/fallback detection fires only on explicit markers nothing sets.
`src/arena-art-ready.ts:45-52` treats a material as unresolved only if
`userData.arenaArtMaterialState ∈ {pending,placeholder,fallback}` or
`arenaArtPlaceholder/arenaArtFallback === true`. Repo-wide grep for
`arenaArtMaterialState|arenaArtPlaceholder|arenaArtFallback` producers returns only the
contract, its test, and the type — zero production setters. So in production
`unresolvedMaterialCount` is always 0 whenever materials exist, and
`authoredMaterialsResolved` (`:84`) is always true. The contract's own doc comment
(`:62-65`) admits markers are the only channel. The test
(`src/arena-art-ready.test.ts:13,26`) manually injects the marker, so it proves the
predicate, not the wiring. A real unmarked placeholder (fallback sky canvas, hidden-proxy
with `colorWrite=false`, any future fallback material) reports ready.
Smallest fix: make one producer real — tag nuketown2 material creation as `resolved` at
birth and treat a missing marker as unresolved (fail-closed), or wire the actual fallback
factories to set the marker. Until then the "reports not-ready while any placeholder
remains" claim is unproven in production.

## (2) streamingSettled vs deferred generators — COUNTS BACKDROP-LOADING ONLY

Checked nuketown2 cold path: `src/nuketown2-arena.ts:16-19` header states nothing imports a
mesh/image/font/LUT — every wall/vehicle/fence is TS geometry, so there is genuinely no
per-material async texture/LUT bake inside the arena builder. The real deferred visual work
is outside it: generated-sky texture admission (`src/rendering/sky-backdrop.ts:816-830`,
statuses `asset-loading → asset-ready | procedural-fallback`) and the IBL PMREM reconvolve
gated on it (`src/rendering/pass64-tsl-scene.ts:1244-1250`, `applyArenaEnvironmentIbl`).

F2 — `src/arena-art-ready.ts:79,85-88` rejects only `pass66SkyBackdropStatus === 'asset-loading'`.
`procedural-fallback` (generated sky failed, procedural canvas showing) and
`procedural-ready` both count as settled, so the first presented frame on a fallback sky
reports `streamingSettled: true` and possibly `ready: true`. A fallback sky is a fallback
on the first frame by definition.
Smallest fix: also reject `procedural-fallback`
(`&& scene?.userData.pass66SkyBackdropStatus !== 'procedural-fallback'`), or publish the raw
sky status inside the snapshot registry and let the smoke assert `asset-ready` for nuketown2.

F3 — `arenaArtPendingTextureCount / arenaArtPendingLutCount / arenaArtStreamingSettled`
(`src/arena-art-ready.ts:31-33,77-78,85`) have zero production writers (grep: only the
contract + its test set them). Any future deferred generator that follows the documented
counter protocol would work, but today the counters are dead code and the IBL reconvolve
pending state (`activeIblState` / `needsIblRegeneration`) is never projected into them.
`streamingSettled` is therefore `backdropLoading`-only in practice.
Smallest fix (either): wire the two real producers (sky texture request + IBL pending) into
the root counters, or delete the counters and document the contract as
material-markers + sky-`asset-loading` only so the next generator cannot assume it is covered.

## (3) Smoke assertion selection — CORRECT SHAPE, TWO SILENT-PASS HOLES

`scripts/qa/cold-admission-art-assertions.mjs:3-14` + `scripts/qa/verify-pass65-cold-webgpu-admission.mjs:388-397,541-542`:
contract subject asserts all three fields and pushes a failure per false field; missing
contract pushes a printed + receipt-stored coverage note (`coverageNotes` in receipt `:535`,
printed `:542`). `node --test` confirms both branches. No silent absence-of-line: art JSON
prints every trial (`:541`). Good.

F4 — two inputs degrade to a passing note when they should fail for THIS subject.
(a) Wrong-version contract (e.g. `{contract:'arena-art-ready-v2', ...all true}`) hits the
`contract !== 'arena-art-ready-v1'` branch → coverage-note → `pass: failures.length===0`
(`:536`) stays true. Version drift passes as "no contract".
(b) `null` on nuketown2 — the one arena known to publish — also passes with a note, but for
`COLD_ARENA_ID='nuketown2'` a null means the debug wiring regressed.
Smallest fix: return a third kind (`stale-contract`) for a present-but-wrong-version object
and fail on it; in the smoke, fail (not note) when `COLD_ARENA_ID` is in the
expected-contract set but `after.arenaArtReady` is null/mismatched. Keep the note path only
for arenas genuinely without a contract.

F5 (minor) — asserted surface is narrower than the contract: `ready`, `arenaId`, and
`registry` are never asserted (`:390-393` loops the three fields only). A stale-arena or
cross-arena snapshot with all-true fields passes.
Smallest fix: after the field loop, assert
`after.arenaArtReady.ready === true && after.arenaArtReady.arenaId === COLD_ARENA_ID`.

## (4) Debug publication cost / combat path — PASS

`src/legacy-main.ts:35061` adds `arenaArtReady: arena.artReadyContract?.snapshot() ?? null`
inside the existing `render` block of the debug snapshot. No new imports, no pipeline/tag
changes, no frame-loop hook: the frame function (`:31237-31676`) never calls `snapshot()`;
per-frame QA uses `samplePresentationTelemetry / sampleEnduranceHealth`, and the
presentation-prewarm contract tests pin `snapshot()` out of per-frame loops. Marginal cost is
one `root.traverse` + Set per debug-snapshot call (smoke: 2 calls/trial), alongside the
already-traversing `auditLocalLightOcclusion`. Nothing enters the in-combat pipeline path.
No fix needed; note for future samplers: do not poll `snapshot()` above debug cadence or the
traverse becomes the cost — use a dedicated sampler if per-frame art polling is ever wanted.

## (5) Ratchet / budgets / fences — PASS, RESPECTED

`git diff` touches 9 files; none is a threshold/test/budget file:
no change to `src/legacy-main-size-ratchet.test.ts`, `src/nuketown2-pipeline-budget.test.ts`,
`src/pipeline-metrics.test.ts`, or any fence. `src/legacy-main.ts` is a one-line change,
37396 lines preserved. Vitest confirms: ratchet + metrics + contract 8/8; budget 9/10 with the
exact preserved base failure (`painted metal: panelled vs plain`, `MUST_DIFFER` key collision
at `src/nuketown2-pipeline-budget.test.ts:177`). No loosening anywhere.

## Verdict: SHIP-WITH-FIXES

Reasons: (a) structure is right — registry-derived contract, no allowlist, optional
`ArenaMap` slot, smoke asserts-rather-than-drops with printed + receipt notes, zero
per-frame/combat cost, ratchet and budget untouched with the base failure preserved;
(b) the core safety property is not yet wired — placeholder detection is marker-only with no
producers (F1) and fallback sky counts as settled (F2), so `ready:true` can accompany a
fallback first frame; (c) the known-contract subject can pass without its contract — null or
version-drifted art degrades to a note and `pass:true` (F4), with `ready`/`arenaId`
unasserted (F5). All fixes are small (one producer tag or fail-closed default; one status
comparison; one fail-on-missing branch + two-line assertion) and none requires re-architecture.
Browser cold admission remains OPEN per the report and must still verify emitted art lines
and WebGPU presentation on the shared machine before candidate 9.
