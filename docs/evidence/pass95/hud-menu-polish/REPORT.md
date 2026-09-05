# PASS 95 - HUD / menu / lobby polish

Date: 2026-09-05 - Machine `dave-gaming-pc` - Harness Claude Code (Opus)
Worktree: `C:/Users/david/projects/aa-p-hud-menu-polish`
Branch: `contrib/dave-gaming-pc/claude/v8-hud-menu-polish`
Base: `452d7aba` (`contrib/dave-gaming-pc/claude/pass93-candidate`, candidate 7)
Browser port `4261`, headless installed Chrome, `PASS73_NATIVE_WEBGPU=1`, stock
flags plus `--mute-audio`, one browser at a time, off the owner screen.

Claim states: **[VERIFIED]** = I ran it and read its output. **[MEASURED]** = a
number produced by an instrument I ran. **[OPEN]** = not proven.

## What this lane did

It refused to redesign a 13,900-line, eight-sheet UI on taste. It built the
measurement that was missing, ran it, and repaired what the measurement found.

`scripts/qa/audit-hud-menu-layout.mjs` is new. One short headless native-WebGPU
session lays out the real shell, deploys Nuke Town Rebuild once, then reads
`getBoundingClientRect()` and computed font sizes off every player-facing
surface at 1280x720, 1920x1080 and 2560x1440. It reports four finding classes -
forbidden overlap, offscreen, type floor, type ramp - plus a Blink style/layout
cost sample with a HUD-hidden attribution rung. It exits non-zero on any
finding, so it gates. Every existing HUD/menu contract in this repository
asserts on CSS *source text*; none of them could have caught anything below.

## What the measurement found (before)

`before-layout.json`, 26 findings. **[MEASURED]**

| Finding | Numbers |
|---|---|
| The map decision surface is off the first screen | `#map-selector` top **922.8** in a 1080-tall viewport; **662.3** of 720 at 1280x720, with 58px of a 573px-tall selector visible. Above it `#menu-showcase` occupied **581px** (309.2..890.8). |
| Map cards render below the readability floor | **8px** text in `#map-selector` at all three resolutions, against the AGENTS.md 9px floor. |
| The objective line is the smallest critical string on the HUD | `#objective` min and max font both **10px**, two ramp steps under the 30px timer beside it. |
| Per-frame style + layout far over budget | **6.092 ms/frame** (recalc 5.614, layout 0.478) over 130 frames at 1920x1080. |
| No overlap anywhere | overlaps `[]` at all three resolutions, no HUD surface outside the viewport. This part was already right. |

## What changed

`src/ui/pass95-hud-menu-polish.css`, loaded last and unlayered from
`bootstrap.ts` for the cascade reason `pass77-command-shell.css` already
documents (style.css ships unlayered `font:` shorthand that outranks every
`@layer` sheet). It declares one 4px spacing grid and one three-step type ramp,
then makes exactly four repairs, each annotated with the number that produced
it. No surface removed, no control dropped, no font added, no per-frame writer
touched.

1. Readability floor `max(9px, 1em)` on map-card, kit-card and lobby micro type.
   `max()` against `1em` can only raise a size, never lower one.
2. `#menu-showcase { max-height: min(34vh, 420px) }` with `object-fit: cover` on
   its media, so the preview stops consuming the whole first screen.
3. `#objective` to the 12px body step.
4. One explicit focus ring on the private-lobby controls and the map cards, plus
   a non-colour-only selected cue on the pressed card.

## What the measurement found (after)

`after-layout.json`, same harness, same session shape, on a build **[VERIFIED]**
to contain the sheet (`grep -c p95-grid dist/assets/index-*.css` = 1).

| Metric | Before | After | Verdict |
|---|---:|---:|---|
| `#map-selector` top @ 1920x1080 | 922.8 | **702.3** | **[MEASURED]** on the first screen |
| `#map-selector` top @ 2560x1440 | 922.8 | **755.2** | **[MEASURED]** |
| `#map-selector` top @ 1280x720 | 662.3 | **603.8** | **[MEASURED]** |
| `#menu-showcase` height @ 1920x1080 | 581.6 | **367.1** | **[MEASURED]** |
| smallest `#map-selector` text | 8px | **10px** | **[MEASURED]** floor met |
| `#objective` largest value | 10px | **12px** | **[MEASURED]** ramp met |
| HUD overlaps, all three resolutions | none | **none** | **[MEASURED]** held |
| HUD surfaces outside viewport | none | **none** | **[MEASURED]** held |
| findings | 26 | **8** | **[MEASURED]** |

