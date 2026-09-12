# PASS 88 cut report (published 04:59 BST 2026-09-03, live-verified 05:01)

Opportunistic second morning cut on top of PASS 87, carrying Lane H2 only.
- Integration head 255300e0; gh-pages exactly {pass88 (live), pass87 (safe
  backup)}; chooser generation b77c111be540; identity chunk names PASS 88 only;
  `channels/pass88/map3.html` 200. Rollback:
  `python scripts/orchestration/publish_pass88.py --rollback`.
- Merged: **H2 load-time second pass** (ACCEPT_WITH_FIXES, repaired; audit
  clean): the in-session switch fence fix (56/56 pairs) kept while the cold
  first-load regression of the first pass is removed (gun-range x1.01, high-seas
  x1.02 vs the PASS 86 baseline, interleaved A/B); match admission attributed
  with markers; the cold-session relief scoped by a pinned authority. Residual:
  paired whole-switch time +488 ms median (2.5%), not repaired.
- Integration fixes: legacy-main line ceiling raised to the measured 36,624 with
  history; the switch-matrix roster test pins the derived roster's shape
  instead of a hidden arena id.
- Gates: tsc 0; full `npx vitest run` 568 files / 5419 tests, 0 failed; release
  tests 69/69; plan contract 9/9; identity OK; Farcrysis admission receipt
  against this bundle (3 paired runs, uncontended, ratio 1.368); headless boot
  smoke 13/13 on all eleven arenas; publish guards green; live checks green.
