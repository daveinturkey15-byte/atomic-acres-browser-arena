# External-services-off diagnostic isolation

VERIFIED symptom: immutable215bc performance run made a POST to the configured
`/v1/match-diagnostics` collector despite `externalServices=off`; its console
record identifies HTTP400. The failed benchmark is retained unchanged.

VERIFIED cause: legacy-main constructed MatchDiagnosticUploader with the live
endpoint unconditionally. Only leaderboard requests honored the existing URL
policy; diagnostics startup retry, match completion and page lifecycle flushes
therefore bypassed that policy.

VERIFIED correction: apply the same existing leaderboardNetworkEnabled policy
to the diagnostic uploader endpoint at construction. Disabled routes receive an
empty endpoint, which the existing uploader already checks on completion,
pending retry and lifecycle flush. Existing queued evidence is preserved, not
deleted. Ordinary production routes retain their configured endpoint and the
existing fetch/receipt/retry/beacon behavior. No console filter, collector
change, benchmark change or threshold adjustment.

VERIFIED tests: execute the actual production constructor endpoint expression
with the real uploader. Two OFF cases (externalServices=off, multiplayerQa=1)
failed before the fix and passed after. Seeded queues, startup/online retries,
active/completed matches, abandonment and unload produce zero fetch/beacon calls
when OFF; the stored queue stays unchanged. Default and explicit ON cases retain
HTTP400 queueing, unload beacon and successful receipt-bearing retry. Together
with existing uploader, leaderboard and route-contract tests:23PASS. TypeScript
noEmit and diff whitespace check PASS. Preimplementation clean pipeline receipt
20260910T101517698Z at215bc.

OPEN live browser request-count verification of the new frozen build. Source
and unit tests are not a claim that the previous215bc served bytes were fixed.
