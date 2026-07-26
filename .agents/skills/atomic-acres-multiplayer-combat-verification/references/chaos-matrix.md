# Pass 65 combat chaos matrix

## Immutable identity

Require full source SHA, immutable build ID, environment hash, acceptance-manifest digest, impairment-manifest version and artifact digests. Moving URLs, dirty worktrees and missing identities are `not-run`, never pass.

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

Freeze named profiles with delay/jitter, loss, duplication, reorder, seed, run duration, event count, repair deadline and expected final hash equality. The runner must report each profile/scenario pair and fail missing cells.

## Evidence

Each result names requirement/falsifier IDs, source/build/environment, command or fixture, immutable artifact digest, expected/observed values and pass/fail. Timeouts, cleanup failures, missing evidence, divergence and threshold breaches return nonzero.

Hardware evidence additionally records OS, browser, adapter/backend, settings hash, resolution, warmup/sample counts and honest CPU/GPU-or-proxy metrics. Never label a queue proxy as GPU time.
