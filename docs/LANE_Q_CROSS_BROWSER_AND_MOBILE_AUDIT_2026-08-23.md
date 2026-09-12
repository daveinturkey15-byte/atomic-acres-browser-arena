# Lane Q — cross-browser and mobile, measured honestly (2026-08-23)

Owner row: *"working in chrome edge firefox safari and opera all ok, and on mobiles."*

Machine: `dave-gaming-pc`, Windows 11, RTX 5080 + AMD iGPU, two 2560x1440 displays.
Build: integration worktree `atomic-acres-highseas`, dev server on `127.0.0.1:41876`.

---

## Bottom line

1. **HF-331 is closed.** Firefox 154 runs the game on **WebGPU**, boots **all six
   arenas**, and in the full matrix measured **76.9–111.1 fps** in-match — against
   Chrome's **38–52 fps** on the same arenas the same evening. Firefox is not
   1/15th of Chrome; on this machine it is currently **ahead** of it. The
   "~10 FPS" was a harness fault: Firefox launched with an explicit `-profile`
   never gets content focus, and the product refuses to render a frame without
   it.
2. **Nothing here is vsync-limited.** With the limiter off, Firefox does
   **909 fps** under a heavy full-screen shader load. Both browsers run the game
   far below what they could present — the game is workload-bound, equally, in
   both engines.
3. **One thing in the original report is real**: Firefox's **p99 frame lands at
   13.7 fps**. The median is fine; the *tail* is not. That deserves its own row.
4. **Safari cannot be tested on this machine at all**, and the WebKit lane that
   stands in for it lies about being macOS on Apple hardware. **Opera is not
   installed.** Both are reported as coverage holes, never as passes.
5. **Mobile is genuinely playable with touch** at 390x844 and 768x1024 — move,
   look, fire and jump all verified by driving the real overlay with real touch
   events and reading the game's own camera and ammo back. 16 controls, none under
   44 px, none off-screen, none overlapping, no horizontal overflow.
6. **The standing gate exists**: `npm run qa:cross-browser` — ceiling, then
   browser x arena, then mobile touch playability; one exit code; SKIPPED and
   BLOCKED can never read as PASS, and that rule is unit-tested without launching
   a browser. Verified failing closed: with `--require opera` on a machine with no
   Opera, the gate exits **1**.
7. **Three product faults fell out of the sweep**, none of them previously
   visible: `farcrysis` will not deploy in **Chrome** on WebGPU (a queue-completion
   stall — it boots in Edge and Firefox); `gun-range` throws a godrays TSL null in
   **every** WebGPU browser; and `high-seas` fails **WebGL2 shader validation** in
   every browser that takes the fallback path — which is the path phones and
   Safari take.

---

## 1. HF-331 is closed. Firefox was never slow.

**The report was "Firefox ~10 FPS versus 150+ in Chrome". It is wrong, and the
reason nobody could disprove it for weeks was a harness fault, not a browser.**

Root cause, bisected mechanically:

> **Firefox launched with an explicit `-profile <dir>` never gives the content
> document focus.** `document.hasFocus()` stays `false` for the entire run and
> not one `focus`, `blur` or `focusin` event ever fires — with the window
> verified as the Windows foreground window, verified `visibilityState:
> "visible"`, and clicked in with genuine synthesised `SendInput` mouse input.
> The same Firefox binary launched against its **default** profile takes content
> focus within ~100 ms.

That single fact produces the whole "10 FPS" signature, because the product
gates rendering on exactly that predicate. `src/legacy-main.ts` pauses match
admission and the frame loop whenever
`document.visibilityState === 'visible' && document.hasFocus()` is false:

```ts
const ownsForeground = (): boolean => document.visibilityState === 'visible' && document.hasFocus();
// ...
const scheduleSample = (): void => { if (settled || frameRequest !== null || !ownsForeground()) return; ... };
```

Every previous harness — `measure-browser-frame-parity.mjs`,
`run-hf331-installed-browser-fps.mjs`, `verify-installed-firefox.mjs`, the
Pass 70 geckodriver work, and the pre-Lane-Q `verify-cross-browser-matrix.mjs` —
launched Firefox with a disposable `-profile`. So Firefox was asked to render in
the one state where the product deliberately renders nothing, and reported a
frame rate that was not a frame rate. **The browser was never measured. The
harness was.**

Bisect receipt: `artifacts/qa/lane-q/firefox-focus-variants.json`

| Firefox launch variant | ever focused | focused fraction | focus events |
|---|---|---|---|
| `-no-remote -profile <dir> -new-window <url>` (what every harness did) | **false** | 0.000 | 0 |
| `-no-remote -profile <dir> -private-window <url>` | **false** | 0.000 | 0 |
| `-profile <dir> -private-window <url>` | **false** | 0.000 | 0 |
| **`-private-window <url>` (default profile)** | **true** | 0.36–0.57 | 7–9 |

