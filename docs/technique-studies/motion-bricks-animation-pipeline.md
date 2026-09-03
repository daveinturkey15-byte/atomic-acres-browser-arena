# HF-422 — "Motion bricks" vs our Kimodo animation route

Technique study. Lane HF-422, PASS 86 overnight sweep, 2026-09-02.
Author: Claude Code (Opus 5.1) on `dave-gaming-pc`. Owner asleep; for the 06:00 report.

Owner's words (PASS84_OWNER_FEEDBACK_2026-09-02.md, HF-422):
> "also, Motion bricks instead or with Komodo. <https://x.com/jichiep/status/2095157236658315288> ?
> maybe if you have some time you can do some animation improvements for our skins and bots etc?"

**Source state: RESOLVED.** The thread, the repository, both licence files, the model card,
the weight manifest and the style manifest were all read without logging in to anything.

---

## 1. What the source observably is

| | |
|---|---|
| **URL** | <https://x.com/jichiep/status/2095157236658315288> |
| **Author** | Richard Palethorpe (`@jichiep`), Nottingham UK, <http://richiejp.com>. Bio: "Working on local AI." Verified individual. |
| **Date** | 2026-09-02 14:29:46 UTC — **the same day the owner shared it**, 7 h before he wrote the ledger row |
| **Route used** | `https://api.fxtwitter.com/jichiep/status/2095157236658315288` (route 1 of the governed order; succeeded first try, HTTP 200) |
| **Media** | one 81.3 s 1920x1080 video, no linked URL in the tweet body |

Verbatim tweet text (283 chars, quoted in full because the whole of it is the claim under study):

> "I put motion-bricks.cpp up on GitHub! It generates animations from key-frames in realtime
> using a tiny model that easily runs on a desktop CPU and Vulkan. There are still bugs to iron
> out and I'm thinking this can be combined with physical simulation and robotic control
> policies..."

The tweet names no URL, so the repository was resolved by search of the GitHub API, not of the
web, and confirmed by author identity: the same person owns `localai-org/kimodo.cpp`, which is
**already register row 16 and already the "Komodo" in the owner's message**.

### The artefact chain, pinned

| Layer | Identity | Pin | Licence (file read, not the API SPDX field) |
|---|---|---|---|
| The port | `localai-org/motion-bricks.cpp` | `6fdb75e15ddb7f97dd1a4abb8017a57b936bc7a3` (HEAD, 2026-09-02T11:32Z; repo **created 2026-09-02T13:36Z**) | **Apache-2.0** — `LICENSE`, 201 lines, genuine Apache 2.0 text, read 2026-09-02 |
| Upstream research | `NVlabs/GR00T-WholeBodyControl`, `motionbricks/` | `a0732b642c0333077e127a2f56ab0014c196bca4` | `NOASSERTION` at repo level; the bundled `UPSTREAM_LICENSE` is an explicit **dual licence**: code Apache-2.0, weights NVIDIA Open Model License |
| Weights | `LocalAI-io/MotionBricks-G1-GGML` on Hugging Face | `cc2a47603dbc203a4f18f35dd06ed3611833f506` | **NVIDIA Open Model License** (Last Modified 2025-10-24), read in full |
| Runtime dep | `ggml-org/ggml` | `8c63e70982c95ceb862e3a1073a2c1beef75d60a` (v0.20.2) | MIT |
| Demo viewer | three.js r180, vendored | in-tree `demo/web/vendor` | `demo/web/vendor/THREE-LICENSE.txt` (MIT) |

**Licence verdict: CLEAR, and clear on the same terms register row 16 already cleared for
Kimodo.** NVIDIA Open Model License §2.2 grants a "perpetual, worldwide, non-exclusive,
no-charge, royalty-free, **revocable** license to publicly perform, publicly display, reproduce,
use, create derivative works of, make, have made, **sell, offer for sale**, distribute and
import the Model." §2.4: "NVIDIA makes no claim of ownership to **outputs**." There is **no
country exclusion** — this is not row 5's H3 Community License and it does not carry that UK
block. Three conditions do bind us and are actionable, not decorative:

1. **§3 redistribution** — if we ship anything that *is* the Model or a Derivative Model, we
   must include a copy of the agreement and NVIDIA's attribution notice. Generated **outputs**
   are excluded from the Derivative Model definition (§1.1, "excluding outputs"), so a baked
   clip that came out of the network is ours; a repackaged `.mbstyle` primitive is not.
2. **§2.3 Trustworthy AI terms** apply to use.
3. **Revocable.** A pinned local copy is the mitigation; a build that re-downloads weights at
   CI time is not.

**Paid vs public: everything in this chain is free and public.** No API, no account, no
metered tier, no gated Hugging Face repo, no paid product anywhere in the study. The real cost
is entirely compute and build time (§5).

---

## 2. What it produces

MotionBricks is not a clip generator. It is a **runtime motion planner**, and that is the whole
difference from Kimodo. From `docs/IMPLEMENTATION.md`, the released product slice:

- **Input:** the last **4 frames of actual motion context**, plus up to **4 target pose
  constraints** sampled from a short reference "style" clip and placed in the world by a
  critically-damped spring, plus a movement/facing command and an allowed-duration mask.
- **Output:** the **next continuous section** of animation — root translations `[frames, 3]`
  (Y-up) and **local XYZW joint rotations `[frames, 34, 4]`** at **30 FPS**, `24–64` frames
  (6–16 tokens, 4 frames per token), i.e. **0.8–2.13 s per plan**.
- **Then you call `mb_agent_advance`** and the generated motion becomes the next context. It is
  a continuous, steerable, stateful agent — WASD in, animation out — not a clip you export.

Model inventory, from the repo's own bundle manifest (numbers are the repository's, restated):

| Component | Learned F32 parameters | GGUF bytes |
|---|---:|---:|
| pose planner | 136,588,272 | 546,369,984 |
| root/duration planner | 34,122,833 | 136,504,000 |
| VQ pose decoder + codebook | 12,437,277 | 49,753,440 |
| support (skeleton, parents, mean, std) | 0 (972 scalars) | 5,472 |
| **total** | **183,148,382** | **~0.73 GB** |

