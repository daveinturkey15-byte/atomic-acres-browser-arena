# PASS 95 - frame hitches lane (HF-509)

Lane: Claude Opus 5. Branch `contrib/dave-gaming-pc/claude/v7-frame-hitches`,
worktree `C:/Users/david/projects/aa-v-frame-hitches`, cut from
`origin/contrib/dave-gaming-pc/claude/pass93-candidate` at candidate 7
`452d7aba27ae2cf8ed793cc58d2fb03a6906fa4c`. Assigned browser port 4254.
Time box 120 minutes.

Owner, HF-509, on candidate 7: "still had a few problems with freezing ...
there's definitely still some sort of lagging and chopping" in Nuke Town with
bots.

Claim-state convention: `[VERIFIED]` = this lane ran it and quotes the output.
`[MEASURED]` = numbers from an instrument this lane ran. `[OPEN]` = not proven.

## What this lane delivered, and what it did not

`[VERIFIED]` DELIVERED: a reusable long-frame attributor,
`scripts/qa/frame-hitch-attributor.mjs`, wired as `npm run qa:hitches`, plus
the first measured attribution of candidate 7's long frames in a live Nuke Town
bot match (below).

`[OPEN]` NOT DELIVERED: the owner's freezes are not fixed. The measurement says
the top cause is **not** where the previous perf lanes were working (main-thread
matrix recompose, arm IK, wear-graph node updates, HUD style recalculation), so
no fix from the candidate-7 backlog was applied on faith inside the remaining
box. The concrete next fixes and the evidence that points at them are named at
the end. Nothing was widened, skipped, weakened or disabled to reach this state.

## Method

`[VERIFIED]` `scripts/qa/frame-hitch-attributor.mjs`, headless installed Chrome
(`channel: 'chrome'`), `PASS73_NATIVE_WEBGPU=1`, stock flags plus
`--mute-audio` and an off-screen `--window-position=-4000,-4000`, one browser,
hard kill at 235 s, port 4254, `dist` from `npm run build` on this head served
locally, 2560x1440, graphics profile HIGH as resolved on this machine
(`graphicsPreset: high`, `renderBackend: webgpu`), arena `nuketown2`,
`selectArena` then `startSolo`, bots live and **not** frozen (`bots: 4` at the
end of the sample), the player walking a five-station route with a continuous
yaw sweep so the sample contains bot spawn, animation, weapon fire, HUD churn
and minimap movement rather than a static pose. 90 s of sampling.

Three independent instruments, all installed before page script:

1. A rAF sampler recording, per frame: the frame interval, the JS task cost of
   that frame (a `MessageChannel` continuation that runs after every rAF
   callback in the same task, so `jsMs` is the frame's whole JS task and not
   just our own callback), the JS heap, and the delta of every counter below.
2. Prototype hooks that measure the wall time spent **inside** the call, so the
   cost is attributed rather than inferred: `createRenderPipeline` /
   `createShaderModule` (pipeline and shader compile), `createBuffer` /
   `createTexture` (GPU allocation), `queue.writeBuffer` / `writeTexture` /
   `copyExternalImageToTexture` (geometry and texture upload, bytes and ms),
   `draw*` (draws and triangles), 2D canvas operations (minimap redraw),
   `getComputedStyle` / `getBoundingClientRect` / `offset*` (forced synchronous
   style and layout out of the HUD), `decodeAudioData` and voice start, and a
   `PerformanceObserver` on `longtask`.
3. A CDP trace (`devtools.timeline` + `blink.user_timing`) so the renderer's
   own style recalculation, layout, paint, GC, image decode and GPU task are
   attributed by the browser rather than guessed. Trace time is aligned to
   `performance.now()` through a user-timing mark the sampler emits, so each
   trace event is charged to an exact frame. `traceAligned: true`, 3,764 trace
   events retained in the run below.

Raw evidence: `before.json` (every hitch frame with its causes and counters),
`before.md` (the generated tables), `before-final.png`.

Harness honesty: the run uses `--disable-gpu-vsync --disable-frame-rate-limit`,
so the numbers are frame COST, not a vsync cap, and a stall waiting on
presentation is real GPU back-pressure rather than a missed vblank. Zero page
console errors and zero page errors were recorded during the sample.

## `[MEASURED]` Candidate 7, nuketown2, 4 live bots, 90 s, 2560x1440 HIGH

| metric | value |
|---|---:|
| frames sampled | 3,751 |
| mean fps | 41.7 |
| p50 frame ms | 23.2 |
| p95 frame ms | 32.9 |
| p99 frame ms | 40.3 |
| p99.9 frame ms | 65.5 |
| max frame ms | 116.6 |
| hitches >= 50 ms | 11 |
| frames >= 100 ms | 1 |
| frames >= 33.4 ms | 169 (4.5%) |
| hitch time total ms | 718.6 |
| long tasks | 9, total 588 ms, worst 99 ms |
| cold deploy to active | 89,319 ms |