Captures: `before-menu-*.png`, `before-hud-*.png`, `after-menu-*.png`,
`after-hud-*.png` at all three resolutions. **[VERIFIED]** backend reported
`webgpu` on both runs.

`control-stale-build-layout.json` is a re-measurement of the *pre-change* build,
kept deliberately: an earlier run npm build hung and the audit measured a stale
`dist`. Its findings are identical to `before-layout.json`, which is what makes
it useful - it is the run-to-run noise control for this harness.

## Performance

**[MEASURED]**, 1920x1080, 156 frames, CDP `Performance.getMetrics` deltas:

| rung | recalc ms/frame | layout ms/frame | style+layout ms/frame |
|---|---:|---:|---:|
| live HUD | 3.558 | 0.538 | **4.096** |
| HUD subtree display:none | 1.244 | 0.000 | **1.244** |
| **HUD-attributed** | | | **2.852** |

**[OPEN] - blocking.** 2.852 ms/frame attributable to the HUD exceeds the 1.5 ms
budget. The budget was **not** widened: `budgetMsPerFrame: 1.5` is asserted in
the harness, the harness exits non-zero on it, and the unit suite asserts that
the constant is 1.5 and that the attribution rung actually ran. The unit suite
deliberately does not duplicate the pass/fail of a browser measurement it did
not take.

**[VERIFIED]** this lane did not cause it and did not regress it: 6.092 before
against 4.096 after in the same rung, and the HUD-attributed figure was 2.894 on
the stale-build control against 2.852 here - unchanged within noise. The perf
lane 5 boundary is intact: all five frame-driven `--hud-*` properties remain
`inherits: false`, `HUD_MOTION_TARGETS` still resolves nine targets once, and
this sheet references none of those properties, adds no `@keyframes` and adds no
`transition` (asserted in `pass95-hud-menu-polish.test.ts`).

The residual is **not** the `--hud-*` writes. `recalcStyleCountPerFrame` was
1.65 with about 2.2 ms of recalc left after the sway channel was bounded, so the
next owner should bisect the remaining per-frame DOM text writes (ammo, timer,
scoreline, minimap console) rather than the custom-property channel again.

## Remaining findings, and why each is where it is

1. **[OPEN]** perf, above.
2. **[OPEN]** `.hud-map-console carries no value at or above 12px` at all three
   resolutions. This is a **rule-model finding, not a defect**: the minimap
   decision content is a canvas, and its 10-11px strings are status labels that
   already clear the 9px floor. The harness still flags it, honestly, rather
   than being quietly special-cased mid-run; the unit suite critical list
   already excludes it. Correcting the harness `critical` flag needs one more
   browser cycle to re-record, which did not fit the time box.
3. **[OPEN]** `menu #map-selector` and `#high-score-card` still extend past the
   viewport bottom at 1280x720 (and the selector at 1920x1080). The menu column
   is a scrolling panel, so vertical overflow there is not by itself a defect -
   what was a defect was the *first screen* containing no map cards, and that is
   fixed and measured. A 573px-tall two-column selector cannot fit a 720px
   viewport under a title and a preview; the real fix is a horizontal card rail
   at short viewports, which is a design change, not a polish repair.
4. **[OPEN]** one console error on both runs: `WebGPU queue completion exceeded
   12000 ms`. That is candidate 7 known preserved cold fence
   (`docs/evidence/pass94/candidate7/REPORT.md`), not new here, and the fence was
   not touched.

## Gates

- **[VERIFIED]** `npx tsc --noEmit`: exit 0, no output.
- **[VERIFIED]** focused suite - `pass95-hud-menu-polish`, `surface-registry`,
  `pass65-hud-layout`, `pass77-visual-language`, `pass66-readability`,
  `hud-chat-layout`, `legacy-main-size-ratchet`, `hud-motion-contract`,
  `menu-lifecycle`, `pass64-shell`: **121 tests, 10 files, all passing** after
  one self-inflicted assertion fix (the sheet own prose contains the word
  `@layer`; the assertion now matches the at-rule, not the word).
- **[VERIFIED]** `npm run build`: exit 0, and the sheet is present in the emitted
  CSS.
- **[VERIFIED]** `src/legacy-main-size-ratchet.test.ts` passes. `legacy-main.ts`
  was not touched by this lane; LINE_CEILING 37,396 was not raised.
- **[VERIFIED]** the layout harness is a real gate: it exited 1 on both runs
  because findings remain.

Nothing was weakened, skipped, widened or deleted. Every heavy step
(`npm run build`, every browser session) was taken under the machine lock and
released after it.
