# Muse review — v8 HUD/menu polish (pass95 lane, branch `contrib/dave-gaming-pc/claude/v8-hud-menu-polish`)

Reviewer: Meta Muse Spark 1.3 (skeptical second pair of eyes, no verifier has run).
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate`. Head reviewed: `9497183f`.
Scope: 4 source files changed, 744 insertions, 0 deletions outside evidence —
`scripts/qa/audit-hud-menu-layout.mjs` (new, 354), `src/bootstrap.ts` (+3),
`src/ui/pass95-hud-menu-polish.css` (new, 170), `src/ui/pass95-hud-menu-polish.test.ts` (new, 217).
No existing test, threshold, or contract touched. No builds, no browser, no GPU run by this reviewer;
all measurement claims below are re-asserted by reading the committed JSON, not re-taken.

## Check (1) — perf lane 5 boundary holds, zero per-frame `@property` regression

PASS. Quote from the boundary source (`src/ui/pass77-instrument-hud.css:98-127`):

```css
@property --hud-sway-x { syntax: '<number>'; inherits: false; ... }
@property --hud-sway-y { syntax: '<number>'; inherits: false; ... }
@property --hud-breathe { syntax: '<number>'; inherits: false; ... }
@property --hud-gait    { syntax: '<number>'; inherits: false; ... }
@property --hud-health  { syntax: '<number>'; inherits: false; ... }
```

And the new sheet references none of them: `grep -c "hud-sway-x\|hud-sway-y\|hud-breathe\|hud-gait\|hud-health"
src/ui/pass95-hud-menu-polish.css` = **0** (the only `--hud-` strings are `--hud-edge`/`--hud-gap`
in a prose comment). It adds no `@keyframes` and no `transition:` (verified by read; the unit test
asserts both absences). `HUD_MOTION_TARGETS` in `src/ui/surface-registry.ts:33-43` still resolves
exactly nine targets (8 sway + 1 health), untouched — the diff on that file is empty.
Per-frame numbers moved the right direction: before 6.092 ms/frame (recalc 5.614 + layout 0.478,
130 frames) → after 4.096 (recalc 3.558 + layout 0.538, 156 frames), HUD-attributed 2.894
(stale-build control) → 2.852, i.e. unchanged within noise. The lane neither caused nor regressed
the residual.

Deliberately-noted trap, correctly left alone: `src/ui/pass77-instrument-hud.css:133-166` declares
six `--hud-impact-*` properties with `inherits: true`, which looks exactly like the lane-1 defect.
The report kills that hypothesis at the source (`src/ui/hud-impact-response.ts`: `advanceHudImpact`
returns without writing when idle; `releaseHudImpact` clears once on transition into idle), so a
settled HUD writes nothing there. A future `inherits: true` grep will flag it; it is handled.

## Check (2) — every control, multiplayer state, and accessibility hook kept

PASS. Diff on `src/ui/surface-registry.ts`, `src/ui/pass64-shell.ts`,
`src/ui/pass94-hud-chat.css`, `src/legacy-main.ts` is **empty** (verified `git diff --numstat`).
Consequences, each checked at the source:

- Gamepad/keyboard: map cards are still native `<button type="button" class="map-card"
  data-arena-id=... aria-pressed=...>` (`src/ui/pass64-shell.ts:64`); the roving-focus hooks that
  read `.map-card[data-arena-id]` (`src/legacy-main.ts:29697`, `:30394`) are untouched. The new
  `:focus-visible` rules change no layout (outline + offset only), so DOM order is intact.
- Focus lineage real, not decorative: base `:focus-visible` for `.map-card` already exists in
  `src/ui/pass66-overhaul.css:424`, `src/ui/pass74-visual-refresh.css:298`,
  `src/ui/pass77-command-shell.css:907-910`; the new sheet restates it explicitly for
  `#private-lobby button/select/input` + `.map-card` (`pass95-hud-menu-polish.css:155-161`) with a
  non-colour-only selected cue (`[aria-pressed='true']` inset box-shadow, :168-170).