The first four rows are in that receipt. A separate probe
(`scripts/qa/tmp-lane-q-firefox-warm-profile.mjs`) additionally launched the SAME
`-profile` directory three times in a row — cold, then warmed, then warmed again —
and scored `everFocused: false, focusedFraction: 0.000` on all three. So it is not
a first-run effect that a warmed profile grows out of; it is the `-profile` flag
itself.

The fix is in `scripts/qa/installed-browser-lanes.mjs`: the Firefox lane now
drives the **default profile** with `-private-window`, is identified by process
ownership (the lane refuses to start if Firefox is already open, so every window
of that process is ours), and is torn down by `WM_CLOSE` first and a force-kill
only as a last resort.

### The Firefox number

Full matrix, Firefox 154, WebGPU, hardware adapter, **100% of every frame sample
holding document focus**, ceiling sampled in the same window in the same run:

| arena | Firefox fps | Firefox ceiling | Chrome fps | Chrome ceiling |
|---|---|---|---|---|
| atomic-acres | **76.9** | 166.7 | 38.2 | 178.6 |
| skyline-terminal | **90.9** | 166.7 | 38.0 | 175.4 |
| rustworks-1v1 | **111.1** | 166.7 | 50.0 | 178.6 |
| gun-range | **90.9** | 166.7 | 43.1 | 178.6 |
| high-seas | **111.1** | 166.7 | 52.1 | 178.6 |
| farcrysis | **90.9** | 166.7 | **did not boot** | — |

An earlier isolated single-arena run of the same instrument put Firefox at
**38.5 fps** on atomic-acres. Both numbers are real; the machine is noisy (see
below) and another lane was driving browsers during the earlier run. The claim
that survives every reading is the one that matters:

> **Firefox is at worst on par with Chrome and at best roughly double it. It is
> nowhere near 10 fps, and there is no 15x gap in any direction.**

Two caveats stated rather than buried:

- Firefox's frame times come back as whole milliseconds (13, 11, 9 ms) because
  the default profile keeps `privacy.reduceTimerPrecision` on and the lane cannot
  inject prefs into a profile it must not modify. So 90.9 fps means "11 ms ±0.5",
  i.e. 87–95 fps.
- Both numbers are **requestAnimationFrame cadence**, which is a callback rate,
  not a proof that both engines did equal GPU work per callback. Firefox coming
  out ahead of Chrome on a Chromium-first codebase is surprising enough that it
  deserves a follow-up that compares actual submitted work (GPU timestamp
  queries, or a pixel diff of the two outputs) before anyone acts on it. What it
  is *already* sufficient to do is kill the "Firefox is 15x slower" claim.

### Is Firefox vsync-capped or GPU-bound? Both questions answered.

The task asked specifically whether Firefox is capped at 60 by vsync. Measured,
with no game involved (`scripts/qa/measure-refresh-ceiling.mjs`):

| Browser | idle rAF | WebGL clear | 24 full-screen shader passes | vsync disabled |
|---|---|---|---|---|
| Chrome  | 60.2–61.0 fps | 60.2–62.1 fps | 59.9–61.0 fps | ~5000 fps (measurement floor) |
| Firefox | 62.7–63.2 fps | 60.4–62.3 fps | 60.4–62.5 fps | **1162.8 fps clear / 909.1 fps loaded** |

Two conclusions, and they matter separately:

1. **When both browsers read ~60, that is a vsync cap, not a performance
   ceiling.** With the limiter removed (`layout.frame_rate=0` for Firefox,
   `--disable-gpu-vsync --disable-frame-rate-limit` for Chromium) Firefox does
   **909 fps under a 24-pass full-screen fragment load**. Nothing about Gecko is
   slow on this machine.
2. **The game is not vsync-capped — it is workload-bound.** In-match Firefox runs
   77–111 fps against a 166.7 fps ceiling and Chrome 38–52 against 178.6. Both
   sit well under what the browser could present, so the limit is the scene, not
   the display. Note the direction: **Chrome is the one leaving the most of its
   ceiling unused.**

### The measurement-integrity finding behind "150+ vs 10"

**This desktop's presentation cadence is not stable.** The same window position
measured **60.2 fps** at one point in the session and **178.6 fps** an hour
later, with no configuration change by this lane. Windows reports the RTX 5080's
display at 59 Hz and the second 2560x1440 panel at 179 Hz.

So a bare frame-rate number from this machine is not comparable to another bare
frame-rate number from this machine, let alone across browsers on different
displays. **A cross-browser "150+ vs 10" comparison collected that way carries no
information.** Every number in the matrix below therefore ships with the
browser's own ceiling, sampled in the same window, in the same run, seconds
before the game number — that is now built into the probe page and cannot be
forgotten.

### Two ledger claims this measurement corrects

