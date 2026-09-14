# Bounded integration acceptance review — houses / interiors / lighting

Reviewer `claude-opus-5` effort `xhigh` · 2026-09-13 · call 6 · **review only, nothing executed
beyond source reads, arithmetic and one narrow vitest file.** No Blender, browser, GPU, build or
server. Writes confined to `docs/technique-lab/lighting/**`; no runtime source, arena, loader,
house, interior, registry or root file was modified, and nothing was committed.

**Root reference:** `C:/Users/david/projects/aa-world-studio` at
`8fbbbbdbf2305d776230ceb3765f7c695e2e3a1c` (confirmed HEAD, clean worktree). Every root fact below
was read from that commit via the shared object store (`git show <root-sha>:<path>`), not from a
lane copy.

## Verdict

| Handoff | Evidence verdict | Blocking for root? |
|---|---|---|
| Lighting (this lane) | **Accept.** Every load-bearing number reproduced independently | No |
| Interiors | **Accept the adapter.** Its *recommended consumer filter* is unsafe as written | **Yes — one decision** |
| Houses | **Accept the export.** Handoff prose carries stale hashes; manifest is current | No, but fix the prose |

---

## 1. Lighting — the lane diff

Scope is 2 files, `+174 / −9`, both inside the declared write scope. No renderer state, clock,
global light, gameplay, loader-lifecycle or staging path is touched. Confirmed in scope.

### House coordinate contract — verified exactly, from root

| Claim | Root evidence (`src/world-studio/architecture/house.ts` @ `8fbbbbdb`) | Result |
|---|---|---|
| `GROUND_FLOOR_Y` 0.08, `UPPER_FLOOR_Y` 3.3, `UPPER_CEILING_Y` 6.3, `GARAGE_ROOF_Y` 3.5 | lines 32–37 | ✅ |
| `SLAB` = 0.22 | line 41 | ✅ |
| Ground ceiling plane = `UPPER_FLOOR_Y − SLAB` = **3.08** | line 134 (`ceilingY: UPPER_FLOOR_Y - SLAB`) | ✅ |
| Upper ceiling plane = **6.30** | line 138 (`ceilingY: UPPER_CEILING_Y`) | ✅ |
| Garage ceiling = roof underside **3.30** over slab top **0.06** | line 842 `garage-roof` spans `GARAGE_ROOF_Y-0.2 … GARAGE_ROOF_Y`; line 489 `slab-garage` top `0.06` | ✅ |

So `CLEAR_STOREY_HEIGHT = 3.00` (3.08 − 0.08 and 6.30 − 3.30, both exact) and
`GARAGE_CLEAR_HEIGHT = 3.24` (3.30 − 0.06) are derived correctly, and the same two planes are the
ones the baked interior contact AO darkens toward. The pass-1 float of 0.45 / 0.90 / 0.84 m is real.

### Photometric compensation — recomputed independently, all six rows match

Using `FIXTURE_DROP` pendant 0.35 / flush 0.02 / batten 0.05 and `FIXTURE_KIND`
(`lighting/index.ts:140-154`), `I' = I·(d'/d)²`:

| room | throw pass1 → now | candela claimed | recomputed |
|---|---|---|---|
| living (pendant key, 20) | 2.20 → 2.65 | 29.02 | 29.02 ✅ |
| bedroom (flush key, 14) | 2.08 → 2.98 | 28.73 | 28.73 ✅ |
| dining (pendant fill, 6.5) | 2.20 → 2.65 | 9.43 | 9.43 ✅ |
| kitchen (flush fill, 6.5) | 2.53 → 2.98 | 9.02 | 9.02 ✅ |
| study / bedroom2 (flush fill, 6.5) | 2.08 → 2.98 | 13.34 | 13.34 ✅ |
| garage (batten fill, 5) | 2.35 → 3.19 | 9.21 | 9.21 ✅ |

Peak = 29.02 × 1.45 presence = **42.1**, under the suite's 69.6 ceiling. Shadow, draw-call,
occlusion-policy and fixture-count budgets are untouched.

### Runtime / Three.js compatibility — compatible

* Installed **three `0.185.1`** (`node_modules/three/package.json`). The change introduces no new
  three API: it only moves an existing `SpotLight`/`PointLight` origin and scales `intensity`.
  `distance`, `decay: 2` and the physically-correct candela convention are unchanged, so there is
  no r155+/r165+ intensity-convention exposure.
* The duplicated mount expression is now one helper (`lampY`) shared by the light loop and the
  instanced-fixture loop, so a lamp and its visible fixture can no longer drift. Verified both call
  sites now route through it (`index.ts:414`, `:476`).
* The EVIDENCE-MATRIX's falsification of "cloned PBR textures never reach the GPU" is consistent
  with r185 `Texture.copy()` semantics, and `pbr-library.ts` was correctly left unchanged.

### True weather timing — the identity gate is sound; the *hour* is static by design

This was the sharpest open question, and it resolves in the lane's favour:

* `update()` gates on `environment === lastEnvironment` (`lighting/index.ts:509-512`).
* The producer is `createStudioWeatherRouter` (`weather-routing.ts`): it memoises on
  `previousPreset === preset && previousPresentation === presentation` (line 38) and otherwise
  builds a **new** `Object.freeze`d `environment` (line 50) inside a frozen route (line 59).
* The publisher is `legacy-main.ts:5104` — `target.root.userData.worldStudioEnvironment =
  route.environment`, i.e. the memoised object itself, not a per-frame copy.

**Therefore object identity changes exactly when the preset or the presentation runtime changes.**
The gate is correct and costs one reference compare per frame. Two honest caveats, neither
introduced by this lane:

1. **No continuous clock.** `derivePracticalTuning` reads `environment.hour`, which is a constant
   of the preset (`weather-routing.ts`: "Shared random mode follows the weather preset's hour").
   The `daylight` term therefore never ramps during a session — practicals respond to *preset and
   presentation changes only*, not to time passing. This is root's deliberate design, but do not
   expect a dusk ramp from this rig.
2. **One-frame settle.** `arena.ts:203` calls `lighting.update()` before reading the environment at
   `:204`, and `arena.ts:38` seeds `userData` with `STUDIO_ENVIRONMENTS[0]`. A preset change is
   therefore applied on the following frame. Pre-existing and cosmetic; flagged, not a defect.

### Gates — not weakened

* `lighting.test.ts` diff is **+99 / −0** — pure addition. No assertion was relaxed or deleted.
* Re-ran `node node_modules/vitest/vitest.mjs run src/world-studio/lighting/lighting.test.ts` →
  **36 passed (36), 1 file, exit 0, 248 ms.** Narrow single-file run (a wide run OOMs the fork pool
  on this machine and would not be trustworthy evidence).
* The new tests derive the ceiling planes from the *exported* `GROUND_FLOOR_Y` / `UPPER_FLOOR_Y` /
  `UPPER_CEILING_Y` / `GARAGE_ROOF_Y`, so a storey move fails the suite closed. Good instrument.

---

## 2. Houses — export hashes and apertures

### Hash finding: manifest current, handoff prose stale

Measured with SHA-256 over the bytes on disk in `aa-houses-night-20260912`:

| file | bytes | sha256 |
|---|---|---|
| `public/assets/world-studio/blender/houses/house-teal-shell.glb` | **5,670,156** | `38cc4c2d941524434bad5a51772e07fe3a35a7775c0ccca9a239fbb9731a5c27` |
| `public/assets/world-studio/blender/houses/house-yellow-shell.glb` | **5,644,860** | `c7d7c219978a6e0738faa338e40f96e861e6a316a2560576c9bd55d90540b08f` |

`HANDOFF.md:485-486` states teal `5,545,104 B / 5f987101ab0f…` and yellow `5,519,604 B /
eb7afd7299ca…` — **neither matches.** That block is the wave-3 census and wave 4 did not restate it.

**The export itself is fine:** `catalog.json` (revision 3) records `38cc4c2d…` and `c7d7c219…` —
byte-exact with the files. So the manifest consumers actually read is current and self-consistent;
only the prose is stale. Correct the prose, do not re-export.

### Apertures

`apertureMismatches: []` in both build reports, **26/26 declared apertures per house**, 22 panes,
22 distinct `atomic_window_id`s, one glass mesh per house, `opaqueBehind: 0` across all 44 pane
samples. Consistent between `HANDOFF.md` and `catalog.json` (quality reason cites 26 openings, 9
interior cased openings, 24 transcribed probes). Not independently re-measured this pass — no
Blender, by instruction.

⚠️ **Known reconciliation, carry it forward:** the GLBs mark **22** panes while the arena registry
registers **20** (garage windows are unglazed apertures in `house.ts`; GLB glass stays hidden).
A consumer should assert the exact 20/2 split and must **not** "fix" the registry upward to 22.

---

## 3. Interiors — collision, mirror, disposal

* **Authoritative collision is retained.** The adapter is presentation-only and emits no collider:
  `interior-assets/index.ts:5-6` — "emits no collider, shot surface, spawn or navigation data, and
  nothing here may be used to derive collision." Nothing in the diff touches the solids path. ✅
* **M3 re-verified against root, and the wave-4 correction is accurate.** `interiors/index.ts:147`
  merges geometry **per role across every anchor of both houses** into one `Mesh`, and `:157` does
  `for (const solid of solids) if (solidRoles.get(solid.id) === role) solid.mesh = mesh` — one
  shared mesh assigned to every solid of that role. So "hide the procedural mesh, keep its solid"
  is genuinely unavailable: hiding the teal sofa's mesh blanks the yellow house too. The handoff is
  right to have retracted its wave-2 wording. ✅
* **Mirror/layout.** The removed comment (`yaw → π − yaw`) was `house.ts`'s own rule and wrong for
  this asset set; it is replaced by an explicit `mirrored` reflection option. Of the 5 deleted
  lines, all are that stale comment plus one replaced `paths` line — **no guard removed.** ✅