Read against the candidate-7 report's own perf rung (spawn pose, bots frozen,
p50 11.5 ms / p99 31.4 ms): **with four live bots and a moving player the same
build runs at 23.2 ms p50 and 40.3 ms p99.** The owner's "lagging and chopping"
is therefore two separate things, and only the instrument separates them: a
roughly doubled steady-state frame cost once bots are actually fighting, and a
small number of much longer frames on top of it.

## `[MEASURED]` Attribution of the 11 frames at or over 50 ms

| cause | count | total ms | worst ms |
|---|---:|---:|---:|
| unattributed-present (frame time outside the JS task and outside every hooked API) | 7 | 368.6 | 66.9 |
| gpu-task (browser trace) | 2 | 44.1 | 32.5 |
| style-recalculation (browser trace) | 2 | 9.7 | 7.6 |
| paint (browser trace) | 1 | 4.1 | 4.1 |
| forced-layout-read (`getBoundingClientRect` / `offset*`) | 1 | 2.2 | 2.2 |
| gpu-buffer-upload (`queue.writeBuffer`) | 1 | 1.6 | 1.6 |
| pipeline-shader-compile (`createRenderPipeline` / `createShaderModule`) | 3 | 0.5 | 0.3 |

The per-frame rows behind that table (`before.json`, `hitchFrames`):

| frame | frame ms | JS ms | heap delta MB | charged causes |
|---:|---:|---:|---:|---|
| 121 | 55.5 | 7.2 | +6.7 | style-recalculation 7.6, gpu-task 11.6, paint 4.1 |
| 208 | 64.6 | 2.4 | -18.6 | gpu-task 32.5, style-recalculation 2.1 |
| 719 | 65.5 | 2.3 | +12.1 | pipeline/shader compile 0.1 (2 modules) |
| 1445 | 55.2 | 4.7 | +3.9 | present 50.5 |
| 1446 | 70.2 | 23.9 | -91.1 | present 46.3 |
| 1447 | 52.8 | 4.0 | +6.2 | present 48.8 |
| 1607 | 56.7 | 3.4 | +4.7 | present 53.3 |
| 1723 | 116.6 | 7.2 | +22.9 | 957 `writeBuffer` calls in one frame, forced layout 2.2 |
| 1900 | 56.2 | 3.6 | +4.3 | present 52.6 |
| 3361 | 71.2 | 4.3 | +6.1 | present 66.9 |
| 3364 | 54.1 | 3.9 | -37.2 | present 50.2 |

The load-bearing reading: **in ten of the eleven long frames the JS task is
2.3-7.2 ms.** The main thread is not what makes these frames long. Seven of
them are the renderer blocked outside JS and outside every hooked API - GPU
back-pressure at presentation - and two more are charged directly to the
browser's own `GPUTask`. This contradicts the working assumption the previous
three perf lanes optimised against, all of which are main-thread JS. Those
lanes' fixes were real and their numbers stand; they were simply not aimed at
the frames the owner sees.

## `[MEASURED]` Whole-sample per-frame census - where the GPU work comes from

Cumulative counters over the same 3,751 frames, divided by frames:

| instrument | total over 90 s | per frame |
|---|---:|---:|
| `GPUQueue.submit` | 98,353 | **26.2** |
| `beginRenderPass` | 95,426 | **25.4** |
| `GPUQueue.writeBuffer` | 1,246,396 | **332.3** |
| `writeBuffer` bytes | 1.63 GB | ~330 kB |
| `writeBuffer` ms (inside the call) | 3,185.3 | 0.85 |
| draws | 541,309 | 144.3 |
| `writeTexture` | 11,975 | 3.2 |
| `createBuffer` | 5,029 | 1.3 |
| 2D canvas operations (minimap) | 33,923 | 9.0 |
| forced layout reads | 3,443 | 0.9 |

Two numbers stand out and neither has been reported before in this pass:

1. **26 queue submits and 25 render passes per frame.** One submit per pass is
   a driver round trip per pass; a 25-pass frame is the direct suspect for the
   seven `unattributed-present` hitches and the two `GPUTask` hitches.
2. **332 `writeBuffer` calls per frame** (worst measured frame: 957, and that
   worst frame is the 116.6 ms maximum of the whole sample), 0.85 ms of CPU per
   frame inside the call alone, plus the driver-side cost that lands on the GPU
   timeline rather than in this counter.

