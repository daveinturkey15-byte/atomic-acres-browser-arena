# Atomic Acres Build 59 — overnight implementation specification

Date received: 2026-07-22
Owner: Dave Hatton
Principal implementation model and lead: Hermes on `openai-codex/gpt-5.6-sol` with High reasoning
Integrator/release owner: Hermes Desktop on dave-gaming-pc, using GPT-5.6 Sol High for architecture, implementation direction, reconciliation, final review, and release decisions
Supplementary sidecar: exact `gemini-3.6-flash-high` through direct AGY CLI for bounded simpler handoffs such as inspection, narrow critiques, test review, and asset review; fallback forbidden for Gemini-attributed work
Independent verification: GPT-5.6 Sol High reviews every retained sidecar contribution, backed by deterministic tests, browser evidence, GitHub checks, production receipt, and live verification

## Model allocation contract

- GPT-5.6 Sol High is the main workhorse. It owns the specification, architecture, implementation, code review, test interpretation, integration, and release.
- Hermes-native delegated agents inherit GPT-5.6 Sol High and may handle substantial implementation work in isolated scopes.
- Gemini 3.6 Flash High is supplementary compute only. Give it bounded, simpler, independently checkable tasks; it must not become the principal implementation owner or make merge/release decisions.
- Invoke Gemini through the direct exact-model AGY path with structural no-fallback behavior and a receipt. Never represent DeepSeek, Qwen, or another fallback as Gemini output.
- One implementation owner writes a worktree at a time. Sidecar suggestions or edits are non-authoritative until GPT-5.6 Sol High reviews the diff and mechanical checks pass.

## Release intent

- Do not begin implementation until PR #17 (`Add Pass 58 and Pass 57 launch chooser`) is fully green, merged, promoted through `release-production`, and live-verified.
- Preserve the exact currently pinned Pass 57 Pages commit as **RECENT STABLE**.
- Pass 58 remains repository/release history but must no longer be the selectable **NEW BUILD** after this work ships.
- Promote the verified result as **PASS 59 / NEW BUILD**.
- Never develop on or push directly to `main` or `gh-pages`.
- Create a fresh isolated contribution worktree from the exact verified `origin/main` live baseline.
- One writer owns the implementation worktree at a time. Subagents/critics must not edit it concurrently.
- Push only the contribution branch, open an evidenced PR, require all protected checks, integrate separately, then use the serialized production workflow with the exact green `main` SHA and `PASS 59`.

## Product and legal boundary

Atomic Acres must remain an original retro-future browser arena FPS. Broad fast close-quarters arena design principles are allowed; do not copy protected Call of Duty/Black Ops names, branding, code, audio, textures, models, assets, exact map geometry, or proprietary UI. Do not add third-party assets without provenance and license evidence.

## Workstream A — multiplayer authority, replication, fairness, and hosted bots

### A1. Quad-damage authority and replication

Observed report: in multiplayer only the host sees and can collect quad damage.

Required:
- Every eligible peer must see the same authoritative pickup lifecycle and availability.
- A guest must be able to collect quad damage under the same rules as the host.
- Collection, expiry, respawn, damage multiplier, VFX, HUD, and event logs must agree across peers.
- Collection must be single-award under races; no duplicate or divergent ownership.
- Host remains authoritative over canonical pickup state, but presentation and eligibility are correctly replicated.

### A2. Grenade and killstreak presentation replication

Observed report: each player sees/hears their own grenades and killstreaks, while enemies do not see/hear those effects even though they take damage.

Required:
- Replicate spawn, trajectory/placement, activation, destruction/expiry, audio, VFX, and ownership metadata for grenades and killstreak effects to all relevant peers.
- Preserve authoritative damage and anti-duplication rules.
- Remote presentation must not cause a second local damage application.
- Respect visibility/occlusion/range rules where already intended, but never hide an active enemy threat merely because it was remotely owned.
- Add host/guest browser tests proving both peers observe the event and converge on resulting health/death state.

### A3. Host/guest damage correctness

Observed report: damage done/taken is inconsistent between host and guests and may be interacting incorrectly with bot-skirmish rules.

Required:
- Audit every player-vs-player and bot-vs-player damage path, admission rule, deduplication key, ownership field, timestamp, weapon modifier, armor/quad modifier, and local prediction path.
- Separate PvP, hosted-bot, and solo-skirmish rules explicitly; do not infer a human remote peer is a bot.
- Eliminate double application, dropped valid hits, host-only modifiers, guest-only clamps, stale health reconciliation, and contradictory damage feeds.
- Canonical health/death/score/assist state must converge across all peers.
- Add a deterministic damage matrix covering host→guest, guest→host, host→bot, guest→bot, bot→host, bot→guest, splash/self damage, grenade, killstreak, quad damage, and representative weapons.

