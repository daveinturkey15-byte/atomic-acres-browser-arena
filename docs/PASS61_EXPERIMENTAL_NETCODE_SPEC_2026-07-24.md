# Pass 61 — Experimental Netcode

## Release contract

- Pass 59 remains the immutable `recent-stable` channel.
- Pass 60 remains the normal live channel and is titled **New Netcode**.
- Pass 61 is published only at the separate **Experimental Netcode Pass** channel.
- The root is a lightweight three-channel chooser. Publishing Pass 61 must not rebuild or replace Pass 59 or Pass 60 bytes.

## Runtime contract

1. A disconnected private-lobby identity is reserved for 90 seconds using a monotonic deadline.
2. Clock probes map each guest monotonic clock into the host monotonic domain. A small rolling window favours the lowest-RTT samples, retains uncertainty bounds, tracks slow drift and rejects sudden mapping movement. Wall time is not used for gameplay comparison.
3. Movement snapshots carry a continuity identifier, sequence and host-world timestamp.
4. Remote presentation uses bounded-adaptive timestamped pose estimation. Delay follows snapshot interval, measured jitter and repeated underruns, and diagnostics record the chosen delay plus the actual host-world time represented.
5. Movement pacing uses only 20, 30 or 40 Hz, with fast pressure demotion, slow stable promotion, hysteresis and bounded receiver feedback.
6. Movement stays unordered/unreliable; gameplay events stay ordered/reliable.
7. One trigger creates one reliable `shot-request`. Guest firearm `hit` claims are not authoritative.
8. The host validates ownership, protocol, sequence, cadence, history continuity, origin, pellet count and timing, then performs canonical obstruction/raycast evaluation once.
9. The host applies health/death/score no more than once per `(shooter, shotId)` and returns one cached, idempotent `shot-result`.
10. Confirmed hitmarker, hit audio and damage numbers are presented only from an accepted host result.
11. Missing or incompatible history is rejected explicitly; current pose is never silently substituted.
12. Protocol mismatch is rejected with an update/reload reason.
13. Display presentation, fixed-step simulation, adaptive 20/30/40 Hz movement and weapon-authored fire events are four independent cadence layers.
14. One authored shot timestamp is frozen before local ray evaluation. The host derives one resolver timestamp and uses it for every shooter and target pose; actual rewind never exceeds 250 ms.

## Acceptance criteria

- Seven authored-cadence shots delivered in a jitter-bunched reliable stream are admitted by authored host time, not rejected from receipt spacing.
- Duplicate requests and duplicate results produce one damage mutation and one confirmation.
- Stationary, moving, crouched and prone rewind uses one consistent resolver host time, and the reported rewind equals the timestamp actually used within the existing 250 ms cap.
- Hit and miss outcomes produce the same pre-evaluation authored timestamp; multi-target pellets never choose a timestamp from whichever target happened to be hit or had the oldest buffer.
- Stale, future, bad-origin, bad-weapon, cadence, malformed and missing-history requests return machine-readable rejection reasons.
- Diagnostics expose bounded clock RTT/jitter/uncertainty/outliers, movement gaps/reordering/pressure/rate/render age, and shot lifecycle counters.
- Automated browser QA under approximately 20 ms RTT plus jitter proves host damage count equals guest confirmed-hit count.

## Boundaries

- TURN, paid/dedicated servers and fully host-simulated guest movement/ammunition are out of scope.
- Melee, grenades and earned support retain their existing protocol except for monotonic timing plumbing needed for compatibility.

## Evidence model

- Observation: Pass 60 presents predicted guest hit feedback before authority and sends separate firearm hit claims.
- Inference: reliable packet bunching plus host-receipt cadence can explain the reported seven-to-two/three disagreement.
- Assumption: host-admitted movement history is sufficient for bounded firearm pose estimation; it is not claimed to be exact reconstruction or fully authoritative movement simulation.
- Unknown: real public PeerJS asymmetry cannot be inferred from RTT alone.
- Falsifier: any automated or manual trace where an accepted host firearm damage event lacks exactly one matching shooter result, or a shooter confirmation lacks one host damage event, fails this pass.
