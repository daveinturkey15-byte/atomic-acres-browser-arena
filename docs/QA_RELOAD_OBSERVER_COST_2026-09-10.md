# Reload observation must not starve its subject

VERIFIED symptom: same-PC three-peer 120ms RTT/1% loss diagnostic sometimes
rejected a first post-respawn shot as stale. One retained rejection was289.946ms
old; the original250ms plus bounded uncertainty policy was correctly enforced.

VERIFIED cause found in the test: its50ms observer called the full game snapshot,
which performs the actor/scene census. In enamel-reload-wire01, changed-row reads
averaged47.8-48.2ms and reached62.8ms. Its shot calls themselves took4.7-6.5ms.
The existing samplePlayerPose comment already documented this general hazard.
This does not prove every delay in all earlier runs had the same cause.

VERIFIED correction at be3a0bfbb86b6db6c57ef65a99af39d8c8955fa8:
sampleReloadSubject reads only the existing player/remote, score, inventory and
life fields. The observer compares its projection with the old full snapshot
once at setup and refuses mismatches, then polls the thin projection at the
unchanged50ms interval. It retains sampled time brackets, limits, shot counters
and rejection reasons. No input, timing limit, authority, gameplay or retry policy
changed. Typecheck/build,11 focused Node tests and final preflight pass.

VERIFIED fresh lightweight-reload01 on exact be3a runtime: both guests' actual
shots were accepted, all peers acknowledged the spent ammo, reload refilled and
there were no extra deaths. Mean observer reads were0.008-0.016ms; max0.1ms.
Host shot ages were148.720ms and137.622ms. Normal browser cleanup and exit0.
Evidence: artifacts/qa/lightweight-reload01 and lightweight-reload-freeze.json.

OPEN full soak, repeated reliability and WAN. Do not relabel historical failures
or generalize this scoped result to friends' internet connections. Other hot
callers of the full snapshot still need measured review, not a blanket rewrite.
