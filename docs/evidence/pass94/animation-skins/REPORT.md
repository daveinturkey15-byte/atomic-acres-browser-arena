# PASS 94 — animation and skins: report

Lane ANIMATION + SKINS. Branch `contrib/dave-gaming-pc/claude/animation-skins` from
`origin/contrib/dave-gaming-pc/omp/pass84-overnight` (`112fee7c`). Worktree
`C:/Users/david/projects/aa-claude-anim`. Nothing published, nothing merged.

Claim-states: **VERIFIED** = measured or read this pass. **RECORDED** = a prior pass's tracked
evidence. **ASSUMPTION** = reasoned, not measured. **OPEN** = not done.

---

## What the owner should notice

1. **Skins are no longer a tint.** A third-person operator's garment is now built by a TSL node
   graph — camouflage, cloth weave, a faction shoulder band, grime rising from the boots and
   abrasion — instead of one flat colour multiplied over a dark atlas plus an emissive fill
   faking the brightness that multiply could not reach. There are two visually distinct looks
   per team, and the code refuses to load a registry where that stops being true.
2. **Crouching and going prone are animation states now, not just bone offsets.** A crouch-walk
   runs its leg cycle faster to match the shortened stride instead of skating; a prone operator
   can no longer select a full run; sprinting leans the body and drops the aim authority.
3. **The honest answer to the "image and H3 video" question is no** — for animation. Neither
   produces a skinned clip on our 62-joint rig. `PLAN.md` says where each does earn its place.
4. **Bots still do not crouch.** That was deliberate; it is the first item in section 6.

---

## 1. What changed

### New modules (presentation-only; nothing touches hit proxies, movement or replication)

| File | What it is |
|---|---|
| `src/operator-skin-look-registry.ts` | Authored procedural looks — palette, camouflage field, cloth, wear — with load-time invariants: at least two looks per team, every same-team pair perceptually distinct, every cross-team pair separable at range. |
| `src/operator-skin-tsl-materials.ts` | The TSL node graphs and the material cache. One graph per (look, role); instance clones preserve node identity and add no pipeline. |
| `src/operator-posture-layer.ts` | Posture (stand/crouch/prone) and sprint as solved state: cross-fade weights, cadence correction, per-posture clip-speed cap with reported residual, stance- and sprint-scaled aim, sprint lean. |
| `dev/pass94-operator-looks.{html,ts}` | Evidence harness. Builds operators through the shipped `buildOperator` / `poseOperator`. Never imported by the game. |
| `scripts/pass94/capture-operator-looks.mjs` | Headless capture driver for the harness. |

### Shared files touched

Other lanes are editing Nuke Town; nothing here goes near it.

| File | Hunks | What |
|---|---|---|
| `src/legacy-main.ts` | 2 (`+63`, `+2011..2015`) | One import; one `setOperatorLookRenderBackend(renderRuntime.backend)` beside the existing `dataset.renderBackend` line. |
| `src/rigged-operator-animation-director.ts` | 9 | Optional `stance` input and `stance` output; clip selection sees the posture-capped speed; a new `applyCadence` helper re-times emitted layers inside the existing playback limits; aim pitch scaled. Omitting `stance` reproduces the previous behaviour exactly. |
| `src/operator-model.ts` | 10 | Imports; two runtime-state fields; posture solved before the director and passed in; `ensureAnimationRuntime` back-fills the new fields for hand-built runtimes; the sprint lean added to the stance-pivot target; a 14-line early return in `materialForTeam` selecting the procedural look. |

---

## 2. The measurements the work rests on

| Finding | Claim-state |
|---|---|
| The rig is Quaternius `Swat.gltf`: 62 joints, 24 clips, CC0. **No crouch, prone, sprint or jump clip exists in the corpus.** | VERIFIED — GLTF animation list |
| Bind pose height **1.854 units**, so geometry units are metres and every procedural scale is a real size. | VERIFIED — POSITION accessor min/max |
| The base operator GLTF has **zero images**; each PASS 74 skin GLB has 12, including normals, and its garment materials carry a `baseColorTexture`. | VERIFIED — GLTF/GLB JSON chunks |
| `skinPaintedBodyMaterial` sets `color` (a multiply over that atlas) **and** `emissive` to the same hue at `body.lift`. Its own comment records that two atlases mean about 40/255 and that no multiply, "not even white", can lift them. | VERIFIED — `src/operator-model.ts` |
| Bots publish `stance: 'stand'` unconditionally at `legacy-main.ts:8310` and `:14033`. | VERIFIED |
| **`NodeMaterial` on three 0.185.1 declares `set type( _value ) {}`, an explicit no-op** (`node_modules/three/src/materials/nodes/NodeMaterial.js:47-53`). The `material.type = 'MeshStandardMaterial'` guard documented in `farcrysis-tsl-foliage.ts` as the thing that keeps WebGL2 compiling **is silently discarded on the installed revision**. | VERIFIED — read the source and reproduced in a test |
| `MeshStandardNodeMaterial.clone()` preserves node-object identity and yields an identical `customProgramCacheKey()`, so per-instance clones add no pipeline. | VERIFIED — asserted in `operator-skin-tsl-materials.test.ts` |
| A `MeshStandardNodeMaterial` sets `isMeshStandardMaterial === true` but is **not** `instanceof THREE.MeshStandardMaterial`. | VERIFIED — see section 5 |