`docs/PASS74_OWNER_FEEDBACK_LEDGER_2026-08-21.md` → HF-331 currently records two
things that the measurement contradicts. Both should be struck.

1. **"Firefox has no WebGPU on this machine, so 49 Hz is its structural
   ceiling."** Firefox 154 *does* take the WebGPU route here, and the product
   agrees: `navigator.gpu` present, `adapterClass: "GPUAdapter"`,
   `deviceClass: "GPUDevice"`, `requestedBackend: "webgpu"`,
   `actualBackend: "webgpu"`, `softwareAdapter: false`, `failClosed: false`,
   `deviceLost: false`, `uncapturedErrors: 0`. Firefox is on the same renderer
   path as Chrome, not on the WebGL2 compat path.
   *Receipt:* `artifacts/qa/lane-q/smoke-firefox.json`.
2. **The "150+" half of "10 FPS vs 150+" is not an in-match number.** The ledger's
   own quiet-machine entry records "178 Hz menu, 73.9 Hz in-match" for Chromium.
   The 150-plus figure is the MENU. Measured in-match here, Chrome sits at
   43–57 fps and Firefox at 38.5. Comparing a Chrome menu number against a
   Firefox in-match number is most of the reported gap before any browser
   difference is involved.

Note also `adapterLabel: "WebGPU adapter info unavailable"` — **Firefox does not
expose WebGPU adapter identity**, so any GPU-tiering or telemetry that keys off
the adapter label gets nothing from Firefox players.

### One nuance that is fair to the original report: Firefox's tail is worse

Median is not the whole story, and the owner may well have been reacting to
something real. From the full matrix, the ratio of the p90-worst frame to the
median frame — how much the frame rate collapses in the roughest 10% of frames:

| arena | Chrome median → p90 | Firefox median → p90 |
|---|---|---|
| atomic-acres | 38.2 → 29.7 (78%) | 76.9 → 38.5 (**50%**) |
| skyline-terminal | 38.0 → 30.2 (79%) | 90.9 → 41.7 (**46%**) |
| rustworks-1v1 | 50.0 → 38.8 (78%) | 111.1 → 50.0 (**45%**) |
| gun-range | 43.1 → 33.9 (79%) | 90.9 → 45.5 (**50%**) |
| high-seas | 52.1 → 38.8 (74%) | 111.1 → 52.6 (**47%**) |
| farcrysis | did not boot | 90.9 → 35.7 (**39%**) |

**Chrome holds ~78% of its median in the rough tenth of frames; Firefox holds
~45%.** An isolated single-arena run measured Firefox's p99 at **13.7 fps**. So
Firefox delivers a higher average frame rate here and a visibly less even one,
and "it feels like about 10 FPS" is a fair description of a p99 hitch.

The honest version of HF-331 is therefore not "the report was imaginary". It is:
*the average is fine and better than Chrome's; the frame PACING has a long tail,
and that tail is a separate row that is now measurable.*

### And the number itself is noisy — one reading is not a comparison

Chrome, atomic-acres, WebGPU, five separate runs the same evening:
**38.2, 43.3, 43.9, 54.9, 57.5 fps** — a 50% spread with no build change between
them. Ceilings measured in the same windows ranged **60.2 → 181.8 fps**. Part of
that is other lanes sharing the machine, and part is the display cadence moving
under us.

So: **per-arena fps from this machine is a coarse signal.** The signals in the
table below that are actually stable and worth gating on are *which backend was
taken*, *whether the arena booted*, *console errors*, *HUD legibility*, and
*fps as a fraction of the ceiling measured in the same run*. A bare fps number
compared against a bare fps number from another day is worth nothing, and that is
exactly the comparison HF-331 was built on.

---

## 2. The honest table

Legend: **SKIPPED** = browser not installed (**never a pass** — it is an
uncovered browser). **UNMEASURED** = no number exists; never inferred.
CEILING = that browser's own presentation ceiling measured in the same window in
the same run. FOCUS = fraction of the frame sample that genuinely held
`document.hasFocus()`.

