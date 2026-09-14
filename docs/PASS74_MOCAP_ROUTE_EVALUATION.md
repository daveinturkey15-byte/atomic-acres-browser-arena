# Pass 74 — Mocap-to-Animation Route Evaluation (HF-361)

**Owner Feedback Row:** HF-361  
**Subject:** Evaluation of mocap-to-animation route (`mixamo-llm-mocap`, pinned commit `00dfd5385506022d533c84f6737a09f5f4392623`) for in-game third-person operator animation  
**Date:** 2026-08-22  
**Status:** COMPLETE (Evaluated — Recommendation: **DO NOT ADOPT**)

---

## 1. Executive Summary & Verification of Baseline Facts

An investigation was conducted into the feasibility, architectural fit, licensing compliance, and cost/benefit profile of integrating an offline video-to-motion capture (mocap) pipeline into the Atomic Acres animation workflow.

### Verification of Current Repository Baseline
The facts established in the prior investigation were verified against the codebase:
- **Third-Person Operator Model:** Based on the Quaternius CC0 SWAT character, retaining a unified 62-joint humanoid skeleton across four skinned body renderables (`Skin`, `Swat`, `Swat_Black`, `Visor`).
- **Authored Clip Corpus:** Exactly 24 complete action clips ship inside each production operator GLB (`public/assets/original/models/operators/pass65-third-person-operator-lod{0,1,2}.glb`) as discrete NLA tracks.
- **Runtime Binding:** To prevent multi-hundred-millisecond spawn stalls on the browser main thread, the runtime in `src/operator-model.ts` binds only a curated 12-action subset (`RIGGED_OPERATOR_RUNTIME_ACTION_NAMES`) into a single `THREE.AnimationMixer` per operator instance.
- **Post-Mixer Procedural Layers:** Animation clips provide base limb locomotion and gesture timing, but presentation correctness is finalized *after* `mixer.update(dt)` via:
  1. Pelvis/spine stance adjustments (`applyStancePose()`) for standing, crouching, and prone transitions.
  2. Ground-contact leg planting for crouching stances.
  3. Two-bone analytical arm IK (`solveRiggedOperatorArmsIK()`) solving shoulders, elbows, and wrists directly onto body-space weapon sockets (`grip-socket-r` / `grip-socket-l`).
  4. Hand bind-relative floor and finger-curl enforcement.
- **Reference Tool:** `mixamo-llm-mocap` (MIT, commit `00dfd5385506022d533c84f6737a09f5f4392623`) is an offline video-to-3D motion reconstruction and retargeting pipeline built around GVHMR and SMPL-X.

---

## 2. Architectural Fit & Change Surface

If a video-derived motion clip were generated offline and retargeted onto the canonical 62-joint operator skeleton, it fits cleanly into the established Atomic Acres asset and runtime architecture. A new clip simply becomes an additional NLA track on the armature datablock in Blender, passes through deterministic headless export and QA audits, and is exposed at runtime via the action registry.

### Flow Through the Pipeline
1. **Authoring / Retargeting:** The retargeted action clip is added to the NLA tracks of the source Blender file (`source-assets/blender/pass65-third-person-operator.blend`).
2. **Export & Review:** `scripts/blender/create-pass65-third-person-operator.py` processes the `.blend`, exports LOD0, LOD1, and LOD2 GLBs with embedded WebP textures and Meshopt/quantization compression, and renders deterministic multi-angle review stills.
3. **Audit & Manifesting:** `scripts/blender/finalize-pass65-third-person-operator.mjs` executes GLB structural audits via `scripts/qa/pass65-operator-glb.mjs`, hashing outputs and writing `source-assets/blender/pass65-third-person-operator.provenance.json` and `source-assets/blender/pass65-third-person-operator.manifest.json`.
4. **Gate Verification:** `scripts/qa/verify-pass65-operator-production.mjs` validates the 3-LOD family, joint counts, action lists, material opacity, and contact sheets.
5. **Asset Provenance:** `assets.manifest.json` records updated SHA-256 digests verified by `scripts/qa/verify-asset-provenance.mjs` and `scripts/qa/verify-public-asset-provenance.mjs`.
6. **Runtime Admission:** Adding the new action identifier to `src/operator-model.ts` allows the runtime mixer to prewarm and transition to the action.

### Exact Files and Lists That Would Change
To introduce an additional third-person operator action from this pipeline, the following exact files and rosters would be modified:

