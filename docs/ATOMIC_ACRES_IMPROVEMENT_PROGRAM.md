# Atomic Acres — the improvement programme

**Owner direction, 2026-09-16.** This is the standing brief for every future pass on this
arena. It exists because two to three days of lane output did not move the frame, and the
cause was structural rather than effort: the reference loop was never closed, and the
techniques and skills the owner had already gathered were never actually applied.

Read this, then `ATOMIC_ACRES_REFERENCE.md` (the numeric brief), then
`REBUILD_LANE_PIPELINE_CORRECTION_2026-09-16.md` (what broke and why).

---

## 1. The direction

Drive the arena toward the owner's reference corpus, continuously, in bounded loops:

- **Assets** — image-to-3D from the reference catalogue wherever it fits, Blender for
  everything else. Trellis 2 via ComfyUI is the intended image-to-3D route.
- **Textures and PBR** — measured against the plates, not chosen by taste.
- **Lighting, shading, shadows, reflections, colour correction, effects** — improved on
  every pass, never declared finished.
- **Animations** — currently untouched; the last standing gap in the owner's list.
- **POVs** — every reference pairs to a capture station, or it is not being graded.
- **LAYOUT, CIRCULATION AND GAMEPLAY — first, and never frozen.** This heading was missing
  from the first version of this document, and its absence is why sixteen consecutive lanes
  were chartered to paint. Routes, cover, sightlines, verticality, flanks, apertures,
  traversal and spawn quality are the SUBJECT of the work, not a constraint on it. A pass
  that improves only the look of a map that does not play is a pass that failed.
  System order is layout first and dressing last: S1 layout and circulation, S2 streets and
  ground, S3 structures, S4 interiors and connectivity, S5 lighting rig, S6 materials,
  S7 props, S8 motion, S9 time-of-day and weather. The rejected build did S6 and S7 first
  and wrote its numeric brief at hour 32.

### The bar

`atomic-acres-catalog/` holds **556 reference images**. `npm run qa:catalogue` reports how
many are paired to a capture station. As of 2026-09-16 that is **15 (2.7%)**. That number
is the programme's headline metric: an unpaired reference is one nothing measures the build
against, which is precisely how effort went into an 11 MB crate while the ceiling was
orange planks.

| set | count | role |
|---|---|---|
| `_judge/refs` | 18 | the frozen bar |
| `batch-4-nuketown-graybox` | 8 | layout authority (owner-confirmed) |
| `batch-3` | 58 | photoreal plates |
| `batch-3/variants` | 176 | time-of-day targets |
| `batch-2-layout`, `batch-1b`, `batch-1` | 18 | layout, weapons, POV |
| `videos/*/frames` | 278 | motion and technique |
| `assets-batch1` | 288 | **our output — not reference** |

---

## 2. The loop, and where it came from

The owner shared two worked examples and both were sitting unused:

- **`C:/Users/david/projects/morning-diner-ref`** — a 100% procedural photoreal three.js
  scene built by a modified Shumer gauntlet loop. `BUILD.md` (3,646 lines) decomposes the
  work into **Systems 1–9**, each iterating in numbered **revs against a fresh critic** with
  explicit per-rev "blockers" and retained A/B frames. `docs/REFERENCE.md` (447 lines) is
  the model for a numeric brief: real solar geometry with citations, penumbra width per
  metre, profile-angle and floor-hit tables.
- **`atomic-acres-catalog/posts/louszbd-skyline-restaurant-brief.html`** — a Blender
  production-brief format captured from the owner's shared thread.

### Loop protocol — every visual lane follows this

1. **Pair before briefing.** Name the reference image AND the capture station the lane is
   judged against. A lane with no station is a lane nobody can grade.
2. **Measure the delta first.** Capture the station on a real GPU, compose the side-by-side,
   state the gap in measured terms. The brief is the delta, not a wish.