| browser | arena | backend | boot | status | fps (median) | ceiling | focus | errs | notes |
|---|---|---|---|---|---|---|---|---|---|
| Chrome 151 | atomic-acres | webgpu | boot OK | PASS | 38.2 | 178.6 | 100% | 0 | - |
| Chrome 151 | skyline-terminal | webgpu | boot OK | PASS | 38 | 175.4 | 100% | 0 | - |
| Chrome 151 | rustworks-1v1 | webgpu | boot OK | PASS | 50 | 178.6 | 100% | 0 | - |
| Chrome 151 | gun-range | webgpu | boot OK | FAIL | 43.1 | 178.6 | 100% | 1 | console-errors:1 |
| Chrome 151 | high-seas | webgpu | boot OK | PASS | 52.1 | 178.6 | 100% | 0 | - |
| Chrome 151 | farcrysis | UNMEASURED | no boot | FAIL | UNMEASURED | UNMEASURED | - | 0 | match-start-timeout |
| Edge | atomic-acres | webgpu | boot OK | PASS | 48.1 | 178.6 | 100% | 0 | - |
| Edge | skyline-terminal | webgpu | boot OK | PASS | 51.5 | 178.6 | 100% | 0 | - |
| Edge | rustworks-1v1 | webgpu | boot OK | PASS | 60.6 | 175.4 | 100% | 0 | - |
| Edge | gun-range | webgpu | boot OK | FAIL | 59.5 | 178.6 | 100% | 1 | console-errors:1 |
| Edge | high-seas | webgpu | boot OK | PASS | 54.6 | 178.6 | 100% | 0 | - |
| Edge | farcrysis | webgpu | boot OK | PASS | 37 | 178.6 | 100% | 0 | - |
| Firefox 154 | atomic-acres | webgpu | boot OK | PASS | 76.9 | 166.7 | 100% | 0 | - |
| Firefox 154 | skyline-terminal | webgpu | boot OK | PASS | 90.9 | 166.7 | 100% | 0 | - |
| Firefox 154 | rustworks-1v1 | webgpu | boot OK | PASS | 111.1 | 166.7 | 100% | 0 | - |
| Firefox 154 | gun-range | webgpu | boot OK | FAIL | 90.9 | 166.7 | 100% | 1 | console-errors:1 |
| Firefox 154 | high-seas | webgpu | boot OK | PASS | 111.1 | 166.7 | 100% | 0 | - |
| Firefox 154 | farcrysis | webgpu | boot OK | PASS | 90.9 | 166.7 | 100% | 0 | - |
| Opera | atomic-acres | UNMEASURED | no boot | SKIPPED | UNMEASURED | UNMEASURED | - | 0 | - |
| Opera | skyline-terminal | UNMEASURED | no boot | SKIPPED | UNMEASURED | UNMEASURED | - | 0 | - |
| Opera | rustworks-1v1 | UNMEASURED | no boot | SKIPPED | UNMEASURED | UNMEASURED | - | 0 | - |
| Opera | gun-range | UNMEASURED | no boot | SKIPPED | UNMEASURED | UNMEASURED | - | 0 | - |
| Opera | high-seas | UNMEASURED | no boot | SKIPPED | UNMEASURED | UNMEASURED | - | 0 | - |
| Opera | farcrysis | UNMEASURED | no boot | SKIPPED | UNMEASURED | UNMEASURED | - | 0 | - |
| WebKit (NOT Safari) | atomic-acres | webgl2 | boot OK | PASS | 9.6 | 62.5 | 100% | 0 | - |
| WebKit (NOT Safari) | skyline-terminal | webgl2 | boot OK | PASS | 9.3 | 58.8 | 100% | 0 | - |
| WebKit (NOT Safari) | rustworks-1v1 | webgl2 | boot OK | PASS | 9.8 | 58.8 | 100% | 0 | - |
| WebKit (NOT Safari) | gun-range | webgl2 | boot OK | PASS | 10.9 | 55.6 | 100% | 0 | - |
| WebKit (NOT Safari) | high-seas | webgl2 | boot OK | FAIL | 9.5 | 12.2 | 100% | 6 | console-errors:6 |
| WebKit (NOT Safari) | farcrysis | webgl2 | boot OK | PASS | 10.5 | 34.5 | 100% | 0 | - |
| Phone 390x844 | atomic-acres | webgl2 | boot OK | PASS | 30.4 | 60.6 | 100% | 0 | - |
| Phone 390x844 | skyline-terminal | webgl2 | boot OK | PASS | 30.3 | 59.9 | 100% | 0 | - |
| Phone 390x844 | rustworks-1v1 | webgl2 | boot OK | PASS | 36.5 | 60.6 | 100% | 0 | - |
| Phone 390x844 | gun-range | webgl2 | boot OK | PASS | 34.8 | 59.9 | 100% | 0 | - |
| Phone 390x844 | high-seas | webgl2 | boot OK | FAIL | 34.6 | 60.2 | 100% | 6 | console-errors:6 |
| Phone 390x844 | farcrysis | webgl2 | boot OK | PASS | 29.4 | 59.9 | 100% | 0 | - |
| Tablet 768x1024 | atomic-acres | webgl2 | boot OK | PASS | 35.5 | 60.6 | 100% | 0 | - |
| Tablet 768x1024 | skyline-terminal | webgl2 | boot OK | PASS | 33.8 | 59.2 | 100% | 0 | - |
| Tablet 768x1024 | rustworks-1v1 | webgl2 | boot OK | PASS | 36.4 | 59.9 | 100% | 0 | - |
| Tablet 768x1024 | gun-range | webgl2 | boot OK | PASS | 33.2 | 60.2 | 100% | 0 | - |
| Tablet 768x1024 | high-seas | webgl2 | boot OK | FAIL | 32.9 | 60.6 | 100% | 6 | console-errors:6 |
| Tablet 768x1024 | farcrysis | webgl2 | boot OK | PASS | 29.2 | 60.2 | 100% | 0 | - |

