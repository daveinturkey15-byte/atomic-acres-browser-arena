# Pass 69.3 first-person arms reauthoring plan

Status: `BLOCKED_MANUAL_AUTHORING_OWNER_HITL`

Planning base: `74dd41926a2c375a430371d9a8cba8262908823f`

Owner-feedback outcomes: `HF-133`, `HF-220`

Planning requirements: `R105`, `R108`, `R109`, `R608`, `R609`, `R613`

Change impact of this document: process-only. This plan does not change a mesh,
rig, runtime, acceptance manifest, release channel, or artifact. It is not
implementation evidence and must never be cited as `VERIFIED` or owner-approved.

## 1. Truthful current state

### Observations

- The current shipped delivery remains
  `public/assets/original/models/operators/pass65-first-person-arms-lod0.glb`
  (`953a113e4cfd1f79f0394a7e8b1c601590edc85be52906eb5397e7291ab5a707`,
  406,008 bytes) and LOD1
  (`addd8e4da4dc4659a6b84ece3a084360c495cfd1876b6f68dcccc058346bfaa0`,
  387,520 bytes). No new arm mesh was introduced by the recent handedness,
  material, near-plane, or frame-pacing fixes.
- The inspected native-WebGPU M4A1 reload capture is
  `artifacts/pass69-3/arms-hands/m4a1-reload-no-hud-webgpu.png`, SHA-256
  `a3064bd1ad5845f2f81d4d26a724ff6bedce2dc7b449d04ed209b27677f1e4d5`.
  It is an ignored local artifact, not immutable candidate evidence.
- That frame preserves the requested opaque black/grey direction, but the
  visible anatomy remains below the owner requirement: both forearms have a
  lumpy, pinched silhouette; cuff-to-wrist transitions read as abrupt tubes;
  the wrists converge at implausible angles; fingers and knuckles collapse into
  mitten-like masses; and the reload grip does not read as a deliberate palm,
  thumb and magazine/receiver contact pose.
- The checked-in Blender pipeline has real licensed source, a 37-bone skeleton,
  30 deforming finger bones, two GLB LODs, PBR textures and contact receipts.
  Those are useful structural foundations. They do not falsify the visible
  defects in the live capture.
- Runtime currently filters authored clips to finger tracks and solves the
  shoulder/elbow/wrist chains to weapon sockets in TypeScript. A Blender-only
  upper-arm animation edit therefore cannot fix the live pose unless the
  runtime/socket contract is reconciled too.
- Existing gates primarily prove file identity, bone/clip counts, normalized
  weighting, socket distance, coarse framing and near-plane clearance. A
  structurally valid asset with poor joint volume, wrist roll, finger contact
  or silhouette can still pass.

### Inferences

- The smallest truthful correction is not another root reflection, material
  override, uniform scale, camera crop, or socket-offset tweak. The retained
  licensed mesh needs a manual Blender geometry and weight pass, followed by a
  socket-orientation/runtime reconciliation and full visual matrix.
- The frozen DJMaesen source remains a viable base; replacing it is not yet
  justified. The weak result is in the current derivative, deformation and
  runtime pose integration, not proof that the licensed source is unusable.

### Assumptions to test

- The current weapon GLBs expose usable `grip-socket-r`, `support-socket-l` and
  `reload-socket-l` orientations, not only positions.
- A revised arm master can stay within the current four-skinned-batch and
  37-deform-bone budgets without a visible loss at LOD1.
- The positive-determinant, right-on-positive-X export convention remains
  correct across WebGL2 and WebGPU.

### Unknowns

- Whether the current finger topology has enough edge flow for a high-quality
  result without local retopology around knuckles, thumb webbing and cuffs.
- Which individual weapon sockets need reorientation after the palm reference
  becomes explicit.
- The final owner-preferred forearm thickness, glove bulk and idle/reload style.
  These are HITL decisions after the mechanical contract is green.

## 2. Canonical source, output and runtime surfaces

### Retained licensed inputs

- `source-assets/third-party/djmaesen-fps-arms/scene.gltf`
- `source-assets/third-party/djmaesen-fps-arms/scene.bin`
- `source-assets/third-party/djmaesen-fps-arms/textures/`
- `source-assets/third-party/djmaesen-fps-arms/license.txt`
- `public/assets/third-party/djmaesen/fps-arms/README.md`
- `public/assets/third-party/djmaesen/fps-arms/LICENSE.txt`

