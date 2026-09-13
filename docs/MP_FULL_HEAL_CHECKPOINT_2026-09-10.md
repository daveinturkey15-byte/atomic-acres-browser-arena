# HF-535 full-heal observer checkpoint

Impact: runtime. Scope: host health publication only; same-life observer clamp,
authorship, epoch/life/revision fences, movement admission and packet schema remain
unchanged. Base118e8e3cfc117d3e829722fbba1151d498d2294e. Root independently reviewed
the observed mechanism and approved this bounded correction before implementation.

## Symptom -> cause -> correction -> verify

VERIFIED symptom: the actual three-peer Nuke Town soak on exact118e completed
180072ms with zero console/page errors but failed replication and rejoin-damage
gates. An additional finalsample179 showed host100/subjectguestB100/observerguestA80
after damage had converged to80 on allthree peers atsample106. Original bundle
SHA25663b217115fda99ba270b6cb490f1aae24c213400f957a8d3f55770bf48651467 and table
SHA256ad4f858f8fa4f0c24ab4702fdd4211579dd15a2522cc03d730d16642a9a0dbb0 are retained
outside disposable QA output under the coordinator's aa-visual-run evidence.

VERIFIED cause mechanism: direct execution of the unmodified publisher with a
completed damagefact80, then currenthealth100, produced no new message. Its
watermark advanced to100 but the observer retained80. The same-life clamp still
reduced an admitted100HP movement snapshot to80. The old comment claiming relayed
state carries regeneration was therefore incompatible with the later clamp.

VERIFIED correction: a living subject reaching exactly clamped fullhealth100
from a lower publisher watermark mints one new revision. The existing three-copy
budget retries that revision; remaining100 does not mint per-frame facts. This
also supersedes a damage fact whose copies are still pending. A later damage drop
gets the next revision. No heal is inferred from an untrusted/stale movement
snapshot and no self-heal bypass is introduced.

VERIFIED focused evidence: new host-health-full-heal.test.ts first ran against
unchanged118e production and failed4/5tests (dead-authority fence passed). After
the minimal repair, all70tests across that file, host-health-authority-broadcast,
remote-snapshot-reconciliation and guest-respawn-lifecycle passed. Evidence:
full-heal-red.json and full-heal-green.json in coordinator aa-visual-run.
The new chain covers publication -> real observer admission -> real state clamp,
partial regen silence, pending damage copies, bounded duplicate emission, later
damage, forged author, stale epoch/life/revision, newer-life hold and dead authority.

## Explicit unresolved limits

- OPEN full-heal recovery still requires a new exact-candidate real-browser
  receipt. Unit tests do not grant runtime acceptance.
- OPEN partial-regeneration convergence is not fixed: observers can retain the
  lower damage value until the full-heal checkpoint. No per-tick regen flooding.
- OPEN mintHealthAuthoritySeed reads mutable published.hp while the publisher's
  partial-regeneration watermark can change without a new revision. That existing
  same-revision seed payload concern is separate; this patch does not claim to
  resolve all revision/payload consistency.
- VERIFIED three copies35ms apart with nominal60ms one-way impairment correspond
  to60/95/130ms before scheduling overhead, not allwithin120ms. The source comment
  is corrected; latency acceptance still comes only from the unchanged browser gate.
- OPEN this patch does not claim to repair the previous37replication events or
  rejoin firstSeen guestB159ms/guestAnull. Original failures remain failures. No
  thresholds, timeouts, assertions, counts or baseline artifacts are weakened.
