# Perf lane 4 review (Muse Spark 1.3, skeptical) — HF-491 HITL 5

Scope: `aa4979ed..c5f64b77` (7 commits), diff over `src` + `scripts`,
plus "Perf lane 4" in `docs/evidence/pass94/perf-hitl5/REPORT.md`.
Constraints of this review: no builds, no browsers, no GPU; static review only.
`tsc` / `build` / Vitest numbers below are read from `gates-lane4.md` and the
evidence commit message, not re-executed here.

Range under review:

- `e4b611bb` harness rungs (`--pose`, `hud-hidden`, `style-writes`, `hud-var-writes`)
- `d16e580f` `presentImpacts()` live-root refresh (Muse F1)
- `2ffed772` + `04dab166` minimap static layers (`src/minimap-static-layers.ts`)
- `a1e00eca` HUD dirty flag (`src/ui/pass77-hud-sway.ts`, `--hud-health` call site)
- `c5f64b77` evidence record (REPORT + bisect profiles + `gates-lane4.md`)

## (1) Style-recalc attribution — VERIFIED (sufficient, with one granularity caveat)

The report's headline (5 inheriting registered custom properties on `#hud`
invalidate ~245 HUD elements/frame, 7.2 ms spawn / 8.2 ms street) is triangulated
three independent ways, in three sessions on three builds, all as
within-session `(program)` deltas (GPU load varied 1–77% across sessions, so
cross-session comparison is correctly disclaimed):

- `lane4-diag-spawn`: baseline 12.82 → `hud-hidden` 4.01 → `style-writes` 4.84.
  `wear` control stays at 11.61, ruling out the node-material path as the
  alternate explanation.
- `hud-var-writes` (narrowed to `--hud-*` only via a `setProperty` filter in
  `scripts/qa/perf-hitl5-bisect-cdp.mjs`) repeats on later builds:
  13.18→5.97, 8.98→3.57, 14.27→6.06, 7.75→3.00. This rung isolates the HUD
  writes from all other `setProperty` traffic AND from HUD paint, so the delta
  cannot be charged to either.
- Mechanism is pinned in source: `@property --hud-sway-x/y, --hud-breathe,
  --hud-gait, --hud-health`, all `inherits: true`
  (`src/ui/pass77-instrument-hud.css:97-124`), written on the HUD root every
  frame (`src/ui/pass77-hud-sway.ts:448-451`, `src/legacy-main.ts:31627`).

Caveat (not a blocker): `(program)` is Blink's aggregate bucket
(style+layout+paint+compositor with no JS frame), not a `RecalculateStyle`
timer — the report never cites Timeline selector-stats or a style-vs-layout
split. The inherit-fanout mechanism is still the best-supported explanation,
but layout/paint share is not separately quantified.

- Falsifier: with `--hud-*` writes live, a DevTools Timeline where
  `RecalculateStyle` collapses under `hud-var-writes` while Layout/Paint
  timers do not move confirms style; conversely, if the OPEN next-lane fix
  (`inherits: false` + writes on ~10 cluster elements) ships and the
  `hud-var-writes` `(program)` delta goes to ~zero with the writes still live,
  the fanout mechanism is confirmed. Smallest follow-up: capture one Timeline
  with selector stats on the final build — evidence-only, no code.

## (2) Minimap static layers — VERIFIED CORRECT (two bounded edges, neither blocking)

Collider layer (`src/minimap-static-layers.ts`, `activeMinimapColliderLayer`)
keys on the collider array identity. `activeWorldColliders()`
(`src/legacy-main.ts:3790-3836`) returns a STABLE cached identity while
arena+runtime+`collision.revision` are unchanged, so a break/door/collapse
repaints exactly once:

- Glass breaks call `invalidateActiveWorldCollisionCache()`
  (`src/legacy-main.ts:15949`) → new identity → one repaint. House collapse /
  doors flow through `collision.revision` / the baked-in door+glass entries
  (`src/legacy-main.ts:3824-3829`).
- Draw order is preserved exactly: colliders → live Domination zones → cover
  → live targets (`src/legacy-main.ts:28128-28180`); that is why it is two
  layers, and the comment says so.

Edge A (pre-runtime window): the early-return branch
(`src/legacy-main.ts:3809-3814`) spreads into a FRESH array every call, so
identity never stabilises and the layer repaints every 30 Hz tick there.
Bounded to the pre-runtime/menu window (no gameplay), cost is at most today's
cost plus one `drawImage`, never an allocation (retained canvas). Accept or
memoise that branch — optional.

Edge B (gun range): patrolling dummies are deliberately appended outside the
cache (`src/legacy-main.ts:3833-3835`, HF-318: a cached patrol pose would leave
an invisible wall), so identity changes every frame there and the layer
repaints every tick. The module header documents exactly this worst case.
Correct tradeoff, no fix.

Cover layer (`activeMinimapCoverLayer`) keys on arena identity + cover count +
size. Every `physicalCover.push` in `src/` is build-time (`src/map.ts:750,838,
934`; `src/farcrysis-physics.ts:193,778,937,995`; `src/farcrysis.ts:176`;
`src/high-seas.ts:1249`) — no runtime mutation found, so the count tripwire
holds today. Hardening (optional, not required to ship): a count-only key
misses an in-place bounds/id rewrite at constant length. Smallest fix if ever
wanted: key on a cheap cover revision or hash of ids+bounds at build time.

