# FARCRYSIS rework plan — what "total rework" must mean, and how to land it

**Lane:** FARCRYSIS (research only, no commits). **Author:** Opus implementation agent,
2026-09-04. **Worktree read:** `C:\Users\david\projects\aa-claude-research` @ `4ca00bb5`
(branch `contrib/dave-gaming-pc/claude/research-2026-09-04`).
**Ledger rows:** HF-423 (unhide), HF-429 (park), HF-451 (techniques), HF-455 (HITL before
publish), HF-462/468 (reference-grounded forge), HF-467 (penetration classes).
**Sibling research read:** `R1-diner-method-skill-draft.md`, `R2-reference-grounded-loop-design.md`
(fully), `R3`/`R5` headings and the sections named below.

**Claim-state key.** `VERIFIED` = I read the file or ran the command in this session and
quote what it said. `CLAIMED` = a document or another agent's report asserts it and I did
not independently measure it. `OPEN` = unknown, and named as unknown.

Nothing in this document copies geometry, texture data, shader code or trade dress from any
external game. Where an external work is referenced it is referenced as a *bar*, never as a
source of assets.

---

## 1. Why it is parked — the record, not the recollection

**VERIFIED, `src/map-selection.ts:200–275`.** The registry row is `selectable: false`,
`multiplayer: false`, `prototype: true`, with the whole park reasoning inline. The comment
is explicit that parking is **not** a rollback: "Everything Lane R landed stays exactly as
it is… Nothing was deleted to make a gate green." Every roster-dependent pin is DERIVED
from this registry, so the single field is the whole park.

**VERIFIED, ledger HF-429 (owner, 2026-09-03):** *"Farcrysis needs a total re work its
assets and texures are still a mess and it hasnt used the new techniques from threejs etc
for its nature and water, that would need to be sorted, so remove that map and park that
for later."* The ledger row adds: *"a future rework must use the new vegetation/water/
interior-lighting skills. The admission guard keeps working for a parked build."*

**VERIFIED, memory `atomic-acres-art-lighting-direction` (owner, 2026-08-31):** rework =
*"remove all the messy clutter in the middle etc"*, reuse the techniques from test1/test2
and the third-map thread, label it PROTOTYPE; the goal is *"look and feel and also have
physics and lighting similar to playing crysis 1 and farcry back in the day"* and *"a fun
multiplayer map with jungle and beach"*.

**VERIFIED, `docs/PASS87_MORNING_REPORT_2026-09-03.md:130` and the HF-423 lane result:**
what the previous lane itself said was owed next — *"collapse 224 materials onto the shared
vocabulary, the core building's floor/walls and a practical light, the 25 runtime eye rows,
your vegetation technique"* — and the shipped caveat: *in-combat frame time is 1.34–1.89x
atomic-acres (median 1.64x); 224 vs 110 distinct materials is the lever, not attempted.*

**VERIFIED, `docs/evidence/pass87/lane-r/frame-time-at-head.json`** (paired, same browser
launch, quiet machine, ComfyUI queue empty, 1600x900 WebGPU headless), run 1:

| | farcrysis | atomic-acres |
|---|---|---|
| p50 frame | **18.2 ms** | 13.6 ms |
| p95 / p99 | 24.6 / 28.1 ms | 20.4 / 23.6 ms |
| meshes | 253 | 161 |
| instances | 93,194 | 27,133 |
| triangles | 866,727 | 538,735 |
| shadow casters | 99 | 64 |
| **distinct materials** | **222** | **110** |
| transparent | 48 | 36 |
| pipelines during sample | **0** | **0** |

**VERIFIED, `docs/evidence/pass87/lane-r/farcrysis-admission.json`** (contract
`farcrysis-admission-evidence-v1`, sha `28b2d0a9`, measured 2026-09-03T03:22Z, uncontended,
3 paired runs): `selectToAdmittedMs` farcrysis mean **46,072** / max 48,199 vs atomic-acres
mean **36,390** / max 37,160; pair ratios 1.2678 / 1.2971 / 1.2326, **worst 1.2971**;
`allAdmitted: true`, `anyCrashed: false`, `anyPageErrors: false`, `maxMenuPipelines: 0`.

**OPEN — a discrepancy to reconcile before anyone re-quotes either number.** The ledger's
02:10 entry records farcrysis 30.5/34.4/31.1 s vs 25.2/26.8/24.9 s and *"worst pair ratio
1.283 over twelve pairs"*. The receipt in this worktree is a later (03:22) three-pair run
of a different field. Both are honest; they are not the same measurement. The rework lane
must re-measure at its own head rather than inherit either.

