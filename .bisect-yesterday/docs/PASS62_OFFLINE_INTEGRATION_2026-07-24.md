# Pass 62 offline integration candidate

Date: 2026-07-24

This is an unpublished local HITL candidate. It combines the gameplay/assets,
graphics, and netcode streams without changing `origin/main`, GitHub Pages, or
the currently published release channels.

## Exact inputs

- Gameplay/assets plus the initial graphics merge: `3aad07cf0c92107fe0af43c23777cb1786d431ff`.
- Approved graphics contrast and authored-light restoration: `f2a675c3fb18c9499fc34f4c948374c53a9d6a74`.
- Immutable authored-bullet netcode correction: `40cbff4419d95b871f7d95b2a14c039151f666f5`.
- Integration branch: `contrib/dave-gaming-pc/codex/pass62-offline-integration`.

All three source heads remain in their original clean worktrees. The integration
worktree is the only combined candidate.

## Reconciliation decisions

- Retain the gameplay branch's low-frequency offline wake-up and early return
  when no multiplayer remotes exist.
- Record local pose history for both host and guest whenever multiplayer remotes
  exist, and update bounded adaptive interpolation from snapshot rate, jitter,
  and new underruns.
- Preserve the two later graphics commits: Atomic Acres keeps its accepted
  treatment; Rustworks and Gun Range use their authored practical-light pools
  without the broad generic fill that flattened dark zones.
- Report Pass 62 as one gameplay, graphics, and netcode candidate in the local
  changelog. The production timestamp remains pending.

## Integration fault found and corrected

**Symptom -> Cause -> Correction -> Verify:** the host accepted all seven
impaired-network shots but the guest displayed only three confirmations -> the
gameplay overkill field could be microscopically below applied damage because of
floating-point subtraction, or materially below it after target DHV incoming
amplification, causing `shot-result` protocol validation to reject the packet ->
calculate reported raw damage on the target-DHV scale and floor it at the actual
applied value -> focused handicap/protocol tests and two consecutive real-peer
runs each produced 7 authored, 7 host-resolved, and 7 guest-confirmed shots with
zero browser errors.

## Verification

- TypeScript and Worker lint: pass.
- Full core gate: 109 files / 605 tests, 27 leaderboard tests, gameplay
  baselines, 24 source provenance digests, 109/109 public assets, production
  build, 118-file release-tree audit, and zero production dependency
  vulnerabilities.
- Focused integration suite: 60 cross-stream tests before browser validation;
  46 timing, protocol, handicap, and resolver tests after the packet fix.
- Real-peer authoritative netcode under injected event delay/jitter: two
  consecutive 7/7/7 runs, resolver/telemetry agreement, no browser errors.
- Focused Chromium HITL gate: 9/9 covering HUD, boot/assets, Gun Range LMG ADS,
  Quality asset loading, profile collision parity, near-wall weapon retreat,
  sniper/overkill behavior, prewarmed explosive effects, and Pass 62 graphics
  streaming telemetry.

The existing Vite warning for chunks above 500 kB remains; the production audit
reports zero vulnerabilities.

## Claim states

- **Observed:** the three exact source heads are ancestors of the integration
  branch and the combined local validation above passes.
- **Inference:** this candidate is suitable for offline human inspection on this
  machine.
- **Unknown:** public PeerJS route asymmetry and real multi-household behavior
  have not been tested by this local build.
- **Falsifier:** any mismatch between authored, host-resolved, and
  guest-confirmed shots; profile-dependent collision; browser warning/error; or
  return of flat Rustworks/Gun Range lighting rejects the candidate.
