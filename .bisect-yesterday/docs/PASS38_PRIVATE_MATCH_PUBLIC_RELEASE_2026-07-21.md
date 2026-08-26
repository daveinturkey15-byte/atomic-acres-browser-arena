# Pass 38 — Private Match Lobby Public Release

Date: 2026-07-21
Status: promoted to public production after Dave approved the isolated HTTPS candidate
Source branch: `overhaul/pass38-private-match-lobby`
Deployed source revision: `1a7ad06944d829c9e2e9f3b802e7679b7422fed1`
Reviewed preview revision: `d382c1f601e4619452c05c759b43e65636c844a7`
Production `gh-pages` revision: `7978c33de7a6ece7a69eaec4bd8d313966782f94`
Rollback revision: `4103344479bcb20860c40501ca4fdaaabbda2958`
Public route: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/>
Reviewed route: <https://daveinturkey15-byte.github.io/atomic-acres-v2-preview/review/pass38-1a7ad06-20260721-082450/>

## Release contents

- Human-only private waiting room for two to six players.
- Host-owned settings, admission, readiness, team balance, synchronized start, scores and match clock.
- Team Deathmatch and Free For All.
- Explicit capacity-four overflow rejection and capacity-six admission.
- Thirty-second same-identity reload/reconnect reservation.
- Reliable ordered event lane plus native unordered movement lane with `maxRetransmits: 0`.
- 50 ms / 20 Hz nominal adaptive movement pacing and sender self-echo suppression.
- No multiplayer bots, dedicated server, paid backend, TURN credentials or relay secrets.

## Verified release gates

- TypeScript, production build and gameplay contract passed.
- Vitest: 70 files / 348 tests passed.
- Production dependency audit reported zero vulnerabilities.
- Existing two-peer combat/world replication QA and three lifecycle cycles passed.
- Local six-context lobby/start/reconnect gate passed with five remotes and zero bots per peer.
- Hosted four-context public-PeerJS candidate gate passed with synchronized active epoch, three remotes and zero bots per peer, host-team synchronization, reliable events, and `ordered: false` / `maxRetransmits: 0` movement.
- Frozen artifact, corrected immutable review, and production root are identical: 57 files, 20,541,386 bytes, SHA-256 `85c22e571cda7cab56a9e6d244c3dcff5f2b3301fea920ab1a898ae83088569e`.
- All 56 HTTP-served production files matched the frozen artifact byte-for-byte; `.nojekyll` is the intentionally non-served Pages control file.
- Post-release live four-context public-PeerJS smoke passed with no browser errors.
- Canonical browser review showed Pass 38 and no JavaScript errors; the only console message was the expected unsupported `KHR_parallel_shader_compile` warning.

## Limits

- PeerJS Cloud provides signalling, not TURN. Restrictive NATs, symmetric NAT, VPNs, firewalls or blocked UDP may still prevent a connection.
- Six-player behavior passed locally. A broader hosted six-context attempt timed out and is not represented as six-household WAN proof.
- Private rooms use unlisted invite codes rather than account/password authentication.
- Host migration is out of scope; host loss ends the session.

## Rollback

Reset the canonical `gh-pages` branch to `4103344479bcb20860c40501ca4fdaaabbda2958` and force-push only with explicit owner approval, or revert production commit `7978c33de7a6ece7a69eaec4bd8d313966782f94` with a normal forward commit. Preserve both immutable review paths as audit evidence.