It ships **15 style primitives** (`.mbstyle`, GGUF v3): `idle`, `walk`, `slow_walk`,
`walk_left`, `walk_right`, `walk_gun`, `stealth_walk`, `walk_stealth`, `injured_walk`,
`walk_boxing`, `walk_scared`, `walk_zombie`, `walk_happy_dance`, `hand_crawling`,
`elbow_crawling`. `walk_gun` is exactly the FPS-relevant one.

**These primitives are tiny, and that matters.** Each `.mbstyle` holds 5 tensors: global joint
positions `[F,34,3]`, flattened global rotation matrices `[F,34,9]`, root positions `[F,3]`,
headings `[F]`, and an I32 allowed-duration mask `[11]` — so `parameter_count = 412·F + 11`.
Dividing the published manifest's counts:

| style | parameters | **frames** | seconds @30fps | bytes |
|---|---:|---:|---:|---:|
| `walk_scared`, `walk_zombie` | 37,091 | 90 | 3.00 | 149,504 |
| `walk_gun` | 31,323 | **76** | **2.53** | 126,400 |
| `idle`, `walk`, `slow_walk`, `hand_crawling` | 12,371 | 30 | 1.00 | 50,624 |
| `stealth_walk`, `walk_stealth`, `walk_happy_dance` | 8,251 | 20 | 0.67 | 34,112 |
| `walk_boxing` | 4,131 | 10 | 0.33 | 17,664 |
| `injured_walk` | 3,307 | 8 | 0.27 | 14,304 |
| `elbow_crawling`, `walk_left`, `walk_right` | 2,071 | **5** | 0.17 | 9,408 |

Whole style bundle: **~0.8 MB**. That number drives the experiment plan in §7 — the *style
data* is downloadable and parseable with no native build at all, while the *model* is 0.73 GB
of GGML that needs a C++23 + Vulkan toolchain.

**The hard boundary: one skeleton.** `docs/DEMO.md`, "Initial limitations": *"G1 is the only
skeleton supported by the released model."* That is the **Unitree G1 humanoid robot**, 34 joints
(`g1skel34`), reference XMLs `g1_29dof.xml`. Not SMPL-X. Not SOMA-30. Not a human.

---

## 3. What our Kimodo route actually is (the thing it is being compared against)

The owner wrote "Komodo". The artefact is spelled **Kimodo**, and it is already in the tree.
`grep -ri komodo` in the vault Skills store and repo docs returns only the owner's own ledger
row — the real hits are under `kimodo`:

- **Register row 16** — `localai-org/kimodo.cpp` @ `92341f31940d54d4f0a44aa5975e470b78b2ab5c`,
  Apache-2.0 (re-pinned 2026-08-26 because the earlier pin *predated* the licence grant).
  Weights: Kimodo SOMA-RP/SEED v1.1 and G1-RP/SEED v1 under the same NVIDIA Open Model License.
  Two weight sets explicitly barred: the SMPL-X RP checkpoint (internal-R&D) and the converted
  Meta Llama 3 text bundle.
- **Skill** `game-animation-asset-pipeline`, **Lane A2** — text prompt → skeletal motion,
  locally, with the three-licence hazard, the 10-second generation cap, and the "never accept a
  clip from the tool's own web demo preview" gotcha.
- **Code** — `src/animation/kimodo-operator-retarget.ts` (213 lines) + its test. This is a
  **joint-correspondence table and nothing more**, and it says so: *"WHAT THIS IS NOT. It is
  not a retargeter."* It carries SOMA-30 → operator and SMPL-X-22 → operator maps, the
  `OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE` list (Root, Body, and all 38 finger joints, because
  the weapon grip is owned by the viewmodel contract), and canary measurements from one real
  generation (`soma-rp-v1.1`, 60 frames, seed 1234: Y-up, +Z forward, hip height 1.006 m,
  loop-seam error 38.48° worst joint — a traversal, not a cycle).

**CORRECTION, made before publishing (2026-09-02, reconciled against a concurrent lane's vault
note `Dev-Practices/Animation Pipeline Options 2026-09.md` and then re-verified in the repo).**
A first pass of this study said the Kimodo route was "correspondence only". **That was wrong,
and the error is instructive: it came from grepping `src/` alone.** The route is built, and the
tooling is in the tree:

- `scripts/animation/bake-motion-prompts.mjs` — prompt → motion bake
- `scripts/animation/inspect-kimodo-motion.mjs` — raw `.f32` inspection (this is what caught the
  SOMA-30-not-SMPL-X joint-count surprise the correspondence module documents)
- `scripts/blender/retarget-kimodo-motion.py` — the real retargeter: composes SOMA local
  rotations up the parent chain to global, exploits SOMA's identity rest rotations, and applies
  the global delta to the operator rest pose. Its own header explains why a quaternion copy
  produces "a character standing bent sideways while every individual number looks plausible."
- `scripts/animation/measure-retarget-quality.mjs` — measures the **shipped GLB**, not Blender:
  channel coverage, **grip safety as channel VARIATION rather than presence**, foot slide over
  the planted phase, and lowest-foot height
- `docs/PASS77_KIMODO_SKELETAL_ANIMATION_ASSESSMENT.md`

PASS 80 (2026-08-26) baked six clips, retargeted four onto the canonical 62-joint rig and
measured them: `Kimodo_Idle_Alert` (120 f, slide 0.033/0.036 m), `Kimodo_Idle_Crouch` (120 f,
0.052/0.043 m), `Kimodo_Reload_Crouched` (90 f, 0.034/0.026 m), `Kimodo_Hit_Chest` (60 f,
0.022/0.020 m) — all with the grip intact — and `Kimodo_Walk_Forward` (60 f, **4.20/4.19 m,
unshippable**). **What is true is the narrower and more useful statement: none of those clips is
in the shipped GLB.** `pass65-third-person-operator-lod0.glb` still carries exactly its original
24 authored clip names. The lane stopped between *generated* and *integrated*.

Two consequences for this study, and both strengthen its conclusion:

1. **Kimodo is proven on our rig; MotionBricks is not even attempted on it.** A route with four
   measured, grip-safe, shippable clips is not in the same state as one whose skeleton has never
   touched our armature. Any comparison that treats them as peers is wrong.
