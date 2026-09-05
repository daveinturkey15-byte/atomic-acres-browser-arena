# Review: v7-gate-audit-fixes (PASS 95) — independent verdict

**Reviewer:** OMP on dave-gaming-pc (NOT Muse Spark; task file asked for a Muse
identity — declined per writer-identity rule. No false Co-Authored-By trailer.)
**Branch:** `contrib/dave-gaming-pc/claude/v7-gate-audit-fixes` @ `235432d5`
**Base:** `origin/contrib/dave-gaming-pc/claude/pass93-candidate`
**Report under review:** `docs/evidence/pass95/gate-audit-fixes/REPORT.md`
**Method:** full diff read + static checks + measured runs below. No builds,
no browsers, no installs. (`node --check` ×7, vitest F1 file, both QA
contracts, tsx probe of bound uniforms, byte inspection of the F6 blob.)

**Verdict: SHIP-WITH-FIXES** — three reasons at the end. F4 and F6 ship as-is.
F1 needs a small selector-pin fix. F3 stays OPEN as the report already states.

## Measurements I produced on this machine

| check | result |
|---|---|
| `npx vitest run src/nuketown2-pipeline-budget.test.ts` | 9 passed, 1 failed — failure is the restored graph-TOPOLOGY test at `:177` (red reproduced) |
| sibling `keeps every variant pair separated by its own selector uniform` | green (among the 9) |
| `npm run qa:arena-roster:contract` | 8 passed, 0 failed |
| `npm run qa:mp-evidence:contract` | 15 passed, 0 failed |
| `pinnedDaylightArenaIds()` via node import | `["nuketown2","raid2","gun-range","map3"]` — same set as both deleted literals and `lighting-conditions.test.ts:70` |
| tsx probe: structural-differing keys per MUST_DIFFER pair | garageDoor/roofGlazing `[paintedPanelled]`; drive/kerb/block `[concreteVariant]`; fence/trim `[grainAlbedo,scuffAlbedo,trafficAlbedo,soil,baseRoughness,timberVariant]`; lawn/planter `[trafficAlbedo,soil,lawnVariant]`; lawn/ground `[backdrop,grainEnabled,scuffEnabled,lawnVariant]`; coachGlass/asphalt 9 incidental keys, no selector |
| old F6 blob class bytes | `[00 2D 1F 7F 2D C2 9F]` = U+0000–U+001F + U+007F–U+009F = new class exactly |
| new F6 file control bytes | only `0x0A`; 0 NUL; own `git diff` renders it as text |

## F1 — sibling test is good but NOT equivalent (fix required)

File: `src/nuketown2-pipeline-budget.test.ts:182` (`keeps every variant pair
separated by its own selector uniform`).

The sibling requires *any* non-colour bound uniform to differ, plus a
shader-read check. My probe shows 4 of 8 pairs already differ by incidental
structural uniforms, so unifying the designated selector alone would still
pass: fence/trim keeps 5 other differences without `timberVariant`,
lawn/planter keeps 2 without `lawnVariant`, lawn/ground keeps 3 without
`lawnVariant`. The lane's single mutation check (garageDoor `panelled`) covers
exactly the pairs where the selector is the *only* structural difference
(concrete ×3, painted-metal ×1). The shader-read half catches branch deletion,
not value unification. coachGlass/asphalt is cross-family — the "own selector
uniform" framing does not apply (both old and new checks pass it trivially).

Smallest fix: pin the selector per pair and require *that key* to differ,
e.g. `EXPECTED_SELECTOR = { garageDoor: 'paintedPanelled', roofGlazing:
'paintedPanelled', drive/kerb/block: 'concreteVariant', fence/trim:
'timberVariant', lawn/planter/ground: 'lawnVariant' }` with the existing
Color-aware comparison; reframe coachGlass/asphalt as a cross-family
different-graph assertion or drop it from this test.

Verified supporting claims: cause `af1fce7d` rewrote the family shaders
(Codex Luna, 2026-09-04 — stat confirms); all 12 roles still exist under the
same names (3–12 hits each in `nuketown2-materials/index.ts`); the restored
test is red (reproduced). The "7/8 pairs collapsed" count is REPORTED
(lane-measured; the test short-circuits on the first pair so I did not
re-measure the exact count — optional, low value).

Branch hygiene: the red-by-design test ships in the branch, so the branch gate
is red until the integrator records the contract-change decision (delete the
restored test, keep the fixed sibling) at candidate-9 assembly — which is the
report's own §F1 recommendation. Honest handoff, but entry into candidate 9
requires that decision, not the red test.

## F3 — gated assertions are dead code in this config; no silent pass in-script, hole still OPEN