---

## 3. Safari / WebKit — what can and cannot be tested here

**Apple Safari cannot be tested on this machine at all.** Safari for Windows was
discontinued in 2012 at 5.1.7; no current Safari build exists for this OS, and no
emulator reproduces it. Any claim of a Safari result from `dave-gaming-pc` is
fabricated.

What the `webkit` lane actually runs is **Playwright 1.61.1's bundled WebKit
build for Windows**. It is the same engine family as Safari and it is worth
having — it is the only way to exercise WebKit's layout, JS and WebGL behaviour
here — but it is not Safari, and its own self-report actively invites the
mistake:

- It claims `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) … Version/26.5
  Safari/605.1.15` — **a macOS user agent on a Windows machine.**
- It claims WebGL `UNMASKED_RENDERER = "Apple GPU"`, vendor `"Apple Inc."` —
  **on an NVIDIA RTX 5080.**

Both strings are fictions of the test build. Treat every WebKit row as *"the
WebGL2 fallback path renders under a WebKit engine"* and nothing more.

| Question | Testable on this machine? |
|---|---|
| WebKit layout, CSS, JS semantics | **Yes** — Playwright WebKit lane. |
| The game's WebGL2 fallback path under WebKit | **Yes** — the lane has no `navigator.gpu`, so it exercises the fallback. |
| Safari's real frame rate / GPU behaviour | **No** — different build, different platform, different GPU stack. |
| Safari 26 WebGPU (Metal) | **No** — bundled WebKit exposes no `navigator.gpu` at all. |
| iOS Safari / iPadOS / WKWebView | **No** — requires an Apple device. |
| **Pointer Lock on iOS** | **No, and it does not exist**: iOS Safari has never shipped the Pointer Lock API, so mouse-look is structurally impossible on iPhone. Touch controls are not a convenience there, they are the only input path. iPadOS 13.4+ does support it with a trackpad. |
| Apple audio-autoplay / gesture policy | **No** — must be checked on a device. |

**To actually close the Safari row somebody needs a Mac and an iPhone.** That is
a hardware gap, not a QA gap, and it should be recorded as one rather than
papered over with a WebKit row.

---

## 4. Opera

**Opera is not installed on this machine.** Searched, and absent from:

```
%LOCALAPPDATA%/Programs/Opera/opera.exe        %LOCALAPPDATA%/Programs/Opera/launcher.exe
%LOCALAPPDATA%/Programs/Opera GX/opera.exe     C:/Program Files/Opera/opera.exe
C:/Program Files (x86)/Opera/opera.exe
```

A recursive search of `Program Files`, `Program Files (x86)`,
`AppData\Local` and `AppData\Roaming` for `opera.exe` returned nothing, and no
Opera entry exists in either uninstall registry hive.

The gate reports Opera as **SKIPPED**, prints *"SKIPPED IS NOT A PASS — this
browser is uncovered"*, and fails on it the moment anyone adds `--require opera`.
Installing software is outside this lane's remit, so the row stays open. Opera is
Chromium-based, so the Chrome and Edge rows are *evidence about the engine* — but
Opera ships its own GPU-blocklist and feature-flag deltas, and the row does not
close on inference.

---

## 5. Mobile

Instrument: Chromium device emulation on a desktop GPU. Layout, touch input and reachability are real; the frame rate is an upper bound no physical phone will reach, and iOS/Safari is not covered by this lane at all.

| viewport | verdict | visible controls | move stick | look stick | fire | jump | controls < 44px | offscreen | overlaps | match overflow-x |
|---|---|---|---|---|---|---|---|---|---|---|
| 390x844 | PASS | 16 | yes (7.67 m) | yes (1.6778 rad) | yes (30→26) | yes (0.849 m) | 0 | 0 | 0 | 0 |
| 768x1024 | PASS | 16 | yes (7.705 m) | yes (1.4989 rad) | yes (30→26) | yes (0.84 m) | 0 | 0 | 0 | 0 |


### What was actually driven

Real touch input (`Input.dispatchTouchEvent`, not synthesised mouse), against the
live `#mobile-touch-controls` overlay, read back out of the game's own state:

- **Move stick** — dragged to full deflection and held 1.4 s → camera moved
  **7.67 m** (phone) / **7.71 m** (tablet).
- **Look stick** — dragged and held → camera yaw turned **1.68 rad** / **1.50 rad**.
- **FIRE** — held 350 ms → ammo **30 → 26**.
- **JUMP** — tapped → camera rose **0.85 m** / **0.84 m**.

**The game is playable with touch at both sizes.** That is a stronger claim than
the mobile row has been able to make before, and it is the claim the row needed.

