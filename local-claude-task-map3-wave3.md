# Task: Map 3 wave 3 - volumetrics reacting to physics objects, god-ray midpoint

Worktree C:\Users\david\projects\aa-map3, branch
contrib/dave-gaming-pc/claude/map3-demo-showcase (head 525c98d3). Waves 1-2
landed water, weather, god rays, machinery, signage, the 4x4 through
vegetation, water polish and a god-ray recalibration. All hard rules from
local-claude-task-map3.md still apply (TSL NodeMaterial only, procedural
only, headless real Chrome only, never a visible window, never touch another
worktree, never kill processes you did not start, explicit-path commits).

## Work, in order
1. Handoff item F (docs\MAP3_HANDOFF_2026-08-31.md section "F. Volumetrics
   reacting to physics objects", ~1 h): physics bodies passing through the
   god-ray volume and the weather corridor should disturb it - shadow shafts
   that follow moving bodies, dust/mist displaced by the truck and thrown
   balls, rain rings around impacts. Use the existing instanced billboard
   and TSL uniform patterns; no new material types.
2. God-ray midpoint, from the orchestrator's review of
   artifacts/corridor-6-volume-godrays-inside.png after wave 2: the blowout
   is gone but the shafts are now faint. Raise the shaft contrast to roughly
   halfway between the wave-1 and wave-2 settings so distinct diagonal beams
   read clearly while columns keep their albedo. Re-capture both god-ray
   views and compare all three generations before claiming it.
3. Keep every corridor at or above its wave-2 HUD fps (163-181 fps at
   1280x720); report any drop.

## Verify before finishing
npx tsc --noEmit -p tsconfig.json -> 0; npx tsx scripts/map3-validate-geometry.mts
-> PASS; re-capture every corridor you touched under artifacts/ with an honest
note per frame.

## Report (final message)
Per item: done/partial/blocked, commit hash, evidence path, honest quality
notes, fps per corridor, anything not verified.
