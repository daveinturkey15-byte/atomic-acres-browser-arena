# Interior fit correction — wave 5 (recovery, 2026-09-13)

Lane `interiors-night-20260912`, machine `dave-gaming-pc`, harness `claude`, model `claude-opus-5`,
effort `xhigh`. Branch `contrib/dave-gaming-pc/claude/interiors-night-20260912`, starting HEAD
`6b41cef51` with the wave-3/4 working tree in place; **no commit made, no Blender run.**

Wave 4 left five anchored props with a single unanswered question: four of them exceed the anchor
footprint `house.ts` publishes, one of those is a defect, and nothing could be done about any of it
without Blender. This wave answers it as far as CPU work can, and says plainly where that stops.

## What changed

| file | change |
|---|---|
| `src/world-studio/interior-assets/fit.ts` | **new.** Per-face overrun maths, the footprint box derived from the anchor yaw, the sofa plinth repair, the bounded fit nudge, the accepted-overrun register and `assertInteriorFitPolicy`. Owns `INTERIOR_ANCHOR_REFERENCE` now. |
| `src/world-studio/interior-assets/index.ts` | Applies the corrections as each payload lands, before it is attached; new `repairFit` option (default `true`) and `repairs: readonly string[]` on the returned handle. `INTERIOR_ANCHOR_REFERENCE` re-exported from `fit.ts`, same name, shape and values. |
| `src/world-studio/interior-assets/fit.test.ts` | **new**, 24 tests. |
| `src/world-studio/interior-assets/loader.test.ts` | One assertion extended: the exhaustive key-set pin now includes `repairs`, and asserts it starts empty. Nothing relaxed. |
| `scripts/blender/world-studio/interiors/fit_report.py` | **new.** Stdlib measurement of all ten GLBs: per-asset AABB, per-node AABB, per-face overrun, and the rotation repair simulated on the shipped bytes. |
| `scripts/blender/world-studio/interiors/build_interiors.py` | Two source fixes, below. |
| `docs/technique-lab/interiors/fit-report.json` | Machine-readable output of the above. |

## The defect, and what the repair is worth

`sofa-frame` carried the anchor yaw twice (ADAPTER M1), so a 2.20 × 0.88 m walnut plinth lay
crosswise under a sofa whose body runs along Z. Measured from `interior-prop-sofa.glb`, not from the
source:

| | X span | worst face outside the `sofa` footprint |
|---|---|---|
| shipped bytes | 2.2000 m | **+0.650 m** |
| after the load-time repair | 0.9047 m | **+0.155 m** |

The footprint is 0.900 m across, so the repaired sofa is 2.4 mm proud per side in X — inside the
4-decimal precision the catalog publishes. The remaining +0.155 m is **Z**, and it is the arms and
their walnut caps running past each end of the 2.20 m seating span. That is not repaired and is not
claimed to be: it is recorded in `ACCEPTED_OVERRUNS` with its measured value.

**The hero shrinks with it.** The crosswise plinth reached `x = 6.500`, which is the *whole set's*
published max X, so the hero composition measures 12.445 m across once repaired rather than 13.090 —
0.645 m narrower than every document in this lane, including `catalog.json`, says. Pinned in
`fit.ts` `REPAIRED_BOUNDS` and recomputed from the hero's own bytes by test. The catalog rows keep
the shipped (defective) numbers, because that is what the files measure.

The repair rotates one node whose mesh is centred on its own origin, so it is rigid — no scale, no
deform, no re-origin. It is **conditional on measuring the defect**, so when Blender is next run and
the source fix below reaches the bytes, the repair goes quiet instead of rotating a correct node a
third time. `fit.test.ts` asserts both directions.

## Measured fit, all ten GLBs

House-local metres, from `fit_report.py` over the shipped bytes. "Worst face" is the largest of the
four outward X/Z overruns; negative is clearance. `after` includes the load-time rotation repair and
the load-time nudge.

| asset | anchor | X span | Z span | worst face before | worst face after |
|---|---|---|---|---|---|
| `interior-hero-teal-living-kitchen` | — (all five) | 13.090 → **12.445** | 14.988 | — | — |
| `interior-prop-sofa` | `sofa` | 2.200 → **0.905** | 2.510 | **+0.650** | **+0.155** (arms, accepted) |
| `interior-prop-coffee-table` | `coffee-table` | 1.340 | 0.427 | +0.070 | +0.070 (source fixed, needs export) |
| `interior-prop-credenza` | `tv-unit` | 0.482 | 1.560 | +0.012 | **0.000** (nudged 12 mm) |
| `interior-prop-armchair` | — | 0.904 | 0.915 | — | — |
| `interior-prop-kitchen-run` | `kitchen-run` | 0.664 | 4.440 | +0.020 | +0.020 (accepted) |
| `interior-prop-fridge` | — | 0.735 | 0.720 | — | — |
| `interior-prop-dinette` | `dining-table` | 2.351 | 2.111 | +0.555 | +0.555 (chairs, accepted) |
| `interior-prop-area-rug` | — | 3.340 | 2.340 | — | — |
| `interior-prop-accents` | — | 6.872 | 6.680 | — | — |

**A correction to wave 3's numbers.** Wave 3 measured overrun as a *span* difference and reported the
credenza at −0.018 × −0.040, i.e. fitting. It does not fit. It is 0.482 m deep inside a 0.500 m
footprint and sits 12 mm proud of the front face, because it is offset, not oversized. So the true
count was **five of five anchored props outside their footprint**, not four. Per-face is the measure
that decides whether a piece crosses a wall line, and it is what `fit.ts` uses. The old span figures
remain pinned in `catalog.test.ts` and were not touched.