| Component | File Path | Specific List / Data Modified |
| :--- | :--- | :--- |
| **Blender Generator** | `scripts/blender/create-pass65-third-person-operator.py` | `REQUIRED_ACTIONS` tuple (lines 29–32) if the clip is required for review renders; NLA track enumeration during export. |
| **Blender Finalizer** | `scripts/blender/finalize-pass65-third-person-operator.mjs` | Re-generates provenance and manifest hashes; updates action audit lists. |
| **GLB QA Contract** | `scripts/qa/pass65-operator-glb.mjs` | `REQUIRED_OPERATOR_ACTIONS` array (lines 13–16) if the new clip is promoted to a hard-required production action across all LODs; minimum action count check (`animationNames.length < 24`, line 176). |
| **Production Gate** | `scripts/qa/verify-pass65-operator-production.mjs` | Validates updated action rosters in the production manifest and headless Blender assert expression (`len(bpy.data.actions)>=24`, line 75). |
| **Source Provenance** | `source-assets/blender/pass65-third-person-operator.provenance.json` | `requiredActions` list, `animationContract` string, and `worldGlbs` action counts. |
| **Source Manifest** | `source-assets/blender/pass65-third-person-operator.manifest.json` | `requiredActions` list and `runtimeAudit.lods[].animations` arrays. |
| **Public Manifest** | `assets.manifest.json` | Asset record `atomic-acres-pass65-third-person-operator-family-2026-07-27` (lines 516–535): digests for `sourceBlendSha256`, `sourceScriptSha256`, `sourceProvenanceSha256`, and `productionManifestSha256`. |
| **Runtime Model** | `src/operator-model.ts` | `RIGGED_OPERATOR_RUNTIME_ACTION_NAMES` array (lines 253–266); state-machine transition logic in `switchBaseAction()` (lines 947–955) or `playOneShot()` (lines 957–967). |

---

## 3. Scope Boundaries: Authoring-Time Only & First-Person Arms Exclusion

### 1. Authoring-Time Pipeline Only (Never Runtime Mocap)
- The mocap reconstruction pipeline is strictly an **authoring-time offline process**. It requires deep learning inference stacks (PyTorch, CUDA, heavy transformer/diffusion checkpoints, Python environments, and iterative mesh fitting).
- The Atomic Acres game client is a lightweight, zero-install, deterministic web runtime targeting WebGPU and WebGL2 at fixed 60/120 FPS frame pacing. Live runtime mocap or neural pose reconstruction is architecturally impossible, out of scope, and fundamentally incompatible with web client budgets.

### 2. Explicitly Excluded from First-Person Viewmodel Arms
- **Dedicated Rig & Viewmodel Pipeline:** First-person arms use a specialized 37-bone rig (`pass65-first-person-arms-lod0.glb`) authored specifically for screen-space framing, sight alignment, and ADS precision (`scripts/blender/export-pass69-3-first-person-operator-arms.py`).
- **Digit-Only Clip Filtering:** In `src/operator-model.ts`, `firstPersonArmRuntimeClip()` explicitly strips all arm and shoulder motion tracks using `FIRST_PERSON_RUNTIME_FINGER_TRACK = /(?:Index|Middle|Ring|Pinky|Thumb)[123][LR]/`. Only finger curling is evaluated from clips.
- **Analytical Weapon Socket IK:** Shoulder, elbow, and wrist transforms are solved 100% analytically after animation evaluation to lock hands firmly onto weapon grip sockets and maintain sub-pixel sightline alignment with optics.
- **Why Mocap on Arms Fails:** Video mocap contains high-frequency jitter, depth ambiguity, and positional inaccuracy. Applying mocap directly to first-person arms would break optic alignment, introduce weapon penetration/floating, and degrade tactical shooting feel.

---

## 4. The Decisive Point: Licensing Sub-Gates & Provenance Blockers

