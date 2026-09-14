# Interior regeneration — wave 7 (recovery, 2026-09-13): STILL PENDING, launch denied

Lane `interiors-night-20260912`, machine `dave-gaming-pc`, harness `claude`, model `claude-opus-5`,
effort `xhigh`. Branch `contrib/dave-gaming-pc/claude/interiors-night-20260912`, HEAD `6b41cef51`
throughout waves 5, 6 and 7. **No Blender ran. No GLB byte changed. No hash was refreshed.**

## Why nothing was generated — wave 7: the marker arrived, the launch did not

The gate marker this wave is allowed to run behind

```
C:\Users\david\Documents\Codex\2026-09-11\p-le\work\continued-world-20260913\recovery\build18-house-probe-released.json
```

**exists now**, written `2026-09-13T13:54:52Z`, scope *"House wave5 headless candidate consumer probe
completed, both profiles pass. No root heavy job running. Native interiors Blender CPU2threads may
proceed after fresh resource gate."* It was read and quoted before anything else was attempted, and
the supervisor's fresh three-sample resource gate had passed. The gate is open.

The **launch** is what failed. The pinned command was issued three times, differing only in how the
executable path was spelled (forward slashes, bare, and the literal backslash form), and every one
was refused by the harness permission layer before a process started — `Permission to use Bash has
been denied because Claude Code is running in don't ask mode`. Nothing ran: `blender.exe` is not in
this session's allowed command set. That is a harness-side blocker and the one thing this lane is
forbidden to route around — no alternative launcher, no subprocess smuggled through a script that
*is* allowed to run, no "equivalent" export. So generation stays pending for a second wave.

The refusal is cheap to prove either way: the ten GLBs were sha256'd before the first attempt and
again after the third, and all twelve files in the export directory — ten GLBs, `catalog.json`,
`build-report.json` — are byte-identical (table below). Whatever else is true, no export happened.

## Wave 7 did fix the thing that would have wasted the launch

The command below carries **no `--` payload**, and `main()` required one. Run exactly as pinned, the
old `build_interiors.py` would have exited 2 at `argparse` — `--repo` was `required=True` — before
building a single object. Worse, `--props` was `action="store_true"` and therefore opt-in, so a run
that got past that would have written **one** GLB where `catalog.json` publishes **ten**, leaving the
other nine stale next to a refreshed hero and a refreshed catalog. Both are now fixed in the script:

* `--repo` defaults to `_repo_root()`, derived from the script's own location, still overridable;
* props export by default, with `--hero-only` as the explicit opt-out;
* the module docstring now pins the same one-line command the rest of the lane does.

Three new tests in `generation.test.ts` hold that shape, including that `write_catalog` still refuses
to publish a `thumbnailUrl` it did not render. This is unverified against Blender — it is argparse
behaviour read off the source, not a completed run. It is offered as a defect found and repaired, not
as evidence the export works.

**One consequence to expect, and not to paper over:** the pinned line has no `--render`, so the next
successful export publishes `thumbnailUrl: null` for the hero. `thumb-interior-hero-teal.png` stays
on disk but stops being referenced, which is correct — it is a still of the *defective* sofa. Add
`-- --render` if a current thumbnail is wanted; do not re-point the row at the old file.

## The exact command, when the launch is permitted

One command, unchanged, run from the lane worktree. `build_interiors.py` **is** the scoped interior
script — it writes only under `public/assets/world-studio/blender/interiors/` and
`source-assets/world-studio/interiors/`:

Kept on one line deliberately — `generation.test.ts` matches it, and a wrapped copy is a command
someone has to reassemble:

```
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --threads 2 --python scripts/blender/world-studio/interiors/build_interiors.py
```

No GPU, no browser. Afterwards, in this order:

1. `python scripts/blender/world-studio/interiors/fit_report.py --json docs/technique-lab/interiors/fit-report.json`
2. Refresh `catalog.json` sha256/`metrics.bytes` from the new files, and the bounds rows with them.
3. `node node_modules/vitest/vitest.mjs run src/world-studio/interior-assets --reporter=dot`
   — expect the three alarms below to fire, and re-pin each one against the **measured** export.

## The three alarms a successful export will trip, by design

These are not regressions. They are the tripwires waves 5 and 6 left so that a re-export cannot land
silently, and each one has to be re-pinned from the new bytes:

| test | file | what it means |
|---|---|---|
| byte census + set fingerprint | `generation.test.ts` | the GLBs are no longer the bytes `catalog.json` publishes — refresh the catalog from the export |
| the 180 deg sofa plinth pin | `catalog.test.ts` | the M1 defect is gone from the bytes, which is the point of the export |
| "script is ahead of the GLBs it describes" | `fit.test.ts` | the sofa and coffee-table source fixes have reached the geometry |

