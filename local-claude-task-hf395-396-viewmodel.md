# Task: HF-395 + HF-396 — viewmodel clip residue and rail/optic alignment

You are Claude Fable (orchestrator-delegated) in C:\Users\david\projects\aa-omp-pass84,
branch contrib/dave-gaming-pc/omp/pass84-overnight. READ
docs/PASS84_OWNER_FEEDBACK_2026-09-02.md rows HF-395 and HF-396 first.

## HF-395 — clip residue (walls AND floor)
The Pass 81 fix (src/systems/viewmodel-surface-clip.ts) cut 55 -> 12 penetrating
poses; the owner still sees wall AND floor clipping "like crazy".
1. Re-run scripts/qa/measure-viewmodel-penetration-cdp.mjs on the current build
   (build first: npm run build). Record per-pose penetration now.
2. Diagnose the remaining poses (handoff says Bus/Van gap, Garage door, plus
   floor cases). Check whether the Pass 81 ground plane survives all stances and
   whether surface planes cover the named spots.
3. Fix minimally in the clip system (planes/bounds), NOT by enlarging retreat:
   the owner separately asked for pullback to be HALVED (already implemented as
   VIEWMODEL_WALL_PULLBACK_SCALE = 0.5 in weapon-presentation.ts) - so the clip
   planes must carry more of the anti-clip work. Add the fixed poses to the
   ratchet if the instrument supports it.

## HF-396 — rail detached from barrel and scope on the flagged guns
Scoped/railed rifles show the rail piece detached from barrel and scope.
1. Run scripts/dump-glb-nodes.js on the flagged weapon GLBs (m14-ebr model set;
   also check the DMR/carbine optic family) to list rail/scope/socket node names.
2. Find the presentation mount code (search optic/rail socket usage in
   weapon-presentation.ts / viewmodel modules) and fix the alignment so rail
   seats on the barrel datum at hip AND ADS.
3. Add a per-weapon alignment contract test (deterministic node positions), or
   extend an existing one.

## File ownership (hard)
- You own: src/systems/viewmodel-surface-clip.ts, src/weapon-presentation.ts,
  viewmodel modules, the penetration instrument, weapon GLB alignment code.
- Do NOT edit: src/rendering/arenas/**, lobby/netcode, baselines/, thermal
  files (other agents own those). One small `// HF-395:`-marked legacy-main edit
  is allowed only inside the viewmodel clip region.
- Do not git commit. Headless browsers only. Never kill Dave's processes.

## Report back
Per-pose penetration before/after table, the floor-plane verdict, the rail
alignment fix per weapon with node names, and new/updated test names.