---

## 3. Design decisions worth defending

- **The graph replaces the albedo; it does not tint it.** The authored base-colour map is
  detached and retained on `userData.authoredBaseColorMap`, the same recovery contract HF-380
  already uses for the visor lens. Leaving it bound would multiply the dark atlas back over the
  procedural colour and restore the exact defect. The **normal map is kept**, because surface
  relief is the one thing the atlas contributes that a cheap procedural field cannot.
- **Pattern space is `positionGeometry`, not UV and not `positionLocal`.** The bind-pose vertex
  position is pre-skinning, so camouflage stays glued to the cloth instead of swimming as the
  operator animates, and it does not depend on how the atlas was unwrapped.
- **Twelve node graphs for the whole game.** Four looks times three garment roles, built once
  and cached. The WebGPU backend compiles one pipeline per distinct graph and identifies a graph
  by node-object identity — HF-374 is the precedent where per-layer literals produced 86 unique
  graphs and an arena could not boot.
- **Posture transition durations are derived from `DROP_SHOT_TIMING`, not re-tuned.** A second
  table would let the body finish moving before or after the stance it represents.
- **The residual is reported, never hidden.** A prone operator moving faster than a crawl gets a
  capped clip and `residualSpeedMps` on the output — the same policy `animation-locomotion.ts`
  already applies to sprint. Closing it needs an authored clip, not a bigger multiplier.
- **Fail-closed on the backend.** Until `setOperatorLookRenderBackend` runs, and on the WebGL2
  compatibility route, the shipped tinted path is used. A boot-order change degrades to today's
  appearance, never to an invisible operator.

---

## 4. Gates

Quoted verbatim from the run output.

```
$ npx tsc --noEmit
(no output)
```

```
$ npx vitest run src/operator- src/animation- src/rigged- src/character-presentation-contract.test.ts
 Test Files  22 passed (22)
      Tests  399 passed (399)
```

New tests inside that total: 24 (`operator-skin-look-registry.test.ts`), 16
(`operator-skin-tsl-materials.test.ts`), 24 (`operator-posture-layer.test.ts`), 9
(`operator-posture-director-integration.test.ts`).

<!-- CAPTURE-GATES -->

No gate, threshold or assertion was weakened. One test in this lane was written against an
exponential envelope that could never reach its declared target; the **implementation** was
changed to a rate-limited ramp so it genuinely arrives, and the test was left as written.

---

## 5. Findings other lanes should know about

1. **`material.type = 'MeshStandardMaterial'` is dead code on three 0.185.1.**
   `farcrysis-tsl-foliage.ts` uses it twice, both times commented as the guard that keeps
   `WebGLRenderer` from throwing on `shaderIDs[unmapped type]`. `NodeMaterial`'s `type` setter is
   an explicit no-op, so the assignment does nothing. Either the WebGL2 route no longer receives
   those materials by some other means, or the guard has been decorative for a while. Not this
   lane's file to change — recorded with the source line as OPEN.
2. **Node materials are invisible to `instanceof THREE.MeshStandardMaterial` audits.** Three
   runtime paths walk operator materials with that test: `applyBotEmissiveBrightness`,
   `isBloomMaterial` in `graphics-refinement.ts`, and the atomic-signal audit in
   `material-compatibility.ts`. The procedural garment materials are skipped by all three. For
   the first two that is consistent with removing the emissive fake; for the third it means the
   retained normal map does not get the anisotropy correction. The three idiom is
   `material.isMeshStandardMaterial === true`, which node materials do set.
3. **Two definitions of "sprinting" now exist in `operator-model.ts`** — the posture layer's
   latched, hysteretic one, and a stateless `smoothstep(speed, 3.2, 6.8)` used only to place the
   weapon socket. Left alone deliberately: unifying them changes weapon-carry timing, which is
   beyond a minimal hook while other lanes are live. Streamline candidate.

---

## 6. OPEN

1. **Bots have no stance.** The posture layer is the presentation half; the authority half —
   hit-proxy height, movement speed, replication, difficulty review — is a gameplay change and is
   deliberately not in this lane. `PLAN.md` section 4, slice 2.
2. **No authored crouch or prone locomotion clip exists.** The cadence correction makes a
   standing clip survive a crouch; it does not make it right. `PLAN.md` section 4, slice 3.
3. The procedural look is applied to the in-match `team` appearance only. The OPERATOR menu panel
   (`showcase`) and the neon-purple Gun Range dummies still use the shipped path.
4. The `material.type` finding (5.1) and the `instanceof` finding (5.2) are unresolved in the
   files that own them.
5. Branch is one commit behind `origin/contrib/dave-gaming-pc/omp/pass84-overnight`; not rebased,
   because a rebase during an active overnight is the integrator's call.
