# Lane AT — the third-person operator finally reloads, crouches, goes prone, aims and knifes (block 2, 2026-09-03)

Orchestrator: Claude Code (Fable 5.1). Owner: "animation improvements for our skins
and bots" (HF-422) and "impress me with ... animation". Lane AH measured the gap:
the shipped 62-joint third-person operator rig (`pass65-third-person-operator-lod0.glb`,
24 clips) has NO reload, crouch, prone, ADS or knife clip, while the first-person
arms rig has all five; four Kimodo clips PASS 80 measured as shippable (incl. a
crouched reload at 3.4/2.6 cm foot slide, `docs/PASS80_SPRINT_LOG_2026-08-26.md`
Sprint 2) never shipped. Lane AO's trial says do NOT build MotionBricks; land the
analysis tools only. Base: the PASS 89 integration head. Worktree
`C:\Users\david\projects\aa-claude-anim2`, branch
`contrib/dave-gaming-pc/claude/operator-animation-clips`.

## Jobs
1. Find the four measured Kimodo clips and their provenance (PASS 80 artifacts,
   the Komodo route in the vault skill `game-animation-asset-pipeline`); if the
   files exist with recorded licence/provenance, retarget them onto the operator
   rig through the sanctioned Blender pipeline (`scripts/blender/`), keeping the
   glTF corpus's authored node transforms (the handedness gate must stay 0).
   If a clip is missing, author it as a code-driven pose blend over the existing
   rig (the drop-shot lane's `applyStancePose` pattern) rather than importing
   anything unlicensed.
2. Wire: reload, crouch idle/walk, prone idle/crawl, ADS hold, knife swing into
   `src/operator-model.ts` and the replicated stance/action state so peers AND
   bots (they have a stance since PASS 87) play them; hysteresis so bots do not
   flicker; the existing foot-slide gate (Lane AO's contiguous-stance instrument)
   must pass for every new clip.
3. Measure with headless captures (bot skirmish on Map 3 / Nuke Town Rebuild):
   a frame strip per clip from a fixed review camera, the foot-slide numbers,
   frame-time delta (skinning cost) at 1440p, tripwire 0. Open every strip.
4. Gates: tsc; focused vitest (operator-model, hosted-bots, protocol, checkpoint,
   arms handedness); boot smoke of the arenas captured; full vitest at the end.
Machine rules as every lane; provenance and licence recorded for any imported
clip; nothing copied from a reference. Report with claim-states.