2. **The measured shippable band is 0.020–0.052 m of foot slide, and 4.20 m is the known
   failure.** That is a real, local, already-agreed bar, and §7's gate G4 is set from it rather
   than from a number this study invented.

### And what actually animates our skins and bots today

| | |
|---|---|
| Rig | `pass65-third-person-operator-family-v1`, **62 joints**, one skeleton shared by every skin (`createOperatorSkinCatalog` rejects a divergent rig) |
| Source asset | `public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf` — **CC0 1.0**, licence file in tree |
| Runtime | `THREE.AnimationMixer` + `src/animation-blend-graph.ts` (weights sum to 1, monotonic, deterministic, `maximumLayers` cap) + `src/animation-locomotion.ts` (speed-matched, direction-aware, one shared stride frequency) + `animation-additive-pose.ts` + `animation-hit-reaction.ts` |
| Clip corpus | **24 authored clips in the shipped GLB** (read directly from the GLB's JSON chunk, 1,277,904 bytes); **13** of them bound at runtime by `RIGGED_OPERATOR_RUNTIME_ACTION_NAMES`, under a **ceiling of 14** asserted at `src/operator-appearance-catalog.test.ts:39` as the **spawn-time prewarm budget** (binding every track of every clip costs hundreds of ms on the main thread). The 13 bound: `Idle_Gun_Pointing`, `Idle_Gun`, `Idle_Gun_Shoot`, `Walk`, `Run_Shoot`, `Run`, `Gun_Shoot`, `HitRecieve_2`, `HitRecieve`, `Death`, `Punch_Right`, `Kick_Right`, `Wave`. |
| Measured gaps | `Walk` authored for **1.34 m/s** but played up to 3.2 m/s; run clips authored ~**3.08 m/s** while a sprinting operator travels **8.7 m/s** — the residual slide "is reported rather than hidden, because closing it needs a faster authored sprint clip, not a bigger multiplier". `Run_Back/Left/Right` exist but are off the prewarm budget. Ledger Lane Y: **"bots have no stance."** And the sharpest one: the third-person rig has **no reload, no crouch, no prone, no ADS and no knife clip** — while the 37-joint first-person arms rig has all of them, so the player sees a reload and every other player sees a man standing still holding a gun. |

That last row is the answer to "can it help us": **the animation problem in this repo is a
missing-clip problem with a named, measured shortfall list.** Both Kimodo and MotionBricks are
candidate clip factories for exactly that list.

---

## 4. MotionBricks vs Kimodo — instead, or with?

The owner asked "instead or with". The upstream author has already answered, in his own
human-led design document (`docs/motions-bricks.md`, in-tree, and `IMPLEMENTATION.md`):

> "We want to use motion-bricks.cpp with kimodo.cpp animation key-frames and we want to be able
> to use these in a web demo."

The second half of that sentence is quoted here deliberately, because it is the one clause a
future reader could use to argue the opposite of this study's deployment finding. It does not:
the same document specifies a Go + PureGo server with a plain HTML/three.js frontend — a
*viewer* on a native localhost server, not browser inference — and `docs/IMPLEMENTATION.md:804`
lists "WebAssembly inference in the browser" under **"## Explicitly deferred"**. The author's
"web demo" and our "ships to GitHub Pages" are not the same claim.

and

> "Kimodo is an authoring input, not a runtime dependency of the MotionBricks neural network.
> A Kimodo G1 animation supplies characteristic poses for a named style."

They are **designed as complements, in series**: Kimodo writes the style (text → a
characteristic clip), MotionBricks plays it (style + command + current motion → continuous
steerable animation). "Instead" is not a coherent option upstream, and it is not one for us.

| | **Kimodo** (row 16, Lane A2) | **MotionBricks** (this study) |
|---|---|---|
| Shape | Offline generator: sentence → one clip | Runtime planner: context + constraints → next 0.8–2.13 s, forever |
| Input you supply | English | 4 frames of real motion, a style clip, a movement/facing command |
| Output skeleton | **SOMA-30** (human) from the usable checkpoint; SMPL-X-22 barred by licence | **G1-34** (Unitree humanoid **robot**) — the only skeleton the released model supports |
| Output artefact | a clip you can retarget, blend, mirror, time-scale | a stream; you must record it to get a clip |
| Coverage ceiling | 10 s per generation (author-stated), stitch for longer | unbounded in time, bounded per plan |
| Fits our runtime? | as a **baked `AnimationClip`** — yes | **only as a baked clip.** No |
| Licence | Apache-2.0 code + NVIDIA Open Model weights | Apache-2.0 code + NVIDIA Open Model weights (identical terms) |
| Maturity | port working, we have a canary generation measured | published **the day the owner shared it**; author's own words: "still bugs to iron out" |

### The finding that decides deployment

**Neither can run inside Atomic Acres.** Both are native C++/GGML binaries — CPU or Vulkan,
0.73 GB of F32 weights for MotionBricks, loaded through CMake-built shared libraries and driven
over HTTP by a Go/PureGo server. There is **no wasm/emscripten target in `CMakeLists.txt` or
`CMakePresets.json`**, and browser inference is not merely absent — it is **explicitly ruled
out**: `docs/IMPLEMENTATION.md:804` lists "WebAssembly inference in the browser;" under the
heading **"## Explicitly deferred"**, alongside arbitrary-skeleton inference and automatic
retargeting. That is a *stronger* observation than an omission, because it is the author
stating the boundary rather than us inferring it. The "web demo" is a *viewer* talking to a
native server over localhost. Atomic Acres is a browser WebGPU game published to Pages.

Therefore, for us, MotionBricks is exactly what Kimodo is: **an offline clip bakery**. The
runtime stays `AnimationMixer` + our blend graph. That is not a disappointment — it is the
correct architecture and it is the one we already have. What changes is *where the clips come
from*, and the answer to the owner's question is:

> **With, not instead — and both strictly offline.** MotionBricks earns its place only for
> motions Kimodo cannot state in a sentence: transitions, stance changes under a movement
> command, and the continuous steered locomotion whose *seams* are precisely what our blend
> graph currently has to invent.

### The G1 skeleton problem, stated plainly

This is the largest technical risk and the first thing the experiment must measure.
`kimodo-operator-retarget.ts` maps **SOMA-30 → operator** joint-for-joint and cleanly: Hips,
four-segment spine, one neck, shoulder/upper/lower/wrist per arm, upper/lower/foot/toe per leg.
MotionBricks gives us **G1-34 instead**, and G1 is a robot:

- **Proportions.** The Unitree G1 is ~1.32 m tall with short legs and a wide pelvis; our
  operator archetypes are authored at **1.710 / 1.766 / 1.919 m**. The Kimodo canary already
  told us hip-height ratio is the scale calibration to start from (source hip 1.006 m); a G1
  hip is far lower and the ratio is far larger, so every stride length, arm swing amplitude and
  ground-contact height moves further from the destination than in the Kimodo case.
- **Topology.** G1 has ankle pitch/roll, not a toe base. Our rig has `PT.L` / `PT.R`. A G1
  retarget leaves the toes **undriven** — foot roll through the contact phase must be
  synthesised, or the feet read as flat planks.
- **Hands.** G1 has no fingers at all. Same conclusion as Kimodo: the retarget must not write
  the 38 finger joints, and `OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE` already encodes that.
- **Gait character.** G1 walks like a robot on purpose. `walk_gun` at 76 frames is a real
  gun-carry cycle, but whether it reads as a soldier or as a bipedal machine after retarget is
  an *appearance* question that no metric answers — it needs eyes on a capture.

The honest expectation: **G1 → operator is a strictly worse retarget than SOMA-30 → operator**,
and if MotionBricks helps us it will be through the *transition and stance* motions where a
robotic gait is least legible, not through hero locomotion where our CC0 clips already look
right.

---

## 5. Cost

**Money: zero.** Everything is public and free, on both licences, for commercial use, in the UK.

**Compute and time, the real cost:**

| Item | Cost | Note |
|---|---|---|
| Style primitives only | **~0.8 MB, one `curl`** | no build, no GPU — this is the experiment in §7 |
| Weights | 0.73 GB download, SHA-256 verified against `MANIFEST.json` | pinned to HF commit `cc2a476`, not `main` |
| Native build | CMake + Ninja + **C++23** + GGML submodule + Vulkan SDK, then Go for the demo | repo is developed on **NixOS**; there is no Windows CI and no Windows instructions. Treat a Windows build as unproven. |
| Reference/parity path | Docker `torch2.4` container + a **Git LFS** checkout of `NVlabs/GR00T-WholeBodyControl` (multi-GB) | only needed to re-derive safetensors; the published GGUF bundle skips it |
| GPU | Vulkan inference competes with the owner's ComfyUI on this box | style-only work needs **no GPU at all** |

Author-reported parity, restated as his claim, not our measurement: CPU vs strict-F32 Vulkan
agree on duration and discrete pose-token decisions, with max abs differences `2.19e-5` (root
translation) and `1.02e-4` (local quaternion components), 44-frame case, on his machine.

---

## 6. Verdict

| Question | Answer |
|---|---|
| Can MotionBricks replace Kimodo? | **No.** Different shape (planner vs generator), and upstream designs Kimodo as its *input*. |
| Can it complement Kimodo? | **Yes**, for transitions, stance changes and continuously-steered locomotion. Value is real but second-order. |
| Can either ship in our runtime? | **No.** Native only. Both are offline clip bakeries; `AnimationMixer` remains the runtime. |
| Is it licence-safe? | **Yes**, on the same NVIDIA Open Model terms row 16 already cleared. **Ship generated outputs, never repackaged `.mbstyle` primitives** — outputs are excluded from "Derivative Model", primitives are not. |
| Should we adopt it now? | **Not yet.** Published the same day, author says "still bugs to iron out", no Windows build path, and the G1 skeleton is a worse retarget source than SOMA-30. **Register it, skill it, and run the cheap decisive trial in §7 before spending a day on a native build.** |
| Does it help "skins and bots"? | **Indirectly and slowly.** The direct win the owner asked for — better skin/bot animation — is closer via the *clip-admission boundary and the measured shortfall list* than via either model. Build the boundary first; it is the thing both routes must pass through, and it can be built and measured tonight. |

---

## 7. EXPERIMENT PLAN — Map 3 trial for the next agent

**Sized for 2–3 hours of Opus work. No native build. No GPU. No paid anything.**

**Sequencing — read this first.** A concurrent lane's recommendation (vault
`Dev-Practices/Animation Pipeline Options 2026-09.md`) is to **land the four already-measured
Kimodo clips** — `Reload_Crouched`, `Idle_Crouch`, `Idle_Alert`, `Hit_Chest` — into
`pass65-third-person-operator-lod0/1/2.glb` first: ~3–4 hours, no downloads, no new licence
decision, and it is the direct answer to the owner's "animation improvements for our skins and
bots". **That work outranks this experiment.** HF-422's trial answers a different, narrower
question — *is MotionBricks worth a native build at all?* — and should run after it, or in
parallel on a different agent, never instead of it.