The source identity remains DJMaesen/bumstrum `fps arms`, CC BY 4.0, source UID
`08ec4403a47645d8ad80633abf13d39d`, frozen through mirror commit
`96fdc4c94ba6c37786b0af6e8caf44b6cf2913f0`. These inputs remain byte-pinned.

### Rejected baseline retained for comparison

- `source-assets/blender/pass65-first-person-operator-arms.blend`
- `source-assets/blender/pass65-first-person-operator-arms.provenance.json`
- `source-assets/blender/pass65-first-person-operator-arms-contact-receipt.json`
- `scripts/blender/build-pass65-djmaesen-first-person-arms.py`
- `docs/assets/pass65-operators/first-person-arms/`

Do not silently rewrite these records as if the existing owner-rejected shape
had been accepted. Preserve their hashes in the new provenance as the rework
baseline.

### Intended Pass 69.3 authored source and deterministic exporter

- New manual master:
  `source-assets/blender/pass69-3-first-person-operator-arms.blend`
- New deterministic export/receipt script:
  `scripts/blender/export-pass69-3-first-person-operator-arms.py`
- Updated orchestration:
  `scripts/blender/run-authoring.mjs` target `operator-arms`
- Updated finalizer:
  `scripts/blender/finalize-pass65-crossbow-arms-assets.mjs`
- New provenance:
  `source-assets/blender/pass69-3-first-person-operator-arms.provenance.json`
- New contact receipt:
  `source-assets/blender/pass69-3-first-person-operator-arms-contact-receipt.json`

The manual `.blend` is the editable authored source. The exporter must open
that exact checked-in master under Blender 5.1.2 with `PYTHONHASHSEED=0`, reset
the scene to a named review frame, export raw LOD0/LOD1 and review renders, and
fail rather than regenerate the rejected geometry from scalar environment
tweaks. Script-only regeneration from the original GLTF is not a substitute for
the required authored edit.

### Stable runtime deliveries

Retain the existing public URLs to avoid an unrelated loader/catalog migration:

- `public/assets/original/models/operators/pass65-first-person-arms-lod0.glb`
- `public/assets/original/models/operators/pass65-first-person-arms-lod1.glb`
- `public/assets/original/textures/operators/pass65-first-person-arms/`

The new provenance must bind the new master, exporter, optimized GLBs, texture
maps, contact receipt and review corpus by SHA-256. Update
`source-assets/blender/pass65-weapon-production.manifest.json` and
`assets.manifest.json` to point at the new provenance/revision while preserving
the CC BY attribution and unrelated records.

Runtime consumers and tests that must be reconciled are:

- `src/operator-model.ts`
- `src/weapon-presentation.ts`
- `src/weapon-presentation-anatomy.test.ts`
- `src/weapon-presentation-state.test.ts`
- `src/pass65-crossbow-arms-runtime-contract.test.ts`
- `src/viewmodel-framing.test.ts`
- `tests/e2e/pass65-debug-capture-viewmodel.spec.ts`
- `tests/e2e/pass66-viewmodel-framing.spec.ts`

## 3. Manual geometry and rig correction

### Geometry

1. Apply transforms in the master and keep a positive determinant. Do not use a
   negative-X runtime or export reflection.
2. Retopologize the visible elbow, distal forearm, wrist, palm, thumb web and
   knuckle regions where the present loops collapse under the live pose. This
   is a local topology pass, not a primitive sleeve/mitten replacement.
3. Replace the accordion-like forearm contour with a continuous tapered volume.
   Maintain at least three clean deformation loops across each elbow and wrist
   transition and a closed 8-15 mm sleeve/glove overlap in bind space.
4. Re-establish distinct palm, thenar/thumb, knuckle and five-digit silhouettes.
   Preserve three deform phalanges per digit, connected joint heads/tails and
   tapered distal segments. No fused mitten silhouette is acceptable in the
   close review cameras.
5. Preserve deliberate left/right anatomical asymmetry only where the grip
   requires it. In neutral bind, corresponding joint and cuff landmarks must
   mirror within 2 mm after converting to the common arm-root space.
