# Pass 65 combat chaos matrix

## Immutable identity

Require an exact 40-hex Git source SHA, immutable build ID, environment hash, acceptance-manifest SHA-256 digest, impairment-manifest version and SHA-256 artifact digests. Moving URLs, dirty worktrees and missing identities are `not-run`, never pass. Recompute the impairment digest from the frozen version and independent profile oracle rather than trusting a submitted value.

## Required scenario families

- solo host plus bots;
- two-peer private match;
- host, guest and bot;
- respawn/life-epoch/action/revision races;
- weapon ammo/reload/switch/spin-up forgery;
- frag/smoke/flash/bolt duplicate and stale events;
- care reward/double-loot and support pose/input/hit/health forgery;
- shed door/damage/aperture/debris revision forgery;
- reconnect, late join, match end and rematch repair;
- pose-history shots against moving support/dynamic geometry;
- exactly-once health, death, score, reward and consumption.

## Impairment profiles

Freeze named profiles with delay/jitter, loss, duplication, reorder, seed, run duration, event count, repair deadline and expected final hash equality. The staging contract uses one exact moderate-chaos profile and an independent 13-scenario oracle. The runner must report the full profile-by-scenario cross product with no missing, duplicate or extra cells.

## Evidence

Each result names the exact oracle-owned requirement/falsifier IDs, source/build/environment, command or fixture, immutable artifact path/digest, numeric event counts, repair counters/timing, expected and observed state hashes, cleanup/lifecycle counters and derived pass/fail. Relative artifact paths resolve from the matrix file directory and must remain contained after real-path resolution; validators recompute SHA-256 over bounded, non-empty regular files. Late-join and match-end scenarios additionally require numeric repair evidence. Candidate-authored `pass` booleans are not evidence. Timeouts, missing files, traversal or symlink escape, digest drift, cleanup failures, divergence and threshold breaches return nonzero.

Hardware evidence additionally records exact High and Max receipts over all four arenas plus combined stress, OS, browser, adapter/backend, settings hash, resolution, warmup/sample counts and honest CPU/GPU-or-proxy metrics. Each metric carries frozen baseline, absolute and delta thresholds, and observed values that the validator compares numerically. Never label a queue proxy as GPU time.

Run `node scripts/run-pass65-combat-matrix.mjs --self-test` after fixture checks. Its adversarial mutations must all be rejected before the validator can guard a candidate.