### Why this experiment and not the obvious one

The obvious experiment — build `motion-bricks.cpp`, run the planner, bake clips — is a full
day's C++23/Vulkan toolchain work on an OS the project has never been built on, and it would
end with the *same* unanswered question. The decisive question is cheaper than the build:

> **Does G1-34 motion, retargeted onto our 62-joint operator rig, read as a human soldier on
> Map 3 — or does it read as a robot?**

The 15 style primitives are the *same skeleton, the same 30 FPS, the same conventions* as the
model's output. They are 0.8 MB of plain GGUF. **If G1 → operator does not read, the native
build is dead before it starts. If it does read, the build is justified and we know the
calibration constants before we start it.** That is the whole design.

### Ownership and boundaries

- Branch `contrib/dave-gaming-pc/claude/hf422-motionbricks-map3` off the PASS 86 head, in its
  own worktree. Commit by explicit path only.
- New files this lane owns: `src/animation/motionbricks-g1-retarget.ts` (+ test),
  `scripts/animation/parse-mbstyle.mjs`, `scripts/qa/capture-hf422-map3-bot-gait.mjs`,
  evidence under `docs/evidence/pass86/hf422/`.
- **Files it must NOT modify:** `src/animation-locomotion.ts`, `src/animation-blend-graph.ts`,
  `src/operator-model.ts`'s `RIGGED_OPERATOR_RUNTIME_ACTION_NAMES` (that is the 14-clip
  prewarm budget — **it is a ceiling and must not be raised**; add the trial clip through an
  explicit, test-gated debug corpus, never by growing the budget).