**VERIFIED, scope.** 48 farcrysis files in `src/`: 23 source (**14,832 LF lines**) and 25
tests (**5,698 lines**). The three largest source files are
`farcrysis-vegetation.ts` (133 KB), `farcrysis-art.ts` (54.7 KB) and
`farcrysis-textures.ts` (47.7 KB) — that mass is what the owner is calling "a mess".
`src/legacy-main.ts` carries exactly **one** `FARCRYSIS-LOAD` marked region.

---

## 2. What "total rework" must mean

The owner said *total*. The trap is reading that as "delete the arena and start again",
which would throw away six lanes of measured authority work and re-open every gate hole
that was closed. The correct line is **surgical about which layer is total**:

> **Rework the presentation layer completely. Preserve the authority layer byte-for-byte
> unless a measurement says it is wrong.**

### 2.1 Rebuilt from zero (the "total" half)

| Layer | Today | After |
|---|---|---|
| Surface maps | `farcrysis-textures.ts` (47.7 KB) + `farcrysis-ground-textures.ts` + `farcrysis-ground-materials.ts`, arena-private generators | One vocabulary through `src/rendering/surface-forge.ts` (VERIFIED: exports `SurfaceDescription`, `forgeSurface`, `sharedSurfaceMaps`, `surfaceStandardMaterial`, `MICRO_TILE_METRES = 0.25`), authored in **millimetres**, shared micro/macro rasters |
| Vegetation | `farcrysis-vegetation.ts` (133 KB) + `-palms-enhanced` + `-tsl-foliage` + `-grass-field`, several parallel systems | One instanced system per the `threejs-procedural-vegetation` skill (Fibonacci lattice, trunk/canopy split meshes, per-instance jitter) + the cluster-geometry rule from `docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md:481` — solid procedural geometry inside ~25 m, merged cards for MID/FAR fill |
| Water | `farcrysis-water-surface.ts` + `-water-fx` + `-water-ripples` + `-shore-bands`, arena-private | The `threejs-webgpu-water` contract: one declared spectrum with two consumers (TSL displacement + CPU `sample(x,z,t)`), Beer-Lambert absorption colour, persistent breaking foam, shoreline band, swimmable volume, registered in `src/water/water-authoring.ts` (VERIFIED: `WATER_BODIES` already keys `farcrysis`, and `waterBodyForArena('farcrysis')` is pinned by test) |
| Interior of the core | no floor, no walls, no practical light (owed by the previous lane) | The `threejs-webgpu-interior-lighting-look` recipe: emissive fixtures, value composition, fog falloff, decal grime, filmic post — with its combat-readability rules |
| Mid-map dressing | `farcrysis-midmap-landmarks.ts` + `farcrysis-detail.ts` + `farcrysis-visual-dressing` | Cleared and re-composed against the owner's "remove all the messy clutter in the middle" |
| Material count | **222 distinct** | **≤ 110 distinct** (parity with the shipped control) |

### 2.2 Preserved (the half that is not a rollback)

Each of these is a *measured* asset with a receipt. Deleting it to make the rebuild easier
would be exactly the regression the repository's own rules forbid.

- `farcrysis-terrain-authority.ts` + its test (30.8 KB / 30.3 KB) — the terrain collision
  proxy that took the HF-402 spawn-floor rule from 6.44 % to 100 % coverage and made the
  island stop bullets (VERIFIED in the registry comment).
- `farcrysis-constants.ts` — the solved spawn table (`FARCRYSIS_SPAWNS_XZ`, 6 per team),
  patrol anchors, `FARCRYSIS_BOUNDS` ±64 m, `FARCRYSIS_MAX_SIGHTLINE = 22`,
  `FARCRYSIS_COVER_MIN = 14`. It is the designated leaf module; both the arena and the
  vegetation layer must keep deriving from it (that de-duplication is why it exists).
- `farcrysis-physics.ts` (61.4 KB) — interactables, fuel drums, crate-lid / tower-deck /
  dish / cave-crown authority.
- The `FARCRYSIS-LOAD` region in `legacy-main.ts` (the admission fix).
- Every existing test file. **25 test files stay.** A test may be *extended*; none may be
  weakened, and none may be deleted because its subject was rewritten — if a subject is
  rewritten, its test is rewritten to hold the new implementation to the same or a tighter
  bound.
- The admission-evidence guard and its red test in the publish script.

### 2.3 The card stays parked until the very end

`selectable: false` is the last line changed, in its own commit, after every gate below is
green and after the owner has played a local HITL build (HF-455). PREVIEW/PROTOTYPE
labelling and `multiplayer: false` stay as they are until he says otherwise.

---

## 3. The art brief, in the diner / reference-grounded style

R1 §1 step 1 is explicit: **freeze the brief as a document before any code**, including the
negative space. This section is that document; the lane copies it into
`docs/farcrysis-rework/BRIEF.md` verbatim and does not edit it mid-flight.

