# Lane AU2 — HF-432 Nuke Town Rebuild refinement + HF-433 crouch speed (Opus, one pass)

Worktree `C:\Users\david\projects\aa-claude-nuketown4`, branch
`contrib/dave-gaming-pc/claude/nuketown2-refine` off the current integration head
(PASS 90 live: the accurate layout + approved look are in). Read first:
`docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` (the first-party minimap
measurements and the three recorded deviations), `docs/nuketown-rebuild/TASK_STATE.md`,
`src/nuketown2-layout.ts`, `src/nuketown2-arena.ts`, `src/nuketown2-fidelity.test.ts`.

## HF-432, from the owner's play of PASS 90
1. **Stairs**: where the reference has them (re-read the minimaps: the stair
   footprints are drawn; pick the wall and direction they climb, the landing and
   the upper hallway), with a headless traversal probe proving a standing player
   climbs each stair and reaches every upper room.
2. **Side areas** (the two back yards and the flanks beside the houses): size,
   shape and cover pieces per the reference (bunker/shelter, shed, planters,
   fence lines, the side paths) - diff table against the schematic, then fix.
3. **Spawns**: re-solve after the yard changes; spawn gate green; no spawn sees
   a spawn; the owner's complaint suggests spawns sit too exposed or too far -
   record the before/after sightline numbers from each spawn.
4. **Doors**: every door opening a player uses is >= 2.1 m clear (no crouch), the
   width per the reference; a probe walks a standing capsule through every door.
5. **Mid-street vehicles**: place the coach, the moving truck and the cars as the
   reference has them (the truck 0.076 L south of the road centre-line per the
   schematic; the coach offset as measured). The 2x core moves with the truck:
   make OVERDRIVE_POSITION per-arena (src/overdrive.ts + the registry) - the
   orchestrator authorises this weapons-code change; the shipped Nuke Town keeps
   its exact position (its tests stay green); line-of-sight claim rule kept.
6. Re-derive the affected fidelity bands with reasons; parity and walkable audits
   at 0; boot smoke; 60 s solo run zero errors; overhead-beside-schematic
   evidence; re-capture the menu preview only if the overhead silhouette changed.

## HF-433 crouch speed (same pass, bounded)
Crouched movement gets its own speed factor (BO2-like ~0.6 of walk; pick from
the shipped movement profile's ratios and record the number), sprint is not
possible while crouched, and crouching clears the sprint latch exactly as
HF-431 does for prone (a still-held Shift does not resume sprinting; fresh press
after standing). Unit tests on the stance/speed/sprint state machine; extend
tests/e2e/pass85-drop-shot.spec.ts with the crouch sequence; the drop-shot
timing constants unchanged; LF preserved in src/legacy-main.ts.

## Rules
Headless only; ComfyUI queue empty + 3 GB VRAM before a browser; one browser on
a private port (4260-4269); never kill processes you did not start; no full
vitest (focused + the ratchet); explicit-path commits with the Opus trailer;
push with the gh credential helper; never touch aa-omp-pass84's working tree;
never weaken a gate. Report with claim-states; be economical - one capture round.