`[MEASURED]` Allocation rate: individual frames move the JS heap by +4 to
+23 MB and the sample contains collections of -18.6, -37.2 and -91.1 MB. The
-91.1 MB collection lands on frame 1446, in the middle of the 1445/1446/1447
present-stall triple. `[OPEN]` Whether that collection causes the triple or
merely coincides with it is not proven by this run.

`[MEASURED]` In-combat pipeline creation stayed at the tripwire's expected
shape: the compile charges in the hitch table are 2-4 shader modules totalling
0.1-0.3 ms, not a compile storm. The in-combat pipeline tripwire was neither
touched nor tripped by this lane.

## `[VERIFIED]` Gates

`npx tsc --noEmit`: exit 0, no output.

Named gates:

```text
npx vitest run src/pipeline-metrics.test.ts src/graphics-profile-contract.test.ts \
  src/legacy-main-size-ratchet.test.ts src/nuketown2-pipeline-budget.test.ts
 Test Files  4 passed (4)
      Tests  28 passed (28)

npx vitest run src/rendering/cold-session-precompile-reach.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Full suite, under the machine heavy-work lock:

```text
npx vitest run
 Test Files  1 failed | 620 passed | 1 skipped (622)
      Tests  1 failed | 6242 passed | 2 skipped (6245)
 FAIL src/audio-music-rotation-runtime.test.ts > HF-430 runtime: the shipped
   ArenaAudio rotates the chiptune roster > plays all ten tracks before
   repeating any of them, in the runtime
 Error: Test timed out in 20000ms.
```

`[VERIFIED]` That one failure is load flake, not a regression: rerun alone on
the same head it is green, and its own body takes 32.4 s of test time, which
cannot fit a 20,000 ms per-test timeout while 621 other files share the box.
The timeout was NOT raised.

```text
npx vitest run src/audio-music-rotation-runtime.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  35.59s (... tests 32.43s ...)
```

`npm run build`: exit 0, `dist` emitted and served for the measurement above.

No timeout, threshold, fence, budget or assertion was changed to obtain any of
these results. `src/legacy-main.ts` is untouched by this lane and sits at
37,396 lines, exactly on the ratchet ceiling.

## `[OPEN]` The fixes this measurement points at, in measured order

Stated as next work with falsifiers, not as claims. Each is a source fix; none
is a budget change.

1. **Collapse the 25 render passes / 26 submits per frame.** Seven of eleven
   hitches and 368.6 of the 718.6 hitch milliseconds are the renderer blocked
   outside JS; two more are the browser's own `GPUTask`. Read the post chain
   and the shadow/probe path for passes that submit individually and for passes
   that need not run every frame at HIGH, and batch encoder work into one
   submit per frame where three's WebGPU backend allows it. Falsifier: rerun
   `npm run qa:hitches` on the same route; `submits`/frame and `passes`/frame
   must fall and the `unattributed-present` row must shrink. If that row does
   not shrink, the stall is elsewhere and this fix is wrong.
2. **Cut the 332 `writeBuffer` calls per frame** (worst frame 957, which is the
   116.6 ms maximum of the sample). This is the per-object uniform upload path
   over a scene the earlier lanes measured at 10.6k nodes / 2.2k auto-updating.
   Falsifier: `writeBuffer`/frame falls and a frame with three times the median
   upload count stops appearing in a 90 s sample.
3. **Per-frame allocation.** +4 to +23 MB of heap per frame with -91 MB
   collections inside the sample. Falsifier: `heapDeltaMb` on hitch frames
   drops toward zero and no collection larger than the frame budget appears in
   a 90 s sample.
4. **HUD style recalculation is still visible in the tail** - 7.6 ms in one
   hitch frame despite the pass-94 7.2 to 1.5 ms work, plus 0.9 forced layout
   reads per frame. Smaller than 1-3, named so it is not lost.
5. `[OPEN]` **Cold deploy measured 89,319 ms** in this harness on this build
   (candidate 7's own report measured 24,065.5 ms cold transition on its
   route). This lane did not investigate the difference; it is recorded because
   it was measured, and because it is the other thing a player experiences as
   the game freezing.

## `[OPEN]` Honest limits of this lane

- There is no "after" table. No fix was landed, so there is nothing to compare;
  publishing a second run of the same build as an "after" would be dishonest.
  The attributor is committed precisely so the next lane's after-run is the
  same script on the same route: `npm run qa:hitches -- --dist dist --label
  after --port <yours> --arena nuketown2 --seconds 90 --out-dir
  docs/evidence/pass95/frame-hitches`.
- The 11-hitch sample is one 90 s run on a machine that also runs ComfyUI. GPU
  load was not sampled per run in this box.
- `unattributed-present` is a residual, not a positive identification: it means
  the frame time was not inside the JS task and not inside any hooked API. The
  two independent `GPUTask` charges from the browser's own trace are what make
  the GPU reading more than a guess.
