# PASS 94 - LANE ACCURACY-2: BO2 Nuketown 2025 facts (HF-477)

**Worktree** `C:/Users/david/projects/aa-claude-acc2`
**Branch** `contrib/dave-gaming-pc/claude/nuketown2-bo2-accuracy`
**Authority** `docs/references/nuketown-2025/FINDINGS.md` (20 images; the BO2-2025 ones
opened with the Read tool for this lane as well), plus
`docs/research/2026-09-04/R4-bo2-nuketown-accuracy.md` where FINDINGS does not correct it.

## Base - READ THIS FIRST

The lane brief names `contrib/dave-gaming-pc/claude/pass93-candidate` as the candidate
head. **That branch does not exist on origin.** `git ls-remote origin` returned no ref
matching `pass93-candidate`, nor any other `*candidate*` beyond two Pass 70/71 codex
branches. The most-integrated head available was
`contrib/dave-gaming-pc/claude/nuketown2-handedness` @ `5f5ecc47`, which has
`nuketown2-tiptop`, `nuketown2-owner-round2`, `nuketown2-refine`, `nuketown2-accurate`
and `pass93-chrome153-hotfix` as ancestors. This lane is based on that.
**OPEN:** the integrator must confirm the base, or rebase this branch.

## Per-feature verdicts against the reference images

| # | Feature | Verdict | Evidence |
|---|---|---|---|
| 1a | Houses are **terracotta-orange over cream** and **white/cream** - blue/yellow gone | **VERIFIED** | `captures/nuketown2-front-porch.png`, `captures/nuketown2-south-yard.png` |
| 1b | White house wears **pale blue-grey roof glazing** | **VERIFIED** | `captures/nuketown2-overhead.png` (the two roofs read as different materials from above) |
| 1c | Exact hex values | **OPEN** | see "Colour" |
| 1d | **RED** appliance bank on the orange lawn, **BLUE** on the white lawn | **VERIFIED** | `captures/nuketown2-front-porch.png` (three red tops on a white cabinet); `nuketown2-plan.png` |
| 2a | Rear deck + exterior stair at the end **opposite the garage** | **VERIFIED** | `captures/nuketown2-south-yard.png`, `captures/nuketown2-north-balcony.png` |
| 2b | Deck over an **undercroft** | **VERIFIED** | both frames above - paved, recessed, in shadow under the deck |
| 2c | **Circular patio** at the stair foot | **VERIFIED (geometry)** / **OPEN (frame)** | `nuketown2-plan.png`; the review camera that should show it stands behind a pre-existing 1.9 m water butt |
| 2d | Porch is a **wide cantilevered eave, no posts** | **VERIFIED** | `captures/nuketown2-front-porch.png` |
| 0 | Every canonical arena, nuketown2 included, **boots a clean visible solo match** | **VERIFIED** | `boot-smoke-pass74.txt` - 13 passed |
| 3a | Street is a **lollipop** - one circular head, stem off-map | **VERIFIED (plan)** / **OPEN (in-engine)** | `nuketown2-plan.png`, `overhead-panel.txt`; see "The road is black" |
| 3b | **Third house** beyond the head, own drive, **red car** | **VERIFIED** | `captures/nuketown2-overhead.png` (the block outside the fence at the head end); `nuketown2-plan.png` |
| 3c | Coach on the **orange** side, truck + dark saloon on the **white** side, all nosed down the stem | **VERIFIED** | `captures/nuketown2-street-centre.png`; `nuketown2-plan.png` |
| 3d | **Green classic** in the stem | **VERIFIED** | `nuketown2-plan.png` |
| 4a | HF-473 garage-right cross-product gate still green | **VERIFIED** | `handedness-frame.txt` - all twelve spawns report `garage RIGHT` |
| 4b | Fidelity symmetry bands re-derived with reasons | **VERIFIED** | `src/nuketown2-fidelity.test.ts`, summarised below |

