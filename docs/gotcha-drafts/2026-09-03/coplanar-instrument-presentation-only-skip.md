# DRAFT: Coplanar instrument silently skipped all presentationOnly meshes ("skipped: 0")

Date: 2026-09-03

**Symptom.** The coplanar instrument's audit reported a clean result while actually skipping every `presentationOnly` mesh — the output read "skipped: 0" and the skipped meshes (lawn field, forest ring, mountains: 16 meshes) were invisible to the audit, so a green instrument result was misleading.

**Cause (VERIFIED).** The instrument's mesh filter excluded `presentationOnly` meshes before counting, so they vanished from the audit entirely instead of appearing as a known-skipped population. Ledger evidence (HF-443, Opus review of the geometry branch): "The coplanar instrument no longer silently skips the lawn field, forest ring, and mountains (16 meshes listed as UNAUDITED instead of "skipped: 0")."

**Correction.** The instrument must enumerate every skipped mesh as UNAUDITED with its name, never fold them into a zeroed skip counter; any mesh population the audit cannot cover must be visible as a named gap in the report.

**Verify.** Re-run the coplanar-instrument audit on the Nuke Town Rebuild branch: the 16 presentationOnly meshes (lawn field, forest ring, mountains) appear as UNAUDITED entries, the "skipped: 0" silent-skip output is gone, and the HF-443 gate set ("coplanar-instrument audit, `npm run test:pass65` + `npm run check`, fresh nuke-town-2 contact sheet in both profiles") passes.