6. Keep all visible arm materials opaque, front-faced and depth-writing. Retain
   the black/grey palette while separating cloth, glove, skin/wrist accent by
   roughness and normal response rather than transparency.

### Weights and deformation

1. Keep no more than four influences per vertex; every skinned vertex must have
   a normalized sum within `1.0 +/- 0.015` and no unweighted visible vertex.
2. For `UpperArm`, `LowerArm`, `Wrist`, and `Thumb2/Index2/Middle2/Ring2/Pinky2`
   on both sides, require at least four rendered vertices with normalized
   weight `>= 0.05` and one with weight `>= 0.20`. Skeleton membership alone is
   not skinning evidence.
3. Require real dual-influence transition vertices for
   `UpperArm/LowerArm`, `LowerArm/Wrist`, `Wrist/digit-1` and every adjacent
   phalanx pair. No rigid single-bone cuff or finger segment may bridge a joint.
4. Weight-paint and inspect elbow flex at 30, 60 and 95 degrees; wrist pitch,
   yaw and roll at +/-30 degrees; and each finger at open, support, firing and
   reload curls. Reject candy-wrapper twist, volume collapse, spikes, gaps or
   surface inversion in any pose.
5. Author LOD1 from the accepted LOD0 while preserving the same skeleton,
   sockets, material semantics and deforming silhouettes. Decimation may not
   remove a digit segment or wrist transition loop that is visible in the
   retained camera matrix.

### Palm and socket orientation

1. Add non-deforming `right-palm-contact` and `left-palm-contact` nodes parented
   below `WristR` and `WristL`. Their transforms define palm centre, forward,
   up and grip roll. Preserve the existing required gameplay sockets,
   especially `right-wrist-knife-socket`.
2. Validate every weapon's `grip-socket-r`, `support-socket-l` and applicable
   `reload-socket-l` as full transforms. A point inside a weapon bounding box is
   not grip proof.
3. In runtime, solve the authored palm-contact transform onto the weapon socket.
   Position error must be `<= 0.010 m` for hip/ADS/fire and `<= 0.015 m` during
   reload interpolation. Socket-relative palm orientation error after one
   documented skeleton-basis correction must be `<= 0.20 rad`.
4. Replace the per-weapon wrist Euler tables in `src/weapon-presentation.ts`
   only after the authored socket quaternions pass the full catalog matrix.
   Do not keep two competing orientation authorities.
5. Keep upper-arm locomotion/action tracks excluded from the live mixer unless
   a later test proves they preserve exact contact. Runtime two-bone IK remains
   responsible for shoulder/elbow reach; authored digit clips and socket
   orientation own the hand. Each live arm must retain at least `0.30 rad`
   elbow flex outside a deliberately authored straight transition.

## 4. Deterministic authoring and provenance procedure

1. Record the base SHA plus hashes of the rejected `.blend`, builder, LODs,
   textures, provenance, contact receipt and inspected Pass 69.3 capture.
2. Make the manual Blender edit only in the new Pass 69.3 master. Save with the
   armature in a named neutral action, frame 1, unit scale in metres, applied
   object transforms and no hidden orphan mesh.
3. Run `npm run author:blender-operator-arms`. The updated target must:
   - open the exact manual master under Blender 5.1.2;
   - render deterministic neutral, deformation and weapon-contact cameras;
   - export raw LOD0 and LOD1;
   - optimize with the existing Meshopt/WebP settings without join, palette,
     prune or simplify operations that can change the rig contract;
   - copy only freshly generated outputs; and
   - finalize provenance/manifests only after all validators pass.
4. Run the authoring command twice from clean disposable worktrees. GLBs,
   textures, review PNGs and JSON receipts must be byte-identical. The `.blend`
   is a pinned input and is not expected to be regenerated by the exporter.
5. Preserve licence/attribution bytes and explicitly describe manual topology,
   weight, socket and material modifications in the new provenance.

## 5. Mechanical and visual gates

### Static/asset gates

- Extend `scripts/qa/verify-pass65-first-person-arms-weighting.mjs` with the
  per-bone positive-weight counts above and adversarial zero-weight fixtures.
- Extend `scripts/qa/pass65-crossbow-arms-glb.mjs` and
  `scripts/qa/inspect-arms-glb.mjs` for palm-node ancestry/orientation,
  connected chains, finite transforms, positive determinant, LOD parity and
  exact material semantics.
