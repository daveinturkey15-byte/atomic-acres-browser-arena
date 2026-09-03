# HF-422 Map 3 trial — MotionBricks G1-34 → operator retarget

**Verdict: NO-GO. Do not build `motion-bricks.cpp`.**
Lane AO, PASS 86 overnight, 2026-09-03. Branch
`contrib/dave-gaming-pc/claude/hf422-motionbricks-map3`. Nothing published, nothing shipped.

The trial answered its question in 2 h 20 m of the 3 h budget, without a native build, without a
GPU, and without downloading the 0.73 GB model. **It measures the RETARGET, which is the gate the
generator sits behind. It says nothing whatever about MotionBricks' generation quality.**

## The question, and the answer

> Does G1-34 motion, retargeted onto our 62-joint operator rig, read as a human soldier — or as a
> robot?

It never got as far as reading like anything. The retarget is mechanically correct — the joint
order is recovered from published metadata, the layout is proved from the bytes, the weapon grip
is untouched — and the resulting clip **slides its feet 5.3× further than the shipped `Walk` on
the identical metric, in the identical file, measured by the identical tool**, and is the only
clip in that file whose lowest foot is *below* the ground plane.

## Gate results

| # | Bar | Result | Evidence |
|---|---|---|---|
| G1 | 34 joint names and parents recovered from published metadata, not guessed | **PASS** | `motionbricks.joint_names` + `joint_parents` in `g1-f32/support.gguf` (5,472 B, sha256 `5d41cae4…07200`, matches the repo's own `SHA256SUMS`). Transcribed into `src/animation/motionbricks-g1-retarget.ts` |
| G2 | Phase 1 reproduces the frame table exactly for all 15 styles | **PASS** | `mbstyle-inventory.json`: 15/15 predicted `(parameter_count − 11)/412` equals the frame count in the tensor dims. Rotation matrices orthonormal to 9.3e-7 worst case |
| G3 | Zero tracks on any `OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE` joint | **PASS by the repo's operative definition; the literal wording is unsatisfiable** — see below | 40 barred joints carry tracks in the trial clip **and in all 24 authored clips, identically** (186 channels each). No finger or thumb channel *varies* |
| G4 | Foot slide ≤ 0.06 m | **FAIL — 2.69 to 3.81 m** | `retarget-quality.json` |
| G4b | No finger or thumb channel varies over the clip | **PASS** | `gripChannelsVarying: []` |
| G5 | No limb inversion, hip drift ≤ 0.05 m, ground penetration ≤ 0.02 m | **PARTIAL** — penetration 0.0168 m, inside tolerance but the only negative in the file; limb inversion NOT ASSESSED (needs G6's capture) | `lowestFootY: -0.0168` vs `+0.0224` for every authored clip |
| G6 | Three-quarter capture reads as a human carrying a weapon | **NOT REACHED** | Stopped on G4 as the plan instructs |
| G7 | Tripwire 0, prewarm ceiling unchanged at 14, focused vitest green, tsc 0 | **PASS on what a no-capture run can show** | ceiling test 9/9 green and untouched; 31 focused tests green; tripwire needs a session, not run |

## The number

Every row below is `scripts/animation/measure-retarget-quality.mjs` on
`artifacts/motion/retargeted/hf422-mb-walk-gun-inplace.glb` — one file, which the Blender NLA
export fills with the 24 authored clips **plus** the trial clip, all in uncompressed float
accessors. Same tool, same encoding, same rig, same session.

| clip | Foot.L slide | Foot.R slide | PT.L | PT.R | lowest foot Y |
|---|---:|---:|---:|---:|---:|
| authored `Walk` | 0.5738 m | 0.6219 m | 0.0000 | 0.0000 | **+0.0224** |
| authored `Run` | 0.5058 m | 0.8278 m | 0.0000 | 0.0000 | +0.0220 |
| authored `Idle_Gun` | 0.0000 m | 0.0000 m | 0.0000 | 0.0000 | +0.0228 |
| **`MB_Walk_Gun_Debug`** | **3.2981 m** | **2.9638 m** | **3.8126** | **2.6876** | **−0.0168** |

**5.3× the authored walk on the feet, and the toes move at all where every authored clip pins
them at exactly zero.** The clip is baked in place — the root carries no travel — so this is
genuine sliding, not travel counted as slide. The travelling variant measures 3.34 m for
comparison; the difference between the two is 0.04 m, which is how you can tell the travel was
never the problem.

### The G4 bar is mis-calibrated, and the trial fails anyway

Stated honestly because it matters for the next lane and because the bar must not be quietly
moved: **0.06 m came from a band (0.020–0.052 m) measured on four Kimodo clips that are two
idles, a crouched reload and a hit reaction** — near-static clips where every frame really is a
plant. A *walk* has swing phases, and the shipped `Walk` measures 0.57 m on this same metric. So
no locomotion clip of any provenance, authored or generated, can pass a 0.06 m bar as written.

The gate is left exactly as written. The verdict does not depend on it: against the only fair
comparator — the authored walk this clip would have to beat to be worth anything — the trial is
**5.3× worse**, and that is not a close call either.

## Two defects found on the way, neither of them MotionBricks' fault

### 1. `measure-retarget-quality.mjs` cannot read the shipped GLB, and says so with a number

`pass65-third-person-operator-lod0.glb` uses `EXT_meshopt_compression` and normalized SHORT
(`componentType` 5122) accessors. The measurer reads every accessor as raw `Float32` out of the
buffer view, so on the shipped asset it returns `lowestFootY: -1.33e+74`, `Body NaN`, "180 deg"
for most joints — **and `0.0000 m` foot slide for every foot, which reads as a pass.** It is a
tool that reports green on a file it cannot decode.

This lane worked around it (measuring the Blender output, where the trial clip and the authored
baselines sit side by side in float accessors), so the finding is reported, not patched — the
file is outside this lane's ownership. The exact patch is in the lane report.

### 2. Driving `PT.L`/`PT.R` from a non-actuated source toe is wrong on this rig

`g1skel34` **does** carry `left_toe_base`/`right_toe_base`, contradicting the pre-trial
expectation that a robot source has no toe and the operator's toes would sit at rest. That is
good news that turns out not to help: the G1 toe links are non-actuated extensions that simply
follow the ankle, and on the operator's flat-hierarchy rig — where `PT.*` is keyed as world
translation and every authored clip holds it at exactly 0.0000 m of slide — driving them from
source FK gives the toes the whole foot swing. `PT.L` at 3.81 m is the worst number in the table.

## What this does and does not license

- It **does not** say MotionBricks generates bad motion. This trial never ran the model.
- It **does** say the `g1skel34` → 62-joint operator retarget, done by the same global-delta
  method that produced four shippable Kimodo clips, produces a clip that would need per-clip
  hand correction to be usable. **That costs more than authoring the clip in Blender**, which is
  the honest alternative and is what the report is obliged to say.
- The decisive structural reasons, all measured rather than argued: G1 has **no head and no neck
  link at all**, so the operator's head is locked to the chest for the whole clip; its waist is a
  single 3-DoF joint where the operator carries a four-segment spine; its rest hip sits at
  0.7872 m against SOMA-30's 0.9887 m, so a G1 clip needs a **25.6% larger root scale** than a
  Kimodo clip onto the same figure.

**Recommendation: do not spend the day on the C++23/Vulkan build.** The named shortfall list
(a sprint cycle above 3.08 m/s, crouch and prone stance idles and their transitions, a reload
body) is better served by the route that is already proven on this rig — the four measured Kimodo
clips waiting to be landed into `pass65-third-person-operator-lod0/1/2.glb` — and by authoring in
Blender where a clip has to be exactly right.

The one thing MotionBricks does that Kimodo cannot — **stance changes under a movement command** —
remains genuinely unserved. It is worth revisiting only if a later release adds a human skeleton;
`docs/DEMO.md` "Initial limitations" states G1 is the only skeleton the released model supports.

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