## Colour - what is authored, and what is OPEN

FINDINGS open item 4 says these are colour FAMILIES, not droppers. Each value is a
measurement plus one stated correction; the correction, not the number, is the contract.

| Surface | Measured | Authored | Correction |
|---|---|---|---|
| Orange house, upper | `#a85e46` (`nt2025-street-boii.jpg`) | `0x9f6147` | hue held at 17.7 deg, chroma and value taken **down** 5 % |
| Cream (both ground storeys, whole white house) | `#e4e2b4` / `#feffeb` (blown) | `0xeae3cf` | authored between the shipped map's `cream` 0xe7dbc1 and `white` 0xf0e4c9 |
| White house roof glazing | `#aebdc0` / `#b6c6c9` (aerial) | `0xaebdc1` | none - the measurement and the shipped map's own `chrome` albedo agree to 1/255 |
| Appliance tops | red / blue (aerial) | `0xa8382c` / `0x46809f` | reuse: the coach's red, and the value that used to paint the north house |
| Dark saloon / green classic | `#5a6b74` / `#78807a` under haze | `0x27394f` / `0x2f8f77` | hue taken, chroma authored at this arena's car-paint level |

**The chroma correction reversed direction mid-lane, and the captures are why.** The first
cut authored `0xb35a3c` - measured hue with chroma lifted 14 %, on the argument that the
mullion grid over the reference's band and the frame's haze pull a mean toward grey. The
first capture round refuted it: on this arena's key and exposure a lifted terracotta
rendered as bright safety-orange in daylight and fire-engine red on the shadow side. A
saturated albedo comes back **hotter** here than it reads in a hazy reference frame.

**OPEN - the exact hex.** Even at `0x9f6147` the lit face reads more orange than the
reference's terracotta. Falsifier: `captures/nuketown2-front-porch.png` beside
`nt2025-street-boii.jpg`. **A related OPEN, for an art lane:** the reference's orange is a
band of tall WINDOWS with orange mullions and spandrels, not a solid painted wall. Some of
the remaining difference is that, and no albedo fixes it.

## The road is black - why 3a is OPEN in-engine

The carriageway renders near-black at this arena's review hour, so the kerb ring that draws
the circle is not legible in any in-engine frame. Pre-existing (the asphalt material's own
comment records the same fight and one lift already applied), not a regression from this
lane. `nuketown2-plan.png` stands in: it is drawn straight from `buildNuketown2()`'s own
world AABBs, so it is built geometry, not a diagram of intent. **Falsifier:** one daylight
capture of the head, or an asphalt-albedo lift, from a lighting lane.

## Gate lines, quoted

    $ npx tsc --noEmit -p tsconfig.json
    (clean)

    $ npx vitest run src/nuketown2-fidelity.test.ts src/spawn-layout-quality.test.ts
        src/spawn-safety.test.ts src/collider-visual-parity-gate.test.ts
        src/walkable-surface-parity-gate.test.ts src/glass-authority.test.ts
        src/glass-collider-bounds.test.ts src/nuketown-overdrive-core.test.ts
        src/destructible-shed-map-parity.test.ts src/nuketown-lawn-field.test.ts
        src/atomic-profile-authority-parity.test.ts src/nuketown-traversal.test.ts
        src/nuketown-sightline-fidelity.test.ts src/railgun-authority.test.ts
     Test Files  14 passed (14)
          Tests  263 passed (263)

    $ npx tsx scripts/qa/find-coplanar-pairs.ts
    # HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
    # STREET pairs<=0.03m (offsets ignored): 0
    # boxes=793 pairs<=0.03m: 95 FINDINGS (different materials, no offset): 0 FENCED: 69 SAME-MATERIAL: 26
    (exit 0)

    $ npx playwright test tests/e2e/pass93-stock-flags-boot.spec.ts --project=chromium --workers=1 --retries=0
      ok 3 nuketown2: the real menu reaches a live frame with zero pipeline errors (1.1m)
      ok 4 skyline-terminal: the real menu reaches a live frame with zero pipeline errors (1.1m)
      4 passed (2.3m)

    $ PASS73_NATIVE_WEBGPU=1 npx playwright test tests/e2e/pass74-arena-boot-smoke.spec.ts --project=chromium --workers=1 --retries=0
      [12/13] arena boot smoke - every canonical arena > nuketown2: boots a clean visible solo match
      13 passed (9.5m)

    $ node scripts/qa/capture-arena-viewpoints.mjs --arenas nuketown2 ...
    [viewpoint-capture] backend=webgpu renderer=webgpu adapter={"gpu":true,"adapter":true,"device":true,"vendor":"nvidia","architecture":"blackwell"}
    [viewpoint-capture] nuketown2          OK 12/12 shots 86202 ms
    { "verdict": "PASS", "backend": "webgpu", "adapterVendor": "nvidia", "failed": [] }

