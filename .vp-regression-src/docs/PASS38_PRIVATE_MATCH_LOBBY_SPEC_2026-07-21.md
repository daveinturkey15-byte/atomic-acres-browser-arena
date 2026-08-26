# Pass 38 — Free Private-Match Lobby and Transport

## Overview

Turn the existing browser-hosted PeerJS star relay into a usable, bounded private-match flow for two to six trusted human players without adding paid infrastructure. GitHub Pages and the default PeerJS signalling service remain the deployment path. Solo modes and the authoritative bullet-ray/physical-sight invariant must not regress.

## Context

Pass 37 already connects one host and three guests with zero bots. The current host starts immediately, match clocks are local, every invite defaults guests to the opposite team, movement snapshots share the reliable event channel and are echoed to their sender, and there is no ready/start/rejoin/cap/quality UX.

## Requirements

- **R1 — Waiting lobby:** Hosting or joining enters a visible pre-match lobby rather than starting gameplay immediately.
- **R2 — Bounded roster:** The host owns a validated roster with callsign, stable player ID, reconnect token binding, team, ready/connected state and smoothed ping. Room capacity is explicitly 4 or 6 players and excess joins are rejected visibly.
- **R3 — Ready/start:** Every connected player can toggle ready. Only the host can start, only with at least two connected players and every connected player ready.
- **R4 — Shared settings:** Host-authoritative settings include arena, `tdm`/`ffa`, capacity and automatic team balancing. Guests render but cannot mutate host-only settings.
- **R5 — Team balance:** TDM can rebalance connected players deterministically; team requests are host-admitted. FFA treats every different player ID as hostile while retaining bounded Aqua/Coral presentation variants.
- **R6 — Synchronized match:** Ping/pong clock estimation maps a host epoch start to each peer’s performance clock. All peers share the same three-second countdown, active start and five-minute deadline. Late/rejoining peers receive the existing active start epoch.
- **R7 — Rejoin:** A client keeps a per-room reconnect token in session storage, retries a dropped host connection with bounded backoff, and reclaims its lobby slot during a grace period without creating a duplicate identity.
- **R8 — Host-authoritative score:** The host owns per-player kill totals from admitted death messages and broadcasts a bounded score snapshot. TDM derives team totals; FFA derives leader/winner from that snapshot.
- **R9 — Transport split:** Reliable ordered event/control traffic and unreliable movement-state traffic use distinct PeerJS data connections. State cadence becomes 20 Hz. Interpolation remains frame-rate independent.
- **R10 — No self echo:** Host relays a guest’s state to every other open guest state channel, never back to the source player.
- **R11 — Connection UX:** Lobby rows show ready/connected/team and latency quality. Network diagnostics expose channel counts, capacity, retries, state sends/relays and suppressed self echoes.
- **R12 — Privacy/security bounds:** All new messages are runtime validated and size bounded. Host-only messages are rejected from guests; player-authored messages stay bound to the established player ID/team/token.
- **R13 — Existing behavior:** Bot Skirmish remains bot-only, multiplayer remains human-only, Rustworks/Gun Range remain solo-only, and existing combat/admission/field-support/window/drop behavior remains green.
- **R14 — Free deployment:** No paid service, account, secret, TURN credential or dynamic backend is introduced.

## Acceptance criteria

- **C1:** Unit tests reject malformed lobby/settings/clock/score messages, host-only spoofing, over-capacity joins and reconnect-token mismatch.
- **C2:** Pure lobby tests prove deterministic 2v2 balancing, all-ready gating, 4/6 caps, FFA hostility and grace-period rejoin.
- **C3:** Network tests prove state/event channel routing, an actual unordered state `RTCDataChannel` with `maxRetransmits: 0`, 50 ms state cadence and source self-echo suppression.
- **C4:** One host plus three guests reaches the waiting lobby with zero bots; nobody starts before host start.
- **C5:** A 2v2 four-peer run readies all players, host starts once, and all peers enter active play within 150 ms of the host epoch estimate with equivalent deadlines.
- **C6:** FFA admits damage between equal presentation teams and exposes a per-player authoritative leader.
- **C7:** A disconnected guest is marked disconnected, reconnects with the same token/ID inside the grace period and returns without a duplicate roster entry.
- **C8:** A fifth player is rejected in a four-player room; switching to six permits it.
- **C9:** Diagnostics show one reliable and one state channel per connected guest, 20 Hz state scheduling and zero source-state echoes.
- **C10:** TypeScript, unit tests, production build, release-tree verification and dependency audit pass.
- **C11:** Existing solo/browser regressions and principal sight/bullet-ray matrices pass unchanged.
- **C12:** An isolated HTTPS review deployment loads exact reviewed bytes and repeats the four-peer lobby/start smoke without console/page errors.

## Out of scope

- TURN service or credentials.
- A dedicated authoritative gameplay server.
- Public matchmaking/accounts/password recovery.
- Ranked anti-cheat or rewind lag compensation.
- Mobile/touch controls.
- Canonical production promotion before Dave reviews the isolated HTTPS candidate.

## Decisions

- Default room capacity: 4; optional host setting: 6.
- Default mode: 2-team TDM with automatic balance enabled.
- Movement snapshots: 20 Hz (`50 ms`), JSON serialization, unordered `RTCDataChannel` with `maxRetransmits: 0`; gameplay/control events remain reliable and ordered JSON.
- Rejoin grace: 30 seconds; bounded reconnect attempts with backoff.
- Host clock: epoch milliseconds carried in bounded ping/pong/start messages; clients estimate host offset using midpoint RTT.
- FFA keeps existing two operator colour families for readability but hostility is ID-based, not colour/team-based.

## Verification status — 2026-07-21

Local release gates passed:

- TypeScript and production build;
- 70 Vitest files / 348 tests;
- gameplay-contract verification and production dependency audit (zero vulnerabilities);
- existing two-peer combat/world replication QA;
- three complete join/start/disconnect lifecycle cycles;
- one host plus five guests in six isolated browser contexts, with five remotes and zero bots on every peer;
- capacity-four overflow rejection before expanding the same lobby to six;
- synchronized `04:59` timers and identical host-owned active epochs on all six peers;
- five host event channels and five unordered `maxRetransmits: 0` state channels;
- active-match reload recovery with the same player identity and no duplicate roster entry.

These browser contexts used one machine and a local PeerServer. C12 and real multi-household NAT/firewall testing remain separate gates; local six-peer success is not a universal internet-connectivity claim.