3. **One system per lane, strict single-file ownership** when lanes run concurrently.
4. **Budget both quantities** — triangles *and* decoded VRAM, reported before and after.
5. **Re-capture and re-compose.** Same station, real GPU, fresh sheet into `repo-state/`.
6. **Gate honestly.** `tsc --noEmit`, the arena's tests, `verify-public-asset-provenance`,
   and the census (`artifacts/lane-f/census.ts`). Never weaken a verifier. Pre-existing
   failures are named and attributed, not absorbed.
7. **Stop on a plateau.** Bounded: three corrections per subsystem, six total. Repeated
   defect, A↔B oscillation or diminishing return ends the loop and reports.

"Integrated" means all of it: tsc clean, tests attributed, **both** `dist/` and
`dist-compare/` rebuilt (play serves the latter), a staged asset URL curl-checked for a real
byte count *and the right filename*, a real-GPU capture with the adapter vendor recorded,
the sheet regenerated, and the work committed. Work that exists only in a working tree is
not integrated, whatever a log says.

---

## 3. Skill routing — and an honest statement of where this stands

`Skills/CATALOGUE.md` holds **169 active skills** and states the governance plainly:

> Before authoring, allocate task -> canonical skill paths -> source IDs -> expected
> consumer files; record successful native Read tool results. Before acceptance, attach
> actual consumer and mechanical/visual evidence. Keep available, read, applied and
> validated separate. Listing a catalogue or reading a description does not satisfy the
> body-read requirement.

**As of 2026-09-16 this was NOT being met.** The integrator loaded `visual-gauntlet-loop`
and applied its discipline, and lane briefs were written from the morning-diner reference by
hand — but no sub-agent was instructed to resolve and read a skill body, and no lane
recorded a body-read or attached skill-attributed evidence. The results were good; the
governance was not followed. That is the gap this section closes.

**Every lane brief must now name its skills, and the lane must read the body before
authoring.** Resolve with:

```bash
python "C:/Users/david/Documents/desky-bootstrap-clone/_Scripts/gen_skill_catalogue.py" --resolve <name> --read
```

Never guess `Skills/<name>/SKILL.md`; if native Glob returns nothing through the junction,
read `Skills/CATALOGUE.md` by literal path. Canonical paths, verified 2026-09-16:

| lane type | skill | canonical path |
|---|---|---|
| every visual lane | `visual-gauntlet-loop` | `Skills/quality/visual-gauntlet-loop/SKILL.md` |
| materials, lighting, look | `photoreal-procedural-scene-forge` | `Skills/game-development/photoreal-procedural-scene-forge/SKILL.md` |
| asset generation | `ai-3d-asset-generation-loop` | `Skills/game-development/ai-3d-asset-generation-loop/SKILL.md` |
| Trellis 2 / image-to-3D | `comfyui-3d-native-pipeline` | `Skills/game-development/comfyui-3d-native-pipeline/SKILL.md` |
| reference image → code model | `img2threejs` | `Skills/game-development/img2threejs/SKILL.md` |
| arena/WebGPU/TSL work | `webgpu-tsl-arena-forging` | `Skills/game-development/webgpu-tsl-arena-forging/SKILL.md` |
| interior lighting look | `threejs-webgpu-interior-lighting-look` | `Skills/game-development/threejs-webgpu-interior-lighting-look/SKILL.md` |
| concurrent lanes | `parallel-delegation-orchestration` | `Skills/autonomous-ai-agents/parallel-delegation-orchestration/SKILL.md` |
| capture harness / QA | `realtime-browser-qa` | `Skills/software-development/realtime-browser-qa/SKILL.md` |
| frame cost / GPU leaks | `threejs-frame-loop-audit` | `Skills/software-development/threejs-frame-loop-audit/SKILL.md` |

`blender-gauntlet-loop` and `reference-image-catalog` did not resolve by those names on
2026-09-16 — resolve them from `CATALOGUE.md` rather than guessing a category.

Skills are a **shared junction**: editing one through `~\.claude\skills` changes it for
Claude, Codex, OMP, dsh and Hermes at once. Author in the canonical store, treat changes as
governed drift, and pair any skill change with an evaluation record per
`skill-regression-policy.json`.

---

## 4. Trellis 2 / image-to-3D — current state, honestly

