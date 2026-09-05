# Muse review — v8 HUD/menu polish, round 2 (Finish round)

Reviewer: Meta Muse Spark 1.3 (skeptical second pair of eyes, no verifier run).
Branch: `contrib/dave-gaming-pc/claude/v8-hud-menu-polish`. Head reviewed: `070322ee`.
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`.
Scope of the Finish round (4 commits on top of `c0b13857`, the head of my
round-1 review): `src/ui/pass95-hud-menu-polish.css` (+PART 5),
`scripts/qa/audit-hud-menu-layout.mjs` (F2 flag + F4 gotcha comment),
`src/legacy-main.ts` (+34/−36, HUD-write dirty-flagging),
`src/ui/hud-write-cache.ts` + `src/ui/hud-write-cache.test.ts` (new),
`src/ui/pass95-hud-menu-polish.test.ts` (3 new source/measurement contracts),
plus the REPORT.md Finish-round section. No existing test, threshold, or
contract touched. No builds, no browser, no GPU run by this reviewer; every
measurement claim below is re-asserted by reading committed artifacts and the
diff, not re-taken — which is exactly what the REPORT itself discloses.

Round-1 verdict was SHIP-WITH-FIXES with F2 (+F4 folded into its re-record) to
land before candidate 9 and F1/F3 travelling as carried OPENs. This round
lands the F2 model fix, the F4 documentation, the F3 scroll mechanism, and the
F1 write-churn removal at source. What it cannot land by instruction (no
browsers, no builds) is the single browser re-record that converts all four
from "verified at source" to "measured". That is the whole of my verdict
below.

## Check (1) — 1280x720 overflow: scroll containment, not hiding; 3-resolution gate

PASS at source, measurement OPEN as disclosed.

- Mechanism (`src/ui/pass95-hud-menu-polish.css`, PART 5): a `min-height: 0`
  chain over `#menu-panel-deploy` / `.arena-command` / `#map-selector`
  (without it a grid item refuses to shrink and no overflow rule engages),
  `overflow-y: auto` on the arena column and the selector with
  `max-height: calc(100vh - 320px)` (+`100dvh` line), `overscroll-behavior:
  contain`, `scrollbar-gutter: stable`, and a `max-height: 800px` media
  tightening (showcase ceiling `min(22vh, 220px)`). Verified by read.
- Not hiding: `grep -i "display:none|visibility:hidden|opacity:0"` on the sheet
  returns nothing. No surface removed, no control dropped; the horizontal card
  rail stays a design change, as round 1 ruled.
- Three resolutions asserted: `REVIEW_VIEWPORTS` is all three
  (`pass95-hud-menu-polish.test.ts:58`); the harness gates menu offscreen per
  viewport at all three (source contract pins the `report.menu` loop and the
  `menu ${off.selector} extends outside the viewport` finding); the shape pin
  asserts `#map-selector`, `#high-score-card`, `#menu-showcase` present in the
  committed capture at all three. Deliberately retained scoping: the
  first-screen top assertion (`test.ts:230-238`) still covers only
  1920x1080/2560x1440 — at 720p the selector top (603.8 measured) is on screen
  but the 573px column cannot fit under title+preview, so strict `[]`-green
  needs the re-record and the rail stays a design change. Honest, and the "do
  not lower the 160px threshold" line needed no action and got none.
- The committed `after-layout.json` (unchanged since `fa8694fc`) still carries
  `offscreen: menu #map-selector` (720p + 1080p) and `menu #high-score-card`
  (720p). The REPORT says exactly this. Source fix verified; browser proof
  OPEN.

## Check (2) — ramp rule-model disagreement: wrong model fixed, assertion intact

PASS. This is the cleanest item in the round.

- The harness was the wrong model and the harness is what moved:
  `scripts/qa/audit-hud-menu-layout.mjs:67-72` records `.hud-map-console` as
  `critical: false` with the canvas rationale in a comment (text is two status
  labels, decision content is the `#minimap` canvas, so no 12px value exists
  by design). The 12px ramp assertion itself is byte-identical on both sides.