Once the export is measured, the load-time repairs should go quiet on their own: `SOFA_PLINTH_REPAIR`
is conditional on finding the defective yaw, and the credenza nudge is derived from measured bounds,
so a correct export computes zero. `fit.test.ts` already asserts both directions.

## Source state: four of five overruns fixed at source, one open

| asset | anchor | measured now | source fixed | wave |
|---|---|---|---|---|
| `interior-prop-sofa` | `sofa` | +0.650 (plinth) → +0.155 after load-time repair | yes — frame no longer takes the yaw twice | 5 |
| `interior-prop-coffee-table` | `coffee-table` | +0.070 | yes — top 1.34 → 1.20 m, pinch half-length 0.67 → 0.60 | 5 |
| `interior-prop-credenza` | `tv-unit` | +0.012 → 0.000 after a 12 mm load-time nudge | yes — assembly recentred on its occupied depth, 21 mm back | **6** |
| `interior-prop-kitchen-run` | `kitchen-run` | +0.020 | yes — depth 0.62 → 0.60 m with a 7 mm back bias, and `length + 0.04` → `length` on three spans | **6** |
| `interior-prop-dinette` | `dining-table` | **+0.555** | **no — OPEN** | — |

### Wave 6's two fixes, and the arithmetic behind them

Both models were validated before being trusted: run on the **pre-fix** constants they reproduce
the spans `fit-report.json` measured from the shipped bytes exactly — credenza 0.482 m, kitchen-run
0.664 m. That is the whole reason the post-fix numbers are worth reviewing before the export exists.
They are still **predictions**. Nothing here has been measured from a GLB, because there is no new
GLB.

**Credenza.** Not oversized, off-centre. The carcass is 0.44 m deep in a 0.500 m footprint, but only
the front carries hardware: brass pulls reach +0.262 (0.25 standoff + 0.012 radius) while the
deepest thing behind the centre line is the carcass at −0.220. Occupied depth 0.482 m centred at
+0.021, so the front face sat 12 mm out while 30 mm of slack went unused at the back. The assembly
is now authored about that occupied centre: predicted ±0.241 in ±0.250, 9 mm clear on both faces.

**Kitchen run.** Two causes, and wave 5 declined both; wave 6 does both, because the anchor
footprint here is the wall line.

* *Depth.* 0.62 → 0.60 m. 600 mm is the standard base-cabinet depth and 650 mm the worktop over it,
  which is exactly what the anchor publishes — 620 was arbitrary and spent the slack the pulls need.
  Front-most is then a base pull at +0.329 (0.300 + 0.020 standoff + 0.009 radius), rear-most the
  splash lip and backsplash at −0.315: occupied 0.644 in 0.650, centred at +0.007. Biased back by
  that, predicted ±0.322, 3 mm clear. The pulls keep their full standoff.
* *Length.* `length + 0.04` → `length` on the worktop, splash lip and backsplash. The 40 mm was a
  bullnose overhang applied to the wrong axis. The worktop still overhangs the **front** by
  `depth + 0.03`, which is the feature; the ends of a run butt into the room, and 20 mm of laminate
  stood outside the footprint at each end.

Neither fix touches the rotation pivot: `_rotate_group(parts, _p(lx, 0, lz), yaw)` in both, so each
piece still rotates about its own anchor and the bias lives inside the piece's local frame.
`generation.test.ts` asserts that, because a bias that leaked into the pivot would land the piece
somewhere else entirely.

### The dinette stays open, and should

+0.555 m, the four chairs standing outside the table the `dining-table` footprint describes. Wave 6
did not touch it and deliberately left the failure open. Shrinking a dinette to hide its chairs
would be vandalism, and widening the footprint to admit them would be weakening the gate. Root
should treat this asset's occupancy as its measured bounds, not its anchor box. `build_dinette`
carries no `FIT FIX` marker and `generation.test.ts` asserts it stays that way.

## Authority, unchanged

Nothing in wave 6 touches gameplay. Both edits are Blender-side authoring constants in a dressing
script; `fit.ts` still emits no collider, spawn, patrol point or shot surface; the procedural kit
keeps ballistic authority; ADAPTER M3 is unchanged. Disposal and loader ownership were not touched —
no file in `index.ts` or the loader changed in this wave, and the `root.parent !== scene` lifecycle
pattern was not introduced. `arena.ts`, `legacy-main.ts`, `architecture/build.ts`, the houses,
lighting and the registry were not opened.

