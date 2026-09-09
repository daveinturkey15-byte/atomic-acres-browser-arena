# Lane E — Gamepad support + aim assist for pad and touch (pass 84)

Orchestrator: Claude Code (Fable 5.1), takeover record
`docs/PASS84_TAKEOVER_CLAUDE_2026-09-02.md`.

Worktree: `C:\Users\david\projects\aa-claude-gamepad`
Branch: `contrib/dave-gaming-pc/claude/gamepad-aim-assist` (base ac0bc5f2)

## Owner intent
Asked 2026-08-31 ("not a massive prio but i want it", wanted within a day or
two), re-confirmed 2026-09-01 23:36 as part of "work on every single thing
you mentioned" for PASS 84. Dave will test with SEVERAL different gamepads
over Bluetooth, on both PC and mobile. The game's purpose is friends sharing
lobbies, so a touch player, a pad player and a mouse player will be in the
same match — aim assist is a FAIRNESS requirement: touch gets the strongest
assist, pad sits between touch and mouse, mouse gets none.

## Starting point (verified 2026-09-02)
`src/legacy-main.ts` has ~72 gamepad references: `gamepadLookRate`, a radial
deadzone, and a button map exist. There is no hot-plug handling, no
per-model mapping, no remap UI, no HUD glyphs, no rumble, no
no-pointer-lock look path, and no aim assist for any input. Persistence
pattern to reuse: `MOBILE_CONTROLS_STORAGE_KEY` in
`src/mobile-touch-controls.ts`. Read the existing code first; extend, do not
fork a second input system.

## Definition of done
1. Poll-based input every frame (the Gamepad API has no axis events) plus
   `gamepadconnected` / `gamepaddisconnected` hot-plug; a pad that connects
   mid-match works without a reload; disconnect falls back cleanly.
2. Multiple pad models: detect by `gamepad.id`/`mapping`; ship a `standard`
   mapping plus a fallback table for common Bluetooth pads that report
   non-standard layouts (Xbox, DualShock/DualSense, Switch Pro, generic).
   Unknown pads must still work with the standard mapping and be remappable.
3. Deadzones and response curves per stick, configurable; sensible defaults.
4. Button remapping the player can change in the settings UI, persisted
   with the existing storage pattern, with a reset-to-default.
5. HUD glyph switching: keyboard/mouse vs pad, and Xbox vs PlayStation
   faces based on the detected pad. Every prompt the HUD shows must match
   the pad in the player's hands.
6. Rumble via `gamepad.vibrationActuator` on fire, hit, damage taken — with
   an off switch.
7. NO pointer lock required for pad look: pad look must work without
   clicking to capture the mouse (today the game gains look control through
   pointer lock — find that path and add the pad route beside it).
8. Mobile: a connected pad suppresses the touch overlay in
   `src/mobile-touch-controls.ts` instead of fighting it; disconnect
   restores it.
9. Aim assist, tiered by input: TOUCH strongest, PAD medium, MOUSE none.
   Components: target-proximity slowdown (reduce look rate when the reticle
   is near an enemy), light magnetism/friction while strafing, and a small
   bullet-magnet cone for touch only if the existing hit model allows it
   without changing host-authoritative hit registration. Assist is a client
   look-rate modifier; it must not touch damage, spread, or netcode. Bots
   and remote players both count as targets. Document the exact curves.
10. Tests: unit tests for mapping tables, deadzone/curve math, assist math
    (deterministic), hot-plug state machine, glyph selection. One headless
    e2e that injects a fake gamepad through `navigator.getGamepads` (Playwright
    `addInitScript`) and proves: pad connects, look moves without pointer
    lock, fire happens, assist slows the look rate near a staged target,
    touch overlay hides on mobile emulation. Real hardware verification is
    the owner's; say so in the report.

## Boundaries (hard)
- You own: new input/gamepad modules (create `src/input/gamepad/*` or extend
  the existing input module — follow what the codebase already does),
  `src/mobile-touch-controls.ts`, HUD glyph/prompt code, settings UI for
  controls, the input regions of `src/legacy-main.ts` marked `// GAMEPAD:`.
- Do NOT edit: weapon presentation/viewmodel clip, arenas, spawn logic,
  thermal, netcode transport, `baselines/`, hit registration. Aim assist
  changes look-rate only.
- `src/legacy-main.ts` is LF; preserve it. Do not grow it with the whole
  feature — new logic goes in modules, legacy-main gets the wiring.
- Repo contract: original UI only; no imported glyph fonts/images — glyphs
  are procedural (SVG/CSS) like the rest of the HUD.

## Machine rules
Headless only, `--mute-audio`, never a visible window, port 41945 for any
preview server. One browser at a time, one build at a time. Never kill a
process you did not start. `npx tsc --noEmit` and focused vitest for what
you touched; never the full suite. Commit to your branch with explicit
paths, one commit per landed item.

## Report (final message = raw data for the orchestrator)
Feature-by-feature done/partial/blocked with evidence paths, the assist
curves, test names, commits, what only the owner can verify with real
hardware, and anything not verified. Claim-state every line:
VERIFIED / CLAIMED / OPEN.
