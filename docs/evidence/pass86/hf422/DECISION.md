# HF-422 Map 3 trial — MotionBricks G1-34 → operator retarget

**Verdict: NO-GO. Do not build `motion-bricks.cpp` for this rig.**
Lane AO, PASS 86 overnight, 2026-09-03. Branch
`contrib/dave-gaming-pc/claude/hf422-motionbricks-map3`. Nothing published, nothing shipped.

**This document was rewritten after skeptic review. The first draft justified the same verdict
with a number that does not exist.** The corrections are in "What was withdrawn" below, stated
before anything else, because the withdrawn number was the headline of the version that was
committed first and a reader who saw only that version was misled.

The trial measures the RETARGET, which is the gate the generator sits behind. **It says nothing
whatever about MotionBricks' generation quality** — the 0.73 GB model was never downloaded and
never run.

## What was withdrawn

| Withdrawn claim | Why it was wrong |
|---|---|
| "slides its feet **5.3×** further than the shipped `Walk`" | An artifact of the measuring tool. `measure-retarget-quality.mjs` builds its planted set with `Array.filter`, which discards contiguity, then sums horizontal distance between *consecutive surviving samples* — so it also sums the swing-phase jump between separate stance phases. Over-count is **zero** on a one-stance clip and **53%** on this six-stance one. Its 3 cm band is absolute, so it swallowed **79%** of the low-lifting trial clip against **33%** of the authored walk. That asymmetry, times a 2.3× clip-length difference, is the entire ratio. |
| G4 **FAIL — foot slide 2.69 to 3.81 m** | Withdrawn. Measured on contiguous stance the trial clip slides **less per stance frame than the authored walk** (0.0400 m vs 0.0574 m), and on the repo's own pass-77 contact metric its stance foot is broadly consistent with the ground speed it carries. **There is no foot-slide failure here.** |
| "`PT.L` at **3.81 m** of toe slide, where every authored clip pins the toes at 0.0000 m" | `PT.L`/`PT.R` are **not toes**. In `Swat.gltf` they are `Root`-parented, childless, **not mirrored** (rest `(0.568, 0.627, 0.227)` and `(-0.018, 0.423, 0.659)`) and sit **0.42–0.63 m off the floor**. The authored clips do not "pin" them — they never animate them at all. A real defect is hiding here, but it is a different one; see finding 3. |
| G5 "ground penetration 0.0168 m, the only negative in the file" | That minimum belongs to `PT.R`. The trial clip's actual **feet bottom out at +0.0442 and +0.0492 — higher off the ground than every authored clip's +0.0224.** The retargeted feet never penetrate the floor. |
| "the travelling variant differs by 0.04 m, which is how you can tell travel was never the problem" | The same non-contiguity artifact. On contiguous stance the two bakes differ by **1.55×** (`Foot.L` 2.1617 vs 1.3959 m) and **2.43×** (`Foot.R` 1.5916 vs 0.6561 m). The falsifier did not distinguish what it claimed to. |
| "`g1skel34` **does** have toes, correcting the technique study" | The joints `left_toe_base`/`right_toe_base` do exist — but the conclusion drawn from them was wrong, because it was drawn about destination bones that are not toes. |

None of the withdrawn claims were re-run into new evidence. All measurements below were taken
this pass, after the frame-rate fix, with `scripts/animation/hf422-foot-contact-analysis.mjs`,
whose implementation of the pass-77 method reproduces the repo's own frozen constants
(`Walk` 1.3559 against 1.3416, **1.07%**; `Run` 3.0803 against 3.0832, **0.09%**).

## What the verdict now rests on

**One structural finding, which no amount of tuning can fix.**

### 1. `g1skel34` has no head and no neck. At all.

All 34 joint names, read from `motionbricks.joint_names` in `g1-f32/support.gguf`, run
`pelvis → legs → 3 waist links → shoulders → arms → hand roll`. There is no `head`, no `neck`,
no `skull`, no cervical link of any kind. The chain simply stops at the shoulders.

So the operator's `Neck` and `Head` **cannot be driven by any G1 clip** — the retarget script
raises rather than fake them, and the report records
`operatorJointsSourceCannotDrive: ["Neck", "Head"]`. The head stays welded to the chest for the
whole clip. For a soldier that must aim, track and telegraph attention, that is not a polish
item; it is the wrong source skeleton. **This is the decisive finding and it is a property of
the released model, not of this retarget** — `docs/DEMO.md` "Initial limitations" states G1 is
the only skeleton the released model supports.

### 2. The feet lift less than half as far as the authored walk, and asymmetrically

| clip | `Foot.L` lift | `Foot.R` lift | L/R asymmetry |
|---|---:|---:|---:|
| authored `Walk` | 0.1960 m | 0.1961 m | 0.0001 m |
| authored `Run` | 0.5376 m | 0.5357 m | 0.0019 m |
| **`MB_Walk_Gun_Debug`** | **0.0935 m** | **0.0669 m** | **0.0266 m (40%)** |

