# DRAFT: Menu boot can exceed the 90 s wait after 12 consecutive boots (smoke flake)

Date: 2026-09-03

**Symptom.** At the PASS 92 cut, the terminal MENU boot smoke exceeded its 90 s wait on the first run (12/13 passed) after twelve prior boots in the same run; the standalone re-run passed in 38 s and 13/13 on re-run.

**Cause (SUSPECTED — recorded as a watch item, root cause unknown).** The ledger records it as a smoke flake, not a Terminal fault: "boot smoke 13/13 on native WebGPU (first run 12/13 — the skyline boot smoke exceeded its 90 s wait after twelve prior boots; standalone re-run in 38 s and 13/13 on re-run; WATCH ITEM, not a Terminal fault)." (PASS 92 publish record.) The mechanism behind the accumulated slowness is not yet established.

**Correction.** Treat a failing boot after many consecutive boots as a candidate warm-up/accumulation effect: re-run the failing boot standalone before treating it as a regression, and keep the watch item open until the accumulation mechanism is identified.

**Verify.** Reproduce by running the menu-boot smoke 12+ times in one session and checking whether boot N+1 times grow with boot count; if the standalone re-run consistently passes while the in-sequence run times out, the flake is sequence-related and the 90 s wait for late boots needs a warm-up-aware allowance rather than a blanket raise.
