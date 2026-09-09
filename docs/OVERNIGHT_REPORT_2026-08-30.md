# Overnight report — 2026-08-29 → 30 (for the 06:00 inspection)

Live build: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/ (PASS 81 channel).
Six checkpoints published through the night; full suite green before every one
(final: 4,541 passed / 2 skipped). Branch `gauntlet/pass79-omp-20260823` @ `abc68b55`.

## The headline: Chrome 153 is FIXED at the root

The "timing race" was never a race. Every QA harness ran Chrome with
`--enable-unsafe-webgpu`, which changes Tint's shader lowering and completely
masks the bug — with stock flags the failure reproduces deterministically on
a warm local build. Root cause: three r185's `DFGLUT` helper returns
`texture(lut, uv).rg`, and every consumer's `.x`/`.y` read compiles to a
CHAINED WGSL swizzle (`nodeVar30.xy.x`). Chrome 153's new Tint IR lowering
rejects exactly that chain — on the sync AND async pipeline paths — for every
material lit through GGX multiscatter. That is why ~10 unrelated pipelines
failed and no amount of retrying could ever win.

Fix: `src/webgpu-tint-swizzle-shim.ts` rewrites `v.xy.x → v.x` at
`createShaderModule` time (semantics-preserving by swizzle composition).
**Measured, stock Chrome 153: before = 10 pipeline failures → WebGL2
fallback; after = 0 failures, match active on WebGPU — 3/3 local runs and
2/2 cold loads of the published site.** Your first load this morning will
retry WebGPU automatically (pre-shim sticky fallback records are ignored);
you should land on full-speed WebGPU with no banner. The retry/fallback
safety net remains underneath, now with pipeline-cache sweeps and an
async-recompile pass between attempts.

## Your specific asks

1. **Music volume** — Done earlier (35% at slider 50). Tonight's fix: your
   browser's SAVED settings carried the old slider default (100) and overrode
   the new default forever — that is why it still sounded loud to you. A
   one-time migration moves an untouched stored 100 down to 50; if you
   deliberately set it back up later, it stays.
2. **Chopper canopy glass** (your live report) — the cockpit viewmodel now
   rides lifted + pulled toward the camera; depth-differential magnification
   sweeps the glass frame out of the sight picture (apex near the top edge,
   console at the bottom, reticle in open glass). Screenshot-verified level
   and pitched.
3. **Chopper damage** — it technically worked but at 10 damage/shell a kill
   took ~11 shells of "30mm autocannon", which reads as broken. Retuned to
   34/22 at 240 ms cadence: ~3 shells per kill (measured 2.7 s possession →
   elimination, with the DAMAGE DONE feed confirming).
4. **No clipping near walls / prone, all maps** — closed the general way: a
   per-frame camera eye resolve pushes the eye clear of any solid-backed shot
   surface within 0.15 m (the felt class is visual geometry protruding past
   movement colliders — ramp flanks, the airstair belly — which no collider
   check could see). Verified by teleporting the real player to every
   sweep-flagged spot and re-probing from the actual camera seat: atomic
   15 → 2 residual rows (both 0.143 m, i.e. 95% of target and 1.8× the bare
   near plane, prone under the interior ramp only at full bob), skyline
   0.069 → 0.136, high-seas 0.096 → 0.123, gun-range's two rows are the
   deliberately walk-through wallbang panels. Ledger re-pinned with the
   method.

## Plan items

- **FPS/perf**: profiled live — 35% of main-thread time was three r185
  recomposing/re-multiplying every scene node every frame, mostly idle pooled
  vocabulary (killstreak prewarms 4.2k nodes, grenade pool, corpse pool,
  hidden weapon rigs, plus the scene root force-walking the whole graph).
  Deep-freeze on idle pools + walk-skip: matrix pass 1.67 ms → 0.435 ms
  (−74%). CPU frame p50 measured down from 7.7 ms to ~4.5-5 ms (fps samples
  on this machine swing 98-151 because ComfyUI et al. share it — the CPU
  ceiling is now ~200 fps where it was ~130). With the Tint fix you're also
  back on WebGPU instead of the slower WebGL2 route.
- **Lighting**: shadow sides were crushing to featureless black (lit:shadow
  ~4.6:1). Hemisphere/ambient/fill lifted to ~2.7:1 with the sun untouched;
  the old test pin that ENCODED the crushed look re-pinned to a bounded
  directionality band. Verified on re-captured review cameras.
- **Sound**: instrumented end-to-end — weapon transients sit 5:1 over the
  music bed, no broadband hiss, all feedback layers prepared. Objectively
  healthy; a punch/mix rebalance is subjective, so I left the knobs
  documented (sfx bus 0.78, master 0.34, headroom ~4×) for your ear.
- **Firefox**: automation is blocked on this machine (Playwright's Firefox
  crashes at launch; system Firefox ignores harness launches). The WebGL2
  code path Firefox uses is verified in Chrome (`?renderer=webgl2` boots,
  plays, same perf win). Needs one manual Firefox open — 2 minutes.
- **Streamline**: shared `scripts/qa/lib/launch-match.mjs` harness replaces
  the ~30-line Playwright boilerplate every probe repeated; WGSL capture tool
  upgraded (sync-path hook, WeakMap sources); dead-concept sweep clean.

## Next options (pick any for the next session)

1. **Nuketown polish round**: asphalt/ground texture variation, yard read,
   house interior dressing — the declutter left some flat surfaces.
2. **Weapon punch pass with you at the speakers** — 15 minutes of live A/B
   on the documented mix knobs beats any blind tuning.
3. **legacy-main extraction** (33k lines): the camera seat, admission flow,
   and debug API are clean seams now; worth a bounded 3-4 file split.
4. **Retire the WebGL2 fallback complexity** once you confirm a week of
   clean WebGPU sessions — the shim makes most of it redundant.
5. **Multiplayer session on the new Nuketown** — the layout has not had a
   2-player HITL since the v3 rebuild.
