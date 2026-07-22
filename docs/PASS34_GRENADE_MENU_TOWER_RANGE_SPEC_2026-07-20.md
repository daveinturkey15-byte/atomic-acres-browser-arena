# Pass 34 — Grenade Power, Map Exit, Tall Rustworks Tower, and Armoured Range Targets

Date: 2026-07-20
Status: released

## Requested outcome

1. Double the hand-grenade maximum damage and gameplay blast radius.
2. Provide an obvious, safe route from any active map back to the map-selecting main menu.
3. Retain Blender-authored source/runtime assets and make the Rustworks central tower materially taller.
4. Give each Gun Range target five times player health; the centre bullseye uses the normal headshot damage path.

## Implementation

### Grenade

- `GRENADE_MAX_DAMAGE`: `115 → 230`.
- `GRENADE_RADIUS`: `8 m → 16 m`.
- Remote explosive hit admission now accepts ordinary grenade claims through `16 m + 1.3 m` tolerance while preserving the `100` remote-player damage cap.
- The gameplay contract and falloff/admission tests encode the new values.

### Return to main menu

- The HUD displays `ESC · MENU` in every active mode.
- Releasing pointer lock opens the existing pause/deployment panel.
- The pause panel exposes `MAIN MENU · CHANGE MAP`.
- Returning closes the network session, clears the current match state, hides the gameplay HUD/viewmodel, restores the menu camera, and re-enables all three map cards.
- The same main-menu action appears beside `REMATCH` after a match ends.

### Rustworks tower and Blender assets

- The procedural, collision-authoritative tower now has `10.8 m` legs, a lower deck at `3.35 m`, an upper deck at `8.15 m`, a control hut at `9.45 m`, a crane boom at `13.4 m`, longer ramps, and railings on both levels.
- The menu camera deliberately frames the tower in the unobstructed right side of the screen; its QA projection is bounded to `0.2 < NDC x < 0.75`.
- Blender source asset: `source-assets/blender/rustworks-central-tower.blend`.
- Deterministic runtime asset: `public/assets/original/models/rustworks-central-tower.glb`.
- Authoring command: `npm run author:rustworks-tower`.
- The Blender detail kit is presentation-only, adds 55 low-poly meshes / 1,128 triangles, carries 56 semantic part tags, and reports an authored runtime height of `13.76 m`.
- Performance mode keeps the lightweight procedural tower. Blender Render loads braces, rails, ladder, pipes, canopy, crane hardware, and shadow detail without changing collision or shot authority.

### Gun Range targets

- Each of the nine score plates has `500 / 500 HP`, exactly five times the player's `100 HP`.
- Ordinary body hits apply normal weapon damage and leave the target standing until health reaches zero.
- The centre bullseye is tagged `head`; shots through it use the existing weapon headshot multiplier and headshot hitmarker path.
- Score is awarded only when a plate is destroyed. Hit count records each damaging impact. Targets respawn after the retained 2.2-second delay at full health.

## Preserved invariants

- Atomic Acres remains five minutes with no kill limit and at most six solo bots.
- Rustworks remains exactly one solo rival.
- Gun Range remains untimed and bot-free.
- The TypeScript arena remains authoritative for collision and shots; Blender assets are non-authoritative presentation.
- Performance mode remains the representative low-spec profile.
- All six weapon families remain centred on the authoritative bullet ray.

## Verification evidence

- TypeScript lint/typecheck: passed.
- Gameplay contract: regenerated and verified.
- Unit/property suite: **310/310 passed** across **64 files**.
- Focused Pass 34 Chromium contracts: **4/4 passed**:
  - uncapped five-minute Atomic rules;
  - Rustworks map activation, exactly one bot, tower framing, and pause-to-main-menu flow;
  - real-shot 500 HP range damage, destruction, score, and respawn;
  - Blender-authored Rustworks tower runtime load and semantic telemetry.
- Grenade detonation hitch browser gate: **1/1 passed**.
- Map runtime checks: **3/3 passed**, no JavaScript errors or WebGL context loss.
- Performance telemetry:
  - Atomic Acres: **48 calls / 107,340 triangles**;
  - Rustworks 1V1: **46 calls / 2,230 triangles**;
  - Gun Range: **50 calls / 2,296 triangles**.
- Six weapons × three viewports: **18/18** authoritative centre-ray combinations passed with zero angular and HUD-centre error.
- Production dependency audit: **0 vulnerabilities**.
- Release-tree gate: **56 files**, zero rejected candidate or oversized files.
- Rustworks GLB reproducibility: repeated authoring retained SHA-256 `5d24f722098aa40b7eec6fb5349a3934c0de4ee33430b94bba9c351b27cfdcbe`; the authoring script disables `.blend1` backup litter.
- Direct local visual inspection passed for Performance Rustworks, Blender Rustworks, Gun Range, and the pause/main-menu UI.
- A second isolated validation pass independently reran lint, the 310-test suite, production build, release-tree gate, 18-case ray matrix, and real Gun Range shots. The centre shot dealt `47` carbine headshot damage (`500 → 453`); an offset body shot dealt `31` (`500 → 469`). No release blocker surfaced.
- Immutable HTTPS review inspection passed for Performance Rustworks, Blender Rustworks, Gun Range, and the paused main-menu flow. Browser telemetry reported zero WebGL context loss and no JavaScript errors.

## Release gate

The final bytes were built once from source commit `14ae108`, published under a new immutable Pass 34 review path, inspected over HTTPS, and promoted to production without rebuilding. The review subtree object remained unchanged across promotion.

## Release identities

- Source commit: `14ae10824f613a9086081a24c789ab7479caa8c3`.
- Immutable review: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass34-grenade-menu-tower-range-14ae108/>.
- Review Pages commit: `908ef1e8b7b37c5dfef35efa773d93e2e67193bf` (`built`).
- Production: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/>.
- Production Pages commit: `0c8113108fd937e872797e7f3c080ea56b74b504` (`built`).
- Immutable review subtree: `5aef18bac9f9a5601eaa029392ccc5e331a592de` before and after promotion.
- Release tree: **56 files / 20,445,465 bytes**; deterministic tree SHA-256 `f0b2b86aac73560b36200af95db15f16bcef51f13712797d0a78910f0b11e602`.
- Live verification fetched all 56 files from review and production: **0 mismatches**, with both surfaces totaling **20,445,465 bytes**.