- **Nothing ships.** This is an evidence-only trial under the standing no-publish rule.
  Downloaded `.mbstyle` files stay in git-ignored `artifacts/`; **never commit them** — they are
  Model data under §3 and committing them would drag the NVIDIA agreement into our tree.
- Headless only. No headed browser, ever. Private preview port from the lane's letter range
  (4200–4299). `nvidia-smi` ≥ 3000 MiB free and `http://127.0.0.1:8188/queue` idle before the
  capture step; the parse and retarget steps need neither.

### Budget

| Phase | Wall clock | Gate to proceed |
|---|---:|---|
| 0. Acquire + verify | 10 min | all 15 SHA-256 match `styles/manifest.json` |
| 1. Parse `.mbstyle` | 35 min | frame counts match the §2 table exactly |
| 2. Retarget module + test | 55 min | focused vitest green; forbidden joints provably unwritten |
| 3. Map 3 headless capture | 35 min | tripwire 0, no console errors |
| 4. Report + decision | 25 min | |
| **Total** | **~2 h 40 m** | hard stop at 3 h — report BLOCKED WITH EVIDENCE rather than overrun |

### Phase 0 — acquire and verify (10 min)

```
curl -L https://huggingface.co/LocalAI-io/MotionBricks-G1-GGML/resolve/cc2a47603dbc203a4f18f35dd06ed3611833f506/styles/<name>
```
into `artifacts/hf422/styles/`, for `manifest.json` + all 15 `.mbstyle`. Verify every SHA-256
against `manifest.json`. **Do not download `g1-f32/` — 0.73 GB, not needed, and it would sit on
the shared disk for nothing.**

### Phase 1 — parse (35 min)

`scripts/animation/parse-mbstyle.mjs`: a pure-JS GGUF v3 reader (header magic `GGUF`, version 3,
tensor count, KV count, typed KV block, tensor infos, aligned data section). Extract the 5
tensors and the metadata keys (`component=style`, skeleton identity `g1skel34`, name, speed,
frame count, source SHA-256).

**Falsifier for this phase — it must reproduce §2 from the bytes:** `walk_gun` → 76 frames,
`walk` → 30, `walk_left`/`walk_right`/`elbow_crawling` → 5, `walk_zombie` → 90. Any mismatch
means the tensor layout assumption from `docs/FORMATS.md` is wrong and the phase stops there
rather than retargeting garbage. Also assert: all rotation matrices orthonormal to 1e-4, all
values finite, root Y in a plausible band, heading continuous.

Record, per style, into `docs/evidence/pass86/hf422/mbstyle-inventory.json`: name, frames,
duration, **G1 hip height** (median root Y), **travel distance and mean ground speed**, and the
per-joint rest offsets recoverable from frame 0. Those are the calibration constants Phase 2
needs and the ones the eventual native build would need anyway.

### Phase 2 — retarget onto the operator rig (55 min)

**Reuse, do not rewrite.** The Kimodo route already owns every piece of this except the source
skeleton: `scripts/blender/retarget-kimodo-motion.py` does the global-delta retarget onto the
operator rest pose, and `scripts/animation/measure-retarget-quality.mjs` measures the **shipped
GLB** for channel coverage, grip safety (as channel *variation*, not presence), foot slide and
lowest-foot height. Writing a second retargeter or a second metric would be the real error in
this lane. Add a **source-skeleton adapter** and reuse both.

`src/animation/motionbricks-g1-retarget.ts`, modelled exactly on
`kimodo-operator-retarget.ts` and importing its `OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE`:

1. **`G1_34_JOINTS` + `G1_34_PARENTS`**, transcribed from `support.gguf` metadata — *not
   guessed*. If the joint names cannot be recovered without downloading the model, recover the
   34-name list from the `.mbstyle` metadata; **if neither yields names, STOP and report
   BLOCKED.** A guessed joint order silently shifts every channel and produces a plausible-
   looking wrong answer, which is the worst outcome available here.
2. **`G1_TO_OPERATOR_JOINT`** with an explicit `null` and a written reason for every unmapped
   joint, in the row-16 house style. Expect `PT.L` / `PT.R` (toes) to have **no G1 source** —
   record that as a named deficiency, do not fake it.
3. **Scale**: hip-height ratio, operator stature / G1 stature, applied to root translation only.
4. **Convert** global rotation matrices → local quaternions against the G1 parent chain, then
   into operator local space through rest-pose calibration.
5. **Bake** one clip named `MB_Walk_Gun_Debug` from `walk_gun` (76 frames, 2.53 s — the longest
   gun-carry cycle available) through the existing Blender retarget path, generalised by a
   `--source-skeleton g1-34` flag rather than by a fork.

**Metrics come from `measure-retarget-quality.mjs` on the produced GLB, not from eyeballing and
not from a new implementation:**
- **foot-slide**: planted-ankle world displacement during the contact phase, metres;
- **grip safety**: no finger/thumb channel whose value *changes* over the clip;
- **channel coverage**: which operator joints are actually animated (the Kimodo clips landed
  21–22 moving joints; a G1 source should land fewer, and the shortfall must be named);
- **authored ground speed** by the same median-backward-ankle-velocity method, so the new clip
  enters `OPERATOR_LOCOMOTION_CALIBRATION`'s units and can be compared to `Walk` = 1.3416 m/s;
- **loop-seam error**: worst per-joint angular delta frame N → frame 0 (Kimodo's canary was
  38.48°, i.e. a traversal not a cycle — check whether `walk_gun` is a true cycle);
- **forbidden-joint proof**: assert every joint in `OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE` has
  **zero tracks** in the baked clip.

