# Player-feedback contribution contract — 2026-07-22

## Scope

- Third-person loadout silhouettes are reduced without changing first-person weapon geometry or authoritative shot rays.
- Both arms remain attached and visible through every firearm pose; a rigged melee action visibly owns a bounded knife and does not continue gun-grip IK while the knife is active.
- Prone keeps the player above the terrain and uses a full-width capsule that cannot slip through gaps rejected by standing/crouched movement.
- Respawning clears held locomotion, sprint, ADS, trigger, jump, and grounded-transition state before returning the player standing.
- Atomic Acres recycling bins and benches block movement and shots using layout-owned bounds.
- The upper facade panel on each house is solid. The two ground-floor windows remain the intended breakable traversal routes.
- Field Support sits below the tactical map at desktop, short-height, and mobile breakpoints.
- Every accepted firearm hit presents a bounded damage number; headshots use a larger gold `CRIT` treatment.
- The end-of-round banner surfaces kills, deaths, K/D, accuracy, damage dealt, and headshots.
- All local boards use a new storage generation. The global board uses a required season identifier and a D1 migration that discards legacy rows; applying that migration remotely is reserved for central integration.

## Anchored acceptance checks

1. Unit tests cover third-person scales, damage-number classification, round-stat formatting, prone dimensions, the sealed upper panel, prop collider layouts, and leaderboard season validation.
2. Browser evidence covers all seven third-person weapons across stand/crouch/prone, visible rigged knife/arms, prone-death respawn reset, damage numbers, Field Support placement, prop/upper-panel collision, and round stats.
3. `npm run lint`, targeted Vitest suites, `npm test`, and `npm run build` pass on the contribution head.
4. The contribution is committed on its isolated branch. It does not merge, deploy GitHub Pages, or execute the reset migration against remote D1.