- Chat position (HF-500): the sheet contains zero `text-chat` references; `src/bootstrap.ts:20-23`
  keeps `pass94-hud-chat.css` imported before the polish sheet, so chat rules still win/lose exactly
  as before. `#text-chat` overlap pairs are measured (see check 3) with zero overlaps in after.
- Multiplayer state: lobby ready/start/leave buttons asserted present in `pass64-shell.ts` by the
  new unit test; `UI_SURFACE_INVENTORY` (incl. `room-chat`, `private-lobby`) untouched.

## Check (3) — the three-resolution bounding-box layout test is real and covers overlap

REAL, with one honest scoping gap (finding F3). `scripts/qa/audit-hud-menu-layout.mjs`:

- Three viewports actually deployed: `VIEWPORTS` = 1280x720, 1920x1080, 2560x1440 (:47-52); menu
  measured pre-deploy at all three, one arena deploy (`nuketown2` + `startSolo`, waits for
  `matchPhase === 'active'`), HUD measured post-deploy at all three. Screenshots per viewport
  committed (12 PNGs).
- `MEASURE_SCRIPT` (:111-189) reads real `getBoundingClientRect()` + walks every descendant with own
  text for min/max computed font, records `visible` honestly (display/visibility/opacity/size/hidden).
  Overlap = positive-area intersection over 16 `FORBIDDEN_OVERLAPS` pairs (:80-97) including a
  crosshair band against every peripheral console — strict, and after reports `[]` at all three
  resolutions (re-verified in `after-layout.json` by this reviewer).
- Offscreen = any visible box outside the viewport rect; type floor 9px / critical ramp 12px per
  AGENTS.md; perf = CDP `Performance.getMetrics` deltas over presented rAF frames with a
  HUD-hidden (`display:none`) attribution rung; `budgetMsPerFrame: 1.5` asserted in-harness and the
  harness exits non-zero on findings. It exited 1 on both runs — a gate that actually gates.
- After-numbers in the report re-verified against committed `after-layout.json`: map-selector top
  922.8→702.3 @1080p, 922.8→755.2 @1440p, 662.3→603.8 @720p; showcase 581.6→367.1 @1080p;
  map-card min font 8→10px; `#objective` max 10→12px; backend `webgpu`. Before-numbers match too
  (6.092 ms/frame, 130 frames, 26 findings).

## Check (4) — test loosening / ratchet

NO WEAKENING. No existing test file is in the diff at all; the only test change is the new
`pass95-hud-menu-polish.test.ts`. `src/legacy-main.ts` untouched, `wc -l` = 37396 = LINE_CEILING.
The budget is asserted as 1.5 in both harness and suite; the suite deliberately does NOT duplicate
the browser pass/fail (documented rationale: a browser-less suite asserting an unmeasured number
would be theatre — instead it asserts the attribution rung ran with >30 frames and real numbers).

One divergence is real, documented, and becomes finding F2 below: the harness marks
`.hud-map-console` `critical: true`, but the unit suite's `critical` list omits it, so the suite is
green while the committed after-run still carries 3 `type-ramp` findings on that surface. Rationale
is stated (canvas decision content; 10–11px labels clear the 9px floor) — but the two contracts
disagree, and the harness side still gates red on it.

## Findings (file:line, why, smallest fix)

