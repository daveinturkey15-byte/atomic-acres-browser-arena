# Pass 36 — Quality Graphics, Bot Arsenal, Gun Range Rules, Atmosphere, Windows, Drops, and Leaderboard

**Date:** 2026-07-20  
**Status:** released to production from immutable reviewed bytes

## Overview

Pass 36 addresses Dave's reported gameplay defects without changing weapon damage, authoritative centre-ray alignment, map population rules, Pass 35 explosion pooling, or Tri-Pass targeting behavior.

## Requirements

### R1 — Unlimited Gun Range ammunition

- In `gun-range`, every weapon retains its normal magazine and reload cadence.
- Reloads draw from virtual unlimited supply, so reserve can never be exhausted and the HUD shows `∞`.
- `Infinity` is never stored in player or protocol state.
- Other arenas retain their existing finite magazine, reserve, reload, pickup, and automatic-reload rules.

### R2 — Monotonically increasing Gun Range score

- Every destroyed Gun Range plate adds its displayed value (`100`, `200`, or `300`), including every later destruction after respawn.
- Score and damaging-hit count are monotonic for the active range session and have no cap or match-end condition.
- A target retains its `500 HP` cumulative-damage/respawn contract; respawning it must not reset the session score.
- Starting a genuinely new range session may reset the score to zero.

### R3 — Firing-line movement authority

- The yellow firing line is a real player-movement boundary across the usable lane width.
- Players spawn and remain on the booth side and cannot walk, sprint, crouch, prone, or jump into the live target lanes.
- The barrier is movement-only: bullets, tracers, target interaction, and line of sight pass through normally.
- The collision is represented in authoritative character physics rather than UI-only clamping.

### R4 — Visible bounded atmosphere on every arena

- Atomic Acres must have clearly visible but restrained distance fog plus pooled mist/smoke/dust on normal hardware Performance and Quality Graphics profiles.
- Rustworks and Gun Range must receive map-specific, lighter atmosphere instead of hiding the atmosphere root entirely.
- Compatibility/software bypass behavior remains truthful unless `mist=on` is explicitly used for QA.
- Atmosphere remains presentation-only, allocation-free per frame, texture-free, and within bounded submissions/triangles.
- Fog/mist must not hide targets, close combat routes, or the authoritative reticle.

### R5 — Every authored house window breaks reliably

- All six authored Atomic Acres panes must break from a valid playable-side rifle shot.
- All six must also admit close melee and unobstructed grenade breaks under their existing authority/range rules.
- Breaking a pane hides its exact visual pane, removes it from subsequent shot raycasts, produces glass feedback once, and resets on match cleanup.
- Staging/verification must select a playable in-bounds side of each pane; out-of-bounds test poses are invalid evidence.
- Remote break admission remains bounded and cannot be forged through solid cover.

### R6 — Dropped guns and ammunition despawn after 30 seconds

- A death drop's weapon and ammo payload share one authoritative lifetime of exactly `30_000 ms` from creation.
- At `expiresAt`, both payloads become unavailable and the pooled presentation is released in the normal update loop.
- Consuming one payload does not extend the other payload's lifetime.
- Existing pool capacity and hitch-free release behavior remain unchanged.

### R7 — One leaderboard row per player name

- Local, peer, completed-match, immediate-streak, and fetched-global records are merged by collision-safe normalized player-name identity, not only by record ID.
- Only the best record according to the existing comparator survives for each player name.
- Existing duplicated local storage is deduplicated and rewritten on load/render persistence.
- Distinct accepted names such as `A B`, `A_B`, and `A-B` remain distinct.
- The Cloudflare leaderboard's existing unique `name_key` remains authoritative; no Worker migration is needed unless live inspection disproves that contract.

### R8 — Bounded bot grenades

- Solo bots may throw timed, bouncing grenades only after reaction, with line of sight and inside a bounded range.
- Bot grenade damage applies the existing `BOT_DAMAGE_MULTIPLIER` exactly once, matching reduced bot gunfire.
- At most one bot-owned grenade may be active globally, and a bot cannot own a second active grenade; cooldown admission prevents stacked grenade spam.
- Bot grenades do not damage allied bots and never inherit player Quad Damage.
- Grenade pooling, prewarming, cover protection, window breaking, and synchronous hitch telemetry remain intact.

### R9 — Random mixed bot weapons

- Each match creates a seeded-random sequence from the four primary weapons: carbine, SMG, scattergun, and sniper.
- Concurrent bots receive different weapons until the four-weapon pool is exhausted; later cycles are reshuffled without adjacent duplicates.
- A bot's model, muzzle tracer, audio, cadence, damage curve, death drop, and debug state all use the same assigned weapon.
- Assignments remain stable over that bot's respawns and are reproducible from the runtime seed.

### R10 — Quality Graphics naming and coplanar-surface safety