## Byte census, wave 7 — before the attempt and after it

sha256 and size of every file in `public/assets/world-studio/blender/interiors/`, taken immediately
before the first launch attempt and again after the last. **Identical in both columns**, so "no byte
changed" is measured, not asserted:

| file | bytes | sha256 |
|---|---|---|
| `interior-hero-teal-living-kitchen.glb` | 4 603 156 | `ded7d8cd183276805cff23f221d653269a4606564c2882189c4a261788c5132e` |
| `interior-prop-sofa.glb` | 1 185 944 | `8e3eb48e5913d37915f3baa40fab3d2393082c289eb371091925fa08472575c7` |
| `interior-prop-coffee-table.glb` | 590 796 | `3840a2733a24830f69d1acbd20e2259a16196e53f6d00bc58c4e9bebc07526e8` |
| `interior-prop-credenza.glb` | 627 744 | `f2440a734dd5fb0049730f9f581ddd6c78cffdf17f627fb701798130a1069cd8` |
| `interior-prop-armchair.glb` | 624 944 | `08cae114c71283d2bd50704a2a980a2db1614618ebc5744b7a59c22dcab78369` |
| `interior-prop-kitchen-run.glb` | 966 432 | `3749ea5f4ef1a27485729a7e0b7f9bca1b8de42c2ad9e950874485feb46624c9` |
| `interior-prop-fridge.glb` | 85 824 | `ccecbce36d9c890d394a7be6637392988127722cfd064b9b4386d12d09e2eba0` |
| `interior-prop-dinette.glb` | 910 816 | `af18cb87a90e1c6d33efe70592e8de09bcbd66c62dd2b14439a98dffa145038b` |
| `interior-prop-area-rug.glb` | 1 036 024 | `45e60576c5d46fdb785a1d0b27dca0f2070abb9ccbef62bbc9770c6f6f447f5b` |
| `interior-prop-accents.glb` | 940 140 | `16a5fae4f1119ac40bc08b7943325ac4476c4c9c3b7206b86563ff1f63fa7cc5` |
| `catalog.json` | 13 073 | `e35346cc79a859a6a96cf0a1a7a39bd4407d38bf40ec608d148ccb650494ab6f` |
| `build-report.json` | 7 215 | `ff0f7202d82d2dc81da8a4bc35d649c92375dd20bc415ff2c343a73a6f1586ca` |
| `thumb-interior-hero-teal.png` | 302 869 | `ee43f441750b1da7c9a30d595a241ad1a92b7b9c9cd28a05fd99e73b7330cb03` |

`fit_report.py` was re-run over those same bytes and reproduced wave 5's table exactly — hero
12.4447 × 14.9875 (repaired), sofa 0.9047 × 2.5100 worst +0.650 → +0.155, coffee-table 1.3400 ×
0.4274 +0.070, credenza 0.4820 × 1.5600 +0.012 → 0.000, armchair 0.9042 × 0.9150, kitchen-run 0.6640
× 4.4400 +0.020, fridge 0.7350 × 0.7200, dinette 2.3509 × 2.1109 +0.555, area-rug 3.3400 × 2.3400,
accents 6.8720 × 6.6795. Ten assets, same numbers, because they are the same files.

## Honest remaining failures

1. **Generation has not happened**, for a second consecutive wave and for a different reason. Every
   "fixed at source" row above describes bytes that do not exist. Five source fixes are now queued
   behind one Blender run, and the blocker moved from a missing marker to a denied launch.
2. **The dinette overrun is open** at +0.555 m and was not repaired, by choice.
3. **The predicted post-export bounds are arithmetic**, not measurement. The models reproduce the
   two measured spans exactly, which is evidence, not proof — a bevel or a segment count could still
   move a face by a millimetre, and the kitchen run only has 3 mm of predicted clearance.
4. Everything falsifier 7 says still holds: no runtime has loaded one of these GLBs, and the
   repaired sofa has never been rendered.
5. **The wave-7 argparse fix is unexercised.** `--repo`'s default and the props default are read off
   the source and pinned by test; no Blender process has parsed them. If the next launch is
   permitted and still fails, this is the first thing to suspect and the easiest to check — the run
   should print `[interiors] built N objects` and then eleven `export_glb` lines.
6. **The hero thumbnail will go `null`** on the next export run as pinned, and
   `thumb-interior-hero-teal.png` will be an unreferenced still of the defective sofa still sitting
   in `public/`. Deleting or re-rendering it is a decision for the wave that gets the export.
