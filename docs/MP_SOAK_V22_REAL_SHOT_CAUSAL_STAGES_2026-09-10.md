# MP soak v2.2 QA correction — real-shot reload and causal death stages

This is a separately named QA driver/consumer correction. It is additive and
does not modify gameplay source or the existing v1, v2, or v2.1 consumers,
tests, or reports.

## Contract

The v2.2 reload row requires all of the following evidence for the same
transaction:

- natural respawn and a real safe sky shot, with all peers acknowledging
  carbine ammo `30 -> 29` for a stable 250 ms window;
- the current local protocol intent (string request ID, actor, life, and
  action sequence) correlated to one host admission and one unique host
  commit. Idempotent started/cache-hit retries remain allowed;
- every peer observing the same request and a real `reloading: true` sample
  while its local protocol clock is between that transaction's start and
  commit, followed by agreed carbine ammo `30`;
- an actual node call bracket and final observation completed before the
  unchanged `350ms + 4000ms + ACK` deadline.

The original reload deadline remains `350ms + 4000ms + ACK`. The `350ms` value
is a sample point only; it is not a responsiveness ceiling, and the v2.2
consumer rejects a `<=350ms` claim. The retained global values remain
`299000ms` hard timeout, `120ms` health bound, `180` connected samples, and
`1.5m` position bound. Missing, late-only, stale-request, cancelled,
duplicate-commit, full-magazine, and eventual-ammo-only evidence remains FAIL.

The v2.2 death row requires subject, match epoch, and death-count identity;
authoritative HP `100 -> 0`; sampled HP0/dead stage before any alive stage;
support-life invalidation; an HP0/dead held-new-life stage; final agreed new
life with valid inventory; one health publication revision correlated through
the same subject, epoch, continuity, and author; and captured asynchronous
ordering. Per-recipient outgoing message copies are transport evidence, not
additional canonical deaths. A dead render/support tuple is explicitly allowed
to be non-atomic when the stages are causally ordered. Stale, duplicate,
missing-death, and missing-new-life evidence remains FAIL.

## Evidence and verification state

- **VERIFIED** source worktree: `C:\Users\david\Documents\Codex\2026-09-09\atomic-acres-weekly-audit\work\overnight-mp` at clean HEAD `1f2a77b0fb94b68ca7fedd5ffc8854fb3226c366` before edits.
- **CLAIMED** parent preflight: `20260910T092908030Z` PASS at the same clean
  `1f2a` head; the parent is integrating separately.
- **VERIFIED** supplied numeric reload evidence is schema
  `reload-stage-diagnostic-v1`, runtime SHA
  `62d864c8ef55eef08efd555d3a4d4e3bbb6825df`, driver SHA
  `1f2a77b0fb94b68ca7fedd5ffc8854fb3226c366`, and SHA-256
  `1f448ffc284417e4751edfca807f657f2d53fb96d4591393f7c3eb0ddbf9ac76`.
  It is explicitly scoped as a bounded diagnostic, not soak acceptance.
- **VERIFIED** that supplied evidence records both guest real-shot reloads
  as completed, safe-shot, ammo-acknowledged, and refilled, with zero observer
  drops. Its protocol pattern includes one host admission, one host started
  result, one host committed result, and peer committed observations. The
  v2.2 adapter does not reuse this diagnostic's 5500 ms wait as its full gate.
- **VERIFIED** compact Node coverage includes positive and negative v2.2
  fixtures plus an executed top-level full-driver dispatch regression. The
  retained v1/v2/v2.1 focused Node tests also pass unchanged.
- **OPEN** live v2.2 browser execution and the combined full scenario. They
  were not run in this worker because the coordinator explicitly reserved
  browser/build/heavy execution. The prior full state-aware-v21 attempt FAIL
  remains preserved and is not reclassified.

## Files

The new implementation is limited to the separately named v2.2 driver,
consumer, tests, and this note. The driver is a full v2.1-driver copy: it keeps
the 180-sample replication/rejoin/health/scoreboard/stair/menu/finalization and
live-HTTP-SHA paths, exact `--dist`, and the 299000 ms hard-stop reserve. Only
the causal natural-life and real-shot-after-death scenario calls are replaced.
It reuses the immutable 50 ms reload observer and existing safe-shot/ammo
helpers; it does not introduce a gameplay transition exclusion or a broad
gameplay fix.