GPU rule: ComfyUI queue empty, 14,364 MiB free, zero other headless Chrome, verified
immediately before each browser run. An earlier attempt was abandoned because another
lane's headless Chrome held the GPU; the wait samples are in `gpu-wait.txt`.

## The regression this lane found in its own work, and fixed

The first capture round would not deploy Nuke Town Rebuild at all:

    [Nuke Town Rebuild map selection failed] Error: WebGPU queue completion exceeded 12000 ms
    for submission 1 (completed 0, mode serialized, in-flight 1, pending 12012 ms, probes 1,
    fenced draws 511)

Isolated rather than guessed at: **Terminal deployed fine in the same build**; the **base
at `5f5ecc47`, built and served from its own worktree, deployed nuketown2 fine**; and the
same candidate with plain `MeshStandardMaterial` cars deployed fine. Cause:
`createNuketown2CarPaintMaterial` baked the base colour into the node graph as three
constants, so every colour is a separate WGSL shader and a separate pipeline compile. The
reference has three coloured cars in the street; the third and fourth compiles pushed the
arena's first submission past its own 12,000 ms deploy fence. **Fix:** the base colour is a
`uniform`, so every car paint shares one compiled pipeline - fewer pipelines than before
this pass, with the look unchanged.

**This is the failure the base branch's own note could not rule out**: the handedness lane
recorded its browser gates OPEN because free VRAM never left 739-1,050 MiB during its
twenty-minute wait. Nothing between `5f5ecc47` and this branch had ever been booted.

## Gates re-derived, with reasons - none relaxed

The lollipop breaks "every solid has an exact 180-degree partner" for the road, and it must:
FINDINGS Q4 VERIFIES one head at one end. `nuketown2-fidelity.test.ts` now carries three
enumerated classes, each paid for by a property:

- **Road** (`nuketown2 carriageway *`) - exactly **z-mirror symmetric**. The teams are
  separated across z; the lollipop's asymmetry runs entirely along x. Both teams still get
  an identical road, which is what the 180-degree rule was buying, proved directly. Also
  capped at **kerb height (0.30 m)**, so a wall, a house, a vehicle or any cover body is
  structurally barred from joining, and confined to the street corridor.
- **Verge** (`verge lawn *`, `street driveway *`) - road-plus-verge covers a
  **180-symmetric region**, sampled on a 0.5 m lattice offset off the tile seams. Tile
  boundaries are an artefact of how the band was cut up; the region is the claim.
- **Ground tiles** - 180-symmetric **everywhere off the carriageway**, sampled the same
  way, and classified by property rather than by a name list because the grid renumbers.
- **Third house** - every body asserted **entirely outside NUKETOWN2_BOUNDS**, and on the
  closed end, derived from the head's own footprint rather than from a literal sign.

Two bands moved, both with the reason written into the test:

- `MAX_STREET_CENTRE_RUN_METRES` is **unchanged at 21.2** and transfers from the invented
  "head car" to the green classic, which is the body the reference parks across z = 0.
- The street-vehicle **x-half floors** (20 m2 either side of x = 0) are replaced. They were
  a proxy: with a head centred on the map, "cover on both sides of the origin" and "cover
  in the head" were the same statement. Under a lollipop they differ and only one is a
  property of the reference. The replacement is more specific, not looser - at least 60 %
  of street-vehicle plan area stands in the head and at least 8 m2 out in the stem. **Both
  z-half floors, which are the actual fairness bands, survive untouched.**

One case was re-derived rather than moved: the upper front window's drop-out probe now
lands on the bulb's kerb apron, so its ceiling is stated as "eye height on a surface at or
below kerb height" against the same 0.30 m constant the carriageway class uses, and a
**floor** was added that the old case did not have. The surfaces it discriminates against -
the ground slab, the upper floor it fell from, and a vehicle roof - are 3 m from either
edge of the band.

Two instrument bugs the lollipop exposed and this lane fixed, both invisible while the
carriageway was its own mirror image: `find-coplanar-pairs.ts` and the fidelity ground-cut
gate both compared **world** boxes against the **authored** carriageway rects.

## Shared lines touched, exactly

- `src/nuketown2-layout.ts`, `src/nuketown2-arena.ts` - owned by this lane this round.
- `src/nuketown2-fidelity.test.ts` - the gates above.
- `src/nuketown2-vehicle-materials.ts` - ONE function, `createNuketown2CarPaintMaterial`:
  base colour becomes a `uniform`, plus `uniform` added to the TSL destructure list.
- `src/overdrive.ts` - ONE literal: the nuketown2 core seat's `x: 0` becomes
  `nuketown2HandedX(NUKETOWN2_CENTRAL_TRUCK.x)`, plus the import.
- `src/nuketown-lawn-field.ts` - one optional `paired?: boolean` on the dressing-piece type
  and one guard on the partner region.
- `src/rendering/arenas/nuketown2.ts` - ONE camera line (`nuketown2-street-centre`
  eye/target) and two comment blocks. No other camera, light, policy or profile moved.
- `scripts/qa/find-coplanar-pairs.ts` - the authored-to-world mirror above.
- `scripts/qa/nuketown2-overhead-panel.mts` - one legend regex.

## OPEN

1. **The base.** `pass93-candidate` does not exist on origin; based on `5f5ecc47`.
2. **Exact hexes** for every colour above (FINDINGS open item 4).
3. **The orange still reads hotter than the reference**, and part of that is the reference's
   mullioned window band - an art change this lane did not make.
4. **The head is not legible in-engine** because the carriageway renders near-black at the
   review hour. Pre-existing; plan evidence substituted.
5. **The bulb's inset** (1.5 m of verge between kerb and map bound) is authored, not
   measured - FINDINGS open item 5 records it as unmeasured.
6. **Two review cameras are crowded by pre-existing yard props** - the patio table set sits
   about 5 m in front of both back-yard spawn stations, and the 1.9 m water butt stands
   between the balcony station and the new circular patio. Not touched: dressing this lane
   does not own, and moving it changes cover.
7. **`pass74-arena-boot-smoke` needs `PASS73_NATIVE_WEBGPU=1` and the npm script does not
   set it.** Without it the chromium project takes the bundled Chromium, which cannot get
   a WebGPU device on this machine, and all ten arenas time out - `atomic-acres` included,
   so it reads like a whole-build failure when it is a harness misconfiguration. With it,
   13 passed. Worth fixing in `package.json` by a lane that owns it.
8. **The shared node_modules at aa-claude-chopper was destroyed mid-lane** by another
   process (`.bin` emptied, `@playwright` removed). This worktree was re-junctioned to
   `aa-shared-install/node_modules`, which every other lane already uses. Worth a gotcha.
