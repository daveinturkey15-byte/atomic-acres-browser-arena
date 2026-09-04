# PASS 94 - Nuke Town Rebuild materials lane

**Branch** `contrib/dave-gaming-pc/claude/nuketown2-materials`
**Base** `40e8081e` (local `contrib/dave-gaming-pc/claude/pass93-candidate`; that branch did
not exist on `origin` at lane start - see OPEN 1)
**Head** `4a4cc5ef`
**Impact class** `runtime`
**Skill** `photoreal-procedural-scene-forge` (SKILL.md and all four references read in full)

Method observed in `StarKnightt/morning-diner` (Claude Fable, 2026), shared by the owner via
x.com/prasenx/status/2095537643182563778; re-implemented from first principles. No source
file, function, shader string, identifier or prose from that repository is reproduced here.

---

## 1. The complaint, and what was actually wrong

The owner's report was that the map "looks like basic geometry". The arena was **not** short
of procedural materials - `nuketown2-facade-materials.ts` and `nuketown2-street-materials.ts`
already carried lap siding, shingles, asphalt and kerbs as TSL node graphs. Two measurable
things were missing, and both are numbers rather than shader cleverness:

1. **Wear at one scale.** Every shipped generator used a single mid-frequency fBm
   (`fbm2(p * 3.5 .. 14)`, i.e. features of 70-290 mm). A photograph shows sub-millimetre
   grain, hand-sized scuffs and metre-scale traffic gradients *at once*; one scale is the
   loudest CG tell there is.
2. **Wear the albedo could not carry.** Measured off the shipped source, the albedo swings
   were: roof tab variation 6%, granules 3.5%, siding board tone 4%, siding grain 3%, ground
   grime 1.4%, fence slat tone 8%. Below roughly 10% the eye does not resolve a step on a
   large flat surface, so that wear existed in the file and not in the frame.

On top of that, **ten roles were flat `MeshStandardMaterial(colour, roughness, metalness)`
with no map and no node at all** - `ground`, `lawn`, `drive`, `garageDoor`, `trim`, `block`,
`sign`, `planter`, `busTrim`, `coachGlass`. Those are literally basic geometry with a colour
on it.

Two of them were also the *wrong family*: the sectional garage door shipped at
`metalness 0.76` (a mirror, not a door - a 5 x 2 m panel returning the sky as one bright
rectangle from the street) and the coach glazing band at `metalness 0.5` (a coloured metal
band, not glass).

---

## 2. What changed

New library `src/nuketown2-materials/`, 12 files:

| File | What it owns |
|---|---|
| `spec.ts` | The wear contract as DATA: three scale bands in metres, the albedo-visible-wear floor, the combat-readability darkening ceiling, and `assertSpec`, which throws at construction |
| `wear.ts` | One shared three-scale wear engine driven by a spec, plus the sRGB-to-linear swatch decode and the metre-scale surface parameterisations |
| `families/siding.ts` | Lap siding: 184 mm courses, 3 mm drip shadow, nail dimples at 400 mm, 3.6 m butt joints, sun fade, splash-back grime, optional two-tone wainscot break snapped to a real course |
| `families/roof.ts` | Shingles: 143 mm exposure, 333 mm tabs in brick bond, 3 mm keyways, granule loss to the asphalt mat, algae streaking down-slope |
| `families/asphalt.ts` | Carriageway: aggregate, saw-cut cold patches, tar seams at paving-lane spacing (dark **and** glossy), crack network, polished wheel paths, kerb-channel silt - plus worn thermoplastic markings with road bite-through |
| `families/concrete.ts` | Kerbs, aprons and block: 2.7 m sawn control joints, 2.5 mm broom finish, per-bay pour tone, the **damp band** that wicks off every foot, and kerb-nose spalls that expose the *pale* core |
| `families/timber.ts` | Fence pickets (146 mm), deck boards (145 mm) and painted trim: latewood banding along the board, knots, UV **silvering** (a light step), dark damp foot |
| `families/glass.ts` | Dielectric glazing: `metalness 0`, rain streaking, uncleaned grime that rides **opacity** as well as albedo |
| `families/painted-metal.ts` | Garage doors, signage, coach panels: 0.51 m panel joints, orange peel, **chips to primer**, UV chalking, rust weep at the threshold |
| `families/lawn.ts` | Turf, scrub and hedge: mower bands, desire lines worn through to bare earth, straw scorch |
| `index.ts` | `createNuketown2MaterialRegistry()` - one material per **role** |
| `nuketown2-materials.test.ts` | The family gate |