### 3.1 The frozen brief

- **Subject, one sentence.** A small equatorial island research station, flooded and
  abandoned long enough for the jungle to have taken the concrete back: a lagoon-side beach
  ring, a dense mid-island jungle band, and a broken reinforced-concrete core.
- **Time and weather, one sentence.** 07:40, an hour after sunrise, clear with high haze
  after overnight rain — the sun is low and warm from the east, every horizontal surface is
  still damp, and the air has enough moisture to make one soft shaft through the canopy.
  *(This one sentence fixes the entire light rig; it is not decoration.)*
- **Photographic register.** Documentary tropical-coast photography and dive/expedition
  stills: hard sun, deep but *open* shade, colour in the shadows from bounced sand and
  foliage, no orange grade. Not a film-look, not golden hour, not neon.
- **Acceptance question — inverted for a shooter (R1 method step 16).**
  *"Would a paused frame read as a photograph, AND can I read an enemy silhouette at 20 m
  standing in the deepest shade on the map?"* Both, or it fails. A 5 EV sun-to-shade ratio
  and shaded walls at sRGB 46 are correct for a photograph and **wrong for an arena**.
- **DO NOT list.** No golden hour. No orange grade. No fog bank (one haze shaft, physically
  motivated, ≤ 0.004 of sun radiance per lit metre — R1 §8). No lens flare. No bloom beyond
  the shipped chain's `strength ≈ 0.045`. No neon. No imported assets of any kind
  (`authoring: 'code'`, `authoringNote: 'ALL CODE BUILD, NO ASSET IMPORT'` is a registry
  contract, VERIFIED). No pure black and no pure white in any generator (blacks ~26 sRGB,
  whites ~220). No flat single-colour surface anywhere a critic camera can see (HF-451).
  No new clutter in the middle of the map.
- **Machine budget.** Headless only, one browser at a time, ports 4280–4289, ≥ 3000 MiB
  free VRAM and an empty ComfyUI queue before any capture, never on the owner's main
  screen.

### 3.2 Reference sets — the source ladder, and the line that keeps this original

Follow R2 §3.2 exactly. One `docs/reference-sets/<subject>/reference-set.json`
(contract `reference-set-v1`) per subject; image cache under
`artifacts/reference-cache/` which is gitignored by construction; provenance and
measurements committed, images not.

**The line that matters for this arena specifically:**

> A frame grab from Far Cry or Crysis is **REJECTED**. It is not a reference, it may not be
> measured, and it may never be put in front of a critic as "make it look like this."
> The arena is an *original* homage; its bar is photography of the real world.

Subjects and their sets (all T2 = our own capture, or T3 = permissively licensed real-world
photography, with a resolving fetch receipt per R2 §3.3):

| Subject | What the set must contain | Used for |
|---|---|---|
| `farcrysis-beach-and-lagoon` | wet sand at grazing sun, dry sand at 1 m, waterline foam, shallow lagoon over pale sand at two depths | sand families, water absorption tint, foam |
| `farcrysis-jungle-canopy` | canopy from below against sky, understory in shade, a palm trunk at 0.5 m, fronds backlit | foliage translucency, shade colour, bark |
| `farcrysis-concrete-ruin` | weathered board-formed concrete, rebar staining, a spalled edge, moss/algae at the damp line | the core building's material family |
| `farcrysis-corroded-steel` | painted steel with rust bloom, a corrugated sheet, a shipping-crate corner | drums, crates, tower, dish |

**Two independent sources per load-bearing number, with the agreement percentage
published** (R2 §3.3). **Reference gathering is not delegable to Gemini Flash** — HF-426 §0
recorded four dead URLs presented as citations; that is the exact failure mode.

### 3.3 Material families — the table the lane starts from

Ranges, not gospel (R1 §6). Every family is authored **in millimetres and measured**, not
in noise units, and every one of them is a row in the ≤ 110 distinct-material budget.