### A4. Hosted-lobby bots

Required:
- The host can add bots to a hosted private lobby.
- Allowed quantities are exactly **2 or 4**; no arbitrary count.
- Bots use the same combat, difficulty, navigation, scoring, spawn, death, and lifecycle rules as solo Bot Skirmish unless a documented multiplayer authority constraint requires a narrow adapter.
- Host owns bot simulation and canonical bot state; guests receive consistent replicated movement, combat, effects, health, death, score, and match transitions.
- Lobby UI clearly displays bot count and prevents guests from changing it.
- Room joins/rejoins and match restarts preserve the configured count without duplicating bots.
- Add tests for 0, 2, and 4 bots, including a host plus at least one guest.

### A5. Killstreak earning

Required:
- Only qualifying **gun kills** progress or grant killstreak rewards.
- Grenade, environmental, melee (unless currently classified as gun and explicitly retained), quad modifier alone, and killstreak-generated kills must not grant further killstreak progress.
- Killstreak multi-kills must not recursively chain rewards.
- Preserve score/kill credit separately from killstreak eligibility.
- Add unit and browser regression tests.

### A6. Host latency/fairness

Observed report: host has a damage advantage and a latency advantage over guests.

Required:
- Measure before changing: collect clock offset, RTT/jitter, input→fire timing, shot timestamp, receive time, admission decision, rewind/sample age, damage application time, and reconciliation latency.
- Implement a bounded, abuse-resistant fairness model appropriate to browser-hosted PeerJS/WebRTC play. Candidates may include clock synchronization, input/event sequence numbers, server/host-authoritative timestamps, bounded lag compensation/rewind, interpolation buffers, deterministic hit admission windows, and symmetric local feedback.
- Do not add unbounded client authority or trust arbitrary client hit claims.
- Do not intentionally delay everyone without evidence. Optimize fairness while preserving responsiveness.
- Define explicit caps and rejection reasons for stale/future/duplicate events.
- Add deterministic network-chaos tests across latency, jitter, reordering, duplication, and modest packet loss. Compare host→guest and guest→host outcomes and timing.
- Same-machine proof is necessary but not sufficient; document remaining WAN/TURN limitations honestly.

## Workstream B — maps, collision, assets, and spawns

### B1. Rustworks layout cleanup

Required:
- Improve the middle combat layout.
- Bring exterior-style crates/cover closer to the middle and use multiple intentional layout styles rather than repetitive rows.
- Preserve readable lanes, traversal, cover rhythm, flank options, and sightline balance.
- Remove or correctly ground all floating assets near the middle.
- Run collision/grounding checks and visual captures from multiple approaches.

### B2. Skyline Terminal overhaul continuation

Observed report: missing doors, overly plain terminal, poor assets and textures.

Required:
- Audit all intended door openings and supply coherent doors/frames or deliberately open passages; no accidental voids.
- Improve terminal identity, material hierarchy, architectural detail, wayfinding, cover, props, lighting readability, texture scale, and asset quality while remaining original.
- Remove/replace visibly bad, placeholder, floating, clipping, or incoherent assets.
- Maintain gameplay readability and performance budgets across render profiles.
- Verify collision and traversal around every changed doorway, prop, cover item, and route.
- Capture before/after viewpoints and representative combat routes.

### B3. Atomic Acres collision and floating assets

Required:
- New terrain mounds must have gameplay collision consistent with visible geometry; players cannot walk through them.
- Remove random floating assets in houses, including reported floating wood.
- The reported large cylinder must receive correct collision.
- Audit all intended breakable windows; fix windows that cannot break and preserve synchronized break state in multiplayer.
- Add collision/interaction tests and browser repro coverage for the named objects plus a broader scene audit.

### B4. Spawn system by map and mode

Required:
- Design and implement map- and mode-specific spawn candidates and selection rules.
- Prevent immediate line-of-sight spawns, enemy proximity spawns, repeated trapping, invalid geometry, out-of-bounds placement, and collision penetration.
- Account for solo/bots, hosted bots, FFA/team modes, map population, recent deaths, and dynamic enemy positions.
- Use deterministic scoring/fallback behavior and log why a spawn was selected.
- Add property/unit tests and browser scenarios for every map and supported mode.

## Workstream C — shooting range, HUD, feedback, and killstreak layout

### C1. LMG aim-down-sights

Required:
- Correct the LMG ADS alignment in Shooting Range.
- Verify camera, weapon model, muzzle, reticle/sight picture, recoil, firing origin, and profile/aspect-ratio behavior.
- Capture hip/ADS/firing evidence at representative resolutions.

### C2. Shooting Range damage text

Required:
- Add the white damage-number treatment to Shooting Range.
- Make damage text thinner, spread overlapping values slightly more, easier to read, and visible slightly longer.
- Avoid excessive clutter; maintain pooling/performance and accessibility contrast.
- Keep damage numbers consistent with authoritative damage events.