Frame-rate independent, band independent, tool independent — it is the range of a world-space Y
coordinate. The authored clips are symmetric to a tenth of a millimetre; the trial clip's left
foot lifts 40% higher than its right.

This is also *why* the repo's own contact detector becomes unreliable on this clip. Swept over
the contact-height gate, the authored clips are stable and the trial clip is not:

| contact gate | `Walk` (authored) | `MB_Walk_Gun_Debug` |
|---|---:|---:|
| **0.10** (pass-77's own constant) | 1.3559 m/s (616 samples) | **0.2683 m/s (66 samples)** |
| 0.15 | 1.3558 m/s | 1.1214 m/s |
| 0.20 | 1.3558 m/s | 1.2137 m/s |
| 0.25 | 1.2474 m/s | 1.1386 m/s |

At the canonical gate only **66 of 1920** samples survive on the trial clip and it reports a
spurious 0.27 m/s. Widen the gate and it recovers 1.07–1.21 m/s against an operator-scale target
of **1.273 m/s** — i.e. **the stance foot is broadly right**, which is exactly why the foot-slide
failure was withdrawn. The instability is the finding, not the number.

*(Honest limit: `walk_gun` is a slow tactical gait, and no authored clip of a comparable gait
exists to compare against. The lift shortfall is a measured fact; reading it as "a shuffle" is an
interpretation that G6 would have settled and G6 was never run.)*

### 3. The retarget writes metres of motion onto two bones the shipped clips never touch

`PT.L`/`PT.R` are `Root`-parented helper bones — the name reads as *pole target*, but nothing in
the tree states their semantics, and this lane did not establish them.

| | authored `Walk` | authored `Run` | `MB_Walk_Gun_Debug` |
|---|---:|---:|---:|
| `PT.L` height | 0.4669 m, **static** | 0.4206 m, **static** | **−0.0135 m**, path **3.81 m** |
| `PT.R` height | 0.4669 m, **static** | 0.4233 m, **static** | **−0.0168 m**, path **3.87 m** |

All 24 authored clips leave them completely still (lift 0.0000 m, path 0.0000 m) at roughly knee
height. This retarget drags both to the floor and moves them nearly 4 m. **This is Lane AO's own
bug, not MotionBricks'** — the `left_toe_base → PT.L` row was inherited from the pre-existing
Kimodo correspondence table and never questioned. It is fixable by simply not mapping `PT.*`, and
it is called out here so that the next lane fixes it rather than inheriting it a third time.

### 4. Coverage, for the record

20 of the operator's 62 joints are driven (SOMA-30 reaches 22); 18 vary by >0.5° against the
authored `Walk`'s 20. G1's three waist links are effectively co-located — a single 3-DoF waist
where the operator carries a four-segment spine. Its rest hip sits at 0.7872 m against SOMA-30's
0.9887 m, so a G1 clip needs a **25.6% larger root scale** onto the same figure.

## Gate results

| # | Bar | Result | Evidence |
|---|---|---|---|
| G1 | 34 joint names and parents recovered from published metadata, not guessed | **PASS** | `motionbricks.joint_names` + `joint_parents` in `g1-f32/support.gguf` (5,472 B, sha256 `5d41cae4…07200`, matches the repo's own `SHA256SUMS`) |
| G2 | Phase 1 reproduces the frame table exactly for all 15 styles | **PASS** | `mbstyle-inventory.json`: 15/15 predicted `(parameter_count − 11)/412` equals the tensor frame count. Worst rotation orthonormality error 9.293e-7 |
| G3 | Zero tracks on any `OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE` joint | **PASS by the repo's operative definition (variation); unsatisfiable as literally worded** | 40 barred joints carry tracks in the trial clip **and identically in all 24 authored clips** (186 channels each) — Blender writes a channel per bone per action. No gate was changed |
| G4 | Foot slide ≤ 0.06 m | **NOT FAILED — and the bar is unsatisfiable as written** | Contiguous stance slide 2.1617 m / 1.5916 m over 60 and 51 band frames, i.e. **0.0400 and 0.0354 m per stance frame against the authored walk's 0.0574 and 0.0565**. The shipped `Walk` measures 0.5738 m on the literal metric, so no locomotion clip of any provenance passes 0.06 m. **The gate was left exactly as written and was not used to decide anything.** |
| G4b | No finger or thumb channel varies over the clip | **PASS** | `gripChannelsVarying: []`. Authored `Walk` shows 4 and `Idle_Gun` 10, so the check is live |
| G5 | No limb inversion, hip drift ≤ 0.05 m, ground penetration ≤ 0.02 m | **PARTIAL** — no ground penetration by the feet (min **+0.0442 m**, higher than every authored clip). Hip drift 0.0024 m in place. `PT.*` reach −0.0168 m, which is finding 3, not penetration. Limb inversion **NOT ASSESSED** — needs G6's capture | `foot-contact-analysis.json` |
| G6 | Three-quarter capture reads as a human carrying a weapon | **NOT REACHED — readability was never measured** | No capture was taken. Nothing here licenses any claim about how the clip *looks* |
| G7 | Tripwire 0, prewarm ceiling unchanged at 14, focused vitest green, tsc 0 | **PASS on what a no-capture run can show** | ceiling test 9/9 green and untouched; 40 focused tests green; `tsc` exit 0; tripwire needs a session, not run |

**G4 and G5 no longer carry the verdict. G1 does, supported by findings 2 and 4.**

## How strong is this verdict, honestly

Weaker than the first draft claimed, and it should be read that way.

- Finding 1 is **decisive and unfixable** within this model release: a source skeleton with no
  head and no neck cannot animate a soldier's head.
- Finding 2 is **real but interpretable**: the lift shortfall is measured, the reading of it as a
  shuffle is not, because G6 was never run.
- Finding 3 is **this lane's own bug** and counts against the harness, not the source.
- Finding 4 is a **cost** argument, not a defect.

What would change the verdict: a MotionBricks release with a human skeleton carrying a
head and neck. Nothing else in this document would need to move.

**Recommendation: do not spend the day on the C++23/Vulkan build.** The named shortfall list (a
sprint cycle above 3.08 m/s, crouch and prone stance idles and their transitions, a reload body)
is better served by the route already proven on this rig — the four measured Kimodo clips waiting
to be landed — and by authoring in Blender. The one thing MotionBricks does that Kimodo cannot,
**stance changes under a movement command**, remains genuinely unserved and is worth revisiting
if a later release adds a human skeleton.

## Two harness defects found on the way, neither of them MotionBricks' fault

### 1. The bake exported a 30 fps source at 24 fps — FIXED this pass

`retarget-kimodo-motion.py` never set `scene.render.fps`, so Blender's default 24 applied: the
trial clip's sampler ran `1/24 … 76/24`, making it **3.1667 s instead of 2.5333 s and 25% slow**,
with nothing in the file to say so. The frame rate now comes from `skeleton.json` (the `soma30`
path keeps 24, which is both its native rate and Blender's default, so that path is unchanged),
`sourceFps`/`sceneFps`/`clipDurationS` are recorded in the retarget report, and both trial GLBs
were re-baked. Every measurement in this document is from the corrected bakes.

Because one Blender scene exports every action at one scene fps, the 24 fps authored actions
carry 30 fps sampler times **in these re-baked files**. Every frame-based figure here is
unaffected; every per-second figure states the clip's native rate explicitly.

### 2. `measure-retarget-quality.mjs` has two defects and is outside this lane's ownership

Reported, not patched. The exact patch is in the lane report.

- **It cannot decode the shipped GLB, and says so with a number.**
  `pass65-third-person-operator-lod0.glb` uses `EXT_meshopt_compression` and normalized SHORT
  (`componentType` 5122) accessors; the tool reads every accessor as raw `Float32`, returning
  `lowestFootY: -1.33e+74`, `Body NaN` — **and `0.0000 m` foot slide on every foot, which reads
  as a pass.**
- **Its slide metric is not contiguity-aware**, as set out at the top of this document, and its
  `lowestFootY` pools `PT.*` in with the feet. Both produced withdrawn claims above.

`docs/evidence/pass86/hf422/retarget-quality.json` still carries that tool's raw output — the
tool was not modified and the numbers were not massaged — but it now carries a `metricCaveat`
block so those numbers can never be read as a cross-clip comparison again.

## Provenance and licence

| Layer | Pin | Licence |
|---|---|---|
| Style primitives + `support.gguf` | `LocalAI-io/MotionBricks-G1-GGML@cc2a47603dbc203a4f18f35dd06ed3611833f506` | NVIDIA Open Model License, no jurisdiction exclusion; outputs excluded from "Derivative Model" |
| Port | `localai-org/motion-bricks.cpp@6fdb75e15ddb7f97dd1a4abb8017a57b936bc7a3` | Apache-2.0 |
| Upstream | `NVlabs/GR00T-WholeBodyControl@a0732b642c0333077e127a2f56ab0014c196bca4` | dual: code Apache-2.0, weights NVIDIA OML |
| Destination rig | `pass65-third-person-operator-family-v1`, from Quaternius `Swat.gltf` | CC0 1.0, licence file in tree |

All 16 downloaded files SHA-256 verified against the repo's own `styles/manifest.json` and
`SHA256SUMS`. **No `.mbstyle` byte and no model byte is committed** — they are Model data under
NVIDIA OML §3 and live only in git-ignored `artifacts/`. `g1-f32/` (0.73 GB) was not downloaded;
the single 5,472-byte `support.gguf` was, because the joint-name metadata lives there and the
alternative was guessing the joint order.