`src/nuketown2-facade-materials.ts` and `src/nuketown2-street-materials.ts` are superseded
and removed; the arena was their only importer, and `npm run qa:unreachable` would have
failed on them otherwise.

### Measured wear, per family

Every scale sits inside its authored band and every step clears the 10% floor. Produced by
reading the same spec objects the node graphs are built from:

```
siding           step=22.5% grain=0.9mm scuff=45mm traffic=1.6m rough=0.74  metal=0
roof             step=23.5% grain=1.1mm scuff=60mm traffic=2.2m rough=0.9   metal=0.02
asphalt          step=22.5% grain=1.0mm scuff=35mm traffic=2.6m rough=0.95  metal=0.02
marking          step=29.0% grain=1.0mm scuff=50mm traffic=1.4m rough=0.86  metal=0.02
concrete         step=22.5% grain=1.0mm scuff=40mm traffic=2m   rough=0.92  metal=0.01
timber-fence     step=27.0% grain=1.2mm scuff=55mm traffic=1.8m rough=0.9   metal=0
timber-painted   step=21.8% grain=1.2mm scuff=55mm traffic=1.8m rough=0.66  metal=0
glass            step=21.5% grain=0.8mm scuff=30mm traffic=1.2m rough=0.045 metal=0
painted-metal    step=23.0% grain=0.9mm scuff=50mm traffic=1.5m rough=0.42  metal=0.08
lawn-turf        step=30.0% grain=1.0mm scuff=60mm traffic=2.4m rough=0.97  metal=0
lawn-scrub       step=30.0% grain=1.0mm scuff=60mm traffic=2.4m rough=0.97  metal=0
lawn-hedge       step=24.5% grain=1.0mm scuff=60mm traffic=2.4m rough=0.97  metal=0
```

All twelve land in the skill's 10-30% band, and nothing exceeds 30%.

### Bounds honoured, not negotiated

- **Combat readability.** `MAX_ALBEDO_DARKENING = 0.45` is asserted per spec **and** clamped
  in the shader, so no surface loses more than 45% of its albedo to wear however a family
  composes its own terms on top. There is no 5 EV sun-to-shade grading anywhere in this lane:
  it does not touch lighting, exposure or post at all.
- **No new light objects.** Gated: the registry sweep asserts nothing it returns is a light.
- **No textures.** Gated: every map slot on every role must be `null`.
- **No per-frame allocations.** Every wear term is a node expression built once at material
  construction; nothing in the library runs per frame on the CPU.
- **Authority untouched.** No collider, ballistic class, breakable pane, spawn, footprint or
  review camera changed. Materials only.
- **HF-434 offsets carried verbatim**, and now authored *with* the material instead of being
  reapplied by a local `withOffset` helper that a call site could forget.

---

## 3. Shared lines touched

`src/nuketown2-arena.ts` only - **37 insertions, 50 deletions**, in these regions:

| Region | Change |
|---|---|
| import list ~line 105 | dropped the now-unused `standard` from the `./additional-maps` import |
| imports ~lines 137-160 | the `./nuketown2-street-materials` (4 symbols) and `./nuketown2-facade-materials` (3 symbols) import blocks replaced by one `import { createNuketown2MaterialRegistry } from './nuketown2-materials';` |
| `nuketown2Materials()` ~1024-1060 | the local `withOffset` helper and the 12 `const x = create...()` / `standard(...)` locals for library-owned roles replaced by one `const forged = createNuketown2MaterialRegistry();`; the HF-434 comment retained and extended |
| `nuketown2Materials()` return ~1078-1130 | 18 role entries now read `forged.<role>`; every surrounding authored comment kept |

No other shared file is touched. Nothing in `src/legacy-main.ts`, no arena geometry, no
layout table, and no existing test.

---

## 4. What the frames actually show

Seventeen deterministic review captures per side, on the REAL native-WebGPU
route in installed headless Chrome (backend `webgpu`, adapter nvidia/blackwell,
1280x720, fixed visual time and seed, HUD hidden), taken twice: once against
this branch and once against a build of its own base commit `40e8081e` in a
separate worktree, so the pair differs only by this lane.