### C3. HUD damage feeds

Required:
- Separate **damage done** and **damage taken** into clearly distinct feeds/regions.
- Use clearly different, accessible colors and labels/direction cues; color alone must not be the only distinction.
- Make the feed larger and retain entries longer while bounding total items and screen obstruction.
- Ensure host/guest/bot/quad/grenade/killstreak events display in the correct feed exactly once.

### C4. Killstreak HUD column

Required:
- Killstreaks on the left below the map must appear in one vertical column only.
- Prevent wrapping into multiple columns across supported viewport sizes and UI scale settings.
- Preserve keyboard/controller accessibility and activation feedback.

## Workstream D — logs, diagnosis, and player export

### D1. Inspect today’s multiplayer evidence

Required:
- Inspect available 2026-07-22 multiplayer browser logs, artifacts, QA output, and Codex/Hermes evidence for contradictions between host and guests.
- Treat logs as evidence, not authority; correlate by match/session ID, peer role, event ID, actor/target, sequence, and timestamp.
- Do not ingest or publish secrets, room codes, private IPs, tokens, or unrelated personal data.
- Record confirmed findings, hypotheses, unknowns, and falsifiers in the Pass 59 spec/evidence.

### D2. Structured future diagnostics

Required:
- Add bounded structured match logs suitable for multiplayer diagnosis.
- Include schema version, build/source identity, sanitized match/session ID, peer role, arena/mode, monotonic/local time, synchronized match time where available, sequence/event ID, actor/target pseudonymous IDs, event type, weapon/effect, position where safe/useful, admission decision/reason, health before/after, damage requested/applied, modifiers, RTT/jitter/clock offset snapshot, spawn decision score/reason, and state-reconciliation events.
- Bound memory/storage, rotate or summarize noisy telemetry, and avoid secrets/room codes/private network details.
- Allow each player to download their own sanitized logs after a match using a clear UI action.
- Produce a deterministic file name and documented JSON/JSONL schema.
- Add tests for sanitization, size bounds, export availability, and representative host/guest correlation.

## Cross-cutting acceptance gates

### Repository and provenance

- Read and obey repository `AGENTS.md` and `docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md`.
- Run `npm ci` and contribution preflight before implementation and again before handoff.
- Preserve asset provenance and do not weaken security, CI, release, or verification gates.
- No unrelated worktree cleanup or edits.

### Required verification

At minimum, run and retain real output for:
- focused unit/property tests added for every corrected invariant;
- TypeScript lint/type checking;
- gameplay-contract and asset-provenance checks;
- full Vitest suite;
- leaderboard checks where shared gameplay events touch scoring;
- production build and release-tree verification;
- bounded browser suite;
- multiplayer lifecycle/private lobby checks;
- deterministic two-peer host/guest checks for pickup, grenade, killstreak presentation, damage matrix, hosted bots, logs, and match restart;
- network-chaos matrix with explicit host/guest fairness metrics;
- visual/browser evidence for Rustworks, Skyline Terminal, Atomic Acres collisions/assets, Shooting Range ADS/damage text, damage feeds, killstreak column, and spawn behavior;
- performance comparison and zero unexpected browser console warnings/errors.

### Release acceptance

- Contribution PR contains the current `origin/main` before final checks.
- Independent integrator reviews actual diff and evidence.
- All four required GitHub checks succeed.
- Merge is serialized and followed by successful checks on the exact `main` SHA if required by the release guard.
- Dispatch `release-production` with the exact full green `main` SHA and `PASS 59`.
- Production receipt reports matching `sourceSha`, built `pagesSha`, `releasePass: PASS 59`, and `pagesStatus: built`.
- Canonical HTTPS site is cache-busted and verified for chooser, release panel, affected gameplay paths, multiplayer host/guest behavior, and zero unexpected browser logs.
- `release-channels.json` still pins the exact Pass 57 stable Pages SHA; NEW BUILD is Pass 59. Pass 58 is not offered as the current new build.

## Conservative interpretation rules

- “Discard Pass 58” means supersede it as the selectable NEW BUILD after Pass 59 is live; do not rewrite Git history or delete release evidence.
- “Grenades and killstreaks not visible to enemies” means replicate legitimate remote presentation while retaining authoritative single damage application.
- “Clever net code” means measured, bounded lag compensation and state reconciliation, never unrestricted client authority.
- “Same rules as bot skirmish solo” means reuse canonical bot behavior/rules with a narrow host-authoritative replication adapter rather than copy/fork divergent bot logic.
- If an ambiguous object cannot be uniquely identified (for example the reported large cylinder), use current scene inspection, collision debug overlays, screenshots, object names, and broad collision auditing to identify and fix it without inventing unrelated geometry.