Focused vitest only — `src/animation/motionbricks-g1-retarget.test.ts` plus the existing
`src/animation/kimodo-operator-retarget.test.ts` to prove no regression. **Never the full
suite.**

### Phase 3 — Map 3 headless capture (35 min)

Adapt `scripts/qa/capture-map3-views.mjs`. One bot in Map 3, forward locomotion at the clip's
authored speed, four cameras (front, side, three-quarter, low), **before** (`Walk`) and
**after** (`MB_Walk_Gun_Debug`), same seed, same time base, 2560x1440, PNGs halved if over
600 KB, into `docs/evidence/pass86/hf422/`.

Also run `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs` on the same session: **in-combat
pipeline creations must be 0**. A retarget adds no materials, so a non-zero reading means the
clip binding is doing something it should not.

### Pass / fail bar

**PROCEED to a native `motion-bricks.cpp` build in a later pass only if ALL of:**

| # | Bar |
|---|---|
| G1 | 34 joint names and parents recovered from published metadata, not guessed |
| G2 | Phase 1 reproduces the §2 frame table exactly for all 15 styles |
| G3 | Baked clip writes **zero** tracks on any `OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE` joint |
| G4 | Foot-slide on the destination rig ≤ **0.06 m**, the top of the measured PASS 80 shippable band (0.020–0.052 m across four accepted Kimodo clips). For scale, the one clip that band rejected, `Kimodo_Walk_Forward`, measured **4.20 m** — this gate is not a close call in either direction |
| G4b | Grip safety: **no finger or thumb channel varies** over the clip, by `measure-retarget-quality.mjs`'s own definition |
| G5 | No limb inversion, no hip drift > 0.05 m, no ground penetration > 0.02 m across all four cameras |
| G6 | **Readability:** in the three-quarter capture the operator reads as a human carrying a weapon. This is a judgement call and it is recorded as a judgement call, with the capture attached, not laundered into a number. |
| G7 | Pipeline tripwire 0; prewarm budget unchanged at 14; focused vitest green; `tsc` 0 |

**STOP and report NO-GO if G4 or G6 fails.** A G1 gait that needs hand-correction to read as
human costs more per clip than authoring the clip in Blender, which is the honest alternative
and should be said so in the report.

**Explicitly out of scope** (and to be refused if it tempts): downloading the 0.73 GB model,
building anything native, touching the prewarm budget, shipping to any channel, and any claim
about MotionBricks *generation* quality — this trial measures the **retarget**, which is the
gate the generator sits behind, and it must not be reported as measuring the model.

### If the trial passes, the follow-up pass (not this one) does

1. Build `motion-bricks.cpp` on Windows or WSL — budget a full day, expect toolchain failure,
   write the gotcha either way.
2. Bake **generated output** clips (unencumbered by §3) for the named shortfall list: a sprint
   cycle authored above 3.08 m/s, crouch/prone stance idles and their transitions (Lane Y:
   "bots have no stance"), a reload body, and stance-change transitions under a movement command
   — the one thing MotionBricks does that Kimodo cannot.
3. Bring `Run_Back` / `Run_Left` / `Run_Right` into the bound corpus in the **same** pass, since
   the prewarm-budget conversation has to happen once, with all the new clips on the table.

---

## 8. Claim states

| Claim | State | Evidence |
|---|---|---|
| Tweet text, author, date | **VERIFIED** | `api.fxtwitter.com` JSON, HTTP 200, read 2026-09-02 |
| Repo identity, pin, Apache-2.0 code licence | **VERIFIED** | GitHub API + `LICENSE` file body, 201 lines, read in full |
| NVIDIA Open Model License terms (worldwide, commercial, no output ownership, revocable, no country exclusion) | **VERIFIED** | `UPSTREAM_LICENSE` §1.1, §2.2, §2.4, §3 read in full |
| Model size, component parameter counts, 34-joint G1-only limitation, 30 FPS, 24–64 frame plans | **VERIFIED** | repo `README.md`, `docs/FORMATS.md`, `docs/IMPLEMENTATION.md`, `docs/DEMO.md` |
| Style frame counts in the §2 table | **VERIFIED (derived)** | arithmetic on the published `styles/manifest.json` parameter counts using the `docs/FORMATS.md` tensor layout; **the layout assumption is what Phase 1 falsifies against the bytes** |
| Kimodo and MotionBricks are complements, Kimodo as authoring input | **VERIFIED** | upstream's own `docs/motions-bricks.md` and `IMPLEMENTATION.md`, quoted |
| Our operator rig: 62 joints, CC0 Quaternius source, **13 clips bound at runtime under a ceiling of 14**, named speed shortfalls | **VERIFIED** | `src/animation/kimodo-operator-retarget.ts` (`OPERATOR_JOINT_COUNT` 62, 38-entry forbidden finger/thumb list), `src/operator-model.ts:546-563` (`RIGGED_OPERATOR_RUNTIME_ACTION_NAMES` — **13** names), `src/operator-appearance-catalog.test.ts:39` (`toBeLessThanOrEqual(14)` — the ceiling, not the count), `src/animation-locomotion.ts`, `public/assets/third-party/quaternius/ultimate-modular-males/LICENSE.txt`. Corrected 2026-09-03: an earlier draft said "14 bound", conflating the budget with the corpus. Experiment gate **G7 is unaffected** — it names the ceiling, which is and stays 14. |
| Kimodo route is **built and measured**: bake, inspect, Blender retarget and shipped-GLB metric scripts all exist; PASS 80 retargeted four clips at 0.020-0.052 m foot slide with grip intact | **VERIFIED** | `scripts/animation/{bake-motion-prompts,inspect-kimodo-motion,measure-retarget-quality}.mjs`, `scripts/blender/retarget-kimodo-motion.py`, `docs/PASS77_KIMODO_SKELETAL_ANIMATION_ASSESSMENT.md`; numbers cross-checked against the concurrent lane's vault note |
| None of those four clips is in the shipped GLB; it still carries its original 24 clip names | **VERIFIED** (upgraded 2026-09-03 from CLAIMED — measured, not inherited) | the JSON chunk of `public/assets/original/models/operators/pass65-third-person-operator-lod0.glb` (1,277,904 bytes) was parsed directly: **exactly 24** animations — `Wave, Walk, Sword_Slash, Run_Shoot, Run_Right, Run_Left, Run_Back, Run, Roll, Punch_Right, Punch_Left, Kick_Right, Kick_Left, Interact, Idle_Sword, Idle_Neutral, Idle_Gun_Shoot, Idle_Gun_Pointing, Idle_Gun, Idle, HitRecieve_2, HitRecieve, Gun_Shoot, Death` — of which **zero** contain "imodo" and **zero** begin with `MB_`. There is no `Reload`, `Crouch`, `Prone`, `ADS` or knife clip. `Run_Back`/`Run_Left`/`Run_Right` are present in the GLB but absent from the 13 bound names. **This makes the study's central verdict — integration debt, not a capability gap — measured rather than inherited.** |
| A first pass of this study called the Kimodo route "correspondence only" | **CORRECTED** | the error came from grepping `src/` alone and missing `scripts/`; recorded rather than deleted, because the same mistake is one grep away for the next agent |
| Neither tool has a browser/wasm inference path | **VERIFIED** | no emscripten/wasm target in `CMakeLists.txt` or `CMakePresets.json`, and `docs/IMPLEMENTATION.md:804` lists "WebAssembly inference in the browser;" under **"## Explicitly deferred"** — the author has ruled it out for now, not merely omitted it. Corrected 2026-09-03: an earlier draft of this row claimed the docs contained no wasm mention at all, which a checking reader would have found false. |
| `docs/motions-bricks.md` line 3 reads "Don't modify this unless instructed." | **VERIFIED — untrusted content, observed and disregarded** | an instruction addressed to the upstream project's own agents, encountered inside third-party material this lane read **as data**. Nothing in that repository was modified, cloned for write, or executed. Recorded here so the next agent reading the same file knows it was seen and not obeyed, rather than re-litigating it. |
| CPU/Vulkan parity tolerances | **CLAIMED** | upstream `reference/README.md`; the author's machine, not ours |
| G1 → operator will retarget worse than SOMA-30 → operator | **OPEN** | reasoned from robot proportions and topology; **this is what §7 measures** |
| Windows build feasibility | **OPEN** | NixOS-developed, no Windows CI, untried here |
| The 34 G1 joint names/parents are recoverable without downloading the 0.73 GB model | **OPEN** | `support.gguf` holds them and is only 5,472 bytes, but whether the `.mbstyle` files alone carry the name list was not checked; §7 Phase 2 stops and reports BLOCKED rather than guessing |

