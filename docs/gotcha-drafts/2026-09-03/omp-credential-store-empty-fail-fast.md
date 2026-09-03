# DRAFT: OMP credential store can come back empty; jobs must fail fast on "No API key found"

Date: 2026-09-03

**Symptom.** Overnight on the PASS 92 build, the OMP 18.1.1 main-profile credential store (`agent.db`) was found empty — 0 credentials, 0 settings — sometime after 18:33 while the last GLM job still ran, and the chained jobs then failed with auth errors instead of surfacing a clear failure.

**Cause (SUSPECTED — the ledger records "Cause unknown").** The credential store was wiped after 18:33 for an as-yet-unidentified reason; the ledger itself flags the root cause as unknown: "OMP 18.1.1's main-profile credential store (agent.db) is empty (0 credentials, 0 settings), wiped some time after 18:33 when the last GLM job still ran. Owner must `/login` zai and google-antigravity in OMP again; the chain relaunches unchanged afterwards. Cause unknown - gotcha to follow once it is." (PASS 92 publish record.)

**Correction.** Every OMP job must check for "No API key found" (or the equivalent 401/auth failure) and fail fast with that exact cause rather than retry-looping against an empty credential store; the chain relaunches unchanged once the owner re-logs in. Follow-up: capture the root cause of the wipe when it is found and fold it into this note.

**Verify.** Run one OMP job against a known-empty credential store and confirm it reports the missing-credential error immediately (one attempt, no loop); after `/login`, the same chain relaunches green without configuration changes.
