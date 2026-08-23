# kimodo.cpp — text-to-skeleton animation, assessed 2026-08-23

Owner-shared: <https://x.com/jichiep/status/2091277918521417834> — Richard
Palethorpe (@jichiep): *"kimodo.cpp is up on GitHub! It allows you to animate a
skeleton by describing what you want it to do."*

Recorded because a previous answer in this session said local text-to-animation
"is not possible in this environment". **That was wrong**, and this file exists
so the correction is on the record rather than only in chat.

## What it actually is

- `localai-org/kimodo.cpp` — a C++/GGML port of **NVIDIA Kimodo**, a
  text-to-motion model.
- **Input:** UTF-8 text prompt, or precomputed LLM2Vec embeddings (4096 F32).
- **Output:** **SMPL-X22 skeletal data** — root translations plus local XYZW
  rotations. This is a real 3D skeleton, not 2D sprites.
- **Runs locally** on CPU or a Vulkan GPU. This machine has both.

That last point matters: this is materially different from the MiniMax H3 route
already in the technique register (row 5), which produces 2D sprite/billboard
animation and whose Community Licence excludes the UK outright. Kimodo produces
the thing this game actually needs — skinned skeletal motion.

## The blocker is licensing, and it is the owner's call

Two gated dependencies, both requiring a Hugging Face account and licence
acceptance: an **SMPL-X** checkpoint and **Llama 3 8B Instruct**.

SMPL-X is the binding one. Its model licence states:

> "Any other use, in particular any use for commercial, pornographic, military,
> or surveillance, purposes is prohibited."

and separately prohibits "incorporation in a commercial product, use in a
commercial service, or production of other artifacts for commercial purposes".
Commercial licensing is available separately through Meshcapade.

**However** the same licence permits non-commercial scientific research,
education **and artistic projects**. Atomic Acres is a personal, free,
non-commercial browser game. On the face of it that sits inside the permitted
use — but that is a judgement about the owner's own project and intentions, so
it is **his decision to make, not one to assume**. If the game is ever sold,
monetised or used commercially, a Meshcapade licence would be required first.

This is a much weaker blocker than H3's outright territorial exclusion.

## What would still need building

Even with the licence question answered yes, kimodo.cpp is not drop-in:

1. **No GLB export.** The README states GLB export, constraints, SOMA, G1 and
   quantized models are all absent. Output is raw SMPL-X22 arrays.
2. **Retarget bridge required.** The game's operators use a Mixamo-style rig
   (see `RIGGED_OPERATOR_RUNTIME_ACTION_NAMES` in `src/operator-model.ts`).
   SMPL-X22 joint names and rest pose differ, so a deterministic
   SMPL-X22 → operator-rig retarget is the actual piece of work — roughly the
   same shape as the retarget half of the `mixamo-llm-mocap` row already in the
   register.
3. **Provenance.** This repo's rule is project-original assets, verified by
   `scripts/qa/verify-public-asset-provenance.mjs`. Generated clips would need a
   provenance record naming the model, prompt, commit and licence basis.

## Recommendation

Viable, and worth doing — but as a **deliberate offline authoring lane**, not
something to bolt into this pass while ten agents are mid-flight. Sequence:

1. Owner confirms the non-commercial/artistic basis (or obtains a commercial
   licence).
2. Build the SMPL-X22 → operator-rig retarget with a golden-clip test, using
   any SMPL-X sample as input, so the bridge is proven before any generation.
3. Only then generate motion from prompts and bake to the operator rig.

Until step 1 is answered, the animation work in this pass improves the
animation **system** in code — blending, additive aim offsets, hit reactions,
speed-matched locomotion — which is valuable regardless of where clips come
from and carries no licence exposure.
