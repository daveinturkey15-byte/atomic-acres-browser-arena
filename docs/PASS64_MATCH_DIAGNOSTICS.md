# Pass 64 match diagnostics

Pass 64 captures a bounded privacy-minimized ledger in memory during a match and submits only its compact automatic envelope after the match ends. The upload path is HTTP-only and never uses the WebRTC gameplay event or state channels.

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

## Production service and operator analysis

Set `VITE_MATCH_DIAGNOSTICS_URL` to the existing Worker origin when building the reviewed candidate. Apply D1 migrations before deploying the Worker. This contribution does not deploy either surface.

Diagnostics are retained for 30 days. Expired rows are deleted after accepted writes and by the Worker's daily scheduled retention sweep. The public Worker exposes only `POST /v1/match-diagnostics`; `GET` is not implemented. Operators inspect or export retained rows only through authenticated Wrangler D1 commands, for example:

```powershell
npx wrangler d1 execute atomic-acres-leaderboard --remote --command "SELECT receipt_id, received_at, completed_at_minute, build_id, release_pass, backend, arena, mode, role, payload_bytes, payload_json FROM match_diagnostics WHERE expires_at >= unixepoch('now') * 1000 ORDER BY completed_at_minute DESC LIMIT 100"
```

Do not publish exported rows. The stored payload contains no callsigns, chat, room codes, raw peer IDs, installation IDs, IP addresses, credentials, cookies, free text, stack traces, user-agent strings, viewport/device metadata, or long-term device fingerprints.