File: `scripts/qa/verify-pass65-cold-webgpu-admission.mjs`.

`COLD_ARENA_ID` is the const `'nuketown2'` (`:9`) and
`ARENAS_WITH_ART_LOADED_SIGNAL` is `{'atomic-acres'}` (`:11`), so the restored
block (`:390-399`) is statically unreachable without editing the subject. The
lane is right that restoring them ungated would false-alarm (all four signal
paths bottom out in atomic-acres art — `:34851`, `:35118`, `:5029`,
`environment-assets.ts:1021` all check out as read). `coverageNotes` (`:344`,
`:401-404`, `:544`, `:550-551`) is printed per trial and written into the
receipt, and has zero consumers anywhere else (grep) — so a no-signal subject
passes green-with-note, never silently *inside this script*, but `pass:true`
is machine-indistinguishable from full cover and no other gate checks
nuketown2 art. Diff is purely additive (`+63/-0`); budgets byte-identical
(`:46-47` 3..5 trials, `:49-50` 2×10 s, `:200` 60 s, `:257` 90 s).

Smallest fix: none in this script — it needs the arena-owner runtime change
(a nuketown2 art-ready signal added to the set) plus the integrator running
the smoke before publish. Both already carried as OPEN in the report; keep
them as blocking OPEN items, not background prose.

## F4 — ships as-is

`scripts/qa/arena-roster.mjs:140-183`: `pinnedDaylightArenaIds()` measured
`["nuketown2","raid2","gun-range","map3"]`, identical as a set to both deleted
literals and to `lighting-conditions.test.ts:70`. The scrape regex handles
quoted and unquoted keys; the coverage floor throws on a missed arena. Gate
8/8 green (my run) with the three entries removed — the gate's own
stale-allowance assertion makes that proof of real derivation.

Kept exemptions, both justified: `raid2-layout-metrics.ts:416`
`DEFAULT_ROSTER` is `['test2','atomic-acres','skyline-terminal','high-seas',
'test1']` — contains `test2`, not `raid2`, so the old reason was factually
wrong as the lane says, and deriving from selectability would drop `test2`,
the row the comparison exists for. `scan-lane-ab-band-readability.mjs:70`
default `'atomic-acres,skyline-terminal,test1'` is an overridable `--arenas`
default, so the cap is measured cost, not coverage.

Note (not a finding): `hf410-near-plane-ab-diff.mjs` now `readdirSync`s frame
dirs at module top level; `docs/evidence/pass86/hf410-prep/frames/near007` and
`near008` are absent from this checkout, so direct invocation throws. Loud,
not silent; pre-existing evidence gap.

## F6 — ships as-is, behaviour identical

`scripts/qa/mp-evidence-analyse.mjs:88`: old blob class bytes are
`00 2D 1F 7F 2D C2 9F`, i.e. ranges U+0000–U+001F and U+007F–U+009F under the
`u` flag — exactly the new `/[\x00-\x1f\x7f-\x9f]/gu`. No behaviour change
possible. New file has no NUL and no control byte other than newline; the diff
renders as text (observed in my own `git diff`). Contract 15/15 green (my
run).

## F5 — nothing else loosened: confirmed

Whole-diff removal audit: the only removed non-comment lines are the 3
deleted allowlist entries (+ reasons) and the 3 replaced roster literals; all
other files purely additive (`arena-roster.mjs +44/-0`, F3 `+63/-0`, F1
`+132/-0`, F6 one-line binary→text). No test, threshold, fence, budget,
timeout, `.skip`/`.only`/`.failing` marker, or `LINE_CEILING` touched.

## Why SHIP-WITH-FIXES (three reasons)

1. The F1 sibling leaves the exact attack it guards half-open: 4/8 pairs pass
   with their designated selector unified. The per-pair selector pin is a
   ~10-line fix in the same test.
2. The branch is red by construction; candidate-9 entry needs the recorded
   contract-change decision (delete restored test), otherwise candidate 9
   starts red with no owner of the call.
3. F3's restored assertions never execute for the shipped subject and the
   smoke is unrun — fine for candidate entry only while the owner-signal and
   must-run-smoke stay explicit blocking OPENs.

## UNFINISHED

- Smoke run not executed (needs production build + machine lock; known-red on
  budget) — integrator must run before publish.
- nuketown2 exposes no art-ready signal — routed to the arena owner; until
  then no gate asserts any arena's art.
- F1 sibling per-pair selector pin (fix §F1) — lane or integrator.
- Integrator contract-change decision on the restored red test at candidate-9
  assembly.
- Exact "7/8 collapsed" count not independently re-measured (red reproduced;
  count REPORTED, low value).
