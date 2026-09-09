# Complete-history reconciliation correction

VERIFIED: current main was 0dd95943e5eb4ac9cc0dd7c3a47baa2b338c7a88;
PASS96 integration was 6f035cf8baecf2a48f26ff476245304b1d29b8c6.
An independent integration repository was created from exact main after preserving every
registered ref/worktree HEAD and eligible dirty source. Original working trees and the
original shared repository's shallow metadata were not changed.

## Observation and correction

VERIFIED: the original repository reported `git rev-parse --is-shallow-repository` true,
with 20 boundaries. All 20 raw commit headers contain parents and every immediate parent
object is available locally. Example: 13addcbab123f7b74f5ef3308a8d08eae3b4d38d has parent
28b49446d55c711442fd4138e93c035191eab1a4. Thus `rev-list --max-parents=0` in that shallow
view does not prove an orphan import. The prior inventory is retained byte-for-byte in
`docs/recovery/ancestry-roots-shallow-inventory-20260906.json`, not silently erased.

VERIFIED: an isolated complete-history view traverses 69,965 available objects without
missing objects. Both source tips reach actual root f7efdafc3ea9ff3d49f142ac39f52e1fe619f35a;
its raw commit object has no parent. Merge-base is 506d6142ce09b8317279a8c705d2de25fa2ab84b,
not Pass64. The actual divergence is 2 main-only / 1,834 candidate-only commits. The
normal merge conflicts in one documentation file, not the shallow view's 395 paths.

VERIFIED: the coordinator independently inspected the raw parent, actual root and 2/1834
divergence and approved this factual inventory correction on 2026-09-09. This does not
authorize new roots, a lossy merge, production publication or acceptance fabrication.

## Regression protection

The new inventory refuses shallow repositories explicitly and checks raw parent headers.
A synthetic child marked shallow reproduces the false-root observation and is refused.
A separate actual orphan joined to a fixture graph is still rejected by the existing
reconciliation guard. The checked-in allowlist must equal complete observed ancestry.
All existing merge-shape, unlisted-root and owner-acceptance assertions remain active.

RED evidence before correcting the inventory: `vitest run src/ancestry-inventory.test.ts`
reported 1 failed / 2 passed: the 15 recorded cutoffs disagreed with the one actual root.
Green results are recorded separately after the correction; no historic empty output is
being represented as a successful test.

## Recovery gotcha

Symptom: `git bundle verify` says complete, but an ordinary clone cannot traverse a parent.
Cause: the source is shallow; the bundle exports that bounded graph without conveying all
boundary semantics needed by a standalone clone. Correction: retain the original shallow
sidecar and verify an independent bounded restore; separately reconstruct complete history
from available objects without mutating the owner's repository. Verify: inspect raw parents,
check for missing objects, require no alternates/shallow file in the final independent
clone, run connectivity checks, and compare exact refs and source trees.

OPEN: historical notes attributing these boundaries to orphan creation require correction
when reused. This record does not establish why or when the shallow file was introduced.
No acceptance or preview approval follows from restoring ancestry.
