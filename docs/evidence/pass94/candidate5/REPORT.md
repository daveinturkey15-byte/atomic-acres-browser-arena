# PASS 94 - HITL candidate 5 (integration)

Worktree C:/Users/david/projects/aa-claude-hitl, branch
contrib/dave-gaming-pc/claude/pass93-candidate, base bc7868ae (candidate 4b).
Served on http://127.0.0.1:4300 from dist the same way 4b was
(`vite preview --outDir dist --host 0.0.0.0 --port 4300 --strictPort`).
Integrator: Claude Fable 5.1 (high), 2026-09-04 17:50-18:50. The 45-minute box
was overrun by the browser gates; every gate below was still run, none cut.
NOT published - HITL before publish is a standing rule.

Owner verdict driving it - ledger HF-491, after playing HITL 4: FPS bad, sound
bad, no bots in Solo, minimap cluttered, map not true to BO2 Nuketown, cluttered.
Seven lanes fixed those in parallel; this candidate merges them into one build.

Claim-states: **VERIFIED** = a gate or instrument in this worktree produced the
number quoted. **OBSERVED** = I read the file or capture. **INFERRED** =
judgement. **OPEN** = not settled, falsifier stated.

## Merges, in order

| # | Lane | Head merged | Conflicts | Resolution |
| --- | --- | --- | --- | --- |
| 1 | nuketown2-bo2-accuracy | a1219fe8 | 1 file, 1 hunk | 1 below |
| 2 | nuketown2-look | df9cabdc | clean | - |
| 3 | layout-hitl5 | 04d2ef43 | 1 file, 2 hunks | 2 below |
| 4 | bots-hitl5 | 535319e1 (the bot-count commit had landed after the brief; taken as instructed) | clean | - |
| 5 | minimap-declutter | 10baf2cc | clean | rules re-pointed, 4 below |
| 6 | perf-hitl5 | 145d33c5 | 2 files, 3 hunks | 3 below |
| 7 | audio-regression | 246b2fd2 | clean | probe + report only, no behaviour |

Left OUT as briefed: nuke-event, thin-metal-perforation, sound-design,
r185-techniques. Nothing from those branches is in this build.

### Conflict resolutions (toward the lane that owns the file, reading its REPORT)

1. **accuracy @ a1219fe8 vs 4b's material registry.** The lane's two Muse
   fixes: the derived third-house `nearX = head.closedX - 2.7` (auto-merged
   with its fidelity assertion) and ONE canonical appliance blue,
   `NUKETOWN2_APPLIANCE_BLUE = 0x2f5f92` in nuketown2-layout.ts. 4b had moved
   the inline colour block into `createNuketown2MaterialRegistry()`, so the
   lane's inline hunk is dropped and the unification lands where the colour now
   lives: the registry's `applianceBlue` role reads `NUKETOWN2_APPLIANCE_BLUE`
   (was the literal 0x46809f), and the techniques-lane hob in
   nuketown2-yard-props.ts reads the same constant instead of its own 0x2f5f92
   literal - the "techniques-lane follow-up" the lane's own REPORT asked for.
2. **layout @ 04d2ef43 vs 4b's appliance-bank dedupe.** Hunk 1 (the verge
   furniture line): the lane's version verbatim - 11 paired emitters deleted;
   4b's hydrant-relocation note is moot once the hydrant is deleted. Hunk 2: the
   lane, based on accuracy-2, re-authored the dressing-only appliance bank that
   4b had already deduplicated onto the techniques-lane prop, so the merge keeps
   4b's "not authored here" note and takes the lane's deletions of the entry
   urn/shrub and front planter/soil. The lane's new "load-bearing pieces
   survive" assertion named `verge appliance cabinet`; the bank that ships is
   `nuketown2 <half> lawn appliance bank cabinet`, so the assertion is re-pointed
   at the prop that ships - same falsifier, right name.
3. **perf @ 145d33c5 vs HF-477's two street cars.** The lane merged the forged
   vehicles into one draw per material against a base that still had the single
   head car. Resolved: the saloon and classic material sets take the shared
   bucket set like every other body (5 paint/accent pairs over ONE shared set),
   and the mirror gate reads the lane's `audit.skins` (baked world-space
   centres) while keeping 4b's street-car assertions - skins >= 7 (coach, cab,
   bogie, two street cars, two driveway cars), each street car's box at
   `hx(seat)` with its skin on it. 49/49 in nuketown2-fidelity + vehicle-forge.