| Family | Type | roughness | metal | clearcoat / cc-rough | notes |
|---|---|---|---|---|---|
| Dry sand | Standard | 0.94 × map | 0 | — | albedo step, not roughness-only; ±1.5 % macro tone |
| Wet sand (waterline band) | Physical | 0.35 × map | 0 | 0.25 / 0.35 | darkens ~18 % albedo, not a gloss trick |
| Coral rubble / shingle | Standard | 0.88 × map | 0 | — | 20–80 mm scale is the readable one |
| Weathered concrete | Standard | 0.90 × map | 0 | — | board-form lines at true 150 mm pitch; spall = geometry |
| Rebar stain / algae damp line | (map on concrete) | — | — | — | a 10–30 % **albedo** step, never roughness-only |
| Painted steel, worn | Standard | 0.55 × map | 0.15 | — | `0x383838` floor for dark paint, never `0x141414` |
| Corroded steel / rust bloom | Standard | 0.82 × map | 0.3 | — | rust is an albedo family, not a normal map |
| Palm bark | Standard | 1.0 × map | 0 | — | anisotropic noise along the trunk axis |
| Frond / broadleaf | Physical | 0.62 | 0 | 0.1 / 0.4 | thin-surface translucency term; cards MID/FAR only |
| Undergrowth tuft | Standard | 0.85 | 0 | — | 3-blade Bezier cluster geometry, one node graph |
| Lagoon surface | see §3.5 | — | — | — | one spectrum, two consumers |
| Crate ply / canvas tarp | Standard | 0.88 × map | 0 | — | penetration class from R3 |

**Wear has three scales and a photograph shows all three** (R1 §5): 0.5–1.5 mm grain,
20–80 mm scuffs and blooms, 0.5–3 m traffic and weathering gradients. One scale is a CG
tell — and *one scale is exactly what the current arena has*, which is the honest technical
translation of "the textures are a mess".

**Anti-tell checklist (R1 §2, §5):** razor-sharp shadows everywhere; uniform gloss;
cracks drawn dark instead of built as geometry; no contact shadows; missing bounce;
perfect edges and perfect alignment; uniform dirt; noise at one scale only; sun colour too
orange. **Traps that will each cost a rev if ignored:** canvas row 0 is `v = 1` (anything
authored at a height must be drawn at `(1 - v) * size`); `ImageBitmap` uploads ignore
`flipY`/`premultiplyAlpha`; `new THREE.Color(r,g,b)` with floats is **linear** since r152;
wear that lives only in roughness is invisible.

### 3.4 Lighting

- Physical rig with a **derived** exposure, not a tuned one:
  `EV100 = log2(N²/t) − log2(ISO/100)`, `L_sat = 1.2·2^EV100`, `exposure = 1/(L_sat·K)`,
  `K = 1e-4`. **Meter on the subject** — the shaded jungle floor, not the beach, or the
  playable half of the map ships 1.5 EV under.
- Keep the frozen grade order in `src/rendering/filmic-grade-chain.ts` (VERIFIED present);
  add the camera block that derives exposure. R1 §2 names this "the highest-value single
  import for our look".
- Two probes through `src/rendering/arena-environment-ibl.ts` (VERIFIED present): a sun-off
  probe as `scene.environment` for dielectrics, a sun-on probe as `envMap` for
  `metalness ≥ 0.9`. **Every material belongs to exactly one probe.**
- **Combat-safety inversion is a gate, not a preference.** Every grade stage must be
  provably non-hiding: a toe that only lifts, bounded midtone slope, luminance-preserving
  split toning, clamped grain. The deepest shade must still separate an operator silhouette
  at 20 m — measured, from a capture, not judged.
- The analytic periodic-occluder transmittance trick (R1 §7) is the right tool for the
  canopy dapple and the tower grating: solve it per fragment instead of shadow-mapping a
  periodic occluder. It removes the tuning knob along with the problem, and it is one of
  the few structural ports that pays for itself immediately.

### 3.5 Water

The `threejs-webgpu-water` contract, in its own words (VERIFIED, SKILL.md): *"Use the same
declared wave components for GPU displacement and CPU/gameplay sampling… Never tune visual
waves and physics waves independently."* For this arena:

- One deterministic spectrum module; TSL displacement + analytic normal on the GPU;
  `sample(x, z, t)` on the CPU for buoyancy, swim state, VFX and audio.
- Colour by **Beer-Lambert absorption** over the measured lagoon depth, not a tinted plane.
- Persistent breaking foam at the shoreline band; the shore ramp already exists in
  `src/water/water-authoring.ts` (VERIFIED: the farcrysis body's shore factor is
  `(chebyshev − 15) / 22`, cross-checked against `farcrysisTerrainHeight` by
  `water-authoring.test.ts`) — reuse it, do not author a second one.
- Swimmable volume through `src/water/swim-state.ts` (VERIFIED present, and its vertical
  loop is already pinned by `farcrysis-terrain-authority.test.ts`).

### 3.6 The core building

Owed since PASS 87 and named by HF-429's "interior-lighting skills": a real floor, real
walls, and a **practical** light. Follow `threejs-webgpu-interior-lighting-look` — emissive
fixtures carrying the value composition, fog falloff, decal grime, filmic post — under its
own non-negotiable readability rules. A dark opening is a **dim lit box, never a black
quad** (R1 §4).

---

## 4. The gameplay brief