- Update `scripts/qa/verify-pass65-first-person-arms-visual.mjs` so a screenshot
  hash plus coarse arm bounds is not visual acceptance. Project shoulders,
  elbows, wrists, palm contacts and all five digit sentinels; require the close
  capture to show each complete chain and hand at reviewable pixel size.
- Keep `npm run qa:pass65:weapon-assets`,
  `npm run qa:pass65:first-person-arms-visual` and
  `npm run qa:pass66:viewmodel-framing` green without weakening thresholds.

### Required catalog/action matrix

The gate must derive set equality from the canonical weapon catalog and cover:

`carbine`, `smg`, `lmg`, `scattergun`, `sniper`, `railgun`, `pistol`, `magnum`,
`machine-pistol`, `mini-uzi`, `mp5`, `m4a1`, `ak-47`, `minigun`, `m14-ebr`,
`slug-shotgun`, `flashlight-pistol`, `explosive-crossbow`, `flamethrower`, and
`flare-gun`.

For each applicable weapon capture hip idle, ADS, fire peak/recovery, dry fire,
reload at progress 0.15/0.46/0.85, empty reload, sprint, crouch, prone/wall
retreat, switch and melee. Add grenade hold/throw and world-interaction poses for
the shared arms. Capture 1600x900, 2560x1440, 3840x2160, 3440x1440, 390x844
portrait and 844x390 landscape. Full native-WebGPU coverage is canonical;
WebGL2 covers the same representative grip families as compatibility evidence.

Every close capture must reject:

- disconnected, fused or unreadable digits;
- wrist/cuff gaps, pinching or candy-wrapper deformation;
- palm/socket position or orientation outside the stated tolerances;
- forbidden sleeve/wrist penetration into the weapon;
- a nearly straight, inverted or cross-body arm solve;
- near-plane clipping, missing limbs, negative-handed output or transparent
  material; and
- an unchanged owner-rejected silhouette hidden by framing or HUD.

Receipts must bind exact source SHA, GLB/provenance/review hashes, browser,
renderer/backend, adapter class, viewport, weapon/action/progress and clean
ending SHA. Automated framing may be `AUTOMATION_PASS`; it is never final owner
visual acceptance.

### Owner HITL

After every mechanical gate is green, build one immutable Pass 69.3 preview and
provide Dave the exact SHA plus a short Gun Range route covering M4A1 reload,
M4A1 ADS/fire, pistol, MP5/Uzi, shotgun pump/reload, heavy weapon, crossbow,
knife and grenade. `HF-133` and `HF-220` remain open until the new asset/runtime
exists; they are not `VERIFIED` without exact-SHA evidence and are not accepted
without Dave's inspection of that immutable preview.

## 6. Falsifiers and stop conditions

Stop and reject the lane if any of the following occurs:

1. The result is achieved by material, reflection, uniform scale, camera crop
   or runtime Euler offsets without a materially revised mesh/weight master.
2. The exporter cannot reproduce byte-identical deliveries from the pinned
   manual master in two clean worktrees.
3. Any visible vertex is unweighted, any required bone lacks meaningful vertex
   influence, or a joint collapses/twists in the deformation matrix.
4. Any weapon/action lacks a complete palm-orientation/contact result or falls
   back to a generic/procedural arm.
5. The authority ray, gameplay timing, weapon catalog, networking or collision
   changes as a side effect of presentation work.
6. A gate passes only because its threshold, viewport, weapon set or action set
   was narrowed.
7. Dave rejects the immutable preview's proportions, joints, fingers, grips or
   motion. Mechanical green does not overrule that owner-HITL result.

## 7. Execution risk and implementation boundary

This cannot be completed truthfully as a reproducible script-only patch in the
current run. A skilled Blender author must perform and inspect local sculpt/
retopology, weight painting and socket orientation in the manual master. The
deterministic part begins after that authored source exists: export,
optimization, provenance, runtime integration and gates can then be automated.

Realistic risk is medium-high. Budget one to two focused authoring days plus a
separate runtime/gate cycle; the largest regression surface is the complete
20-weapon socket/action matrix. If the existing topology cannot hold clean
knuckle, wrist and elbow deformation after one bounded manual pass, stop and
commission a replacement licensed/project-authored arm mesh rather than adding
more runtime distortion.