4. **minimap @ 10baf2cc vs HF-477's names.** The lane's nuketown2 rules were
   written against candidate-4 names: the road bodies are now
   `nuketown2 carriageway stem / turning head / head kerb island ...` and the
   head car is retired for `stem saloon` / `stem classic`. The rules admit those
   names (older `street ...` spellings kept), the vehicle macro set becomes 6
   (coach, truck, saloon, classic, two driveway cars) and the derived ceiling
   12. Measured by the lane's own gate: nuketown2 300 -> at most 12 elements.

## Fixes in the merge

- **(a) Garage wing bright red** (4b garage.png). `garageSiding` wore
  `createNuketown2GarageWallMaterial` - the coral board-course graph authored
  for an INTERIOR wall. It now wears the registry's cream siding role
  (`forged.sidingB`, 0xeae3cf - the cream HF-426/HF-477 specify for the ground
  storey and the white house). No new hex; one fewer graph on the cold path.
  VERIFIED in this candidate's garage.png: cream lap siding on every face.
- **(b) Navy saloon lilacs.** `createForgePaintMaterial` scaled every channel
  so the peak reached 0.1 linear; the navy 0x27394f (peak 0.08) was the first
  body low enough to trip it. The lift is removed; dark paint ships its authored
  albedo, the 0.08 `specularIntensity` stays as the lilac defence, light/mid
  paints are unaffected (the lift was a no-op above a 0.1 peak). File header
  updated. **BUT SEE OPEN 1** - the capture shows the lift was not the cause.
- **(c) browser-visibility-contract RED.** scripts/pass94/capture-operator-looks.mjs
  launched headless but unmuted and parked on monitor 2 (`2560,0`). It now
  carries the stock gate's flags (`--mute-audio`, the three backgrounding
  disables, `--window-position=-32000,-32000`, `--window-size=2640,1520`). The
  contract test was not touched: 10/11 before, 11/11 after.
- **(d) audio-music-rotation-runtime.** Timeout left at 20 s. Full suite:
  timed out at 21.8 s under load. Alone: 8/8 passed in 16.02 s. The same flake
  4b recorded (16.4 s alone); not a candidate defect.
- **Node-material FLOOR re-pinned 80 -> 60** in nuketown2-pipeline-budget.test.ts,
  history written into the test. The floor guards against an EMPTY material
  layer; the perf lane's forge dedupe (45 -> 17 materials) plus (a) put the
  arena at 68, under a floor set when it measured 96. The distinct-graph BUDGET
  (54) is untouched and green. Recorded as a contract change with its evidence.
- **Bot probe launcher fixed forward.** scripts/qa/pass94-bot-presence-probe.mjs
  launched bundled Chromium with `--enable-unsafe-swiftshader`, which offers no
  WebGPU adapter on this machine (the lane recorded exactly that). It now
  launches installed Chrome with the native-WebGPU flags the stock arena gates
  use - still headless, mute, parked off-screen. Visibility contract 11/11.
- **capture-arena-viewpoints.mjs** gained an opt-in `--cameras` subset; the
  default is unchanged and the summary line says "(subset)" so a partial run
  can never read as a full one.

## Gates (every output quoted)

    npx tsc --noEmit                                  TSC_EXIT=0
    find-coplanar-pairs   HOUSE-INTERIOR 0 - STREET 0 - FINDINGS 0
                          FENCED 165 - SAME-MATERIAL 26 - boxes=819
                          pairs under 0.03m: 191
    node --test browser-visibility-contract           11 pass, 0 fail
    vitest, FULL          Test Files  601 passed, 1 failed, 1 skipped of 603
                          Tests  6070 passed, 1 failed, 2 skipped of 6073
                          (the one: audio-music-rotation-runtime, 20 s timeout
                          under full-suite load; 8/8 in 16.02 s alone)
    npm run build                                     built in 3.02s, exit 0
    identity grep         dist/assets/release-identity-BljZFRzG.js -> "PASS 93"
                          (same identity family 4b served; candidate, not release)

