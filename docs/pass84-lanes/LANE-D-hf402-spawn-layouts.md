# Lane D — HF-402: reasonable spawns for players and bots on every map (pass 84)

Orchestrator: Claude Code (Fable 5.1), takeover record
`docs/PASS84_TAKEOVER_CLAUDE_2026-09-02.md`. Ledger row HF-402.

Worktree: `C:\Users\david\projects\aa-claude-hf402`
Branch: `contrib/dave-gaming-pc/claude/hf402-spawn-layouts` (base ac0bc5f2)

## Owner statement (verbatim, 2026-09-02 07:08 BST)
"please ensure all maps have more reasonable spawns for both players and
bots, currently raid spawns me in outside and i want the multiplayer and
guest lobby experience to be great too ... all maps should be playable and
joinable in the same way"

Raid is the arena registered as `test2` (menu name Raid). Spawn layouts on
every map were last changed in commit b138b9c0 (2026-08-31, "spawn layouts
on every map") and the owner still lands outside on Raid, so that pass did
not solve it — measure what it actually produced before assuming.

## Mechanical falsifier (ledger)
The spawn-layout quality gate passes per map with spawn points inside or
adjacent to POI cover, the collider-aware solver output
(`scripts/qa/solve-spawn-layouts.ts`) is committed with the map, and a real
join on each map lands the player where the layout says.

## Job, in order
1. Read `scripts/qa/solve-spawn-layouts.ts` (83 lines), the spawn-safety
   gate it feeds, and where each arena's spawn table lives
   (`grep -rn "spawn" src/rendering/arenas/*.ts src/additional-maps.ts src/map-selection.ts | head -60`).
   Establish how player spawns, bot spawns, team spawns and mode spawns
   (Domination zones, Gun Range) are chosen at deploy time and at respawn.
2. BEFORE evidence per arena (all selectable arenas; farcrysis excluded):
   for each spawn point, is it inside the playable bounds, on a walkable
   surface, within N metres of POI cover, not in line of sight of an enemy
   spawn, and not "outside" the intended play space? Produce a table. For
   Raid specifically, show the exact spawn the owner gets on a solo deploy
   and on a host+guest deploy.
3. Design the constraint set the solver is missing (POI proximity, inside
   the fenced/walled envelope, cover within reach, team separation,
   minimum distance from bots' spawns), implement it in the solver, re-run
   it per map, commit the regenerated layouts with the map.
4. Bots: same rules; bots must not spawn in the player's face or outside
   the envelope.
5. VERIFY with a real headless deploy on every map (real Chrome,
   `channel:'chrome'`, policy flags from
   `scripts/qa/lib/browser-launch-flags.mjs`, serve `dist` on port 41944):
   sample the player position from the debug snapshot after deploy and
   after one respawn, and assert it matches a committed spawn that passes
   the gate. Save `artifacts/qa/hf402/<arena>.json` and one screenshot per
   arena from the spawn viewpoint. Look at the screenshots: the owner's
   complaint is visual ("spawns me outside").
6. Extend the spawn gate so a future layout that spawns outside the envelope
   fails CI. Derive the arena roster from the registry — never a hardcoded
   list (a hardcoded roster is how three earlier gates went green while
   never looking at the newest arenas).
7. `npx tsc --noEmit`; focused vitest for files you touched; commit to your
   branch with explicit paths.

## File ownership (hard)
- You own: spawn tables/layout data per arena, `scripts/qa/solve-spawn-layouts.ts`,
  the spawn-safety gate and its tests, spawn selection logic at deploy and
  respawn (mark edits `// HF-402:`).
- Do NOT edit: arena geometry/art, `src/weapon-presentation.ts`, viewmodel
  clip, thermal, lobby/netcode transport, `baselines/`. If spawn selection
  lives inside `src/legacy-main.ts`, edit ONLY that region with `// HF-402:`
  marks; the file is LF — preserve it. Another agent (AGY, HF-403) is
  editing `scripts/qa/mp-lab/` and `// MP-LAB:` regions in a different
  worktree; do not create files under `scripts/qa/mp-lab/`.

## Machine rules
Headless only, `--mute-audio`, never a visible window. One browser at a
time, one build at a time. Never kill a process you did not start.

## Report (final message = raw data for the orchestrator)
Per-arena BEFORE/AFTER table (spawn count, in-envelope %, POI distance,
worst offender), the Raid root cause, the new constraints, gate changes,
evidence paths, commits, and anything not verified. Claim-state every line:
VERIFIED / CLAIMED / OPEN.
