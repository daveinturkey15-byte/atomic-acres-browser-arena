# Pass 52 — reconciled private-match map sync, combat telemetry, and release history

Date: 2026-07-21

## Purpose

Safely reconcile the Codex multiplayer/telemetry work with the verified Pass 51 Rustworks release, preserve every Pass 47–51 production feature, and replace the ambiguous **Last Updated** display with explicit public-release timestamps.

## Source reconciliation

- Verified Pass 51 functional source: `68c20dbb18a97d547258038162a25c91a494d4f9`.
- Pass 51 release-document head: `504890c039d7bee9ef01f266b0ad7786e64fd251`.
- Original Codex feature commit on the older Pass 50 branch: `e437f8f882a532db71a597a645f7f8a0d3a6a9b4`.
- Reconciled Codex commit on top of Pass 51: `f6a3a8607077bea0a05b42291aa1e2d2c6dc4f37`.
- `git range-diff` identifies `e437f8f` and `f6a3a86` as the same patch; `f6a3a86` contains the Pass 51 source ancestry.
- The generic production commit `9edbc5f74b3586ec70bba22bd2f990753701f351` first exposed the reconciled multiplayer work at `2026-07-21T19:47:24+01:00`, but had no immutable review or player-facing Pass 52 release note. This pass supersedes it with audited/reviewed bytes and explicit release evidence.

## Player-visible changes

### Private-match arena synchronization

- The host-selected arena is carried in private-match configuration and synchronized to guests before start.
- Lobby, match start, active map root, navigation collision, respawn bounds, and DOM/debug identity remain aligned.
- Guest arena switches are serialized rather than dropped when repeated lobby-state snapshots arrive during physics creation.
- Map cards lock once a private lobby exists; Ready and Start remain disabled until the selected arena and lobby configuration match.
- Respawn selection uses the active map bounds and handles wide/non-square arenas.
- Team and free-for-all spawn selection use opponent separation appropriate to the current match mode.

### Combat telemetry

- The host-authoritative score table includes kills, deaths, damage dealt, and damage taken.
- HUD/network roster/feed surfaces expose admitted damage changes and ping without making clients authoritative.
- Protocol validation rejects invalid score rows and bounded counters prevent unbounded or non-integer values.

### Clear release history

- The top-right control is renamed from **Last Updated** to **Last Release**.
- Every changelog timestamp means the first successful public production promotion, not implementation or review time.
- The panel labels timestamps **PUBLISHED**, shows UK local time, timezone abbreviation, UTC offset, and seconds, and preserves the offset-bearing ISO value in `<time datetime>`.
- The current release is marked **CURRENT LIVE** and entries carry player-facing area tags.
- Historical Pass 44–51 timestamps are corrected to their actual successful production promotions; Pass 49 uses its corrected root promotion, not the earlier incomplete deploy.

## Required acceptance gates

1. TypeScript passes.
2. Gameplay contract and golden replay baselines match.
3. Full Vitest suite passes.
4. Production build and release-tree verification pass.
5. Dependency audit reports zero vulnerabilities.
6. Rustworks host/guest lobby synchronization passes with an 800 ms forced local physics-switch window: Ready is disabled and map cards remain locked during synchronization, then both peers expose enabled Ready controls plus identical active roots, colliders, bounds, and DOM arena identity.
7. Main multiplayer replication passes including damage telemetry and spawn separation.
8. Four-/six-player private lobby, overflow, synchronized timer, FFA, reconnect, and zero-bot gates pass.
9. Three repeated multiplayer lifecycle cycles pass.
10. Desktop and 390×844 changelog checks pass with eight entries, exact Pass 52 release metadata, no horizontal overflow, and no browser errors.
11. An immutable HTTPS review is published and verified byte-for-byte before production promotion.
12. Production promotion preserves every historical review and serves bytes exactly matching the accepted artifact.