### Reachability

- **16 visible controls** at both viewports, **none** below the 44 CSS px minimum
  touch target (two 108x108 sticks, fourteen 48x48 buttons, pause 52x48).
- **Zero** controls outside the viewport, **zero** overlapping control pairs.
- **Zero** horizontal overflow, in the menu and in match, at both sizes.
- 150 interactive menu controls, none under 44 px tall, none off-screen.

### What this lane got wrong first, and how

The first run of this probe reported *"move stick does not move the player (0 m),
look stick does not turn camera (0 rad)"* — a headline mobile-is-broken result.
**It was my bug.** The camera lives at
`snapshot().deterministicReview.captureCamera`, not at the top level; reading the
wrong path returned `null`, and `null` was being folded into a delta of `0`. A
missing reading was silently becoming a measurement of zero — the exact failure
mode this whole lane exists to stamp out, reproduced by the lane itself.

Fixed two ways: the correct path, and an unreadable camera now reports
`UNMEASURED(camera-unreadable)` instead of `0`. Worth recording because the false
version was one paste away from becoming "touch controls are broken on mobile".

### Frame rate on mobile, with the caveat attached

The phone and tablet lanes take the **WebGL2** path (Chromium device emulation
exposes no WebGPU) and run **29–37 fps** against a **~60 fps** ceiling. That is a
desktop RTX 5080 rendering at a phone's viewport: **it is an upper bound no real
handset will come near**, and it should never be quoted as a phone frame rate.

`high-seas` throws six WebGL2 shader-validation errors on this path in every
browser that takes it — see Q-6. Since the WebGL2 path *is* the mobile path, that
finding matters more for phones than for anything else in this report.

### Not covered by these lanes

- **iOS has no Pointer Lock API at all**, so mouse-look is structurally impossible
  on iPhone and the touch overlay is not a convenience there but the only input
  path. iPadOS 13.4+ does support it with a trackpad.
- Real device thermals, memory limits, and GPU class.
- Safari's audio/gesture policies.

---

## 6. The standing gate

`npm run qa:cross-browser` — one command, whole matrix, fails closed.

```
scripts/qa/run-cross-browser-gate.mjs      the gate: three stages, one exit code
scripts/qa/run-with-dev-server.mjs         guarantees a dev server (reuses one if up)
scripts/qa/measure-refresh-ceiling.mjs     stage 1: each browser's presentation ceiling
scripts/qa/verify-cross-browser-matrix.mjs stage 2: browser x arena x backend x boot x fps
scripts/qa/verify-mobile-touch-playability.mjs stage 3: phone + tablet, and does touch play
scripts/qa/cross-browser-probe.html        the one instrument every lane loads
scripts/qa/installed-browser-lanes.mjs     launch/foreground/teardown discipline, shared
scripts/qa/win-foreground.ps1              takes the Windows foreground and PROVES it
scripts/qa/cross-browser-gate-contract.mjs      the verdict rule, as a pure function
scripts/qa/cross-browser-gate-contract.test.mjs its unit tests - no browser needed
```

Also wired: `qa:cross-browser:matrix`, `qa:cross-browser:ceiling`,
`qa:cross-browser:mobile` for running one stage alone, and
`qa:cross-browser:contract` for the verdict-rule unit tests (no browser, under a
second).

Re-running one lane or one arena, which is what you want while chasing a single
red cell:

```
node scripts/qa/verify-cross-browser-matrix.mjs --lanes firefox --arenas high-seas
node scripts/qa/measure-refresh-ceiling.mjs --browsers firefox --uncap
```

Operating notes that are easy to get wrong:

- **The full matrix takes roughly two hours.** The receipt is written after every
  lane, not only at the end, and a partial receipt is stamped
  `"complete": false` with `lanesNeverRun` listed — it can never be read as a
  finished sweep.
- **`--arena-timeout` must stay above ~300 s.** The probe page itself budgets up
  to 180 s for bootstrap plus three 60 s deploy attempts, so a shorter harness
  timeout cuts arenas off mid-answer and truncates the lane. Measured: at 240 s
  the Chrome lane silently lost `high-seas` because `farcrysis` was still working
  through its retries. Default is now 420 s.
- **Do not edit `package.json` while a run is in flight.** Vite restarts the dev
  server on that file, the in-flight page loses its module graph, and the lane
  reports a bootstrap timeout that looks like a browser fault. Cost this lane one
  wasted run.
- **`farcrysis` last.** It is by far the slowest arena to deploy, so putting it at
  the end of `--arenas` means a stall there costs only itself.

### What makes it fail closed

Four verdicts, and they are not interchangeable:

| Verdict | Meaning | Counts as pass? |
|---|---|---|
| `pass` | Measured, every check held. | yes |
| `fail` | Measured, something did not hold. | no |
| `not-installed` → printed **SKIPPED** | Browser absent from this machine. | **no** — coverage hole |
| `blocked` | Lane could not be measured at all (no foreground; the human already had that browser open). | **no** — nothing was measured |

