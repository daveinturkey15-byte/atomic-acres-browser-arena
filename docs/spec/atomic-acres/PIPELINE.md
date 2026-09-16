# Atomic Acres — Design & Implementation Pipeline

Owner directive: Dave, 2026-09-13. Binding for ANY model or harness working on Atomic Acres.
Master source register: `INGESTION_REGISTER.md` (same folder). Technique skill:
`Skills/game-development/reference-image-catalog` (shared store, all harnesses).

## §0 Authority order

1. Dave's current direct instruction.
2. Live repo `AGENTS.md` + contribution/release contract + AKP active controls.
3. This pipeline (changes = owner-approved, one bounded change per iteration, recorded).
4. Installed skills (workflow heuristics — never override current upstream docs/source).

## §1 The Order (structured implementation route)

**Step 1 — Reference Image Catalogue (TOP of the order, never "done").**
- Populate heavily at project start; then CONTINUOUSLY: every request and pass appends refs.
- Shot matrix per `shot-matrix.md` (231 slugs: weapon POV/ADS/side/detail/world + map views) —
  **re-weighted per owner steer 2026-09-13: ENVIRONMENT-FIRST** (map plates, assets/props, lighting
  moods, effects, experience). Weapons = detail-tweak scope only (finger/texture/lighting studies,
  scope sight-pictures, firing-animation frames, arms/bot studies); full weapon re-models are NOT a
  priority (owner: current models "not too bad").
- Prompt packs per `prompt-templates.md` (byte-identical style blocks, ≤75 CLIP tokens, negative
  block) + **fixed weapon-identity descriptions** reused verbatim across every view of a weapon
  (validated in batch-1b: same carbine across POV/side/ADS).
- Each catalogue revision freezes as the visual bar; bar changes are owner-approved revisions.
- Structure mirrors astralwar.io/refs: per-category galleries (weapons, sight pictures, maps, assets).
  Reference scale: their full collection = 15 weapon/sight plates + 3 map collections (~21 items,
  4 filter categories). Ours: 231 slugs / 21 weapons / 12 maps — deliberately denser.
- Review gallery for owner gates: `Desktop\atomic-acres-refs-preview\preview.html` (plate model,
  filters, lightbox).

**Step 2 — Generation lanes (images → 3D → animation).**
- *Images*: Codex/GPT-Image = primary renderer (proven 2026-09-13, ~55s/plate). Muse Spark / Gemini /
  GLM = prompt engineering + vision judging of outputs against the shot spec. Local ComfyUI =
  offline fallback only (owner prefers not to spend local GPU on image gen).
- *3D assets* (owner steer 2026-09-14: NO paid Meshy/Tripo until further notice):
  PRIMARY = Blender-procedural (verified: Blender 5.1.2 headless + RTX 5080 16GB
  on dave-gaming-pc; Python build scripts per runbook rule, PBR materials via
  procedural textures, GLB export, rig-trial review page, integrate). SECOND =
  local Trellis2 image-to-3D (weights `microsoft/TRELLIS-image-large` cached in
  HF hub; nodes at `atra/ComfyUI/comfy_extras/nodes_trellis2.py`; ComfyUI server
  started per-batch). DEFERRED = Meshy REST / TripoAI / auto-rig (no paid key).
  0xrishi recipe stages map 1:1 (ref → 3D → Blender decimate → rig trial) with
  the 3D step bound to Blender/Trellis instead of Meshy. Per-asset budgets stand.
- *Animation*: Blender rigging + procedural clips first (Meshy auto-rig deferred with Meshy); video-referenced animation from local captures
- *Every asset* lands with a manifest row: source refs used, generator, seed/revision, sha256,
  triangle/texture budget, and the catalogue views it must match.
- *Asset classes* (owner ratified 2026-09-14 — detail budget follows camera distance +
  interaction; no class may spend above its row without a bar revision):
  | Class | Examples | Glass | Interior | Collision | Review distance | Min rounds |
  |---|---|---|---|---|---|---|
  | A walk-in interior | only spaces gameplay enters (none yet) | cut-out + frames | full, contact everywhere | architecture boxes | 1 m + gameplay | 5 |
  | B sealed hero | bus, semi, houses, jeep, rusty | dark inset panes, sealed shells | NONE (dark glass by design) | single boxes matching dims | 5 m + street | 4 |
  | C hard prop | shed, fence, lamp, sign, pads | none | none | single box or non-solid per fact | 10 m | 2 |
  | D dressing | hedges, laundry, furniture, decals | none | none | non-solid always | 15 m | 1 + eye |
  Trellis/image-to-3D output always enters as class B or C raw material (decimate +
  rebake lane); promotion to A needs explicit owner call + authority pass.
  (`videos/luccacerf/TECHNIQUE.md`): agentic prop-attach QC via 245-pose grip sweeps + telemetry.