### The honest read, frame by frame

**Lap siding — a regression I shipped and then caught.** The first capture set
came back with both houses as FLAT COLOURED BOXES. The lap shadow had been
authored at its true 3 mm width, which at the 8 m a player reads a wall from is
0.6 of a pixel; the material it replaced used a 22 mm band and its courses read
clearly in the same frame. Physical accuracy that deletes the thing the frame
must show is not accuracy. It is now a graded ~35 mm band with the drip edge as
a hard core inside it — which is also what the wedge-shaped board really does —
and `nuketown2-front-porch` and `nuketown2-north-yard` now read as lap boards
across the whole wall.

**Blockwork is the clearest win.** The yard cover walls, buttresses, plinths and
kerbstones were flat tan boxes. They are now 200 mm courses in half bond with
400 mm stretchers and recessed joints, and in `nuketown2-north-yard` and
`nuketown2-into-sun-street` they read as concrete blocks at a glance.

**The porch and drive slabs** gained sawn joints, per-bay pour tone and a broom
finish; they read as poured concrete rather than as a pale plane, though the
joints are subtle at 6 m and could stand to be a touch deeper.

**Lawn: over-done first, then pulled back.** The first overhead capture showed
both yards as brown blotches - the bare core opened too early and mixed too far,
so the wear read as mud and swamped the mown checker. Thresholds moved late and
the core mix cut to 60%; the wear now reads as paths across a lawn.

**Worn lane markings** read better than the shipped ones in
`nuketown2-street-centre`: the bar is a dirty warm off-white with the road
biting through it, not a clean grey strip.

**What still does not read.** The hedges are flat green - the hedge variant
carries the least structure of any family and it shows. The carriageway is in
deep shade at this sun angle in the street frames, so the aggregate, wheel paths
and tar seams are all but invisible there; they show on the sunlit apron and in
the overhead. And the siding's own albedo wear - splash-back grime, sun fade,
ladder scuffs - is present but quiet next to the course structure.

---

## 5. Gates

Quoted from the runs. The last commit that changes any source is `32105cdf`;
everything after it is this document and the captured frames, so the `tsc` and
`vitest` results below are the final source state.

```
$ npx tsc --noEmit
(no diagnostics)   exit 0
```

```
$ npx vitest run src/nuketown2-fidelity.test.ts src/nuketown2-glass-authority.test.ts \
    src/nuketown2-materials/ src/collider-visual-parity-gate.test.ts \
    src/walkable-surface-parity-gate.test.ts src/nuketown-lawn-field.test.ts
 Test Files  6 passed (6)
      Tests  109 passed (109)
```

The new per-family gate is 49 of those. Separately green in this lane:
`src/ballistics.test.ts`, `src/collider-visual-parity-gate.test.ts`,
`src/destructible-shed-registry.test.ts`, `src/killstreak-flight-navigation.test.ts`,
`src/map-selection.test.ts`, `src/match-diagnostics-migration.test.ts`,
`src/overdrive-line-of-sight.test.ts`, `src/railgun-authority.test.ts`,
`src/spawn-layout-quality.test.ts`, `src/spawn-selection.test.ts`,
`src/walkable-surface-parity-gate.test.ts`, `src/rendering/lighting-conditions.test.ts`,
`src/ui/menu-preview-video.test.ts`, `src/additional-maps.test.ts`,
`src/rendering/arena-visual-definition.test.ts`, `src/project-map.test.ts`,
`src/nuketown-overdrive-core.test.ts`, `src/arena-contrast-lighting.test.ts`,
`src/nuketown-forest-surround.test.ts`, `src/nuketown-mountain-backdrop.test.ts`,
`src/legacy-main-size-ratchet.test.ts` - 313 + 90 tests, 0 failures.

**Coplanar instrument, unchanged.** Same run before and after this lane:

```
# boxes=726 · pairs<=0.03m: 92 · FINDINGS (different materials, no offset): 0
  · FENCED (material offset): 66 · SAME-MATERIAL (benign): 26
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
```