Layout authority is **not** being rebuilt. The map rhythm the arena already documents —
three overlaid loops (beach/lagoon ring, dense jungle mid ring, ruined core), short
sightlines, frequent collision-backed cover — is kept, with these changes:

1. **Clear the middle.** The owner's complaint is explicit and dates back to 2026-08-31.
   Mid-map dressing is deleted and re-composed from the four quadrant landmark frames, with
   a hard rule: **every mid-map mass either blocks a sightline that the sightline metric
   says needs blocking, or it is not placed.** Decorative mid-map clutter is the defect.
2. **Sightline and cover contracts unchanged.** `FARCRYSIS_MAX_SIGHTLINE = 22`,
   `FARCRYSIS_COVER_MIN = 14`. Re-measured after the clear-out, with an occlusion test
   (the PASS 74 audit recorded that the assertion had once been replaced with a vacuous
   `>= 0` check — that must never come back).
3. **Spawns unchanged.** The solved table stays; `farcrysis-spawns.test.ts` stays; the
   HF-456 spawn-distribution work (all maps) applies here when it lands, not before.
4. **Eye clearance to zero.** 25 genuine runtime rows remain (CLAIMED, HF-423 lane result;
   the other 373 of 441 were a stage-1 instrument limitation on heightfields). Fix the 25;
   the stage-1 flat-ground eye seat is an instrument fix that affects every heightfield
   arena and belongs to a separate lane, not this one.
5. **Material penetration classes (HF-467, R3).** The rework is the cheapest moment to
   classify every new surface as it is authored: glass breaks and passes through, thin
   metal (drums, corrugated sheet, the dish) perforates and loses collision at the hole,
   concrete and the core walls stop. R3 §3.1 records 22 unshootable surfaces on `nuketown2`
   from exactly this being done after the fact.
6. **Presentation never derives collision** (R1 §16). A lofted or re-forged body over an
   existing collider stays presentation; the collider stays where the authority put it.
   Every substantial player-reachable visible object must have matching movement and shot
   authority in **both** graphics profiles (AGENTS.md).

---

## 5. The admission budget plan

### 5.1 The constraints, stated precisely

- **The 12 s WebGPU fence is per fenced submission, not per arena.** `legacy-main.ts`
  `profileArenaTransition('coverage-submit-fence')` (VERIFIED, line 29983) fences the
  single full-coverage draw that `withArenaFrustumCullingDisabled` forces through
  (VERIFIED, `src/rendering/arena-coverage-prewarm.ts`). HF-374's failure was ~86 distinct
  TSL foliage graphs realised inside that one submission.
- **Wall-clock admission is NOT the fence.** The orchestrator's amendment stands: no arena
  on this machine admits in 12 s. The gate is a **ratio ≤ 1.60** to a same-window
  atomic-acres control (`FARCRYSIS_ADMISSION_RATIO_CEILING = 1.60`, VERIFIED in
  `publish_pass93.py:83`).
