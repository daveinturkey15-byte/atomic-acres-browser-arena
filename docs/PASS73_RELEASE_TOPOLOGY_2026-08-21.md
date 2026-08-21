# Pass 73 release topology

## Change impact

This contribution is `release-shell`. It changes the player-facing build chooser, current release identity, changelog, staged-channel schema, topology verification and the protected production workflow. It does not publish `main` or `gh-pages`.

## Observations

- Production workflow run `32432483550` succeeded for Pass 72 source `5da686551d92387d08b00be40125386c391bb3ed`.
- Its production receipt names Pages commit `d5b77dc3b9e46608264c52eb0737b50590d70eb5` and production build timestamp `2026-08-21T00:25:40Z`.
- The embedded Pass 72 provenance at historical path `channels/the-big-one` names 515 runtime files and tree digest `62fafc5e5c39fa744dfc4f7067b3e0953dd190d8ffecc04e203b2b86d6a8974f`. The complete copied subtree has one additional embedded provenance file.
- Pass 70, Pass 69, direct-only Pass 67.1, selectable Pass 63 and the offline Pass 62 benchmark retain their existing exact source, Pages and digest pins.
- Dave ordered the corrected build published after autonomous mechanical verification. He has not inspected or tested an immutable Pass 73 preview.

## Intended schema 5 topology

| Role | Pass | Public path | Preservation |
|---|---|---|---|
| Live target | Pass 73 | `channels/the-big-one` | Bound only to the final green `main` SHA at protected dispatch |
| Previous | Pass 72 | `channels/pass72-retained` | Exact Pages blobs from `d5b77dc3b9e46608264c52eb0737b50590d70eb5:channels/the-big-one` |
| Retained | Pass 70 | `channels/pass70-retained` | Existing exact Pages pin |
| Historical | Pass 69 | `channels/pass69-retained` | Existing exact Pages pin |
| Direct-only stable source | Pass 67.1 | `channels/recent-stable` | Rebuilt only from its pinned source with its original Pages timestamp; no chooser card |
| Selectable rollback | Pass 63 | `channels/pass63-rollback` | Rebuilt only from its pinned source with its original Pages timestamp |

The root chooser exposes five actions: Pass 73, Pass 72, Pass 70, Pass 69 and Pass 63. Room links plus `latest`, `normal` and `experimental` enter Pass 73. `previous` and `pass72` enter Pass 72; `pass70` and `pass69` preserve their named routes; `stable` and `rollback` enter Pass 63.

## Inferences and assumptions

- The safest immediate rollback after Pass 73 is Pass 72 because it is the exact build Dave just tested, even though his test found release-blocking defects.
- Retaining Pass 70 and Pass 69 as separate selectable byte copies is preferable to collapsing history because they remain useful behavioral comparators.
- The final Pass 73 source SHA, preview artifact ID, preview file count, preview digest and production Pages SHA are unknown until integration and protected workflows produce them.

## Unknowns and blockers

- `acceptance/pass-73.json` intentionally has no preview object and leaves incomplete mechanical requirements in `pending`. The acceptance gate must remain red until the final integrated evidence exists.
- Owner public HITL remains explicitly deferred until after protected publication. This is not preview approval and must not be rewritten as one.
- No local or contribution-branch result establishes that Pass 73 is live.

## Falsifiers

- Any copied Pass 72, Pass 70 or Pass 69 byte differs from its pinned Pages blob.
- The wrapper provenance replaces or alters an embedded provenance file rather than using `pinned-channel-provenance.json`.
- Pass 67.1 appears as a chooser card, Pass 63 disappears, or an alias resolves to a different pass than declared above.
- A candidate labels itself Live without `RELEASE_BUILT_AT`, or production retains candidate/public-HITL-pending timestamp text.
- The acceptance manifest names a guessed preview SHA, artifact ID, file count, digest or unrun evidence.

## Final binding sequence

1. Integrate all runtime and release-shell corrections into one exact candidate.
2. Run the complete affected unit, topology, native-browser, hardware WebGPU and cross-browser gates without weakening thresholds.
3. Create the immutable GitHub Actions preview and record its real source SHA, artifact ID, file count, tree digest and creation timestamp.
4. Replace every `pending` mechanical requirement with digest- or artifact-backed `verified` evidence; keep owner public HITL deferred.
5. Commit only the allowed finalizer changes, then run:

   ```text
   node scripts/release/acceptance-gate.mjs --phase ci --impact full --base <base-sha> --head <finalizer-sha>
   ```

6. Require all five repository checks on the exact merge, then dispatch `.github/workflows/release-production.yml` with exact Pass 73 `main` SHA.
7. Accept Live only when the production receipt, Pages SHA, schema 5 topology, cache-busted chooser, every direct route and runtime logs agree.