`coplanar-before.txt` and `coplanar-after.txt` are both in this directory. Every
verdict row is byte-identical once the printed material NAME is masked - the ten
formerly-anonymous `mat=MeshStandardMaterial` rows now print their role name -
and the headline counts are identical unmasked.

**Arena boot smoke, native WebGPU:**

```
$ PASS73_NATIVE_WEBGPU=1 npx playwright test tests/e2e/pass74-arena-boot-smoke.spec.ts \
    --project=chromium --workers=1 --retries=0 -g nuketown2
  1 passed (53.7s)
```

**Stock-flags boot (`npm run qa:stock-boot`), installed Chrome, no unsafe flags** -
run at head `d3c925ab`:

```
  ok 1 launch arguments carry none of the flags that mask Tint lowering bugs (12ms)
  ok 2 stock-flag Chrome exposes a WebGPU device, or the arena boots skip by name (883ms)
  ok 3 nuketown2: the real menu reaches a live frame with zero pipeline errors (1.4m)
  ok 4 skyline-terminal: the real menu reaches a live frame with zero pipeline errors (1.2m)
  4 passed (2.6m)
```

**Review captures**, native WebGPU in installed headless Chrome, at the FINAL
head `32105cdf` (and, for the before/after pair, at base `40e8081e`). A capture
run deploys the arena and parks on every authored review camera, so 17/17 shots
at the final head is itself a boot-and-render receipt for the material state
this branch ships:

```
[viewpoint-capture] backend=webgpu adapter={"vendor":"nvidia","architecture":"blackwell"}
[viewpoint-capture] nuketown2          OK 17/17 shots
{"verdict": "PASS", "backend": "webgpu", "failed": []}
```

Every browser run observed the machine rule first: ComfyUI queue empty
(`{"queue_running": [], "queue_pending": []}`), at least 12,511 MiB of GPU memory
free, and zero other headless Chrome processes. Three runs were deferred and
polled for, and one capture attempt that started with four foreign headless
Chromes present was abandoned and re-run rather than counted.

No gate, threshold, fence or assertion was weakened. The two gates this lane
adds - the 10% albedo-visible-wear floor and the physical wear bands - were
tightened once during the lane, never loosened.

---

## 6. OPEN

1. **The base branch was never on `origin`.** The lane brief names
   `contrib/dave-gaming-pc/claude/pass93-candidate` as the PASS 94 candidate head
   and says to base on origin's head at start. `git ls-remote` showed no such ref
   at 13:32; the only `pass93*` ref on origin was `pass93-chrome153-hotfix`
   (`bebb9124`). The branch existed LOCALLY at `40e8081e`, checked out in another
   worktree, so that is what this lane is based on. If the integrator's candidate
   has moved since, rebase before merging.
2. **The plain beyond the fence reads as pale sand, and it is not this lane's
   surface.** The overhead frame shows the 220 m ground outside the fence as a
   flat cream field. It is byte-for-byte the same in the base capture, so it is
   the mountain-backdrop skirt rather than the arena's own ground material -
   which is authored at 0x515642, an olive. Whoever owns
   `nuketown-mountain-backdrop.ts` should look at that frame: the map currently
   sits on a beach.
3. **FIXED in this review pass: the reference houses are terracotta-orange over
   cream and white/cream, not blue and yellow.** HF-477 pins `0x9f6147` for the
   north upper siding and `0xeae3cf` for the shared cream/south house; the
   existing siding wainscot hook now applies the cream ground-storey break.
4. **The driveway aprons in the reference are mottled tan flagstones**, not the
   grey poured slabs the arena builds. That is a paving-type decision belonging
   to the geometry/accuracy lane, not a material treatment, so it was left alone
   and is recorded here with the frame that shows it.
5. **The hedges carry the least structure of any family** and read flat green in
   every frame. A hedge is a mass of leaves, not a painted box, and it wants a
   real foliage treatment rather than a lawn variant.
6. **Two pre-existing gate failures**, neither in this lane's diff and both
   present on the base: `npm run qa:unreachable` exits 1 on `src/map3/sky.ts` and
   `src/map3/main.ts`, and `npm run qa:text-integrity` fails on
   `docs/evidence/pass94/nuketown2-ballistics/gate-tsc.txt: is unexpectedly
   empty` (committed empty at `d8eaa1df`).