- **The menu must construct zero gameplay arenas** and `maxMenuPipelines` must stay **0**
  (VERIFIED in the receipt and in AGENTS.md's menu contract). So "precompile at menu time"
  can only ever mean the one fenced, isolated submission that compiles the shared
  retained-asset TSL/HDR pipeline — it must not attach an arena root or render a gameplay
  scene.
- **In-combat pipeline creations must stay 0** (`pipelinesDuringSample`, VERIFIED 0 for
  both arenas in the frame-time receipt). This is the tripwire; it is the reason the arena
  does not hitch mid-fight, and it may not be traded for anything.

### 5.2 What compiles when

| Phase | What is allowed | Budget |
|---|---|---|
| Menu | shared retained-asset TSL/HDR pipeline only, one fenced isolated submission | `menuPipelines` **0** for the arena |
| Admission coverage draw (inside the 12 s fence) | every material a player can see from anywhere in the playable envelope | **≤ 110 distinct programs**, of which **≤ 16** foliage node graphs (`TSL_FOLIAGE_MAX_DISTINCT_GRAPHS = 16`, VERIFIED — a ceiling to lower, never to raise) |
| Post-admission safe windows | detail-tier decals, distant-band card material, the rain-damp variant, anything a player cannot see in the first coverage draw | deferred, with a **synchronous fallback before first use** (the `admission-rehearsal-scope` pattern; CLAIMED — `src/weapon-rehearsal-scheduler.ts` is NOT in this worktree, it is on that branch) |
| In combat | nothing | `pipelinesDuringSample` **0** |

### 5.3 The levers, in the order they pay

1. **222 → ≤ 110 distinct materials.** One vocabulary through `surface-forge`, one material
   per family with per-instance tint and per-object UV offset instead of a new material per
   variant. R1 §4's rule is the discipline: *a new material is a new draw call even if it
   is "just a map"*. This is the single largest lever on both admission and frame time and
   the previous lane explicitly did not attempt it.
2. **Cluster geometry for foliage.** Merge N blades/cards into one instance for N× the
   density at the same instance count (the pattern already proved in
   `instanced-grass-field.ts`, per `UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md:481`).
   93,194 instances is not the problem; 222 programs is.
3. **Solve the periodic occluders instead of shadow-mapping them** (§3.4) — removes shadow
   casters (99 today vs 64 on the control) and a tuning knob.
4. **Distance tiering.** fBM octaves, wear detail and card-vs-geometry all step down with
   distance. *"A cell that costs the same at 200 m as at 5 m is mis-built"* (R2 §6).
5. **Defer the detail tier** to safe windows behind a synchronous fallback (§5.2).

### 5.4 Rules that may not move

Never widen the 12 s fence. Never raise `TSL_FOLIAGE_MAX_DISTINCT_GRAPHS`. Never raise
`FARCRYSIS_ADMISSION_RATIO_CEILING`. Never relax a threshold to reach green — a correct
failure stays failing and its row stays OPEN (AGENTS.md). Never delete the admission guard
or its red test.

---

## 6. Gates

Every row is a command with a receipt. Nothing here is new tolerance; where a number is
tightened it is tightened, never loosened.

| # | Gate | Command / file | Pass condition |
|---|---|---|---|
| G1 | Type check | `npx tsc --noEmit` | 0 errors |
| G2 | Farcrysis unit set (25 files) | `npx vitest run src/farcrysis*.test.ts` | all green; **no test deleted or weakened** |
| G3 | Pipeline budget | `src/farcrysis-webgpu-pipeline-budget.test.ts` (unchanged) | distinct foliage graphs ≤ 16 **and** `distinct.size < keys.length / 4` |
| G4 | **New** distinct-material ceiling | `src/farcrysis-material-vocabulary.test.ts` (new), ratcheted downward only, in the style of `legacy-main-size-ratchet.test.ts` | ≤ 110 distinct `customProgramCacheKey()` values across the built arena |
| G5 | Boot cost | `src/farcrysis-boot-cost.test.ts` | unchanged digests or a stated, reviewed re-pin |
| G6 | Frame time, paired | `node scripts/qa/measure-farcrysis-frame-time.mjs` (via `run-with-preview-server.mjs`), 3 runs, quiet machine | p50 ratio **≤ 1.25** (from 1.34–1.89, median 1.64) **and** `pipelinesDuringSample === 0` in every run |
| G7 | **Admission evidence** | `node scripts/qa/collect-farcrysis-admission-evidence.mjs --runs 3` | contract `farcrysis-admission-evidence-v1`; `allAdmitted`, `!anyCrashed`, `!anyPageErrors`, `maxMenuPipelines === 0`, `contended === false`, **worst pair ratio ≤ 1.60** (target: beat the 1.297 baseline, not merely clear the ceiling) |
| G8 | Publish guard | `assert_farcrysis_admission_evidence` + `farcrysis_guard_red_test` carried into the next `publish_pass<N>.py` | guard fires red on absent / stale-digest / contended / < 3 runs receipts, then passes on the real one. **The patch is written into the lane report; the lane does not edit the publish script for a pass it does not own.** |
| G9 | **Stock-flags boot** | `npm run qa:stock-boot` extended to `farcrysis` | menu → Solo → live frame in the owner's installed Chrome with **no** `--enable-unsafe-webgpu`. HF-454 is the reason this is a named gate: every QA smoke passed that flag and hid a Tint swizzle bug that made the live site unlaunchable. |
| G10 | Solo 60 s | `node scripts/qa/verify-farcrysis-solo-60s.mjs` | zero page errors, zero console errors |
| G11 | Traversal + eye clearance | `sweep-farcrysis-traversal.mjs`, the eye-clearance stages | genuine runtime eye rows **0** (from 25); no new invisible walls on the beach/jungle routes |
| G12 | Ground contract / spawn quality | `verify-farcrysis-ground-contract.mjs`, `farcrysis-spawns.test.ts`, `spawn-layout-quality.test.ts` | unchanged green |
| G13 | Derived rosters | `arena-selectability.test.ts`, `arena-switch-matrix-roster.test.ts`, `walkable-surface-parity-gate.test.ts`, `collider-visual-parity-gate.test.ts` | green **with the card still parked**, then re-run green after the unhide commit |
| G14 | Reference-grounded critic | R2 loop: `reference-precheck` + 3 critics with probe-token receipts | every row ≥ 85 % on ≥ 2 **valid** critics for two consecutive cycles; a `rubric-only` verdict **cannot** reach the exit gate; a probe-token mismatch is journalled `INVALID`, never as a score |
| G15 | Combat readability | capture the deepest-shade sightline at 20 m; measure operator-vs-background separation | separation above the shipped floor in **both** graphics profiles |
| G16 | Regression on other arenas | `diff-arena-viewpoints.mjs` against a frozen pre-lane baseline | no `REGION_CHANGED` on any other arena — a gain here that costs a regression there is a rejected round |
| G17 | **HITL** (HF-455) | local build served on `127.0.0.1:4300`, owner plays it | the owner's word. **No card flip and no publish before this.** |

**Machine preconditions for every browser gate:** `curl -s http://127.0.0.1:8188/queue`
shows both lists empty, `nvidia-smi` shows ≥ 3000 MiB free, no other headless Chrome is
running, headless only, one at a time, never on the owner's main screen. If VRAM does not
free within 20 minutes of polling, the browser rows are marked **OPEN** — not skipped, not
assumed.

---

## 7. Ordered implementation plan for a two-agent lane

**Shape.** Two Opus agents, disjoint file ownership, **one shared serialization point**:
the GPU. Captures and browser gates are strictly one at a time; the agents alternate
through a single lock file rather than racing. Everything else runs in parallel.

**Worktree.** `git worktree add` from `C:\Users\david\projects\aa-omp-pass84`, branch
`contrib/dave-gaming-pc/claude/farcrysis-rework`; junction `node_modules` to
`C:\Users\david\projects\aa-claude-chopper\node_modules`. Confirm the path and branch
explicitly — never infer them (AGENTS.md: 365 worktrees, 458 branches here). Note the
PASS 93 cut record: `aa-omp-pass84`'s own `node_modules` was left half-reinstalled by an
elevated Codex run (VERIFIED in the ledger), which is exactly why the junction is specified.

**Ownership split.**

| | **Agent A — authority, budget, admission** | **Agent B — art, reference loop** |
|---|---|---|
| Owns | `farcrysis-terrain-authority.ts`, `farcrysis-physics.ts`, `farcrysis-constants.ts`, `farcrysis.ts`, `farcrysis-midmap-landmarks.ts`, the `FARCRYSIS-LOAD` region, all `scripts/qa/*farcrysis*`, the new material-vocabulary gate | `farcrysis-art.ts`, `farcrysis-textures.ts`, `farcrysis-ground-*`, `farcrysis-vegetation.ts`, `farcrysis-palms-enhanced.ts`, `farcrysis-tsl-foliage.ts`, `farcrysis-water-*`, `farcrysis-mountains.ts`, `farcrysis-vista.ts`, `farcrysis-detail.ts`, `docs/reference-sets/**` |
| Never touches | the art modules | the spawn table, the terrain authority, the collider set, the publish script, the fence |

**Phase 0 — ground (both, 30 min).** Read AGENTS.md and this plan. Freeze
`docs/farcrysis-rework/BRIEF.md` from §3.1. Capture the **pre-lane baseline** for every
arena's viewpoints (G16 depends on it existing before anything changes). Re-measure G6 and
G7 at the branch head so the lane owns its own baseline instead of inheriting the 02:10 /
03:22 discrepancy in §1.

**Phase 1 — reference sets (Agent B alone, 60–90 min).** The four sets in §3.2, gathered by
the Opus agent itself with `curl` receipts (status, bytes, served content-type, sha256,
pixel dimensions). `criticTargets` allow-list per source; `notUsableFor` mandatory where a
source distorts. **Gate:** every source resolves; every load-bearing number has two sources
and a published agreement percentage; no UNKNOWN-licence source in the file; no game frame
grab anywhere. **This step is not delegable to Flash.**

**Phase 2 — the vocabulary (Agent A, 90 min; blocking).** Land the material-vocabulary gate
(G4) **red first** at the measured 222, then let it be the thing the art rebuild has to
satisfy. Build the shared family list from §3.3 on `surface-forge`, one material per
family. **Gate:** G1, G3, G4 red-then-green as the families land; no behaviour change yet.

**Phase 3 — the art rebuild (Agent B, the bulk).** In this order, one bounded correction
per cycle, each cycle capture → tier-0 precheck → 3 critics → journal (R2 §5.2):
 (a) ground and beach families; (b) water on the `threejs-webgpu-water` contract, with the
 CPU/GPU spectrum parity assertion written before the shader; (c) vegetation rebuilt on the
 skill's lattice + cluster geometry, inside the ≤ 16 graph ceiling; (d) the core building's
 interior floor, walls and practical light; (e) the mid-map clear-out and re-composition;
 (f) the analytic canopy/grating transmittance. **Gate per cycle:** G14 plus G16; **gate at
 the end of each of (a)–(f):** G1, G2, G3, G4.

**Phase 4 — clear the middle and the sightline re-measure (Agent A, in parallel with 3e).**
Delete the decorative mid-map mass; re-measure sightline and cover with a real occlusion
test; fix the 25 runtime eye rows. **Gate:** G11, G12.

**Phase 5 — penetration classes (Agent A, 60 min).** Classify every re-authored surface per
R3 §4 as it lands, not afterwards. **Gate:** the R3 unshootable-surface sweep at 0 for this
arena.

**Phase 6 — budget close (Agent A, blocking, GPU-serialized).** G6, G7, G9, G10 at the
lane head, three runs each, quiet machine. If G6 or G7 misses, the fix is **compiling less**
— never widening a fence, never re-running until a number flatters. Write the G8 patch into
the report; do not edit a publish script the lane does not own.

**Phase 7 — HITL (orchestrator, not the agents).** Build, serve on 127.0.0.1:4300, hand the
owner a checklist: the middle of the map, the water at the shoreline and from in it, the
core interior, enemy readability in the deepest shade, load time versus the other maps, FPS.
**Gate:** G17.

**Phase 8 — unhide (one commit, after G17).** `selectable: false → true` in
`src/map-selection.ts`, PROTOTYPE/PREVIEW copy per the owner's word, `multiplayer` left
false. Re-run G13. The admission receipt for the built bundle must exist and be current, or
the publish guard will (correctly) refuse.

**Cadence rules for both agents.** Explicit-path commits with the trailer
`Co-Authored-By: Claude Opus 5.1 <noreply@anthropic.com>`. Never run the full vitest suite
unless told. Delete `test-results`, `playwright-report` and any `artifacts/**/*.json` the
runs created. `src/legacy-main.ts` by `sed` ranges only, inside the `FARCRYSIS-LOAD` region,
LF preserved, and follow the size ratchet if it grows. Check for concurrent commits from
other agents before `git add` (this machine runs several harnesses in the same tree family).

---

## 8. Risks this plan is built against

| Risk | Where it bit before | Mitigation here |
|---|---|---|
| A pretty still frame that plays badly | R1 §16; the shipped 1.64x frame-time caveat | G6 with the p50 ratio tightened to 1.25 and `pipelinesDuringSample 0`; the 40 m distance capture is in the judgeset |
| Critic drift to 97/100 against its own memory | VERIFIED, R2 §2 — not one overnight critic file names a reference | G14: no score without a reference pair; `rubric-only` cannot reach the exit gate |
| The critic never saw the pixels | OPEN, R2 §2 | probe-token receipt per call (R2 §4.4); mismatch ⇒ INVALID, never a score |
| Fabricated references | VERIFIED, HF-426 §0 (four dead URLs) | fetch receipts, tier ladder, two-source rule, Flash never gathers |
| Drifting into a copy of the games it homages | standing rule | game frame grabs are REJECTED tier; look bar is real-world photography; layout is ours |
| Green gates over a build the owner cannot launch | VERIFIED, HF-454 | G9 stock-flags boot, no unsafe-webgpu flag |
| A rewrite quietly deleting a paid-for gate | VERIFIED, the park comment's own warning | §2.2 preservation list; 25 test files stay; guard + red test carried forward |
| The rebuild regressing another arena | VERIFIED rule | G16 frozen baseline diff every cycle |
| Unhiding before it is playable | VERIFIED, 2026-08-28: 279 s then a tab crash | card flip is the last commit, after G17 |
| Two agents writing one file | VERIFIED, AGENTS.md | the ownership table in §7; one GPU lock for captures |

---

## 9. Open items for the owner

1. **OPEN — how "total" is total.** This plan rebuilds the presentation completely and
   preserves the measured authority (spawns, terrain collision, physics, admission fix).
   If the owner means the *layout* too, that is a different and much larger lane and should
   be said before Phase 2.
2. **OPEN — reference photography.** The strongest sets are T2 (photographs the owner or we
   take). Absent that, T3 CC-licensed photography costs Phase 1 real time. Ask before
   spending it.
3. **OPEN — where farcrysis sits against the current priority.** HF-466 made Nuke Town
   Rebuild the focus arena and parked the original Nuketown beside farcrysis. This lane is
   sized as a two-agent multi-hour pass; it should not pre-empt HF-461/463/464/465.
4. **OPEN — the multiplayer flip.** `multiplayer: false` stays until the owner has played
   it solo. Flipping it enters an MP sweep nobody has run against this arena.
5. **OPEN — the §1 admission-number discrepancy.** Two honest receipts, two different
   fields, quoted interchangeably in the ledger. The lane re-measures rather than inherits;
   the ledger row should be corrected when it does.
