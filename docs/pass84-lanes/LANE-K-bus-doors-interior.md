# Lane K — Atomic Acres bus doors and interior (Blender re-export)

Orchestrator: Claude Code (Fable 5.1). Owner 2026-09-02 08:40: "sort all of
this too". This was blocked as "not night-safe" only because it needs a
Blender re-export; Blender 5.1 is installed on this machine.

Worktree: `C:\Users\david\projects\aa-claude-bus`
Branch: `contrib/dave-gaming-pc/claude/bus-doors-interior` (base 7a083e48)

## What is owed
The owner's playtest list had the bus as a recurring item (bus v6 shipped in
PASS 81 with see-through and push physics). The remaining defect, from the
PASS 83 handoff: "Bus doors/interior — needs a Blender re-export from
`scripts/blender/create-atomic-acres-blender-arena.py`; the GLB source is a
revision behind collision." Find the exact owner wording first:
`grep -rn -i "bus door\|bus interior\|inside the bus" docs/ HANDOFF-TO-CLAUDE-PASS84.md`
and the PASS 81/82 handoffs. The outcome: doors open (or are open) and the
interior is enterable and matches collision, so the player can walk in and
out without clipping or invisible walls, and what they see is what blocks.

## Facts
- Generator: `scripts/blender/create-atomic-acres-blender-arena.py`; run
  headless with `"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python <script>`.
  The bake pipeline (webp + meshopt + texture dedupe) runs inside
  `npm run author:blender-arena` — use it, do not hand-run steps.
- Gotcha on record (Blender shaping anchors): a reshape re-anchored on the
  untouched skeleton cancels itself. Gate the SHIPPED BYTES (GLB digest and
  node positions), not in-memory geometry.
- Provenance gates must stay green: `npm run verify:provenance`,
  `npm run qa:asset-provenance`, `assets.manifest.json` digests updated by
  the pipeline, never by hand.
- Collision is authoritative in TypeScript boxes (see the Rustworks tower
  handoff pattern); the GLB is presentation. Align the boxes to the doors
  and interior, and prove it with a Rapier traversal test (stand/crouch/
  prone through the door, along the aisle, out the other side).
- Blender runs are CPU-heavy: run ONE at a time, and check `nvidia-smi` and
  CPU before starting. Never kill ComfyUI.

## Job
1. Establish the current state: screenshot the bus exterior/interior from
   the player eye headless; dump the door/interior nodes of the current GLB;
   diff the collision boxes against the visual openings. Table the gaps.
2. Update the generator (doors, interior detail that reads at eye height,
   seats/poles if the spec asks), re-export through the pipeline, update the
   collision boxes, add the traversal test and a node-position contract.
3. Re-screenshot the same views; verify eye clearance inside the bus with
   the eye-clearance sweep for atomic-acres; verify `qa:asset-provenance`.
4. `npx tsc --noEmit`; focused tests; commit generator, GLB, manifest,
   collision and tests together with explicit paths.

## Boundaries
- You own: the bus generator/script, the bus GLB and its manifest rows, the
  atomic-acres bus collision boxes, the new tests.
- Do NOT touch: the lawn field/perf (Lane A), spawns (Lane D), viewmodel,
  lobby/netcode, other arenas.

## Report
Before/after screenshots compared, GLB digest before/after, collision diff,
traversal test name, provenance gate results, commits. Claim-state every line.
