# Pass 59 match diagnostics

Pass 59 keeps a bounded in-memory diagnostic record for the current match. At the post-match screen, each player can select **DOWNLOAD DIAGNOSTICS** to save their own sanitized JSON record. Nothing is uploaded by this feature.

## Envelope

- `schemaVersion`: currently `1`.
- `context`: build/source identity, a one-way pseudonymous session ID, local peer role (`offline`, `host`, or `guest`), arena, and mode.
- `droppedEvents`: number of oldest records removed by rotation or byte-bound enforcement.
- `events`: ordered structured events.

Each event may include monotonic time, local epoch time, synchronized match-relative time, a sequence/event ID, pseudonymous actor and target IDs, event type, weapon/effect, coarsened position, admission decision/reason, health and damage values, modifiers, RTT/jitter/clock-offset samples, and spawn score/reason. Combat send and host-admission events share a bounded sequence ID so two players can correlate an exercised event without exporting raw peer identities.

## Bounds and privacy

- At most 1,024 events are retained; oldest events rotate first.
- Export is capped at 512 KiB and trims additional oldest events if necessary.
- Actor, target, and session identifiers are deterministically pseudonymized within an export.
- Room-code patterns, secret-bearing fields, long credential/token-like strings, and private IPv4 addresses are removed.
- Free text and arrays are length-bounded; positions are rounded to 0.1 world unit.
- Room codes, resume credentials, network addresses, browser storage, and unrelated personal data are not intentionally recorded.

## Correlation limits

A shared combat sequence ID is evidence that two local records describe the same emitted/admitted event. It is not a global identity and may collide across independent sessions. Same-machine PeerJS/WebRTC testing can validate local host/guest ordering and convergence, but it is not WAN, relay, TURN, NAT, or geographically realistic latency proof.