## (3) HUD dirty flag — VERIFIED, no stale path

Set sites traced (exhaustive — grep for `--hud-(sway|breathe|gait|health)` over
`src/`):

- `src/ui/pass77-hud-sway.ts:448-451` (`applyHudSway`, four sway writes),
  `:462-465` (`releaseHudSway`, four writes),
  `src/legacy-main.ts:31627` (`--hud-health` via `setHudProperty`).
- No other writer of these five properties exists. The only neighbouring
  `setProperty` traffic is `--hud-impact-*` in
  `src/ui/hud-impact-response.ts:309-314` — a separate namespace, event-driven
  (per hit, not per frame), untouched by the flag and unaffected by it.
- No `removeProperty` / `cssText` / `innerHTML` mutation of the HUD root found;
  the cache is a per-target `WeakMap`, so element replacement starts fresh.
- Skipping a byte-identical write is invisible by construction (computed value
  already in the declaration). Health/ammo/killstreak readouts do not consume
  these five vars (health width is set elsewhere; `--hud-health` only drives
  the vitals colour ramp, `pass77-instrument-hud.css:476`), so nothing that
  reads them can go stale.
- The report's ASSUMPTION is honest and I concur: the flag does not recover the
  measured cost at either pose because `--hud-breathe` is a continuous
  respiration sine that changes every frame at three decimals. It bounds the
  released/paused/unchanged cases only.

Nit (one redundant write on transitions, zero correctness impact):
`releaseHudSway` writes `'0'` (`pass77-hud-sway.ts:462-465`) while
`serialise(0)` is `'0.000'` (`:388-390`), so release→apply(0) and apply(0)→
release each cost one extra write that a normalised comparison would skip.
Smallest fix: `writeHudProperty(target, '--hud-sway-x', serialise(0))` (etc.)
in `releaseHudSway`. Optional.

## (4) `presentImpacts()` refresh — VERIFIED CORRECT, no double update

`freezeMatrixWorldWalk(this.root)` (`src/killstreak-presentation.ts:3027`)
makes the pool root a traversal boundary; `presentImpacts` (`:3985-4094`) is
the one activation site outside `sync()`, mutating shell/flash/ember roots.
Without the added `updateLiveWorldMatrices()` (`:4094`) an effect would draw
one frame at its pooled rest pose. The refresh touches only active roots
(`:3902-3919`), is idempotent, and `sync()` has no early return on these paths
that would skip its own refresh (`:3882`). Call sites
(`src/legacy-main.ts:13063` network, `:25130` local) may be followed by a
same-frame `sync()` → the matrices are recomputed twice, which is pure
redundant arithmetic, not a double activation or ordering hazard. Correct
under the lane-3 walk-skip. No fix.

## (5) Tests + size ratchet — VERIFIED, nothing loosened

- `git diff --name-only aa4979ed..c5f64b77` = 26 files; ZERO `*.test.*` /
  spec files. No test, threshold, or assertion was touched, let alone weakened.
- `gates-lane4.md`: 41 files / 454 tests passed, 1 file / 2 skipped (the
  pre-existing intentional killstreak demo-media manifest skips, as the
  evidence commit states). `tsc --noEmit` / `build` claimed in-report, not
  re-run here per lane constraints.
- `src/legacy-main.ts` is 37,369 lines (measured) ≤ `LINE_CEILING` 37,371
  (`src/legacy-main-size-ratchet.test.ts:78`), ledger head 37,371 — two lines
  of headroom, ceiling untouched. New code was hoisted into
  `src/minimap-static-layers.ts` (185 lines) instead of the ratcheted file.

## Findings (file:line + smallest fix)

- F1 — `src/ui/pass77-instrument-hud.css:97-124` + report: `(program)` bucket
  never split into style-vs-layout. No code fix; follow-up is one Timeline
  with selector stats. Non-blocking.
- F2 — `src/minimap-static-layers.ts` cover cache: count-only key.
  Hardening only: key on a cover revision/hash if in-place runtime mutation
  ever becomes possible. Non-blocking (all pushes are build-time today).
- F3 — `src/ui/pass77-hud-sway.ts:462-465`: release writes `'0'` vs
  `serialise` `'0.000'`. One-line normalisation (above). Non-blocking nit.
- F4 — `src/legacy-main.ts:3809-3814`: early-return branch allocates per call
  → layer repaints per tick pre-runtime. Accept/document or memoise.
  Non-blocking.

## Verdict: SHIP

Three reasons: (a) the 7–8 ms attribution is triangulated three independent
ways with exact reverts and a control rung, with the cross-session caveat
correctly disclaimed; (b) both caches invalidate on every real mutation path
(glass invalidation, collision revision, stable identity) with draw order
preserved and the gun-range worst case explicitly bounded; (c) no contract was
weakened — zero test files touched, gates green as logged, `presentImpacts`
refresh idempotent under the walk-skip, no stale HUD path, and the ratchet
holds at 37,369 ≤ 37,371 with new code hoisted out of the ratcheted file.
The OPEN item (narrow `@property` inheritance to ~10 cluster elements) is
correctly handed over, not half-shipped.