**Not yet used.** As of 2026-09-16:

- ComfyUI is **not running** (`127.0.0.1:8188` does not respond). The kit is at
  `C:/Users/david/Desktop/stuff/trellis/` with `ComfyUI-Easy-Install`.
- It was skipped on the afternoon pass because standing it up would have consumed GPU time
  needed for real-GPU captures, and captures are the loop's evidence. That was a scheduling
  call, not a judgement about the technique.
- The route that **has** worked here is a crop from a photoreal plate into image-to-3D:
  `assets-batch1/trellis-trial/bus_crop_raw.png` → `game_bus.glb`, and
  `assets-batch1/trellis-lamp/lamp_crop_raw.png` → `game_lamp.glb`.
- **ComfyUI output is swept at ~2 hours.** Anything generated must be copied out in the same
  session or it is lost.

Asset lanes must meet the texture budget the arena now holds: decoded VRAM **358.7 MB**
against a 500 MB gate (`npm run qa:glb-vram -- public/assets/rebuild --budget 500`). Bake at
512 px maximum edge, prefer one atlas per object over per-material tiling maps, and report
decoded VRAM per piece. A 3,000-triangle prop carrying 96 MB of VRAM is a failure even if it
looks good — that has happened here twice.

---

## 5. Standing constraints, non-negotiable

- **PASS 82:** never add, remove, hide or toggle a light at runtime. Changing the light set
  invalidates every shader program.
- **COMPLEXITY FLOORS, not a freeze.** This replaces the rule that broke the first build.
  The previous text pinned the arena at colliders 122 / shotSurfaces 139 and told every lane
  to REVERT if either moved. Combined with `AGENTS.md`, that made adding a wall, a room, a
  ladder or a piece of cover a revert-able offence for every agent on the project, and it is
  the direct cause of the rejected map: `atomic-acres-rebuild-authority.ts` - the file owning
  every collider, shot surface and spawn - has exactly ONE commit in its history, while
  89% of all line churn went into a file whose own header says it can contain no gameplay.
  The result measured 122 colliders against nuketown2's 369 on 61% more ground, with a mean
  of 1.7 cover pieces within 6 m of a spawn against nuketown2's 17.3.

  A **presentation** lane still must not move authority, and still proves it with
  `npx tsx artifacts/lane-f/census.ts` before and after. But a **layout lane is chartered to
  move it**, and the gate is a FLOOR it must clear, not a pin it must match:

  | floor | target | nuketown2 for scale |
  |---|---|---|
  | movement colliders | >= 300 | 369 |
  | shot surfaces | >= 350 | 389 |
  | breakable windows | >= 8 | 8 |
  | spawns per team | 8 | 8 |
  | cover pieces within 6 m of each spawn | >= 6 | 17.3 mean |
  | reachable floors | >= 4 | - |
  | distinct cross-map routes | >= 6 | - |
  | 8x8 grid cells occupied | >= 50/64 | 55/64 |

  Every lane brief must say which side of that line it is on. A brief that says neither is
  malformed and must be rejected rather than guessed at.
- **Readability beats decoration.** This is a competitive FPS map: an effect that hides a
  player is a bug.
- **Never weaken a verifier, threshold or test to get green.**
- **Never commit `docs/evidence/**`** unless that is the work — a full-suite run auto-rewrites
  a baseline there.
- **Arena-scoped changes must be proved arena-scoped**, not asserted. Fingerprint the other
  arenas and diff.

---

## 6. Standing commands

```bash
npm run qa:catalogue                    # rebuild the reference catalogue + coverage number
npm run qa:compare-refs -- --captures artifacts/viewpoint-regression/<label>/atomic-acres-rebuild
npm run qa:glb-vram -- public/assets/rebuild --budget 500
npx tsx artifacts/lane-f/census.ts      # authority gate
node scripts/qa/capture-arena-viewpoints.mjs --url http://127.0.0.1:41922 \
  --arenas atomic-acres-rebuild --label <label> --settle-ms 45000 --samples 1
npx vite preview --outDir dist-compare --port 41922 --host 127.0.0.1
```