The primary blocker preventing adoption is **intellectual property and licensing compliance**. While the top-level GitHub repository `mixamo-llm-mocap` is published under an MIT license, that license applies solely to the wrapper glue scripts, not to the critical underlying models, checkpoints, and datasets.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        mixamo-llm-mocap (MIT)                          │
├──────────────────────────┬─────────────────────────────┬───────────────┤
│    GVHMR Checkpoints     │      SMPL-X Body Model      │ Adobe Mixamo  │
│  (Research / Academic)   │ (MPI-IS Non-Commercial /    │ (Proprietary  │
│  Unvetted Provenance     │  Click-Through Agreement)   │  TOS / No-    │
│                          │  Restricted Distribution    │ Redistribution│
└──────────────────────────┴─────────────────────────────┴───────────────┘
                                   │
                                   ▼
    ❌ FAILS ATOMIC ACRES ASSET PROVENANCE GATE (assets.manifest.json)
```

### Critical Licensing Blockers:
1. **SMPL-X Parametric Model (Max Planck Institute for Intelligent Systems):**
   - The reconstruction pipeline relies fundamentally on SMPL-X for 3D body estimation.
   - SMPL-X is distributed under a proprietary, restrictive license requiring individual user registration.
   - The SMPL-X terms explicitly prohibit commercial use and commercial redistribution of derivative body topology/parameters without a separate, negotiated commercial license agreement.
2. **GVHMR (Generic Video Human Mesh Recovery) Weights & Checkpoints:**
   - Pre-trained checkpoints depend on neural networks trained on diverse academic video/pose datasets (e.g., Human3.6M, 3DPW, AMASS), many of which forbid commercial exploitation or carry unvetted redistribution rights.
   - Generated motions derived directly from these checkpoints carry encumbered downstream provenance.
3. **Adobe Mixamo Asset Rights:**
   - The Mixamo character assets and target skeletons reference Adobe Mixamo service terms, which do not permit standalone redistribution, repackaging, or extraction into third-party open repositories.

### Provenance Gate Requirement:
Atomic Acres enforces strict, audit-backed asset provenance (`assets.manifest.json`, `verify-asset-provenance.mjs`, CC0 baseline for third-party mesh topology). No asset or derivative motion track generated from unvetted or non-commercially licensed models can be admitted into the repository. 

**Adoption cannot proceed until these upstream licensing terms are completely cleared or replaced with fully open-licensed alternatives.**

---

## 5. Cost / Benefit Analysis vs. Existing Authored-Clip Pipeline

| Evaluation Dimension | Existing Authored Pipeline (Quaternius CC0 + Procedural IK) | Video Mocap Route (`mixamo-llm-mocap`) |
| :--- | :--- | :--- |
| **Licensing & Legal** | **Flawless:** Clean CC0 1.0 Universal public domain dedication + original project code. No attribution debt. | **High Risk / Blocked:** Encumbered by SMPL-X non-commercial terms, GVHMR checkpoints, and Mixamo TOS. |
| **Local Dependencies** | **Minimal:** Standard Blender 5.1 LTS and Node.js toolchains already required by the repo. | **Heavy:** Python 3.10+, PyTorch with CUDA/cuDNN, SMPL-X SDK, Git LFS / HuggingFace model weight downloads (several GBs). |
| **Hardware & Compute** | **Negligible:** Instant headless Blender exports; lightweight local CPU/GPU execution. | **Substantial:** Heavy VRAM/GPU compute required per video sequence for 3D human mesh estimation. |
| **Motion Quality & Artifacts** | **Clean & Predictable:** Crisp keyframed poses, stable joint orientations, zero capture jitter. | **Noisy:** Foot sliding, ground clipping, jitter, joint pops, and ambiguous hand/finger positions requiring manual cleanup. |
| **Gameplay Alignment** | **Perfect:** Hand sockets and weapon poses are precisely aligned via procedural IK in TypeScript. | **Requires Heavy Rework:** Mocap hand positions drift relative to weapon grip geometry, still requiring post-IK override. |
| **Iteration Speed** | **Fast:** Re-use of 24 existing clips across all loadouts and stances with dynamic procedural adaptation. | **Slow:** Sourcing video, running neural reconstruction, cleaning in Blender, baking, retargeting, and auditing. |

---

## 6. Final Recommendation and Gating Conditions

### Recommendation: DO NOT ADOPT
**Adoption of the `mixamo-llm-mocap` route for Atomic Acres operator animation is REJECTED.** The project should retain its existing architecture combining 24 clean CC0 Quaternius source clips with post-mixer TypeScript procedural layers (stance pitching, crouch knee planting, two-arm weapon-grip IK, and finger-bind clamps).

### Specific Conditions Required to Change This Recommendation:
1. **Commercial & Unencumbered Model Clearance:** Replacement of SMPL-X and GVHMR with a fully permissive (MIT / Apache 2.0 / CC-BY) human mesh recovery foundation model with clean dataset provenance allowing unrestricted commercial game deployment.
2. **Automated Clean Retargeting to 62-Joint Rig:** A deterministic, automated pipeline that directly outputs clean NLA tracks onto the existing 62-joint Quaternius skeleton, with automated foot-locking and noise filtering that eliminates manual Blender cleanup.
3. **Demonstrated Need for Unique Full-Body Choreography:** Identification of a critical gameplay requirement (e.g., complex cinematic executions, interactive ladder climbs, or vehicle boarding) that cannot be authored via procedural IK or existing clips.
