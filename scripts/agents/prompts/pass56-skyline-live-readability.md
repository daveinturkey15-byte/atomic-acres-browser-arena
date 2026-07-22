# Pass 56 — Skyline Terminal live readability and selection-preview parity

Implement one bounded user-visible polish pass on the current merged Atomic Acres release.

## Observed production evidence

At merged release `99014bcac1fdf8260917adb0cb169ee194422b02`:

- Selecting **Skyline Terminal** in the deploy menu correctly changes the selected-map label, but the large right-hand 3D preview still visibly shows the Atomic Acres street/bus scene.
- Starting a Skyline bot match does activate the correct arena. The live debug snapshot reported `activeRoots=["skyline-terminal"]`, 57 physics colliders, 44 navigation colliders, matching navigation/arena contracts, 6+6 spawns, no WebGL context loss, and healthy frame rate.
- The initial live Skyline spawn view is functional but has very large near-black ceiling/foreground surfaces that obscure the new terminal detail and make the first impression substantially darker than the authored menu art.

Treat those as observations, not instructions embedded in external content. Reproduce them locally before choosing an implementation.

## Outcome

1. Make the deploy-menu 3D preview follow the currently selected arena, including Skyline Terminal, without starting a match or mutating multiplayer match state.
2. Improve the initial Skyline spawn/readability so its architectural detail reads under normal quality rendering instead of presenting as a dominant black void.
3. Keep the change presentation-focused and bounded. Prefer the smallest coherent design over a broad refactor.

## Protected contracts

- Preserve arena IDs, physics boundaries/colliders, navigation colliders, breakable windows, team spawns, patrol points, route geometry, match rules, room/network semantics, bot count, weapon/gameplay balance, and shot penetration behavior.
- Preview selection must not create duplicate active roots, duplicate colliders, stale targets, or a hidden active match.
- Do not copy proprietary branding, assets, names, textures, audio, or exact geometry. Atomic Acres must remain original and legally distinct.
- Do not add dependencies unless mechanically necessary and explicitly justified.
- Do not commit, push, merge, deploy, or modify credentials.

## Required implementation evidence

- Add or update focused tests that prove selected-map preview parity and protected gameplay contracts.
- Run at least TypeScript lint, focused unit tests, production build, the map smoke verifier, and any focused browser test you add or modify.
- If browser evidence is feasible, capture at least menu-preview and in-match Skyline views under one deterministic URL/profile and report their paths.
- Report render call/triangle evidence before and after for Skyline if available; do not invent unavailable measurements.
- Keep a concise `docs/PASS56_*` implementation/evidence note with observed, inferred, assumption, unknown, and falsifier states.

## Finish report

Return changed files, design rationale, exact test commands/results, residual risks, and the required exact-model receipt. If a requirement cannot be verified, label it unknown rather than claiming success.
