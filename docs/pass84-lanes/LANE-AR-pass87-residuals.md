# Lane AR — PASS 87 residuals: the small owner-visible defects nobody owns

Orchestrator: Claude Code (Fable 5.1). Launch after the PASS 86 cut (22:20 BST).
Worktree `C:\Users\david\projects\aa-claude-residuals` off the post-cut
integration head, branch `contrib/dave-gaming-pc/claude/pass87-residuals`.

Each item is its own commit with before/after evidence under
`docs/evidence/pass87/residuals/`; skeptic scores them individually.

1. **HUD/menu overflow with 8+ arena cards** (found by Lane Y): the deployment
   shell overflows horizontally (menuOverflowX 250 at 2560x1440, 312 at
   1600x900); `tests/e2e/pass64-hud-menu.spec.ts` has been 13 failed / 8 passed
   since PASS 84. Make the card row wrap or scroll inside its container at every
   review viewport (roster-derived: it must still hold when Nuke Town Rebuild
   and Raid Rebuild add cards), pin the spec to installed Chrome
   (PASS73_NATIVE_WEBGPU=1) so a boot failure cannot masquerade as a layout
   regression, and get it green headless.
2. **Minimap redraw cadence** (Lane T's withheld patch, orchestrator-approved
   at 30 Hz): MINIMAP_RENDER_HZ 60 -> 30 with a test that the minimap still
   reflects a moved player within 2 frames at 30 Hz; measure main-thread ms/frame
   before/after with Lane T's instrument on a quiet machine.
3. **Bots have no stance** (Lane Y): give BotPlayer a stance field driven by the
   bot AI (crouch behind cover when taking fire, prone on low health) so bots
   play the same body transitions players do; replicated like a player's.
4. **legacy-main line-ceiling gate** (Lane N): make it a one-direction ratchet
   (growth needs a CEILING_HISTORY entry; removal is always allowed) - the
   two-direction version fails every refactor that removes lines.
5. **Overdrive core claimed through the roof slab** (Lane U, shared with the
   shipped Nuke Town): pickup requires a grounded state or a line-of-sight test
   from the eye to the core, not a scalar height window; test on both arenas.
6. **Review cameras hardcode near 0.08** (`src/rendering/arenas/shared.ts:49`):
   derive from FIRST_PERSON_CAMERA_NEAR_METERS so the visual-regression
   instrument sees a near-plane regression.
7. **`?renderer=webgl2` copy in src/main.ts** contradicts the retired fallback
   (Lane N): remove the stale instruction; make the no-adapter message honest.
8. **pass65 operator visual gate** red on the canonical PBR operator since
   2026-07-27 (Lane N): run it headless, report the assertion, fix if bounded,
   else ledger it with the frame.

Machine rules as every lane. Never weaken a threshold; each change measured.
