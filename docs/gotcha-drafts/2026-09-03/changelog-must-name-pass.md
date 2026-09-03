# DRAFT: Changelog title/summary must name the pass (HF-406 identity rule)

Date: 2026-09-03

**Symptom.** At the PASS 92 cut, the release identity checks failed because the changelog's title/summary did not name the pass being published, even though the underlying gates were untouched.

**Cause (VERIFIED).** The HF-406 identity guard requires every rendered identity surface — including the changelog title and summary — to name the pass; a changelog that names no pass fails the identity surface check. Ledger evidence (PASS 92 publish record): "Two content fixes, no gate touched: the changelog title/summary must name the pass (HF-406) and the pre-existing weapon-name regex caught a QA comment in `src/map3/street-cell.ts`."

**Correction.** Name the pass in both the changelog title and the summary before cutting; the same rule that guards the rendered identity surface (root 200/200, retired roots, identity chunk, changelog panel) applies to the changelog strings.

**Verify.** The identity gate at the PASS 92 cut: "identity 543 files / 5,151 passed, 0 failed" on the built head, and the publish script's post-state assertion. Any future cut whose changelog title/summary does not name the pass must fail before publish, not after.