- Ground truth at source confirms the rationale: `src/ui/tactical-ui.css`
  pins `#map-heading` (`:1225`) and `#location-label` (`:1233`) at `font: 900
  9px` / `800 9px`; measured 10–11px clears the 9px floor, and no 12px value
  exists by design.
- Agreement pinned in suite (`pass95-hud-menu-polish.test.ts:227` asserts the
  `critical: false` harness line). No weakening: the critical list that gates
  12px is unchanged, only membership moved, with reason stated at the flag.
- Residual, disclosed: the committed `after-layout.json` still carries the 3
  `type-ramp` findings on `.hud-map-console` recorded under the old flag.
  Re-recording them away needs the same single browser cycle as item 1.

## Check (3) — per-frame HUD write audit: what moved, and the 2.85 ms claim

PASS at source; the number is still [OPEN] and the REPORT leaves it so.

Writes dirty-flagged or throttled (all 1:1, no displayed value changed):

- ~20 text/style writes per 10 Hz `updateHud` tick now go through
  `setHudText` / `setHudStyle` (`src/ui/hud-write-cache.ts`, WeakMap
  per-element last-value caches; DOM write skipped only when identical):
  location, health, health-fill width, damage dealt/taken, weapon, ammo,
  reserve, railgun status, mode/aqua/coral labels, both scores, timer,
  objective, respawn countdown, reload line, stance, grenades, plus the four
  match-start sites (`#match-mode-label`, `#objective`, `#aqua-label`,
  `#coral-label`) converted so no direct write can desynchronise a cache.
  Verified: grep for direct `.textContent =` / `.style.setProperty` on any
  cached selector in `src/legacy-main.ts` returns nothing.
- Railgun status line hoisted to pure `railgunStatusCopy` (all five branches
  pinned by `hud-write-cache.test.ts`); `legacy-main.ts` 37396 → **37394**,
  under the ratchet with no ceiling change.
- `#network-strip` full innerHTML rebuild throttled to 500 ms
  (`src/legacy-main.ts:28393-28394`, `lastNetworkStripAt` guard).
- Crosshair `--spread` (`src/legacy-main.ts:28287` region) goes through
  `setHudStyle` — dirty-flagged, not removed. Correctly so: the value moves
  continuously while spread changes, so a last-value cache cannot help a
  moving value; the structural fix (register `--spread` with `inherits:
  false`, or move the four arms onto `transform`) changes ADS visuals and
  stays with its measured cycle + visual review, per round 1. Untouched and
  correctly so: `crosshair.hidden`/ads toggles, `#health-block` toggle,
  respawn/roster conditionals (already event-gated), `updateFieldSupportHud`
  internals, the 60 Hz minimap canvas redraw (Canvas2D, not style/layout),
  every `querySelector`.
- The 2.852 ms HUD-attributed figure is **inherited, not remeasured**:
  `after-layout.json` perf block is byte-identical to the first session's run
  (156 frames, recalc 3.558 + layout 0.538 = 4.096 live vs 1.244 hidden =
  2.852 attributed, budget 1.5). The REPORT marks it **[OPEN] - blocking,
  unchanged in kind** and states proof needs the harness attribution rung in a
  browser. The budget stands unwidened and still gates. Nothing here claims
  the number fell.

## Check (4) — gamepad nav, focus states, chat position (HF-500)

PASS, each at source:

- Map cards still native `<button type="button" class="map-card"
  data-arena-id=... aria-pressed=...>` (`src/ui/pass64-shell.ts:64`); the
  roving-focus hooks reading `.map-card[data-arena-id]`
  (`src/legacy-main.ts:29695`, `:30392`) are untouched (the legacy diff
  touches only HUD-write lines and the import + throttle guard).
- Focus rules are outline + offset only (no layout change, DOM order intact);
  `:focus-visible` restated for `#private-lobby button/select/input` +
  `.map-card`, non-colour-only selected cue via `inset box-shadow` on
  `[aria-pressed='true']` (sheet `:155-170`, verified).
- Chat (HF-500): zero `text-chat` references in the polish sheet (verified);
  `src/bootstrap.ts:20-23` keeps `pass94-hud-chat.css` before the polish
  sheet, so chat rules win/lose exactly as before; crosshair-vs-chat and
  map-vs-chat overlap pairs still gated, after-run `[]`.

