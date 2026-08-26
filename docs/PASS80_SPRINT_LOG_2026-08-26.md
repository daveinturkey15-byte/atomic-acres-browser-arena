# Pass 80 sprint log — 2026-08-26

Branch `gauntlet/pass79-omp-20260823`. Written so a harness/model swap mid-run is
clean: each sprint states its goal, its stop condition, and what is safe to
resume from. Append only.

**Standing rule: nothing publishes. Live channels untouched.**

---

## Licence position established before sprint 1 (verified live, 2026-08-26 ~17:40)

The register's rows 5 and 16 were both **stale**. Re-verified:

| Layer | Verdict | Evidence |
|---|---|---|
| `localai-org/kimodo.cpp` (code) | **CLEAR — Apache-2.0** | LICENSE file added 2026-08-26T15:05Z, ~2 h before this check. Read the file body, not the API SPDX field (register rule): genuine 201-line Apache 2.0 text. Register row 16's "NO LICENCE FOUND / ALL RIGHTS RESERVED" hard blocker is **lifted**. |
| Kimodo SOMA-RP/SEED v1.1, G1-RP/SEED v1 (GGUF weights) | **CLEAR — NVIDIA Open Model License** | Commercial use permitted; "perpetual, worldwide, non-exclusive" with **no country exclusion**; "NVIDIA claims no ownership rights in outputs"; derivative models may be created and distributed. This is a *different* licence from row 5's H3 Community License and does **not** carry its UK exclusion. |
| SMPL-X RP checkpoint | **BLOCKED — internal R&D** | Prohibits distributing derivative models; deliberately absent from the published-weight installer. README warns an inconsistent `LICENSE` has appeared in the upstream repo and that the **restrictive terms control**. Do not use. |
| Text bundle (converted Meta Llama 3) | **Separate terms — read before shipping** | README: "retains its separate terms". |
| MiniMax H3 | **STILL BLOCKED in the UK** | Row 5 stands: Community License excludes the model *and its output* in UK/EU/US/Korea. Row 30's correction is about H3's *role* (reference scaffolding), not its licence. kimodo now covers the motion job directly and legally, so H3 is not needed for it. |

Action owed to AKP: rows 5 and 16 need updating with these findings. Not done
yet — see sprint 4.

---

## Sprint 1 — character archetype read (the "Lara Croft / Venom isn't in" gap)

**Goal.** The 2D skin cards read as tomb-raider explorer and symbiote composite.
The 3D bodies do not. Pass 80 fixed their *proportions* (`40fb8f59`) — explorer
1.710 m, symbiote 1.919 m — but proportion alone is not archetype. Add the
silhouette features that carry the read, as project-original geometry.

**Boundary held throughout.** The repo `sourcePolicy` forbids franchise likeness,
trademarked names, copied characters and extracted geometry. Archetype
conventions (a braid, a tank-top frame, twin thigh holsters; an elongated skull,
claw hands, a glossy black hide, pale eye patches) are not protected expression
and are what the cards already trade on. No character name enters any asset id,
material name, mesh name or spec field.

**Stop condition.** New accessory builders registered, all three archetypes
export, every existing distinctness gate still passes unchanged, shipped-bytes
silhouette test still green, full suite green.

**What landed.** Five new project-original accessory builders, registered and
wired into the spec:

| Archetype | New | Reads as |
|---|---|---|
| explorer | `braided-hair-fall` (4 plaits + 2 ties, skinned to Neck) | the plait down the back - the one feature that survives distance |
| explorer | `twin-thigh-holsters` (holster + muzzle guard + 2 straps per leg) | matched drop-leg rigs, the archetype's read |
| symbiote | `taloned-hand-claws` (8 talons on the distal phalanges) | taloned hands, curling with every existing clip, zero new bones |
| symbiote | `elongated-cranial-crest` (3 swept plates) | the carried-back skull |
| symbiote | `pale-ocular-patches` (2 raked accent slashes) | bright eyes on a dark hide |

**Envelope held.** explorer 1.0001 / cap 1.0 and symbiote 1.0352 / cap 1.1,
both `clamped: false`, `accessoryScale: 1.0` - identical to before the
accessories were added, and every distinctness gate unchanged. That was the
main risk: explorer sits 0.0001 under its hit-proxy cap, and anything that
pushed it over would have made the envelope solver RELAX the proportions,
silently undoing the archetype work to buy back radius.

**Scale bug found and fixed by measurement, not by eye.** The first cut sized
head and neck features off BONE length. The Head bone is 0.0774 m; the skull is
0.237 m across - a 3x mismatch. The braid came out a 17 cm stub inside the
nape and the crest never cleared the skull. Rewrote all three head features in
SKULL WIDTHS via a documented `_skull_span` calibration.

