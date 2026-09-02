# Lane Y — HF-412: drop shots the way Black Ops 2 did them

Orchestrator: Claude Code (Fable 5.1). Ledger row HF-412. Owner: "important".

Worktree: create `C:\Users\david\projects\aa-claude-dropshot`:
`cd C:\Users\david\projects\aa-omp-pass84 && git worktree add ../aa-claude-dropshot -b contrib/dave-gaming-pc/claude/hf412-drop-shot 75a4e508`
then `New-Item -ItemType Junction -Path C:\Users\david\projects\aa-claude-dropshot\node_modules -Target C:\Users\david\projects\aa-omp-pass84\node_modules`.
Branch: `contrib/dave-gaming-pc/claude/hf412-drop-shot` (base 75a4e508)

## Owner statement (verbatim, 2026-09-02 ~16:45 BST)
"Also ensure 'drop shots' work like they did back in black ops 2 days, no
weird sliding or diving, just however drop shots worked and what keys you had
to press, important" ... "its where you go prone and shoot i think, and has
an animation too of the body"

## What a drop shot is (verify the specifics against references, then build)
Going prone while firing, without stopping firing: the player presses the
prone input mid-burst, the camera drops to prone eye height over a short,
fixed transition (well under a second in the reference), the weapon stays
raised and aimed and keeps firing throughout, and the character's body plays
a prone-transition animation that other players and bots see. There is NO
slide and NO dive: Black Ops 2 had neither (dolphin dive was Black Ops 1;
sliding came later). Verify with WebSearch/WebFetch: the reference's default
prone key on PC and the console control (hold-crouch to prone), the
transition duration players describe, whether firing is interrupted (it is
not), and any accuracy or movement penalty while transitioning. Record what
you find and what you chose in `docs/DROP_SHOT_2026-09-02.md`.

## What exists (verify)
- Stances stand / crouch / prone exist with Rapier capsules
  (`src/physics.ts`: stand 1.82 m eye 1.70, crouch eye 1.16, prone eye 0.50)
  and an input path in `src/legacy-main.ts` (grep `prone`, `stance`,
  `crouch` in the input and player-update regions; never read the file
  whole). Prone autostep is disabled by design.
- Weapon fire gating lives in the fire path (`tryFire`, `fireBlockTelemetry`,
  the `HF-343` fire gate that consumes `surfaceRetreat`); the viewmodel has a
  prone contact pose (Lane W is reworking the viewmodel geometry in parallel:
  you own the STANCE TRANSITION, the FIRE CONTINUITY and the BODY ANIMATION;
  W owns the viewmodel pose. If you need the viewmodel to do something during
  the drop, write it in your report as a request to Lane W, do not edit
  `src/weapon-presentation.ts`).
- Character rigs carry an animation director with 24 clips (operator rig
  contract 62 joints / 24 clips); check whether a prone-transition clip
  exists; if not, author one procedurally in the animation director (no
  imported assets) and replicate the stance change over the network so
  remote peers and bots show the same body transition.
- Gamepad (Lane E, PASS 84): input actions are remappable and glyphed; add
  the drop-shot input as an action there too.

## Job
1. Reference notes first (above), then measure the current behaviour: how
   long the prone transition takes today, whether firing continues through
   it, what the camera does, what remote peers see (two-client harness
   `scripts/qa/mp-lab/run-host-guest.mjs` from Lane G can stage host+guest
   headless). Save before evidence under `docs/evidence/pass85/hf412/`.
2. Implement: a dedicated fixed-duration prone transition (reference-like
   timing, tuned constant in one place), camera eye height interpolating
   down smoothly, weapon stays raised and firing with no interruption, no
   slide, no dive, optional small accuracy penalty only if the reference had
   one (document either way). Bindings: the reference's default PC key and
   hold-crouch on pad, both remappable; the HUD keybinding rows show it.
3. Body animation: a prone-transition clip on the local third-person shadow
   (if any) and on remote/bot rigs driven by the replicated stance; verify
   with the two-client harness that a guest sees the host drop, not teleport
   to prone.
4. Tests: unit tests for the transition state machine (duration, no fire
   interruption, no slide/dive path reachable), a source-pinned contract that
   the fire path does not gate on the transition, and a headless e2e that
   drops while firing and asserts shots landed throughout the transition.
5. `npx tsc --noEmit`; focused tests; commits per step with explicit paths.

## Boundaries
- You own: the stance transition and its input bindings (`// HF-412:` marks
  in `src/legacy-main.ts`, LF preserved), the animation director's prone
  transition, the stance replication field if one is needed, the new tests.
- Do NOT touch: `src/weapon-presentation.ts` and the viewmodel clip system
  (Lane W), arenas, damage or hit registration, the gamepad module's
  internals beyond registering the action.
- Machine rules: headless only (a guard kills headed browsers), one browser
  (two for the host+guest harness), one build, never kill processes you did
  not start, never the full vitest suite, 3 GB free VRAM before a launch.

## Report
The reference notes and chosen keys/timing; before/after transition timing;
proof firing continued (shot timestamps across the drop); the guest-side
animation evidence; tests; commits; the request list for Lane W. Claim-state
every line.