## The five, one at a time

1. **sofa** — defect, **repaired at load time**, +0.650 → +0.155 m, and fixed at source for the next
   export.
2. **credenza** — **corrected**, 12 mm nudge, now fully inside. The nudge is derived from the measured
   bounds, is refused above 25 mm, is refused outright for anything larger than its footprint, and
   can only translate in X/Z.
3. **coffee-table** — +0.070 m per end. The top was authored 1.34 m long inside a 1.20 m footprint.
   **Corrected at source** (1.34 → 1.20, pinch half-length 0.67 → 0.60 so the surfboard profile is
   unchanged in normalised terms). The shipped GLB still measures 1.34: only Blender can shrink
   geometry, so it stays an accepted overrun until the next export.
4. **kitchen-run** — +0.020 m. Two millimetre-scale causes, measured: chrome door pulls stand 0.014 m
   proud of the 0.65 m depth, and the worktop, splash lip and backsplash are authored at
   `length + 0.04`, overhanging the 4.40 m run by 0.020 m at each end. **Deliberately not
   re-authored.** A handle that protrudes and a worktop that overhangs its ends are what those
   objects are.
5. **dinette** — +0.555 m. The four chairs stand outside the table the `dining-table` footprint
   describes. **Deliberately not "corrected"**: shrinking a dinette to hide its chairs would be
   vandalism. Root should treat this asset's occupancy as its measured bounds, not its anchor box.

`assertInteriorFitPolicy()` throws if any of these grows past its recorded value or if an unlisted
asset overruns at all. Accepting a measured overrun is a pin, not a relaxation — `fit.test.ts`
proves a grown overrun fails.

> **Superseded in part by wave 6 (`REGENERATION.md`), 2026-09-13.** Wave 6 held the Blender
> authorisation and the marker never appeared, so it ran no export and changed no byte — but it did
> re-author the two overruns this report declined, at source: the **credenza** is now recentred on
> its occupied depth (predicted ±0.241 in ±0.250) rather than relying on the 12 mm load-time nudge,
> and the **kitchen run** goes to a standard 0.60 m base depth with a 7 mm back bias and its
> `length + 0.04` end overhang trimmed to `length` (predicted ±0.322 in ±0.325). Those are
> predictions from the authored constants, validated by reproducing this report's measured 0.482 m
> and 0.664 m spans exactly on the pre-fix numbers — not measurements. Every measured figure below
> still describes the shipped bytes and is unchanged. The **dinette** remains open at +0.555 m.

## Source fixes that need a Blender run to take effect

`build_interiors.py` is now **ahead of the GLBs it describes**, deliberately and for the first time
in this lane:

* `build_sofa` no longer sets the frame's own Z rotation; `_rotate_group` already applies the anchor
  yaw to every part. This is the M1 fix.
* `build_coffee_table` authors a 1.20 m top.

Until someone runs Blender, the pinned sha256s describe geometry the script no longer produces, and
that divergence is asserted rather than assumed: `fit.test.ts` → *"is honest that the script is ahead
of the GLBs it describes"* fails if the bytes change without this note changing with them, and
`catalog.test.ts`'s existing 180° defect pin fails on a re-export, which is the intended alarm.

**One wave-3 claim corrected:** ADAPTER M1 said `build_rug` "has the same shape and would reproduce
M1". It does not. `build_rug` never calls `_rotate_group`, so its yaw is applied once. Its real (and
currently harmless, since both boxes share the anchor centre and the yaw is 0) latent issue is the
opposite one — it rotates parts about their own origins and never about the anchor. Nothing was
changed there: fixing a defect that does not exist is how the next one gets introduced.

## Authority, unchanged

Nothing here touches gameplay. `fit.ts` emits no collider, spawn, patrol point or shot surface, and
a footprint in it is a dressing envelope. The procedural kit keeps ballistic authority and ADAPTER M3
is unchanged: filtering the five anchors still removes their `StudioInteriorSolid`s, and that
decision is still root's. Disposal ownership is exactly as wave 3 documented — the repair runs on the
payload *before* it is attached, so a payload that loses the race with `dispose()` is released
unrepaired and unattached, asserted in `fit.test.ts`. The hero is never nudged, because translating
it would move the whole set off the house origin.

## Verification

```
node node_modules/vitest/vitest.mjs run src/world-studio/interior-assets --reporter=dot
  -> 69 passed (69), 3 files, ~0.8 s   [45 existing + 24 new]
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck \
  --target ES2022 --module ESNext --moduleResolution bundler \
  src/world-studio/interior-assets/fit.ts src/world-studio/interior-assets/index.ts
  -> clean
python scripts/blender/world-studio/interiors/fit_report.py --json docs/technique-lab/interiors/fit-report.json
  -> ten assets measured, sofa worst face +0.650 -> +0.155 m
```

No Blender, no GPU, no browser, no build, no server, no dependency install, no commit, and no file
outside this lane's five allowed path families. The suite was narrowed to this directory on purpose:
wide `src/world-studio` runs OOM the fork pool on this host (ADAPTER, "one honest note").

## Still untrue

Everything falsifier 7 says. No runtime has loaded one of these GLBs; `fit.test.ts` reads the real
bytes for every bounds claim but drives the loader through the same stubbed `GLTFLoader` wave 3 used.
The repaired sofa has never been rendered — the +0.155 m arm overrun is arithmetic on measured
geometry, not a frame anyone has looked at. And the three source-side improvements (M1, the coffee
table, and anything else a re-export would refresh) are claims about a Blender run that has not
happened.
