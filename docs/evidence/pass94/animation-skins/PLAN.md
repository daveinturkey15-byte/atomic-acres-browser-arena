# PASS 94 — animation and skins: capability map and staged plan

Lane ANIMATION + SKINS, `contrib/dave-gaming-pc/claude/animation-skins`, from
`origin/contrib/dave-gaming-pc/omp/pass84-overnight`. Machine `dave-gaming-pc` (UK).

**Owner request:** *"can we find a way to use image and H3 local video to get better
animations too? players and bots, and better skins?"*

Every row below is marked with a claim-state: **VERIFIED** (measured or read this pass),
**RECORDED** (a prior pass's tracked evidence in this repository or the technique register),
**ASSUMPTION** (reasoned, not measured), **UNKNOWN**.

---

## 1. The hard rule first, stated concretely

The owner's standing rule is that the **mocap technique is never used where guns are
involved**, with an adapted permissive variant available for everything else. Read against
this repository, that resolves to three separate facts, not one:

| | Claim-state | Where it comes from |
|---|---|---|
| The video-mocap route (`squall01337/mixamo-llm-mocap`, GVHMR → SMPL-X → Mixamo rig) is **REJECTED** for admitted assets | RECORDED | `docs/PASS74_MOCAP_ROUTE_EVALUATION.md` §4: the repo licence is MIT over **glue scripts only**; SMPL-X is proprietary, requires per-user registration, and prohibits commercial use of derivative body topology without a negotiated licence; Mixamo TOS is separate again. Provenance is enforced by `assets.manifest.json` and `verify-asset-provenance.mjs` against a CC0 baseline. |
| Mocap must never drive **weapon-holding** poses, whatever its licence | RECORDED | Same document, §"Why Mocap on Arms Fails": video mocap carries high-frequency jitter and depth ambiguity; applied to the arms it breaks optic alignment and puts the weapon through the hands. The shipped answer is `solveRiggedOperatorArmsIK()` — analytical two-bone IK onto `grip-socket-r` / `grip-socket-l` after the mixer writes the pose. That is *better* than mocap here, not a compromise. |
| The **permissive variant** is the SOMA-30 checkpoint, not SMPL-X | RECORDED | Technique register row 16: the port's README says Kimodo "gives you SMPL-X"; that is true only of the SMPL-X checkpoint, **the one we may not use**. `soma-rp-v1.1` emits **SOMA-30**, a human layout. Carry both layouts and select by joint count at import. |

The owner separately recorded (2026-08-23, quoted in `docs/PASS77_KIMODO_SKELETAL_ANIMATION_ASSESSMENT.md`):
*"None of this is for commercial use it's all just testing and prototyping so just local."*
That answers the non-commercial branch **for local prototyping only**. It does not answer it
for anything shipped, and Atomic Acres is published to a public URL. **Treat anything
SMPL-X-derived as unshippable until re-decided.**

---

## 2. Capability map — what each source can and cannot give this game

### 2.1 The rig we actually have

| Fact | Claim-state |
|---|---|
| One rig family: Quaternius `Swat.gltf`, **62 joints, 24 clips**, CC0. Every skin GLB must match it or `createOperatorSkinCatalog` throws. | VERIFIED — read from the GLTF and from `src/operator-skin-catalog.ts`. |
| Bind pose is **1.854 units** tall, i.e. the geometry is in metres. | VERIFIED — POSITION accessor min/max. |
| The 24 clips are `Death, Gun_Shoot, HitRecieve, HitRecieve_2, Idle, Idle_Gun, Idle_Gun_Pointing, Idle_Gun_Shoot, Idle_Neutral, Idle_Sword, Interact, Kick_Left, Kick_Right, Punch_Left, Punch_Right, Roll, Run, Run_Back, Run_Left, Run_Right, Run_Shoot, Sword_Slash, Walk, Wave`. | VERIFIED |
| **There is no crouch clip, no prone clip, no sprint clip and no jump clip in the corpus.** Every stance is procedural. | VERIFIED |
| The base `Swat.gltf` has **zero images** — seven flat colours, no albedo, no normal. The four PASS 74 skin GLBs each carry 12 images including normals. | VERIFIED — GLTF/GLB JSON chunk. |

### 2.2 Motion sources, ranked by what they cost here

| Route | Licence-safe for a gun game? | Runs locally? | Cost | Verdict for this lane |
|---|---|---|---|---|
| **Procedural / keyframe layers written in code** (blend graph, speed-matched locomotion, additive aim, hit reaction, posture, sprint) | Yes, unconditionally — it is our own code | Yes | Author time only; zero per-frame cost beyond the mixer bindings already paid | **This is the lane.** It is also the only route that can touch weapon poses at all. |
| **Kimodo text→motion** (`soma-rp-v1.1` → SOMA-30 → retarget) | Only for non-weapon body motion, and only after all three licences (port, upstream, weights) are re-read with a UK jurisdiction check | Yes — native C++/GGML, CPU or Vulkan, **no Python, no paid API** | ~0.7 GB weights; **60 frames in ~31 s CPU-only**; single generation capped at **10 s** | Deferred. Best fit is the long tail — idles, gestures, reactions — never the gun. |
| **MotionBricks G1 planner** (register row 49) | Moot | Native only; **no wasm/WebGPU inference path**, so it is an offline clip bakery | Not paid | **NO-GO on this rig, already measured.** `docs/evidence/pass86/hf422/DECISION.md`: `g1skel34` has **no head and no neck** — 34 joints running pelvis → legs → 3 waist links → shoulders → arms → hand roll. An earlier 5.3× foot-slide claim in that lane was **withdrawn**; the verdict now rests on the structural gap alone. |
| **Video mocap** (GVHMR/SMPL-X/Mixamo) | No — see §1 | Yes, heavy | GPU + heavy deps | Rejected for admitted assets. |
| **H3 local video → sprite atlas** | Video is working reference, not a shipped asset | Yes | ComfyUI time | **Wrong artifact.** H3 produces a 2D atlas or a video. Our operators are skinned 3D rigs. H3 is useful as *reference footage a human or an agent watches*, and as a route for 2D-only elements. It is never a rig lane. |
| **Image → 3D mesh** (ComfyUI native Trellis.2 / Pixal3D) | Register row 45; core ComfyUI nodes, no custom packs | Yes, ComfyUI 0.34.0 on this box | GPU minutes per asset | Good for **props and gear**. Its own skill says explicitly: not for deforming characters, first-person arms, or anything that must be rigged — image-to-3D produces an **unrigged shell**. |

**The honest summary the owner should read:** *image* and *H3 video* cannot make our players
and bots animate better, because neither produces a skinned clip on our 62-joint rig. What
they can do is (a) generate reference an agent looks at, and (b) make **props, gear and
skin concept art**. Better *animation* on this rig comes from code today and, if the licence
question is ever settled for shipping, from `soma-rp-v1.1` text-to-motion for non-weapon
motion tomorrow. Better *skins* come from procedural TSL materials today — which is what
slice 1 delivers — and from image-to-3D attachments (pouches, helmets, packs) later.

### 2.3 What was already built before this lane

`animation-blend-graph.ts`, `animation-locomotion.ts` (with measured per-clip authored ground
speeds), `animation-additive-pose.ts`, `animation-hit-reaction.ts` and
`rigged-operator-animation-director.ts` all shipped in Pass 77. **Slice 1 must extend these,
not replace them**, and it does. VERIFIED by reading each file.

---

## 3. The gaps slice 1 closes

| Gap | Evidence | Closed by |
|---|---|---|
| The director has four states — `idle | locomotion | turn | death`. Crouch and prone are bone offsets applied afterwards in `operator-model.ts`, on top of a standing clip. A crouch-walk therefore plays a standing stride with the hips 0.44 m lower. | VERIFIED — `rigged-operator-animation-director.ts`, `operator-model.ts` stance pose | `operator-posture-layer.ts` — posture as solved state, with a cadence correction derived from the shortened stride |
| Nothing makes a sprint read as one. `Run` is authored at 3.08 m/s, a sprint travels 8.7 m/s, and the playback clamp stops at 1.75×. | VERIFIED — `animation-locomotion.ts` constants | Sprint envelope with hysteresis, a bounded forward lean, and reduced aim authority |
| A prone operator moving at 4.5 m/s selects a **run**. | VERIFIED — no posture cap existed | Per-posture clip-selection speed cap, with the residual reported not hidden |
| Skins are a multiply tint plus an emissive fill. `THREE.Color` multiplies the atlas and two of four atlases have a mean near 40/255 — the shipped comment says no multiply, *"not even white"*, can make those read as a colour. | VERIFIED — `skinPaintedBodyMaterial` and its own comment | `operator-skin-tsl-materials.ts` — the graph **is** the albedo |
| "Two distinct looks per team" is the kind of claim that rots. | — | `operator-skin-look-registry.ts` enforces within-team distinctness and cross-team separation as module-load invariants with tests |
| **Bots publish `stance: 'stand'` unconditionally** (`legacy-main.ts:8310`, `:14033`), so no bot has ever crouched. | VERIFIED | **NOT closed — see §4.** |

---

## 4. Staged plan

**Slice 1 — this pass (delivered).** Procedural posture and sprint layer; procedural TSL
operator looks; unit tests for both; headless capture of every gait and every look.
Presentation only. No gameplay authority touched.

**Slice 2 — bot stance.** Give bots a real crouch. This is deliberately *not* in slice 1: a
bot's stance changes its hit proxy height and its movement speed, so it is a **gameplay
authority** change, not a presentation one, and AGENTS.md forbids a presentation/authority
mismatch. It needs: a stance policy driven by bot tactical state, the same eye-height and
hit-proxy projection the player already has, replication through the pose snapshot, and a
difficulty review. The posture layer is already the presentation half; only the authority
half is missing.

**Slice 3 — the missing clips, hand-authored.** A crouch-walk cycle and a prone crawl on the
62-joint rig, authored in Blender against the existing export pipeline. Slice 1's cadence
correction makes a standing clip *survive* a crouch; a real crouch cycle is what makes it
right. This is also where the `Roll` clip (present, unbound) earns its place.

**Slice 4 — text-to-motion, if and only if the licence question is re-answered for
shipping.** `soma-rp-v1.1` → SOMA-30 → 62-joint retarget, with the golden-clip retarget test
built and passing *before* any generation, and the three licences (port, upstream, weights)
read as files with their read-dates recorded and a UK jurisdiction check. Non-weapon motion
only. Budget: one day for the retarget bridge, generation is cheap after that.

**Slice 5 — image-to-3D gear.** ComfyUI native Trellis.2 for pouches, helmets and packs that
attach to existing sockets. Unrigged shells parented to bones, never skinned geometry.

**Not planned:** MotionBricks (NO-GO, measured), video mocap (licence), H3 as a rig source
(wrong artifact).