* **Disposal ownership** is stated and tested: everything under `root` belongs to the loader
  (`root.clear()` detaches caller-parented children without disposing them, correctly); a payload
  arriving after `dispose()` is released, not attached; `dispose()` is idempotent (3 calls, 1
  disposal each); per-file texture ownership makes per-prop disposal safe. ✅

---

## 4. Integration hazards in the new lane diffs

1. **Both sibling lanes are uncommitted.** `aa-houses-night-20260912` (modified GLBs, PNGs,
   catalog, Blender scripts) and `aa-interiors-night-20260912` (modified `index.ts` + 4 untracked
   new files incl. `catalog.ts`, `loader.test.ts`) have no commit to cherry-pick and no SHA to
   reference. The lighting lane is the only one whose work sits on a commit (`c0365a141`).
2. **Interiors ships an unsafe recommended patch** — see the prioritized action below.
3. **Lighting lane is cleanly portable.** `src/world-studio/lighting/**`,
   `pbr-library.ts`, `architecture/**`, `interiors/**` and `rendering/**` are byte-identical
   between lane base and root, so this is a clean cherry-pick onto `8fbbbbdb`.

---

## 5. One prioritized root action

> **Decide the M3 collision question before any consumer applies the interiors anchor filter.**

The interiors handoff ships a ready-to-apply consumer patch that removes `sofa`, `coffee-table`,
`tv-unit`, `dining-table` and `kitchen-run` from the array passed to `createStudioInteriors`.
Applying it today **silently deletes the ballistic solids for those five footprints** — bullets and
movement pass through the Blender furniture — and the obvious mitigation is provably unavailable
(§3). This is the only finding in the three handoffs that is gameplay-affecting, silent, and
already packaged for a consumer to apply. Root must pick one of: accept non-solid furniture, author
replacement collision for the five footprints, or give the procedural kit per-anchor geometry.

Second, non-blocking: correct the stale hash block at houses `HANDOFF.md:485-486`.

---

## 6. Remaining OPEN falsifiers — honest status

**Lighting**

1. **OPEN — not visually accepted.** No frame was rendered, here or upstream. The proof is
   geometric and photometric, never perceptual. It does not establish that the pools read well.
2. **OPEN — falloff-window residual.** The compensation covers `1/d²` but not three's finite-
   `distance` window: living ×0.971, bedroom ×0.933, dining ×0.916, kitchen ×0.874,
   study/bedroom2 ×0.811, garage ×0.842. Left as an explicit trade for a frame to settle.
3. **OPEN — `SLAB` (0.22) and garage roof thickness (0.2) are restated, not imported**
   (module-private in `house.ts`). If `SLAB` changes alone the rig drifts; the test cross-check
   would drift with it. Exporting `SLAB` is a one-line root change, outside this scope.
4. **OPEN — arena definition mismatch.** `rendering/arenas/world-studio.ts:12` declares
   world-studio practicals `emissive-only, maximumDistance: 0, castsShadow: false`, while the
   shipped rig runs 4 shadowed-local + 10 clustered lights. Verified as a real mismatch that is
   **not enforced** today (`arena-contrast-lighting.ts:123-160` returns early unless
   `profile === 'blender'` and never walks the arena root). If that early return is ever removed,
   the rig is contradicted. Root's call.
5. **OPEN — shadow budget 4 vs 3.** `STUDIO_LIGHTING_PRESET.maximumShadowLights = 4` against the
   arena default 3 (`arenas/shared.ts:31`). Correctly *not* repaired in-lane: cutting to 3 would
   light one house's living room with a shadowed key and the other's without.
6. **OPEN — unshadowed fills leaking through slabs** (row 7). Inferred, never measured; no safe
   CPU falsifier exists. Needs the zeroed-ground-practicals frame from `world-studio-west-bedroom`.
7. **OPEN — siding stripes (row 5) and flat road/ground (row 6)**, both outside this write scope.

**Houses**

8. **OPEN — falsifier 1: no runtime capture exists.** Every houses claim is still export-side.
9. **OPEN — falsifier 13: same-facing coincident pairs 12,509 / 12,429**, up from the wave-1
   11,061 baseline; dashed vertical seams are measured, recorded and **not fixed**.
10. **OPEN — falsifier 14:** unattributed residue (lining / partition / architrave) not pinned down.
11. **OPEN — glazing reads as a darker film**, with nothing distinguishing "reflective" from
    "painted".

**Interiors**

12. **OPEN — M1/M2 footprint overhang.** Props overhang their anchor footprints (sofa ΔX is M1;
    dinette +0.751 / +1.111 is ordinary — chairs stand outside the table anchor). Root must decide
    whether anchor footprints are advisory or the props need re-authoring. **Do not weaken the
    procedural containment check to match.**
13. **OPEN — M3 collision**, the prioritized action above.
14. **OPEN — coverage:** yellow-house palette variation and the upstairs room are undressed
    (`HANDOFF.md` falsifiers 5–11).

**Not claimed by anyone, and worth saying plainly:** none of the three handoffs has a rendered
frame behind it. All three are source-, arithmetic- and export-side evidence.