**Runbook rules (adopted from builtbysketch's paperroute.lol runbook).**
- **Asset turnarounds**: every character/hero asset also renders front, side, rear + clay turnarounds
  at each checkpoint — review renders are the actual job; 60-70% of quality delta came from the
  agent's own render-review loop.
- **Branch experiments**: experimental features (weather, effects) run in separate subagent threads +
  worktrees, merged only when proven — matches repo worktree discipline.
- **Reproducible assets**: every Blender asset = a Python build script run headless (not MCP), never
  hand-modeled one-offs.
- **Mechanics before looks**: hold art direction back until the simulation is playable and tested;
  polish then gets 80% of the budget.

**Step 3 — Gauntlet integration.**
- Builder implements; critic compares implementation captures against the frozen catalogue views
  (same camera recipe, same aspect) per-view, not vibes. Observed output feeds the next attempt.
- Critics: Gemini 3.8 Flash (multimodal) + GLM (session vision model) + owner visual acceptance.
- Acceptance = per-view diffs within tolerance or owner pass. Never weaken the comparison to pass.

**Step 4 — Performance & platform gates.**
- FPS floor, draw calls, memory/disposal, resize/mobile — per existing QA skills.
- Mobile is FIRST-CLASS: PWA delivery (Add to Home Screen), touch controls, portrait AND landscape
  layouts, FPS floor benchmarked on real handsets, not emulators (luckeyfaraday Kino port = study
  target — its "playable" claim is anecdotal, no FPS counter; paperroute's mobile 60fps also
  unproven. Our gate benchmarks real handsets).

**Step 5 — Serialized production.**
- Repo work: lane identity via project-routing, contribution ledger, one publisher, green PRs only
  (existing contract unchanged). Catalog/asset work lives in `atomic-acres-catalog/` + repo

## §2 Binding rules

- Originality: no CoD/BO2/Nuketown or any protected likeness in refs, prompts, or assets.
- Freeze bars/rubrics mid-run (R2/LH-1); bar revisions are explicit owner-approved events.
- Provenance on everything (LH-9): every image/mesh/clip traceable to prompt + generator + refs.
- Models must cite which catalogue views/skills they used (handoff R36 lesson — mapping ≠ using).
- Secrets never enter catalog, manifests, AKP, or chat. Provider keys via approved secret flow.
- Multi-agent: specialists report up; one writer per lane; publish only through the canonical lane.

## §3 Verified lane capabilities (as of 2026-09-13)

| Lane | Route | Proven for |
|---|---|---|
| Codex (GPT-6 Astra) | `codex exec` | Image generation — **QUOTA 0% since 2026-09-13, offline for days** (halted, no retries; replacement-renderer probes running) |
| Muse Spark 1.3 Contributor | `omp -p --model meta/muse-spark-1.3-contributor --thinking xhigh` | Coding worker, prompt packs (xhigh) |
| Gemini 3.8 Flash | `agy --model gemini-3.8-flash-high` | Multimodal critic, coding second opinion |
| GLM-5.3-flash | OMP session + task subagents | Orchestration, vision judging, cheap workers |
| Opus 5 xhigh | `claude -p --model opus --effort xhigh` | Heavy coding/verification worker |
| Blender 5.1 headless | `"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --python` | PRIMARY 3D lane since 2026-09-14: Python build scripts → PBR + GLB + turnarounds (verified: 5.1.2, RTX 5080) |
| Local Trellis2 / ComfyUI | `atra/ComfyUI` server, TRELLIS-image-large weights cached | Image-to-3D lane, SECOND after Blender-procedural (verified 2026-09-14: weights + nodes present; server started per-batch) |
| Automation browser | `automation-profile` Chrome, hub-supervised — port 9226 headless / headed for login | Logged-in X + Google surfaces (owner logged in 2026-09-13) |
|damjan lens tracing| full-screen WebGPU/TSL fragment pass | Traced scope optics for ADS sight pictures (difficulty 7/10, days-not-weeks) — replaces faked vignette overlays |

## §4 Stack policy

Primary runtime: three.js WebGPU route (Build 19 baseline), WebGL2 compat retained. NOTHING is
removed. A wasm+WebGPU exploration lane is OPEN (pvncher argument archived in
`posts/pvncher-2097634988401250686.json`): pursue only where a measured win on our hardware is
demonstrated (bevy/rust-wasm cited as exemplar). Any stack addition passes the repo perf gates
before adoption.

## §5 Open breadcrumbs (fill out over time)

- Video→animation lane: local H3 captures + kimodo (licence-gained 2026-08-24) as reference
  material for animation generation — needs a bounded pilot.
- Animation prefab library design — luccacerf/damjan frame-extracts DONE
  (`videos/luccacerf/TECHNIQUE.md`, `videos/damjan/TECHNIQUE.md`); prefab schema design next.
- VKSR (ECCV 2026) surface reconstruction — geometry-cleanup candidate; code unpublished, but
  clone-now baselines identified: `mweiherer/matern-surface-reconstruction` (MIT) +
  `nv-tlabs/nksr` (CVPR'23). 8 further discovered sources: register rows 17-24.
- Meshy/Tripo API key provisioning — DEFERRED by owner steer 2026-09-14 (no
  paid accounts yet). Blender-procedural + local Trellis2 carry all 3D until
  the owner re-opens this. Docs at docs.meshy.ai when resumed.
- Reverse-engineering lanes queued (autonomous browser): Super Smash Royale (smashroyale.io),
  Out 4 Blood (cesharpe.com/o4b — L4D-style, dark-zone atmosphere lead), Qingming
  (qingming-riverside.vercel.app — 584 animated NPCs), paperroute.lol devlog. DONE:
  astralwar.io/refs structure (15 weapon/sight plates + 3 map collections — EXACT counts extracted
  from its data chunk), builtbysketch runbook, luckeyfaraday mobile HUD anatomy (118 frames).
- Past-50 residual items (PAST_LINKS_MATRIX.md): video legs for rows 1/2/3/4/5/7/9/10/25
  (twimg CDN downloads + frame-extract, browser-free); GPU-lane rows 9/29/32/45; skill-body reads
  rows 7/26/49; create-or-unmap rows 35/36/40.
