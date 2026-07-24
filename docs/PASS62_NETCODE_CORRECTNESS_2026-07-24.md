# Pass 62 — Netcode correctness and bounded adaptation

## Outcome

Pass 62 gives every bullet one immutable authored record and makes the host resolve the exact timelines carried by that record. The 250 ms limit is a rare hard ceiling, not a normal target and not permission to transplant a stale shot onto the oldest allowed pose. Clock mapping and interpolation move from fixed/EWMA-only behaviour to small bounded adaptive controllers.

Change impact: `runtime`.

Base: exact `origin/main` at `11f6141a463d0994c2fa22fd0addb55b55c9288a`.

## Correctness contract

1. Before local hit evaluation, the client freezes an immutable record containing `shotId`, `connectionEpoch`, `lifeId`, `weaponSequence`, `fireTimeMs`, `targetViewTimeMs`, aim origin, principal direction and every pellet direction.
2. Hit, miss and multi-target outcomes cannot change either authored time.
3. The host reconstructs the shooter/ray origin at `fireTimeMs` and every eligible remote target at `targetViewTimeMs`; it does not force both onto one timestamp. Because the reliable event lane can lead the transient movement lane by one snapshot, shooter-only pose estimation may extrapolate at most 75 ms from admitted same-life history; target history remains strict.
4. `appliedRewindMs = fireTimeMs - targetViewTimeMs`. Admission rejects negative or greater-than-250 ms timelines; there is no clamp path.
5. Packet staleness is independent: reject when `receivedAtHostTimeMs - fireTimeMs` exceeds 250 ms plus at most 25 ms of measured clock uncertainty. A stale shot is never moved forward and resolved anyway.
6. Host results report `fireTimeMs`, `targetViewTimeMs`, actual receipt time, actual resolution-completion time and the exact applied target-view rewind.
7. Authored weapon cadence is checked per bullet, including reordered/bunched automatic fire. Duplicate requests return a cached result and damage remains exactly once.
8. `connectionEpoch`, `lifeId` and pose continuity prevent rewind across reconnect, respawn, teleport or movement-resynchronization boundaries. Pre-death bullets can trade; bullets authored after authoritative death are rejected.
9. Muzzle flash, recoil and tracers remain predicted. Damage, death and kill credit remain host-authored; clients do not invent a death that authority can later resurrect.

## Network-quality contract

- Clock mapping keeps twelve recent four-timestamp samples, favours the lowest-RTT subset for offset, retains a numeric uncertainty bound, estimates slow drift and caps accepted mapping movement after warm-up.
- Interpolation delay begins at 60 ms. Its starting target is two snapshot intervals plus 1.5 times measured jitter, clamped to 20 Hz = 80–120 ms, 30 Hz = 60–90 ms and 40 Hz = 40–70 ms.
- Delay moves in 5 ms steps: it rises only after repeated held-latest underruns and falls only after sustained stability, avoiding sudden presentation-time jumps.
- All remote players on one client sample one common chosen delay. The delay defines the bullet's target-view timeline even when individual buffers temporarily hold different endpoints; diagnostics report the presented-age spread.
- Diagnostics include chosen/target delay, transitions, buffer under/overruns, last authored/resolved shot times, the 250 ms ceiling, target-view headroom, event-lane ordering/buffer pressure, authored spacing, packet receipt spacing, resolution spacing, result-delivery spacing and rewind bands `0–50`, `50–130`, `130–180`, `180–250`, `rejected`.

## Four cadence layers

1. Display presentation follows the browser/display cadence.
2. Gameplay simulation retains its fixed step.
3. Movement snapshots adapt only among 20, 30 and 40 Hz.
4. Fire events follow each weapon's authored cadence and are host-resolved per bullet.

Interpolation is pose estimation between admitted samples. It is not exact world reconstruction.

## Deliberate deferrals

- The current PeerJS event lane is shared reliable-ordered traffic, so unrelated loss can cause head-of-line blocking. This pass instruments its ordering, buffered bytes and all four timing spacings. A dedicated reliable-unordered shot lane is deferred until that evidence justifies a transport change with bounded IDs, acknowledgements, idempotency, retries, reconnect and fallback tests.
- Array histories remain bounded and small. Fixed-capacity ring buffers are not justified without a trace showing GC pressure.

## Integration handoff

- This work is isolated on `contrib/dave-gaming-pc/codex/pass62-netcode-correctness` from exact base `11f6141a463d0994c2fa22fd0addb55b55c9288a`.
- The in-progress Pass 62 gameplay work overlaps `src/changelog.ts`, `src/main.ts`, `src/network-sync.ts`, `src/network-sync.test.ts`, `src/protocol.ts` and `tests/e2e/atomic-acres.spec.ts`.
- The in-progress Pass 62 graphics work overlaps `src/changelog.ts`, `src/main.ts` and `tests/e2e/atomic-acres.spec.ts`.
- Preserve the netcode invariants during reconciliation: freeze both authored times before ray evaluation; resolve shooter at fire time and targets at target-view time; reject stale/invalid timelines rather than clamping; preserve epoch/life continuity and exactly-once result caching; keep interpolation inside the cadence-specific bands.
- After reconciliation, rerun the full core gate and the isolated two-browser seven-shot authoritative-netcode QA. A textually clean merge is not sufficient proof for the shared runtime files.

## Claim states

- **Observed:** Pass 61 calculated a clamped rewind value but resolved shooter and target history at the unclamped request timestamp.
- **Observed:** Pass 61 chose hit timestamps after local ray evaluation from hit-target buffer times, while misses used a fixed-delay fallback.
- **Inference:** those two paths can make advertised diagnostics disagree with actual resolution and make hit outcome alter authored time.
- **Observed:** the event channel is shared reliable-ordered traffic; buffering and spacing telemetry are required before changing its transport semantics.
- **Assumption:** the cadence-specific 40–120 ms bands cover the intended small browser lobbies while keeping normal target rewind below 150 ms.
- **Unknown:** public PeerJS route asymmetry and event-lane head-of-line frequency remain unmeasured.
- **Falsifier:** any accepted shot that uses a shooter pose other than `fireTimeMs`, a target pose other than `targetViewTimeMs`, exceeds 250 ms target rewind, crosses a life/epoch boundary, applies damage twice, or changes an authored time with hit outcome fails this pass.

## Verification and telemetry

- Unit coverage: low/moderate-latency moving targets, crossing cover, 900 RPM bunching, duplicates, reordering, stale/future delivery, pre/post-death shots, connection/life isolation, continuity boundaries, multi-target buffer-age diagnostics, clock drift/outliers and cadence changes.
- Two-browser coverage: the existing seven-shot real WebRTC verifier now requires exact fire-minus-target-view rewind, actual receipt/resolution ordering, cadence-band delay, exactly seven authoritative results, all four spacing streams and a complete rewind histogram.
- Before: the Pass 61 verifier asserted a clamped receipt-derived timestamp even though pose lookup used the request timestamp; no authored/receipt/resolution/delivery spacing or rewind histogram existed.
- After, local two-browser WebRTC with 10 ms base event delay and 6 ms jitter: browser errors `[]`; 7 authored shots, 7 host-authoritative hits and 7 client confirmations; host health `38.8`; all seven applied rewinds `68.875 ms` in the `50–130` band; no rejected shots; authored/receipt/resolution/delivery spacing counts `6/6/6/6`; mean spacings `263.47/265.63/265.17/265.52 ms`; reliable-ordered event buffering peaked at `338` bytes. Production publication remains out of scope for this branch.
