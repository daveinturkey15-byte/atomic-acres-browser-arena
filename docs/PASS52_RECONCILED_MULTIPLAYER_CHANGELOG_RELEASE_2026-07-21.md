# Pass 52 release evidence — reconciled multiplayer telemetry and release history

Date: 2026-07-21
Status: **live in production**

## Revisions

- Original Codex feature revision on the older Pass 50 branch: `e437f8f882a532db71a597a645f7f8a0d3a6a9b4`.
- Reconciled Codex revision containing Pass 51: `f6a3a8607077bea0a05b42291aa1e2d2c6dc4f37`.
- Audited Pass 52 source revision: `3297d5544c8b6fdcdb995e151a6fb44943233883`.
- Source branch: `overhaul/pass52-reconciled-multiplayer-changelog`.
- Immutable HTTPS review revision: `77eea21aa4f38463968512a4e52d2b9bb3450abd`.
- Production `gh-pages` revision: `d6cc0046d72c0da6cb6fd4bcc88ec47b5035692f`.
- Previous production root: `9edbc5f74b3586ec70bba22bd2f990753701f351` (also retained at review commit parent `77eea21`).

## URLs

- Production: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/
- Immutable review: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass52-reconciled-multiplayer-changelog-3297d55/

## Frozen artifact

- Files including `.nojekyll`: **91**.
- Served files: **90**.
- Total bytes: **37,350,608**.
- Path-sensitive tree SHA-256: `ff3d8673e4c32f864063c6681abf5649d5126c0215f50126f289cf74f845df47`.
- Review exact-byte verification: **90/90**, zero mismatches.
- Production exact-byte verification: **90/90**, zero mismatches.
- Historical `review/` content was preserved; no review path changed during production promotion.

## Mechanical verification

`npm run verify:pass25a:core` passed:

- TypeScript clean.
- Gameplay contract and golden replay baselines verified.
- **75 test files / 379 tests passed**.
- Production Vite build passed.
- Release-tree verification passed with 90 served files.
- Dependency audit reported **0 vulnerabilities**.

Focused reconciliation verification passed:

- Changelog/private-match/protocol: **25/25 tests**.
- `qa:rustworks-lobby-sync`: host and guest both reported `rustworks-1v1`, one active map root, 35 navigation colliders, 35 physics colliders, identical `[-27,27] × [-29,29]` bounds, two network rows, and zero browser errors.
- `qa:multiplayer`: waiting-room ready/start, leaderboard, stance, windows, explosive windows, death/drop, scavenging and pickup replication passed; damage-dealt/taken telemetry matched host authority; spawn separation was approximately 57.45 units; zero browser errors.
- `qa:private-lobby`: four- and six-human admission, overflow rejection, auto-balance, FFA, synchronized active epoch/timers, unreliable unordered state channels, zero bots, and reconnect identity recovery passed.
- `qa:multiplayer:lifecycle`: three complete host/join/leave cycles passed with reconnect grace and zero browser errors.
- `qa:pass52:changelog`: desktop 1440×900 and mobile 390×844 passed locally, on immutable HTTPS review, and in production. Eight entries rendered with no horizontal overflow or browser errors.

## Player-facing release-history contract

- The control now says **LAST RELEASE**, not Last Updated.
- Pass 52 is marked **CURRENT LIVE**.
- `PUBLISHED` means the first successful public production promotion.
- Times show UK local time, timezone abbreviation, UTC offset, and seconds while retaining an offset-bearing ISO `<time datetime>`.
- Pass 52 uses `2026-07-21T19:47:24+01:00`, the first generic production promotion of the reconciled Codex feature.
- Pass 51 was corrected from the earlier implementation-time value `18:20` to production promotion `2026-07-21T19:17:57+01:00`.
- Passes 44–50 now use their successful production promotions; Pass 49 uses the corrected root promotion at `17:55:17`.

## Release result

The exact reviewed artifact is live. Pass 51 Rustworks cleanup/horizon ocean remains present, the Codex private-match map sync and damage telemetry are reconciled on top of it, and production no longer contains the stale root JavaScript/CSS artifacts left by the earlier generic `Updates` deployment.