**Pre-existing finding, NOT corrected here.** `build_head_wear` has the same
bone-length sizing, so every archetype's visor lens is 4.8 cm wide on a 23.7 cm
head. Correcting it would change three already-approved assets, so it is
recorded rather than silently fixed. Owner decision.

**Verified.** 487 files / 4366 tests green, tsc 0, provenance 151/151, every
distinctness gate byte-identical to before the accessories, envelope unclamped
on both archetypes. Braid measures a 36 cm fall standing 3 cm proud of the
back; crest clears the skull; talons extend 2.5 cm past the fingertips.

**Status:** DONE

---

## Sprint 2 — kimodo text-to-motion lane, end to end

**Goal.** Clone at pin, build, fetch SOMA weights, generate one canary motion,
retarget onto the canonical 62-joint operator rig, export a GLB canary, and
measure it: foot slide, loop seam, root motion, clip count.

**Stop condition.** One canary clip verified on OUR rig in the real runtime —
per the skill, the tool's own web demo preview is NOT acceptance evidence,
because it renders SMPL-X on its own body model at its own scale.

### Done

- **Licence cleared** (table above). Note the register's pinned commit
  `e55a42a` PREDATES the licence: using that pin would have meant using
  unlicensed code. New pin carrying the grant:
  **`92341f31940d54d4f0a44aa5975e470b78b2ab5c`** (LICENSE added in `2b14016`,
  2026-08-24T13:02+01:00).
- **Builds on Windows/MSVC.** The repo documents Linux as primary and its
  CMake presets require Ninja, which is not on this machine and must not be
  installed. Configuring directly with the `Visual Studio 17 2022` generator
  against the already-present VS 2022 BuildTools works with no install:
  `cmake -S . -B build-msvc -G "Visual Studio 17 2022" -A x64`.
- **Motion weights validate.** `kmd-inspect weights/models/kimodo-soma-rp-v1.1-f32.gguf`
  -> `valid (414 F32 tensors)`.
- **Retarget correspondence landed** as `src/animation/smplx-operator-retarget.ts`
  + 6 gating tests. It is DATA, in TypeScript, not buried in a Blender script,
  so the authoring pipeline and the runtime share one list and a rig change
  fails a test instead of silently producing bent clips. It pins the four-segment
  spine column, mirror-symmetric legs down to the toe (`*_foot` -> `PT.*`, the
  one non-obvious name), no duplicate destinations, and — most important —
  keeps the finger/thumb chains OUT of the retarget entirely, because the model
  emits no hand articulation and a retarget allowed to write them would zero
  them and open every operator's fist mid-fire.

### Known output contract (read from `src/generate.cpp`)

```
kmd-generate MOTION.gguf TEXT_BUNDLE PROMPT.txt FRAMES STEPS SEED OUTPUT_DIR
kmd-generate MOTION.gguf TEXT_BUNDLE --sequence TRANSITION STEPS SEED OUT FRAME PROMPT.txt [...]
```
Emits two raw arrays: `root_positions.f32` (T x 3) and
`local_rotations_xyzw.f32` (T x J x 4 quaternions). `kimodo_motion_joints()`
reports J. The `--sequence` mode stitches prompts with an explicit transition,
which is the native answer to the 10-second generation cap the skill warns
about — seams still need per-seam foot-contact and root-continuity checks.

### Blocking, in progress at cutoff

- `kmd-generate` and `kmd-encode` are gated in CMake on the **ggml submodule**,
  which a plain `git clone` does not fetch. `git submodule update --init
  --recursive` was running at cutoff; rebuild after it lands and those two
  targets appear.
- Text bundle download (Llama-3-8B derived LLM2Vec, ~6 GB+) still in flight.

### Resume from here

1. Confirm `ggml/CMakeLists.txt` exists, re-run the configure + build line above.
2. Confirm the text bundle has no `*.incomplete` files left.
3. Generate a canary, retarget in Blender through the correspondence module,
   export a GLB, and measure foot slide / loop seam / root motion.

**Status:** PART DONE — licence, build, weights, correspondence. Generation blocked on the two downloads above.

---

## Sprint 3 — animation coverage applied in game

**Goal.** Use the lane from sprint 2 for the long tail the rig lacks; wire into
the existing animation system; verify in browser.

**Status:** NOT STARTED

---

## Sprint 4 — AKP bookkeeping + register correction

**Goal.** Rows 5 and 16 updated with the verified licence findings above; new
row for the kimodo lane actually being exercised; evaluation records per
`skill-regression-policy.json`.

**Status:** NOT STARTED