Browser gates: headless installed Chrome, one at a time, GPU load read before
each (ComfyUI shares this GPU; it was idle at 0-16 % / 1.3-3.6 GB throughout).

    qa:stock-boot (stock flags, no unsafe-webgpu), external preview :4189
      run 1 (first cold boot after the build)   3 passed, 1 failed (3.6m)
        launch-args contract                     ok
        WebGPU device exposed                    ok
        nuketown2 live frame                     FAILED - waitForFunction 120 s
        skyline-terminal live frame              ok (1.4m)
      run 2, nuketown2 alone                     1 passed (1.7m)
      Candidate 4 logged the same shape ("one stock-boot attempt failed ...
      before two clean runs", its REPORT open item 2); candidates 1 and 4 both
      passed nuketown2 in 1.3-1.5m. VERIFIED both runs; the first failure's
      Playwright artefacts were cleared by the next run, so its cause is
      INFERRED (the 12 s deploy fence rejecting the first cold submission under
      D3D12 stock flags - the failure candidate 4 saw). The fence, the 120 s
      patience and the tripwire were NOT touched.
    pass74 cold boot smoke -g nuketown2, PASS73_NATIVE_WEBGPU=1, fresh user-data-dir
      1 passed (1.2m)                            [4b: 1 passed (2.2m)]
    bot presence probe, :4189, installed Chrome, 45 s sample per arena
      nuketown2        requested 4 / target 4 / active 4, dormant 2 of max 6,
                       next reinforcement at 10 defeats; first bot alive 124 ms
                       after active; 4 alive at first AND last sample (41
                       samples); 6 spawn selections on 6 distinct points
                       (indices 3,7,2,4,1 + one dormant slot); every bot
                       navigating (2.3 / 30.2 / 3.1 / 15.3 m travelled),
                       15-27 m from the player at the end, all effectively
                       visible; 1 console warning, 0 page errors
      skyline-terminal requested 1 / target 1 / active 1 alive throughout;
                       6 selections on 6 distinct points; 11.2 m travelled
      (the chain's first probe attempt, before the launcher fix, recorded
      "no GPU adapter" on both arenas - the lane's known no-adapter result)
    capture-arena-viewpoints --arenas nuketown2 --cameras <6> --samples 1
      backend webgpu, adapter nvidia/blackwell   OK 6/6 (subset), verdict PASS
    minimap capture (Solo nuketown2, HUD clip)   captured (minimap-solo-nuketown2.png +
                                                 hud-solo-nuketown2.png); active in 30.5 s,
                                                 4/4 bots alive, 0 page errors. The first
                                                 attempt timed out on locator.screenshot -
                                                 a live HUD canvas is never "stable" - so
                                                 the re-run clips the page at the element box.

## Numbers vs 4b and PASS 93 (nuketown2, spawn pose, bisect baseline rung)

Same harness for the two rows this pass measured: scripts/qa/perf-hitl5-bisect-cdp.mjs,
headless installed Chrome, real WebGPU device, 2560x1440, HIGH profile, CDP
profiler ON (p50 carries profiler overhead - compare rows, not to the A/B
table), served through `vite preview` (the path the owner plays on), ComfyUI
at 0 % for both.

| build | served | fps | p50 ms | p95 ms | p99 ms | draws | tris | pipelines total | in-combat pipes | JS busy ms/frame | meshes (visible) | materials |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| candidate 5 (this) | :4189 preview | 51.0 | 18.9 | 38.2 | 44.3 | 228.6 | 392k | 424 | 0 | 15.51 | 7121 (201) | 1828 |
| candidate 4b | :4300 preview | 45.4 | 21.3 | 43.3 | 46.1 | 223.6 | 388k | 424 | 0 | 17.47 | 7117 (196) | 1823 |
| HITL 4 (7733d37b), perf lane | :4300 preview | 48.8 | 19.8 | 39.3 | - | 169 | 326k | 420 | 0 | 15.2 | 7075 (145) | 1822 |
| PASS 93 live, perf lane A/B (no profiler) | github | 67-79 | 12.3-13.8 | 15.5-22.9 | 29-38 | 125 | 271k | 250 | - | - | 6366 (98) | 1770 |

Read honestly: candidate 5 is 2.4 ms p50 / 5 ms p95 / 2 ms JS better than 4b
at this pose (one run each, same minute, same idle GPU - a direction, not a
proof) and is NOT at PASS 93 frame cost. The +55 draws over HITL 4 are the 4b
art merges (techniques yard props, appliance banks, accuracy street cars) plus
the merged vehicles now always drawing; the JS cost is still the per-frame
matrix recompose the perf lane measured (`multiplyMatrices` /
`updateMatrixWorld` / `updateWorldMatrix` are the top three self-time functions
again). Pipeline total 424 on the preview path for BOTH builds - the lane's 533
was its `--dist` static-server path, as it suspected. In-combat pipeline
creation 0 on both (tripwire holds). The perf-fix lane owns the gap (HITL 5b).

## What the captures show (docs/evidence/pass94/candidate5/nuketown2/)

- garage.png: the wing is CREAM lap siding on every face; interior floor and
  joists unchanged. Fix (a) VERIFIED. The driveway car on the apron still
  carries the violet lower band - OPEN 1.
- vehicle-near.png: coach, truck, both street cars. It is the same picture as
  4b's vehicle-near.png: every forged body reads cream, the navy saloon and
  jade classic included. OPEN 1.
- street-centre.png: the verge is open ground - hedge, kerb planter, the
  appliance bank, the letterbox - and nothing else between the coach and the
  orange house. The 36 deleted verge bodies are absent, not hidden.
- overhead.png: the lollipop, both houses two-tone, the head with coach and
  truck, five cream vehicles on the street (OPEN 1 again), the third house
  beyond the closed end.
- north-yard.png: terracotta upper storey over cream, deck and exterior stair,
  hedge box, stepping stones, no floating bodies.
- appliance-bank-south-close.png: the white house's lawn carries the BLUE hob
  deck (one canonical blue after this merge), red on the orange house's.
- minimap-solo-nuketown2.png: the 198 px HUD minimap in a live Solo match -
  house/garage silhouettes, the road strip, one vehicle block, the player
  arrow, ONE red bot dot and the compass; no sign/fence/planter/decal clutter.
  hud-solo-nuketown2.png is the full 1280x720 HUD frame it was clipped from.

## OPEN

1. **Every forged vehicle renders CREAM regardless of its paint hex - and it
   already did in 4b.** vehicle-near.png here and in candidate4b/captures are
   the same image: coach cream (correct, 0xe7dec6), truck cab cream (correct),
   but the driveway cars (0x3d6f80 aqua), the saloon (0x27394f navy) and the
   classic (0x2f8f77 jade) are cream too, each with a violet band low on the
   flank. Fix (b) was applied as briefed and changes nothing visible, so the
   band is NOT the pigment lift. INFERRED cause: 4b's cold-compile change made
   the forge pigment a `uniform(new Vector3)` node so every paint shares one
   program; the siding families do the same and their orange/cream DO differ,
   so the difference is in how the forge graph binds it (the cream bodies all
   read the coach's value - the first paint built). Falsifier: put the pigment
   on `material.color` read through TSL `materialColor` (a per-material
   renderer-bound uniform, program still shared), rebuild, re-capture
   vehicle-near; if the saloon comes up navy the binding is the cause. The
   owner line "not true to BO2" includes this - the reference has a dark
   saloon and a green classic. Handed to HITL 5b; not attempted here because it
   needs a rebuild and a fresh browser pass to be evidence rather than a claim.
2. **Stock-flag first cold boot of nuketown2 missed the 120 s patience once**
   (above). Reproduces candidate 4's one-in-three. The cold-session precompile
   4b added is measured under the unsafe-flag path (cold smoke 1.2 m); the
   stock D3D12 path has no receipt. Falsifier: three consecutive stock-flag
   nuketown2 boots on a fresh dist with the fence message captured.
3. Size ratchet: legacy-main.ts is 37,231 lines after the minimap lane
   (-165); the 37,396 ceiling 4b set was NOT moved. Tightening it back is a
   contract change for a lane with a reason.
4. The layout lane's verge ceiling (43) was set WITH its 14-body appliance bank
   in the `verge` namespace; the shipped bank lives under `lawn appliance bank`,
   so the ceiling now has headroom it was designed not to have. The lane's
   call, not an integrator's.
5. FPS: not fixed here, by design of the brief (HITL 5b).

## Claim-states summary

VERIFIED: every gate line above; the seven merged heads; the 6/6 capture; the
probe counts; both bisect rows this pass ran. OBSERVED: the six captures and
4b's for comparison. INFERRED: the stock-boot first-run cause; the OPEN 1
cause. OPEN: items 1-5.