The overall verdict is PASS only when no lane failed, **no lane was blocked**,
and every `--require` lane was actually measured. A frame rate sampled with less
than half its frames holding focus is a failure, not a slow number.

### Worked example: the gate refusing a number it was handed

This is not theoretical. In the full run, the Edge lane reported
**178.6 fps** on atomic-acres — the best number in the whole matrix, on the
correct backend, with a healthy adapter and zero console errors. The gate marked
it **FAIL**, because the same payload carried `focusedFraction: 0`: every frame
in that sample was taken with `document.hasFocus() === false`, so what was being
measured was the empty rAF cadence of a window the game had stopped drawing into.
The five remaining arenas came back `blocked`, not `pass`.

The cause was a *second lane* on this machine (`capture-lane-l-art-direction.mjs`)
taking the Windows foreground back between this harness's attempts — the harness
held the foreground for only 15% of that run. Re-run in isolation, Edge boots all
six arenas cleanly at 48–61 fps.

**A number that good, on the right backend, with no errors, is exactly the number
a cross-browser report gets fooled by.** That is the whole reason focus fraction
travels with every measurement now.

The harness now detects competing browser automation at startup, warns, and
records it in the receipt as `competingBrowserAutomation`, because the failure it
causes is indistinguishable from a browser fault.

### Instrument decisions, and the dead ends they avoid

- **The page measures itself.** Playwright's bundled Firefox hangs in `launch()`
  on this machine even idle, and stock Firefox and Opera cannot be puppeteered at
  all. Any reach-in driver is a dead instrument for half the matrix. The probe
  POSTs to a loopback receiver as `text/plain`, which keeps it a CORS *simple
  request* — a JSON content-type triggers a preflight and the preflight is what
  broke the reporting endpoint in an earlier attempt.
- **Foreground is verified, not requested.** `win-foreground.ps1` attaches to the
  current foreground thread's input queue (Windows refuses
  `SetForegroundWindow` from a process that does not already own the foreground),
  then re-reads `GetForegroundWindow()` and reports whether the window is
  actually ours. It is re-taken every 5 s for the whole run, because focus gets
  stolen back mid-sample.
- **Never kill the spawned pid.** Several of these browsers ship a launcher stub
  that exits immediately and orphans the real windows — a `taskkill` on the pid
  reports success and leaves a browser running. Cleanup matches the unique
  temp-profile token in the command line instead.
- **Never force-kill Firefox.** It increments Firefox's startup-crash counter,
  and three of those turn the *next* launch into an "Open Firefox in Troubleshoot
  Mode?" modal that swallows the URL — so an impatient teardown breaks the run
  after it, and the failure gets blamed on the browser. `closeGracefully()` sends
  `WM_CLOSE` and waits.
- **Do not identify the window by title.** `src/bootstrap.ts` rewrites
  `document.title` once the app boots, so a title match silently stops matching
  part-way through every run.
- **A per-arena timeout, not just a per-lane one.** One wedged arena used to
  report six.

---

## 7. Product findings (no `src/` file was edited by this lane)

**Q-1 — the foreground gate is strict enough to be a cross-browser hazard.**
Rendering stops entirely unless `document.hasFocus()` is true. That is defensible
for a shooter, but it means any browser or launch path where focus behaves
unusually presents as a catastrophic performance defect rather than as a paused
game. HF-331 cost weeks to exactly this ambiguity. Worth considering: a visible
"click to resume" state when focus is absent, so the difference between *paused*
and *broken* is legible to a player — and to QA.
*Evidence:* `src/legacy-main.ts` `ownsForeground()` in the match-admission
cadence; `artifacts/qa/lane-q/firefox-focus-variants.json`.

**Q-2 — Firefox sanitises the WebGL renderer string.** Firefox 154 reports
`UNMASKED_RENDERER = "ANGLE (NVIDIA, NVIDIA GeForce GTX 980 …), or similar"` on
an RTX 5080. Any telemetry or GPU-tiering logic that reads that string will
mis-tier every Firefox player. Not a bug this lane hit, but a trap sitting in the
open.
*Evidence:* `artifacts/qa/lane-q/ceiling-firefox-defaultprofile.json` → `adapter.unmaskedRenderer`.

**Q-3 — `GodraysNode` throws on the WebGPU route when the shaft light has no
shadow map.** Console error captured live in the matrix (Chrome 151, WebGPU,
Gun Range):

```
THREE.TSL: TypeError: Cannot read properties of null (reading 'depthTexture')
  three_addons_tsl_display_GodraysNode__js.js:305
```

