# Vehicle allocation contract reconciliation

VERIFIED 2026-09-12: two old allocation assertions stopped the fixture audit
before its remaining physical checks ran. Their historical values are retained
verbatim in the test as diagnostic evidence, rather than replaced with current
output values.

| Fixture | Historical triangles | Observed triangles | Unchanged cap |
| --- | ---: | ---: | ---: |
| Coach | 9988 | 9576 | 10000 |
| Truck cab fixture | 5900 | 5816 | 6000 |
| Saloon fixture | 8288 | 8200 | 9000 |

The original allocations came from0c871bbe4d; the coach count was later changed
byf83acdd805. Subsequent authored changes include coach front glazing and its
four-sided frame (b2928c6f8), grille exposure and dark backing (eee248764), and
attached saloon gutters (81c5e129a). Geometry allocation reductions also have
separate surface/normal-field regression tests. These are source-history facts,
not claims that all those revisions were owner approved.

Current tests require all nine material buckets and exactly one draw per bucket.
They independently count the emitted triangle buffers and reconcile them with
every pre-merge part, bucket, named allocation and total. Negative controls must
reject an understated total, inflated bucket count, omitted named allocation and
lost emitted triangle. The original family caps and draw limits remain required.
Every existing exact detail-family allocation remains asserted except the old
three-sided coach frame: its replacement must have two full-height side rails
and two horizontal rails meeting the actual glazed cap heights. Each rail must
remain a closed12-triangle box. The old36-triangle value remains in a comment.

The accounting correction exposed a previously unreachable failure: the new
saloon gutter tags had no relief value. Their actual nominal24mm cross-section
depth is now recorded from the existing12mm half-depth. Geometry, attachment,
materials and authoritative collision are unchanged. The existing4-30mm relief
and underbody limits remain asserted, as do the separate gutter attachment and
winding checks.

OPEN: these fixture checks do not certify the arena's larger dressing. The
actual arena census still counts the truck bogie under its cab anchor and
reports8024/6000 for the truck and9102/9000 for the two coupes. No cap, shot
authority, allocation exception or accepted ledger entry was changed.

Evidence: `artifacts/pipeline/completion-allocation-survey.json`, extracted from
the existing fixture declarations without changes; `completion-allocation-checks.log`.
The first check after migration failed on missing gutter relief; that failure
was retained until the metadata defect was corrected.

VERIFIED: 51 focused checks across six files and full lint passed. An independent
comparison against the committed pre-change builder found all 111 attribute
buffers, covering 70,776 vertices in three products, byte-identical. Receipt:
`artifacts/pipeline/completion-gutter-metadata-identity.json`.