- The user-facing `Blender Render` option is renamed `Quality Graphics`; internal/profile value `blender` remains accepted for backward-compatible settings and URLs.
- When Quality Graphics is active on Atomic Acres, the authored Quality GLB is the only visible primary arena surface root.
- The procedural arena remains loaded as hidden gameplay authority and fallback, but must never be made visible alongside the coplanar Quality root.
- Switching maps and returning to Atomic Acres must preserve the single-visible-root invariant.

## Acceptance criteria

- **C1:** deterministic/browser tests prove repeated empty-magazine reloads work with zero stored reserve only in Gun Range and reserve HUD is `∞`.
- **C2:** repeated target destructions and respawns strictly increase score with no cap/end state.
- **C3:** browser movement attempts cannot cross the firing line, including sprint and jump, while centre-ray target hits still work.
- **C4:** all three maps expose enabled, map-specific atmosphere telemetry on forced software QA and pass matched visual inspection; normal software bypass remains truthful.
- **C5:** a browser matrix breaks all six windows by playable-side shot and deterministic coverage protects melee/grenade/reset/remote rules.
- **C6:** death-drop availability is true at `29_999 ms` and false at `30_000 ms`; presentation pool active count returns to zero.
- **C7:** duplicate Dave/QA rows with different IDs collapse to one best row in unit and browser storage/fetch flows.
- **C8:** deterministic/browser tests prove one active bot grenade maximum, cooldown admission, cover, and exactly one `0.25×` damage scaling step.
- **C9:** seeded assignment tests prove pool diversity/reproducibility, while browser telemetry proves active bots use the assigned weapons.
- **C10:** lint, TypeScript/build, full unit/property suite, gameplay/release contracts, map rules, 18-case centre-ray matrix, retained Pass 34/35 regressions, page-error/WebGL checks, and dependency audit pass.
- **C11:** Performance telemetry remains within measured release ceilings and atmosphere adds no dynamic lights or per-frame allocations.
- **C12:** Quality Graphics browser telemetry proves exactly one primary Atomic Acres root visible through initial load and map switching; visual inspection shows no broad surface shimmer.
- **C13:** final `dist` is frozen once, published to a unique immutable review path, file-compared over HTTPS, visually inspected, and promoted byte-for-byte without rebuilding.

## Local verification

- TypeScript lint and final production build passed.
- Full deterministic/unit/property suite: **335/335**.
- Pass 36 focused Chromium: **7/7**.
- Retained Pass 35 explosion/Tri-Pass Chromium: **3/3**.
- Explosive support regressions: **7/7**.
- Retained Pass 34 Chromium: **4/4**.
- Arena map matrix: **3/3**, with zero reported JavaScript errors or context loss.
- Centre-ray matrix: **18/18**, with zero angular or HUD-pixel error.
- Gameplay contract, release-tree, Worker/client leaderboard checks, and dependency audit passed; production dependency vulnerabilities: **0**.
- Performance telemetry remained Atomic Acres `48` calls / `107,340` triangles, Rustworks `46` / `2,230`, and Gun Range `50` / `2,296`.
- Independent review found four issues; all were addressed before the final gates: fractional bot-grenade damage admission, correlated remote explosive window claims, peer-owned leaderboard sync filtering, and map-specific reduced dust pools.
- Quality Graphics telemetry reported authored GLB `ready`, procedural root hidden, Quality root visible, and `overlappingPrimaryArenaRoots=false`; representative grass/prop and road/building views showed no broad shimmer, gaps, floating surfaces, or light leaks.

## Out of scope

- Weapon damage, recoil, spread, projectile authority, or reticle/ray alignment changes.
- New maps, targets, weapons, bots, or field-support systems.
- A permanent radar or changes to Pass 35 Tri-Pass hostile markers.
- Replacing the global leaderboard Worker or deleting records directly from its D1 database unless a server-side duplicate is independently observed.

## Release policy

Production remained on Pass 35 until all Pass 36 acceptance criteria passed. Source was committed/pushed before the single release build. Production received the exact immutable-reviewed payload bytes with a complete manifest and zero mismatches.

## Release record

- Source implementation commit: `5d3cc58b00303b6f7c1a0121ceccaa0a02340d96`.
- Immutable review Pages commit: `9eba3516b086eb5ff458082955919cb42a311648`.
- Production Pages commit: `5b81e22d8d6b8e758de0491d1f3fbd921ed385b0`.
- Immutable review: `review/pass36-quality-graphics-bot-arsenal-5d3cc58/`.
- Frozen artifact: `/root/jigglyclaw/releases/atomic-acres-pass36-5d3cc58`.
- Identity: **56 files**, **20,462,845 bytes**, tree SHA-256 `c10591a848946e006abac44fef89321689d6ebd7ac7c965c78f0a6d6d50546ca`.
- Frozen/review/production comparison: **56/56 files checked, zero mismatches** at both HTTPS origins.
- Live verification: Pass 36 label, `QUALITY GRAPHICS` option, no overlapping primary roots, deterministic mixed bot weapons, one admitted `0.25×` bot grenade with the second admission rejected, zero JavaScript errors, and zero WebGL context losses.