The only `.depthTexture` reads in `three/addons/tsl/display/GodraysNode.js` are
`this._light.shadow.map.depthTexture` (two of them, in the point-light and
directional-light branches), so `light.shadow.map` was **null** — the shaft
light had no allocated shadow map at the moment the node ran. The wire-up point
is `src/rendering/screen-space-post.ts:264`:

```ts
if (runtime.godrays.enabled && sources.volumetricLight) {
  const node = godrays(sources.sceneDepth, sources.camera, sources.volumetricLight);
```

The guard checks that a volumetric light *exists*, not that its shadow map has
been allocated. `three@0.185.1`. This lane cannot edit `src/`, so it is reported
rather than fixed.

**Q-5 — `farcrysis` does not deploy in Chrome on the WebGPU route.** The match
never leaves `warmup`; the app's own status line says why:

```
Deployment preparation failed: WebGPU queue completion exceeded 4000 ms
for submission 669. Retry to build fresh assets.
```

Focus was true and the window visible for the whole attempt, so this is not the
HF-331 shape — it is a real WebGPU queue stall. **Cross-browser evidence makes it
Chrome-specific rather than arena-specific: the same arena, same build, same
minute, boots in Edge (37 fps) and Firefox (90.9 fps).** It is also intermittent —
an earlier run today booted farcrysis in Chrome at 33.7 fps — so it is a race, not
a hard break. Given Chrome is the primary browser, this is the most player-facing
fault in this report.

**Q-6 — `high-seas` fails shader validation on the WebGL2 fallback path, in every
browser that takes it.** Six console errors per boot, identically in the WebKit,
phone and tablet lanes:

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
THREE.WebGLProgram: Shader Error 1282 - VALIDATE_STATUS false   (x5)
```

GL 1282 is `INVALID_OPERATION`. The arena still reaches an active match and still
renders, so this is not a boot failure — but a program that fails validation is a
program whose output is undefined, and **the WebGL2 path is exactly the path
phones and Safari take**. High Seas is the newest arena and the only one that
does this; the WebGPU lanes (Chrome, Edge, Firefox) are clean on it.

**Q-4 (harness, not product, but it changes how the row reads) — Edge dragged
the machine account's synced profile into a disposable `--user-data-dir`.**
A fresh-profile Edge signed itself into the "Personal" profile, restored that
session and its extensions, and opened the QA URL as a **background tab** —
window title `Help – Dark Reader and 1 more page - Personal - Microsoft Edge`,
probe reporting `visibilityState: "hidden"` for the entire run. A hidden tab
gets no `requestAnimationFrame`, so the game renders nothing, so Edge read as a
browser that cannot run the game. Fixed in the lane with `--inprivate
--disable-sync --disable-extensions --disable-features=msImplicitSignin,msEdgeFre`;
Edge then measured 44.2 fps on WebGPU with 100% focus and zero console errors.

Worth noting because it is the same class of fault as HF-331 and it was live in
the tree today: **on this machine, three separate browsers each had their own way
of never putting the page in front, and each one presents as a catastrophic
performance defect.** Any future cross-browser number that does not publish its
focus/visibility fraction next to it should not be believed.

---

## 8. What is still not covered

| Gap | Why | What would close it |
|---|---|---|
| Apple Safari (macOS) | No Safari build exists for Windows. | A Mac. |
| iOS / iPadOS Safari | Requires the device. | An iPhone and an iPad. |
| Opera | Not installed on this machine. | Install Opera, then `--require opera`. |
| Real handset performance | The mobile lanes are Chromium device emulation on a desktop GPU. Layout, touch and reachability are real; the frame rate is an upper bound no phone will reach. | A physical Android device. |
| Multiplayer across browsers | This lane measures solo boot and frame rate only. | A two-browser session matrix (HF-325's row). |
| Whether Firefox and Chrome do equal GPU work per frame | The matrix compares requestAnimationFrame cadence, which is a callback rate. Firefox coming out ahead of Chrome deserves confirmation before anyone acts on it. | GPU timestamp queries, or a pixel diff of the two outputs on one arena. |
| A quiet machine | Other lanes were driving browsers throughout. The gate now detects and records this, but it still costs measurement precision, and it blocked the Edge lane outright once. | Run the gate when nothing else on this PC is driving a browser. |

### Receipts

```
artifacts/qa/lane-q/cross-browser-matrix-merged.json   the table in section 2
artifacts/qa/lane-q/cross-browser-matrix-full.json     the full sweep as run
artifacts/qa/lane-q/matrix-edge-rerun.json             Edge, re-run in isolation
artifacts/qa/lane-q/mobile-touch-playability.json      section 5
artifacts/qa/lane-q/firefox-focus-variants.json        the HF-331 root-cause bisect
artifacts/qa/lane-q/ceiling-vsync.json                 presentation ceilings
artifacts/qa/lane-q/ceiling-uncapped.json              the same with vsync off
artifacts/qa/lane-q/gate-failclosed-demo/              the gate exiting 1 on a required, uninstalled browser
```