## Check (5) — round-1 UNFINISHED list, item by item

1. Perf 2.852 vs 1.5 budget — OPEN, pre-existing, carried. Churn removed at
   source, proof needs the browser rung. Correctly not claimed fixed.
2. `.hud-map-console` flag divergence — model fixed at source (harness flag +
   suite pin); the 3 stale findings in committed JSON need the re-record.
3. Menu column overflow at 720p (+1080p selector) — scroll mechanism landed
   at source; strict `[]`-green + short-viewport rail (design change) OPEN.
4. `WebGPU queue completion exceeded 12000 ms` cold fence — untouched,
   carried as candidate-7 known state.
5. After-numbers second-hand only; preview-bind gotcha — gotcha now
   documented where the next runner reads it (harness header: `--host
   127.0.0.1` + HTTP-200-from-127.0.0.1 readiness gate). Re-record still OPEN.

## Findings (file:line, why, smallest fix)

- **G1 — one browser re-record blocks candidate-9 entry (not a source
  defect).** Why: the committed `after-layout.json` (from `fa8694fc`) still
  records the old world — 3 `type-ramp` on `.hud-map-console` under the old
  flag, 3 menu `offscreen`, perf 2.852 — while the source contracts already
  describe the new one. Any gate reading the JSON is still red. Smallest fix:
  `npx vite preview --port 4261 --strictPort --host 127.0.0.1`, gate readiness
  on HTTP 200 from `127.0.0.1` (never the log line), run
  `node scripts/qa/audit-hud-menu-layout.mjs --label after --out
  docs/evidence/pass95/hud-menu-polish`, commit the JSON + captures. Then the
  F2/F3 closures and the F1 re-measurement fall out of one cycle.
- **G2 — `--spread` cache cannot move the needle while spread moves
  (expected, not a bug).** `src/legacy-main.ts` (crosshair write) +
  `src/style.css:94` (four transitioned layout properties) + no `@property`
  registration anywhere. Why listed: the next owner must not read
  "dirty-flagged" as "fixed" for this one channel. Smallest fix: the deferred
  measured cycle — register `--spread` (`<length>`, `inherits: false`) or move
  arms to `transform`, with ADS visual review. Needs its own cycle by design.
- No other findings. No cache bypass (verified), no hidden hiding (verified),
  no chat/focus/gamepad regression (verified), no ratchet move (37394 ≤
  37396), no threshold touched.

## Verdict: SHIP-WITH-FIXES

1. **Every Finish-round repair is at source and regresses nothing.** Scroll
   containment without hiding, harness-model correction without loosening the
   ramp, ~20 writes dirty-flagged 1:1 with zero bypasses, gotcha documented
   where the runner reads it. Ratchet unmoved, budget and ramp unwidened on
   both sides of every edit.
2. **Every remaining gap is a measurement, not a model — and all four close
   in one browser cycle.** The re-record (G1) simultaneously clears the F2
   stale findings, proves or refutes F3 containment, and re-takes the F1
   attribution number the write-churn work was aimed at.
3. **Nothing here needs re-review after that cycle unless the numbers argue.**
   If the re-record is green on menu offscreen (modulo the rail) and shows
   the attributed number falling, the branch enters candidate 9 with the
   rail + cold fence as carried OPENs. If the number does not fall, the
   crosshair-structural cycle (G2) is next, with its mechanism already
   written down.

G1 should land before the branch enters candidate 9; F1 (perf) and the rail
travel as carried OPENs — both pre-existing base state, not lane damage.

## UNFINISHED

1. Single browser re-record (G1) — source done, measurement OPEN by
   instruction; blocks candidate-9 entry, not lane correctness.
2. Perf: HUD-attributed 2.852 ms/frame vs 1.5 ms budget — OPEN, pre-existing;
   churn removed, `--spread` structural fix deferred with mechanism (G2).
3. Menu strict `[]`-green at 720p/1080p + short-viewport card rail — scroll
   mechanism landed, rail is a design change, OPEN.
4. `.hud-map-console` 3 stale `type-ramp` findings in committed JSON — flag
   fixed, findings clear on re-record (folds into G1).
5. Candidate-7 cold fence console error — untouched, carried.
