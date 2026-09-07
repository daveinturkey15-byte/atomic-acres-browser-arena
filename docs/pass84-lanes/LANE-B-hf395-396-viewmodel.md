# Lane B — HF-395 + HF-396: viewmodel clip residue and rail/optic alignment (pass 84)

Orchestrator: Claude Code (Fable 5.1), takeover record
`docs/PASS84_TAKEOVER_CLAUDE_2026-09-02.md`. Ledger rows HF-395, HF-396 in
`docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`.

Worktree: `C:\Users\david\projects\aa-claude-hf395`
Branch: `contrib/dave-gaming-pc/claude/hf395-396-viewmodel` (base ac0bc5f2)

## Owner statement (verbatim, 2026-09-02 06:56 BST)
"gun still clips through walls and floor like crazy and the rail is still
detached from the barrel and scope on the few guns i mentioned. also gun
pullback when youre near a wall etc is too strong, half it?"

The pullback halving (HF-397) is already on the base commit:
`VIEWMODEL_WALL_PULLBACK_SCALE = 0.5` in `src/weapon-presentation.ts`. That
means the clip planes must now carry MORE of the anti-clip work. Do not
undo the halving and do not enlarge retreat.

## HF-395 — clip residue, walls AND floor
Facts:
- The objective instrument is `scripts/qa/measure-viewmodel-penetration-cdp.mjs`
  (read its header: it walks every visible viewmodel VERTEX through
  `__ATOMIC_ACRES_DEBUG__.sampleViewmodelPenetration()` and reports deepest
  penetration into a solid and lowest point below the standing surface;
  screenshots cannot grade this defect because the viewmodel draws on a
  depth-cleared overlay). Usage:
  `node scripts/qa/run-with-preview-server.mjs node scripts/qa/measure-viewmodel-penetration-cdp.mjs --out artifacts/qa/hf395 --label before`
  It defaults to port 41933 — use 41942 for this lane (pass `--url` and the
  preview server's port option) so you never collide with another lane.
- Pass 81 cut 55 -> 12 penetrating poses. Known residual spots: Bus/Van gap,
  Garage door (atomic-acres), plus floor cases (looking down on flat ground
  and sloped grass).
- Clip system: `src/systems/viewmodel-surface-clip.ts` (planes/bounds,
  `VIEWMODEL_SURFACE_CLIP_PLANE_COUNT = 4`); consumer in
  `src/weapon-presentation.ts`. Gotcha on record: a clipping-state change
  used to recompile every weapon material (froze the game); the fix froze
  the material set — keep it that way. Any change that alters material
  permutations per frame is a regression; verify with
  `scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75`
  (in-combat pipeline creations must stay 0).
- Contract tests to keep green: prone-contact `nearPlaneClear`, fire-kick
  clearance, `src/weapon-presentation*.test.ts`, `src/systems/*clip*.test.ts`
  (find them: `grep -rl "surface-clip\|nearPlaneClear" src --include=*.test.ts`).

Job:
1. `npm run build` (one build at a time on this machine).
2. Run the instrument -> BEFORE table per pose (deepest penetration m, floor
   penetration m), all arenas and weapons it covers. Add the owner's cases if
   missing: strafing alongside a wall, inside corners, looking straight down
   on flat ground and on the grass slope, prone against a wall.
3. Diagnose per residual pose: is it a plane-count limit (4), a plane
   selection choice (which surfaces get a plane), a bounds mismatch, or the
   ground plane not surviving a stance? Say which, per pose.
4. Fix minimally in the clip system. Acceptable: better plane selection,
   a floor plane that holds in every stance, more planes IF you prove the
   material set stays frozen. Not acceptable: more retreat, hiding the
   weapon, weakening a test, any ShaderMaterial/onBeforeCompile (TSL
   NodeMaterial only).
5. AFTER table, identical run. Add the fixed poses to the ratchet if the
   instrument supports it.

## HF-396 — rail detached from barrel and scope on the flagged guns
Facts:
- Flagged family: M14 EBR and the scoped/railed rifles (DMR/carbine optic
  family). Weapon GLBs live under `public/assets/` (find with
  `grep -rn "m14\|ebr" src/weapon* assets.manifest.json | head`).
- `scripts/dump-glb-nodes.js` is named in the ledger but DOES NOT EXIST.
  Write a small node-only dumper (three's GLTFLoader in node, or
  `@gltf-transform/core` if present in node_modules) that lists node names,
  world positions and parents; commit it under `scripts/qa/`.
- The mount/socket logic is in `src/weapon-presentation.ts` (5,961 lines —
  search for optic/rail/socket/scope/mount) and the viewmodel modules.

Job:
1. Dump the flagged models' node trees; identify rail, scope, barrel datum,
   and the sockets the presentation code uses.
2. Find why the rail seats away from the barrel (wrong parent, authored
   offset applied twice, ADS pose transform applied to the rail but not the
   barrel, or the model itself). If the GLB is wrong, fix it through its
   generator/source under `source-assets/` or `scripts/blender/` and
   re-export deterministically; do not hand-edit a binary.
3. Fix so the rail seats on the barrel datum at hip AND at ADS, for every
   flagged weapon, and add a per-weapon deterministic alignment contract
   test (node positions within a tolerance) so it cannot drift again.
4. Headless screenshots of each flagged weapon at hip and ADS under
   `artifacts/qa/hf396/`; look at them before claiming anything.

## File ownership (hard)
- You own: `src/systems/viewmodel-surface-clip.ts`, `src/weapon-presentation.ts`,
  viewmodel modules, the penetration instrument, weapon GLB alignment code
  and its generators, new tests for the above.
- Do NOT edit: `src/rendering/arenas/**`, `src/nuketown-lawn-field.ts`,
  lobby/netcode, spawn layouts, thermal files, `baselines/`. One small
  `// HF-395:`-marked `src/legacy-main.ts` edit is allowed only inside the
  viewmodel clip region. `legacy-main.ts` is LF — preserve it.

## Machine rules
Headless only, `--mute-audio`, never a visible window. One browser at a
time, one build at a time. Never kill a process you did not start.
`nvidia-smi` before GPU-heavy runs. Commit to YOUR branch only with
explicit paths, one commit per landed item.

## Report (final message = raw data for the orchestrator)
- Per-pose BEFORE/AFTER penetration table and the floor-plane verdict per
  stance.
- Material-set/pipeline tripwire result after the fix.
- Rail fix per weapon with node names and the root cause; new test names.
- tsc result, focused test results, commits on your branch.
- Anything not verified. Claim-state every line: VERIFIED / CLAIMED / OPEN.
