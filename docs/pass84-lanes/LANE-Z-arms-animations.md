# Lane Z — HF-413: first-person arms and animations correct — nothing inverted, mirrored or strange (guns, reload, knife)

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-413.

Worktree: create `C:\Users\david\projects\aa-claude-arms`:
`cd C:\Users\david\projects\aa-omp-pass84 && git worktree add ../aa-claude-arms -b contrib/dave-gaming-pc/claude/hf413-arms-animations 75a4e508`
then `New-Item -ItemType Junction -Path C:\Users\david\projects\aa-claude-arms\node_modules -Target C:\Users\david\projects\aa-omp-pass84\node_modules`.
Branch: `contrib/dave-gaming-pc/claude/hf413-arms-animations` (base 75a4e508)

## Owner statement (verbatim, 2026-09-02 ~16:55 BST)
"also please ensure the arms and animations for guns, reloading, knife are
fixed and not inverted or strange etc, hopefully an easy fix."

## Known history (do not repeat it)
The first-person arms took 13 GLB regenerations and 11 .blend rewrites in
August for defects that were MIRRORING, near-plane penetration and material
response, not asset quality. Mirroring/inversion is the recurring class:
a negative scale or a handedness flip somewhere in the chain (generator
export axes, glTF node scale, rig mirroring, a clip authored for the other
hand, or the viewmodel FOV/aspect scale applying a negative component)
makes the arms, the weapon, the reload hands or the knife look inverted.
Lane W is reworking the viewmodel PLACEMENT and FOV in parallel in
`src/weapon-presentation.ts`; you own the ARMS RIG, the ANIMATION CLIPS
and their playback; coordinate by keeping your edits to those functions and
files and by putting any placement change in your report for Lane W.

## Facts to verify
- Arms: `src/first-person-arms*` (grep), the operator rig contract (62 joints
  / 24 clips), `scripts/blender/` generators for arms and weapons,
  `src/weapon-presentation.ts` (solveRiggedArms, the reload and melee state
  machines, `presentation.melee()`), `src/weapon-presentation-anatomy.test.ts`
  (pins pose numbers), the Pass 65 first-person-arms visual verifier
  (`npm run qa:pass65:first-person-arms-visual`) and the weapon GLB
  validators (`qa:pass65:weapon-gltf`). Lane B (PASS 84) re-exported the
  weapon family; check whether any weapon's rail fix introduced a mirrored
  socket.
- Instruments: headless captures per weapon at hip, ADS, during reload
  (several frames), during the knife swing (several frames), left/right
  strafe. Look at every frame yourself; "inverted" is visual.

## Job
1. Capture the CURRENT state: per weapon, a 6-frame strip of reload and a
   6-frame strip of melee, plus hip and ADS stills, headless real Chrome.
   Save under `docs/evidence/pass85/hf413/before/` (PNGs halved if over
   600 KB). Write down, per weapon, what is wrong in plain words: mirrored
   hand, magazine inserted from the wrong side, knife swing from the wrong
   hand, elbows bent backwards, clip playing reversed, fingers through the
   grip, arms detached from the weapon, wrong handedness after ADS.
2. Find the mechanism for each defect class (one root cause usually covers
   many weapons): scale sign on a node, a mirrored clip, a handedness flag,
   a socket on the wrong side. Prove it with a targeted test (node scale
   determinant positive on every arms/weapon node; clip keyframe direction;
   socket side).
3. Fix at the source (generator or rig code), never by flipping a texture
   or hiding a hand. Re-export through the pipeline if the fix is in a
   generator (provenance gates stay green).
4. AFTER strips for every weapon; the pass65 arms visual verifier;
   `npx tsc --noEmit`; focused tests re-pinned with the reason where a pose
   number legitimately changes; commits per fix with explicit paths.

## Boundaries
- You own: arms rig code and clips, reload and melee animation logic, the
  arms and weapon generators for handedness/scale fixes, the new tests.
- Do NOT touch: viewmodel placement/FOV/clip planes (Lane W), arenas,
  netcode, damage.
- Machine rules: headless only (a guard kills headed browsers), one browser,
  one build, never kill processes you did not start, never the full vitest
  suite, 3 GB free VRAM before a launch (the owner's ComfyUI may hold the
  GPU; wait, do not proceed).

## Report
Per weapon: what was wrong, the mechanism, the fix, before/after strips;
tests; verifier result; commits; requests for Lane W. Claim-state every line.
