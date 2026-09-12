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
9. **Eye-clearance stage 3 ignores QA_BASE_URL** (`scripts/qa/verify-eye-clearance-runtime.mjs:15`
   hardcodes 127.0.0.1:41975): `npm run qa:eye-clearance:runtime` cannot work
   through `run-with-preview-server.mjs`; give it the same fix stage 2 got on
   2026-08-31.
10. **stage-release-topology deletes dist/index.html when the pass dist is
    missing** (throws "candidate dist is incomplete" AFTER moving files), which
    silently 404s the preview until a rebuild; make it validate before it moves.
11. **pass77 menu-preview provenance pins the SHARED generator digest per
    family** (red on the base line since c25f5e32): pin the generator once in a
    shared record or pin only the byte-affecting parts; never rewrite a digest.
12. **Lane J's withheld nacelle patch** (skyline-terminal nacelle collider transposed
    against its visual: authority x1.9/z4.1 vs visual x4.1/z1.9; patch in
    `C:\Users\david\projects\aa-claude-eyeclear\artifacts\lane-report.md` section
    6) - land it with the parity audit and an eye-clearance re-measure.
13. **Lane N's change-impact patch** (two lines in scripts/release/change-impact.mjs +
    scripts/qa/pass84-gamepad-wiring-contract.mjs, in
    `C:\Users\david\projects\aa-claude-corpus\artifacts\lane-report.md`) so the
    gamepad spec is executed by CI.
14. **HF-413 left support sleeve** in prone-against-wall poses (2 honest reds in the
    arms visual gate): exempt the arm chains from the contact-fold scale, or add a
    fourth reach arc toward the eye with a near-plane guard; measured by
    `npm run qa:pass65:first-person-arms-visual` headless.