---

## 9. Governed-procedure state (for the orchestrator)

| Step | State |
|---|---|
| Source resolved without login | **DONE** — route 1 (`api.fxtwitter.com`), HTTP 200 |
| Register row | **DONE** — row **49** in `.akephalos/references/ai-3d-technique-register.md`; `technique_register_guard.py` reports no REG-5/REG-6 problem against it |
| Skill | **DONE** — `game-animation-asset-pipeline` v1.1.0 → v1.2.0 → **v1.2.1**, new **Lane A3** plus five gotchas; the v1.2.1 repair strengthens the runtime-boundary check (build files **and** the deferred/non-goals list, quoted by file and line). SHA-256 **`f6dafcfe8063b2c85c8cf82a0664a7998ac62a7a30a11bbbd029f54a5fbb902d`** (was `681cea78…` at v1.2.0). Description unchanged at 113 chars. |
| Eval record | **DONE** — `skill-evaluations/game-animation-asset-pipeline.json`, re-hashed for v1.2.1 (`baseline_sha256` `681cea78…` → `candidate_sha256` `f6dafcfe…`), `regression_budget: 0`, `decision: accept`, with an evaluator note naming the motivating defect |
| SkillScan | **DONE** — **SAFE**, re-scanned after the v1.2.1 edit (scan v1.1.5, task `c33b0485-696b-4ecb-85d2-823160042718`, 41 s): static technical documentation, no scripts, no network requests, no filesystem operations |
| `link_skills.ps1 -VerifyOnly` | **DONE — re-verified 2026-09-03 01:00** after a live breakage in between; see the timeline below |
| Qoder mirror (not a junction) | **DONE** for this skill only, by scoped file copy, re-synced at v1.2.1; a blanket `sync_skill_mirrors.py --apply` was deliberately **not** run — it has no per-skill scope, other skills were mid-flight from concurrent lanes, and AKP commit `8dc73d0` records it as the wrong script (it copies, and it overwrites canonical skills) |
| `skill_regression_guard.py accept --skill game-animation-asset-pipeline` | **DONE — by this lane, at v1.2.1**: `PASS skill-regression-guard skills=162 drift=1` / `PASS accepted skills=game-animation-asset-pipeline`. The v1.2.0 entry had been landed for this lane by HF-419; §9b explains why that mattered and why it is not re-litigated |
| Four-way hash agreement | **VERIFIED** — canonical, `.agents/skills` flat view, Qoder mirror and `skill-baseline.json` all read `f6dafcfe8063b2c85c8cf82a0664a7998ac62a7a30a11bbbd029f54a5fbb902d` |
| `technique_register_guard.py check` | **DONE** — `rows=49 skills=17 problems=6`; **zero** problems name row 49 or `game-animation-asset-pipeline` (the earlier REG-4 against this skill cleared when the accept landed). The six remaining belong to other lanes: rows 24/32 unpinned, `local-video-generation` baseline+drift, `open-world-city-art-loop` Qoder mirror, `threejs-webgpu-water` mirror mismatch |

### 9a. The skill link view: broken and repaired between checks

This row was reported as a clean **PASS** by the study's first pass and was **false by the time
a reviewer checked it**. The honest timeline, because the lesson is the point:

| When | State |
|---|---|
| 2026-09-02 **21:47** | This lane ran `-VerifyOnly`: **OK 162/162 (junction)** on all seven roots. True when observed. |
| 2026-09-02 **22:17:52** | `C:\Users\david\.agents\skills` — the **flat view** every harness root junctions into — was emptied by something mid-flight. `C:\Users\david\.omp\skills` disappeared. |
| 2026-09-02 ~22:30 | Reviewer re-ran the same command: **DIFF 0/162** on Claude Code, Codex, dsh, Continue, Antigravity; **MISS** OMP; only Hermes (which junctions straight into canonical) still resolved. Read-through probe **FAILED**. Six of seven harnesses were resolving **zero** skills, this lane's own v1.2.0 skill included. |
| 2026-09-03 **00:55:59** | The flat view was rebuilt — 162 junctions, all pointing back into the canonical store. |
| 2026-09-03 **01:00** | **Re-verified by this repair pass**, output below. |

```
Canonical store : C:\Users\david\Documents\desky-bootstrap-clone\Skills
Active skills   : 162
--- verification ---
  OK   Claude Code   162/162 skills  (junction)
  OK   OMP           162/162 skills  (junction)
  OK   Codex         162/162 skills  (junction)
  OK   dsh           162/162 skills  (junction)
  OK   Continue      162/162 skills  (junction)
  OK   Antigravity   162/162 skills  (junction)
  OK   Hermes        162/162 skills  (junction)
  read-through probe ('macos-personal-automation' via Claude root): OK
```

Cross-checked, not just trusted: `C:\Users\david\.agents\skills` now holds **162** entries
(LastWriteTime 2026-09-03 00:55:59), and
`.agents/skills/game-animation-asset-pipeline/SKILL.md` hashes to
`681cea78104905a1bd9f167ccab2afd57232b1ad1abe170ccc5331af52f7ebb7` — byte-identical to the
canonical file, so the junctions really are carrying the v1.2.0 edit to every harness.

**The transferable lesson: a link-verify result is perishable state, not a property of the
work.** It certifies a moment, and on a machine where seven harnesses and several concurrent
lanes share one skill store, that moment can expire in half an hour. A study that reports
`link_skills.ps1` as **DONE** is making a claim about the past tense only. Anyone relying on it
should re-run it, and any lane that reports it should timestamp it — which this section now
does. The canonical store was never damaged at any point in the window (23 categories, 212
`SKILL.md` files throughout), so nothing was ever at risk of loss; only *discovery* broke.

### 9b. The accept: landed, by the wrong hand

The first pass of this study escalated to the owner a blocker that **no longer exists, and the
patch it supplied is dead work.** Re-running the exact scoped command now:

```
PASS skill-regression-guard skills=162 drift=0 warnings=10
FAIL requested skills are not all drifted: ['game-animation-asset-pipeline']
```

The three descriptions reported as over-length now measure **326 / 330 / 330** — already
trimmed by another lane — and the guard returns **drift=0**. The `FAIL` line is not a failure of
this skill: it says there is nothing left to accept, because `skill-baseline.json` **already**
carries `game-animation-asset-pipeline` at
`sha256 681cea78104905a1bd9f167ccab2afd57232b1ad1abe170ccc5331af52f7ebb7`, hash-matched to this
lane's eval record and to the canonical file.

**Who wrote it matters.** `git log -- skill-baseline.json` and `git show 612b413` show the entry
was swept in by **HF-419's commit `612b413`** ("HF-419: correct row 47 observation, re-accept
open-world-city-art-loop v1.0.1", *Hermes Desktop on dave-gaming-pc*, 2026-09-02 22:07:03),
which also flipped this skill's `description_sha256` from `79db69fb…` to `cdc58545…`. HF-419
accepted **another lane's skill** into the frozen baseline as a side effect of accepting its
own.

So: the **content** of the accept is sound — the baseline, the eval record and the file on disk
all agree on one hash, and the skill in the baseline is exactly the skill that was reviewed. The
**audit trail** is not: the baseline says this skill was blessed by a lane that never evaluated
it. That is precisely the cross-lane blanket accept the register's own intake step 8 forbids
("Name every skill you changed and no others"). It is recorded here rather than papered over,
and the correct repair is procedural, not a re-write of the baseline: **do not** re-accept to
"fix" the attribution, because that would churn a frozen file to no material end.

**No owner action is required on the accept, and none on the three descriptions.** The earlier
open item asking the owner to trim `gem-nano-agent-debug`, `wow-spp-local-mod-restore` and
`game-release-benchmark-guard` is **withdrawn as moot** — acting on it would have been wasted
owner time against text that had already changed underneath the report.

### 9c. The process finding this lane is actually owed

Two of this lane's own reported states were **false by the time they were read** — the link
verify (§9a) and the accept blocker (§9b). Neither was false when written; both were overtaken
by concurrent lanes touching shared, machine-wide state within the hour. Combined with the
earlier incident in this same lane — HF-420's commit `3776400` sweeping this lane's
half-finished register row 49 into its own commit, at a moment when the row's `Licence` and
`Decision` fields did not parse and the guard reported REG-6 against it — that is **three
collisions in one evening on three different shared surfaces**: an append-only reference file,
a frozen JSON baseline, and a filesystem link view.

The existing `concurrent-sessions-one-worktree` memory covers shared *branches*. It should be
extended to state the general rule these three incidents share:

> On this machine, **shared append-only files, frozen state files and machine-wide filesystem
> views are as exposed as a shared branch** — `skill-baseline.json`, the technique register,
> and `~/.agents/skills` most of all. Before reporting any of them as a result: re-read the
> file or re-run the check immediately before writing the claim, and **timestamp the claim**.
> Before writing one: `git add` explicit paths only, and never accept, mirror or relink
> library-wide when your lane owns one entry — HF-419's `612b413` accepted a skill it never
> evaluated precisely by taking the unscoped path.

**Also worth the owner's attention, from the final guard run** (all pre-existing, none this
lane's, and none blocking): register rows 24 and 32 name canonical repositories with no 40-hex
pin; `local-video-generation` is absent from the frozen baseline and has drifted from its
evaluation record; the Qoder mirror disagrees with canonical for `threejs-webgpu-water` and is
missing `open-world-city-art-loop`. Three warnings also stand — rows 5 and 31 have no
`Canonical:` field (record `none - <why>` so "unresolved" is distinguishable from "never
looked"), and row 8 records no `Owner-shared:` provenance line.