7. **No `HF-###` ledger row was created.** The owner statement this lane answers
   is "the map looks like basic geometry", which has no row in
   `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`. Writing to that shared ledger from
   a feature worktree would conflict with every parallel lane, so the row is left
   for the integrator to assign.

---

## 7. The seven review captures

Head `32105cdf`, native WebGPU, installed headless Chrome, 1280x720, fixed
visual time and seed, HUD hidden. SHA-256:

| Frame | SHA-256 |
|---|---|
| [overhead](review-overhead.png) | `04fb4fb585a740f0c9f3b838ce991d014db067360fdd514e868f5d8656902fcd` |
| [north yard](review-north-yard.png) | `d955d57cd1c3d5f5fd6c1614d03ff263e8bef40daf5ae990ae8138db30d9dcae` |
| [south yard](review-south-yard.png) | `d6d482b991ef2d22c303c4a33fcf18f6d5e9f3c041378d935c0ba7701eb295e8` |
| [street centre](review-street-centre.png) | `61733c5023f00a46fadbf2670abc98d0831f2a561d53930ee7f510c3e57d30b2` |
| [north upper window](review-north-upper-window.png) | `5f7c5c08ae65358dc87d05527d3d2a812c8b5b6f90ac46375767d2504e416b8a` |
| [south upper window](review-south-upper-window.png) | `45a0d2352d7054d77fa5074d077e32fb4eed060a0d938362bd52c565854069f6` |
| [into-sun street](review-into-sun-street.png) | `4c5497034e5a6d5da9e1c53894dd32cead0bfb3867182ae9bcffdd4aa5967211` |

The interior and vehicle stations from the same run (garage, balcony, front
porch, coach elevation) were captured too and reviewed; the garage frame is the
clearest look at the timber deck boards and the sawn slab joints, both of which
read as the real thing.

**Would a viewer think it is a photograph?** No, and honestly nothing in this
lane could make it one - the arena's geometry, lighting rig and grade all sit
somewhere else, and a competitive shooter's readability bound deliberately
prevents the exposure a photograph needs. What did change is narrower and
answerable: surfaces that were one flat value now have structure at the size the
real thing has it, and blockwork, lap siding, deck boards, poured slabs and worn
lane markings each read as their own material rather than as a coloured box.

---

## 8. OPEN, continued

8. **The boot smoke and stock-boot were not re-run at the final head.** They ran
   green at `d3c925ab`; the three commits after it change shader TERMS only -
   two smoothstep edge values on the siding lap, one base hex on the fence, and
   three thresholds plus one constant on the lawn - and introduce no new node
   type, uniform or material. The 17/17 native-WebGPU capture run AT `32105cdf`
   covers boot and render for that exact state, but it does not assert "zero
   console errors", which is what the smoke adds.

   The re-run could not be performed: the shared `node_modules` tree these
   worktrees junction into (`aa-claude-chopper/node_modules`) lost `@playwright`
   and `.bin` part-way through this lane, mid-session, while another agent was
   working on this machine. `vitest`, `tsc` and `vite` still resolve; `npx
   playwright test` now returns `unknown command 'test'` because npx falls back
   to the deprecated standalone package. Repairing a dependency tree that
   another agent is actively using is not this lane's call, so it is recorded
   here rather than fixed. **The integrator should re-run both gates at the
   merge head.**

## Muse review TODOs

- **TODO (integrator; larger browser verification):** At the final merge head,
  start the lane's isolated preview and run
  `PASS73_NATIVE_WEBGPU=1 npx playwright test tests/e2e/pass74-arena-boot-smoke.spec.ts --project=chromium --workers=1 --retries=0 -g nuketown2`,
  then run `npm run qa:stock-boot` with installed Chrome and no unsafe flags.
  Retain receipts showing the final SHA and zero console errors; do not merge
  on the existing capture receipt alone. This remains open here because this
  repair pass is explicitly browser/build-free.
- **TODO (vegetation/techniques owner; larger visual treatment):** Replace the
  hedge `lawn` variant's flat green treatment with a real foliage-mass
  presentation owned by the vegetation/techniques lane. Preserve the existing
  movement/shot authority and profile parity, then add a deterministic hedge
  review capture plus the affected material/vegetation gate before closing
  this handoff; a lawn variant alone cannot prove foliage mass.
