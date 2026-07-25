# Pass 64 match diagnostics

Pass 64 captures a bounded privacy-minimized ledger in memory during a match and submits only its compact automatic envelope after the match ends. The upload path is HTTP-only and never uses the WebRTC gameplay event or state channels.

Normal post-match delivery uses a credential-free keepalive request and clears an envelope only after the collector returns a valid storage receipt. Failed deliveries remain in a capped four-envelope local queue. A page-lifecycle beacon is only a last-chance attempt and does not clear that queue; idempotency makes a later receipt-bearing retry duplicate-safe.

## Local HITL collection

Run the localhost-only collector in one terminal:

```powershell
npm run qa:pass64:diagnostics:collector
```

Run the game with the collector URL configured at build/dev-server startup:

```powershell
$env:VITE_MATCH_DIAGNOSTICS_URL='http://127.0.0.1:8790'
$env:VITE_MATCH_BUILD_ID='pass64-hitl-candidate'
npm run dev
```

Validated envelopes are appended to the ignored `artifacts/pass64/match-diagnostics.jsonl` file. The collector binds only to `127.0.0.1`, accepts only localhost browser origins, uses the same strict schema and 48 KiB cap as the Worker, and has no read route.

Analyze the collected JSONL without modifying it:

```powershell
npm run qa:pass64:diagnostics:analyze
npm run qa:pass64:diagnostics:analyze -- artifacts/pass64/match-diagnostics.jsonl --json
```

Text output is intended for quick operator review; `--json` emits the same findings as a stable machine-readable report. The default bad-frame gate is p95 greater than `33 ms`; use `--bad-frame-p95-ms 20` when the review machine has a stricter measured budget. The report validates every collector line and envelope, groups results by build/arena/mode/role, and flags health arithmetic or continuity failures, impossible regeneration/death transitions, observable host-canonical reconciliation, evidence truncation, rejected admissions, network loss/reordering, dropped damage, fatal runtime categories, and bad p95 frame pacing.

Output deliberately omits collector receipt IDs, receipt timestamps, idempotency keys, and raw invalid records. Only schema-validated build context and per-match pseudonyms can appear. The command only reads the supplied file; findings never rewrite, truncate, or delete diagnostic logs. Findings are diagnostic rather than a release gate because retained-event truncation can make continuity evidence incomplete.

## Production service and operator analysis

Set `VITE_MATCH_DIAGNOSTICS_URL` to the existing Worker origin when building the reviewed candidate. Apply D1 migrations before deploying the Worker. This contribution does not deploy either surface.

Diagnostics are retained for 30 days. Expired rows are deleted after accepted writes and by the Worker's daily scheduled retention sweep. The public Worker exposes only `POST /v1/match-diagnostics`; `GET` is not implemented. Operators inspect or export retained rows only through authenticated Wrangler D1 commands, for example:

```powershell
npx wrangler d1 execute atomic-acres-leaderboard --remote --command "SELECT receipt_id, received_at, completed_at_minute, build_id, release_pass, backend, arena, mode, role, payload_bytes, payload_json FROM match_diagnostics WHERE expires_at >= unixepoch('now') * 1000 ORDER BY completed_at_minute DESC LIMIT 100"
```

Do not publish exported rows. The stored payload contains no callsigns, chat, room codes, raw peer IDs, installation IDs, IP addresses, credentials, cookies, free text, stack traces, user-agent strings, viewport/device metadata, or long-term device fingerprints.

The 192-event automatic envelope reserves retention for damage, regeneration, death transitions, and rejected admission anomalies before filling remaining space with recent routine events. High-rate accepted state reconciliation therefore cannot evict the health sequence needed to investigate delayed-death reports.

## Residual stale-life protocol gate

The reliable event lane preserves order within one live connection, but current target-health and death results still lack an end-to-end target `lifeId` plus monotonic `healthRevision`. This contribution deliberately does not half-wire those fields. Before claiming stale results are rejected across reconnect, respawn, or class redeploy, add both fields coherently to every authoritative gun, hosted-bot, railgun, legacy-hit, and death result; reset the client revision on a new life; reject mismatched or non-increasing results; and add reconnect/epoch tests.