- **F1 — perf budget still red (pre-existing, blocking, not this lane's).**
  `docs/evidence/pass95/hud-menu-polish/after-layout.json`: `hudAttributedMsPerFrame` 2.852 > 1.5
  budget; `recalcStyleCountPerFrame` 1.65 with ~2.2 ms recalc left. Why it matters: the gate the
  lane kept honest still fails, so candidate 9 cannot claim the perf contract on this evidence.
  Smallest fix: none in this lane (correctly — bisecting blind would be guessing). Next owner takes
  the report's sharpened hypothesis, not its superseded one: `src/legacy-main.ts:28287` writes
  `crosshair.style.setProperty('--spread', ...)` every frame, unguarded; `--spread` has no
  `@property` registration anywhere (only eleven `--hud-*` registrations exist), so it inherits by
  default, and `src/style.css:94` spends it in four layout properties (`left/right/top/bottom`) on
  four elements that also carry `transition: left/right/top/bottom .08s` — one write → transitioned
  layout × 4, every frame. Hypothesis with mechanism, unmeasured; needs its own measured cycle +
  visual review vs ADS states before touching.
- **F2 — harness/unit `critical` divergence on `.hud-map-console`.**
  `scripts/qa/audit-hud-menu-layout.mjs:59-73` (`critical: true`) vs
  `src/ui/pass95-hud-menu-polish.test.ts:189-200` (critical list omits it). Why: suite green +
  harness red on the same committed run is exactly the "two truths" shape that rots. Smallest fix:
  flip the harness flag to `critical: false` with the canvas rationale in a comment, re-run the
  audit once to re-record, commit the new JSON. Needs one browser cycle; correctly deferred, but
  track it — do not let the exclusion live only in prose.
- **F3 — first-screen assertion covers 2 of 3 resolutions.**
  `src/ui/pass95-hud-menu-polish.test.ts:203-213` asserts `#map-selector` top only for 1920x1080
  and 2560x1440. Why: at 1280x720 the selector top is 603.8 in a 720-tall viewport and still extends
  past the bottom (after `offscreen: menu #map-selector`, `#high-score-card` at 720p; `#map-selector`
  at 1080p too). The report is honest about this (OPEN item 3: scrolling menu column; real fix is a
  horizontal card rail at short viewports = design change). Smallest fix: none in this lane; extend
  the assertion to 720p if/when the rail lands. Do not "fix" by lowering the 160px threshold.
- **F4 — evidence caveat: after-numbers are first-session measurements.**
  Report §"The re-measurement I attempted" (gotcha recorded): `vite preview` binds `localhost`
  (::1 first) while the audit defaults to `127.0.0.1:4261`, so the readiness probe never passed and
  no second measurement exists. Why it matters: everything in checks (1)–(3) above re-verifies
  committed artifacts, not a live page. Smallest fix (next run, untested): start preview with
  `--host 127.0.0.1` and gate on HTTP 200 from `127.0.0.1`, never on the log line, with a bounded
  wait. No lock leaked; port left clear.

## Verdict: SHIP-WITH-FIXES

1. **The lane repaired only what it measured and regressed nothing.** Four repairs, each traceable
   to a before-number; perf boundary quoted intact; controls/multiplayer/a11y diff-empty; ratchet
   unmoved; no test touched.
2. **The new gate is real and stays red where it should.** Overlap/offer/floor/ramp/perf all
   measured on the live shell at three resolutions; the residual perf failure and console error are
   carried as OPEN, not hidden — a red gate the next owner can trust beats a green one they cannot.
3. **Every remaining gap is named with its smallest fix and owner.** F1 (pre-existing perf, needs a
   measured crosshair-spread cycle), F2 (one-line harness flag + re-record), F3 (720p rail = design
   change), F4 (preview bind flag). None requires re-reviewing this lane's four repairs.

Fixes F2 (+F4 folded into its re-record) should land before the branch enters candidate 9 so the
harness and suite agree; F1/F3 travel as carried OPENs with the hypotheses above, since both are
pre-existing base state, not lane damage.

## UNFINISHED (brief requirements vs diff)

1. Perf: HUD-attributed 2.852 ms/frame vs 1.5 ms budget — OPEN, pre-existing, carried (F1).
2. `.hud-map-console` 12px-ramp rule-model flag — harness/unit disagree; one browser cycle to
   reconcile (F2).
3. Menu column still overflows viewport bottom at 1280x720 (`#map-selector`, `#high-score-card`)
   and selector at 1920x1080 — first-screen decision surface fixed; short-viewport rail is a design
   change, not done here (F3).
4. `WebGPU queue completion exceeded 12000 ms` console error on both runs — candidate-7 known cold
   fence, untouched here.
5. After-measurement reproduced second-hand only; re-run blocked on preview-bind gotcha (F4).
