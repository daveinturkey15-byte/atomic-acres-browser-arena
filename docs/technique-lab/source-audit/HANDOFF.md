# HANDOFF — sources-night-20260912 (waves 1+2)

## WAVE 2 (2026-09-12, OMP/muse-spark-1.3-contributor — call 2 of 3)

Branch `contrib/dave-gaming-pc/omp/sources-night-20260912`, HEAD still `6e9b2caf` (verified), base contained.
Tree: clean + exactly the 3 allowed untracked lane dirs (`docs/technique-lab/source-audit/`,
`public/assets/skills-lab/`, `scripts/technique-lab/source-audit/`). Preflight contribute-mode refuses
SOLELY on those 3 paths (guard line 227); no foreign writes. AKP check PASS (OMP trusted, control digest
`628f270a…`, matches wave 1); audit GREEN (`trusted_rows=5`, ambers are other-machine receipts only).
Power plan not re-checked this wave (no GPU/CPU lane work; wave-1 High-performance stands).
No commit/push/merge/deploy. No nested agents, no provider calls, no GPU/browser/Vite/vitest.

### Catalog corrections (7 rows, all 50 IDs preserved, validator PASS)

- Row 48 `implemented` → `method-extracted`, mapping `implements` → `informs`: no lab demo executes the
  value-composition method (demo.status absent). REVIEW FLAG for root.
- Row 45 `implemented` → `method-extracted`, mappings `implements` → `informs` ×2: the ADOPT decision +
  pinned supply route are recorded, but no bounded generation was executed under this row. REVIEW FLAG —
  reversing needs execution evidence (generated asset + provenance), not argument.
- Row 7 interior cross-ref `informs` → `candidate`: the skill body was not re-read; now carries a re-verify pointer.
- Row 42 `candidate` → `informs` (mapped skill read in full this lane) + complete per-member file licence
  census (6 urls + 6 evidence entries added).
- Rows 33/38: re-pin evidence naming HEAD `b82e823` (2026-09-01, MIT LICENSE added) over pin `e417c04`
  (2026-08-23); existing pins kept, adoption-time re-pin now names its target.
- Row 46: public feature-page physics terms added (docs root fetched); bubble-backscatter term honestly
  marked register-only.
- `updatedAt` → `2026-09-12 (wave 2)`; change rationale appended to `adapterNotes` in-file.

### Validator V1–V5 (all green; gates proven, not just passing)

- V1: `implemented` requires an executing demo (`implemented`/`delivered`) — negative-tested (row-2 probe fails, restored).
- V2: live demo under non-implemented status requires a `limitations` justification (rows 3/5/11/21/36 carry theirs).
- V3: `informs`/`implements` must not carry an unverified caveat — negative-tested (row-8 probe fails, restored).
- V4: `candidate` must carry a re-verify pointer — FIRED ON REAL DATA (row 7 demotion lacked one; fixed, green re-run).
- V5: every `blocked` row names its alternate path (all 9 do; green run exercises it).
- Public-safety scan still clean (new URLs are public https only; no local paths/creds/transcripts).

### Source evidence fetched this wave (read-only; sources treated as data, no embedded instruction followed)

| Source | Observation |
|---|---|
| GLM brief + host root | Re-fetched verbatim (406 lines, §§00–07 match wave-1 recovery); root still resolves to the same brief — separate kitchen prompt + followup STILL NOT LOCATED (see GLM-BRIEF-RECOVERY.md §4) |
| super-terrain commits API | HEAD `b82e823` 2026-09-01; 4 post-pin commits (foliage sheen 789236b, firefly rejection ac507c3, material octaves 406b229, scatter rock b82e823); pin `e417c04` dated 2026-08-23 |
| super-terrain LICENSE @ HEAD | MIT (2026 alightinastorm), full text read — licence ADDED upstream after the pin |
| Shelf: ggez / three-roads LICENSE | MIT, full texts read |
| Shelf: three-maps / freed LICENSE.md | MIT-style grants, full texts read (API licence field: MIT for both) |
| Shelf: vibeviz LICENSE.md | MIT-style grant, full text read — closes the prior "must be file-verified" gap |
| Shelf: fenix root listing | No licence file of any name — register NO-LICENCE finding stands, stays excluded |
| Water Pro docs root | Feature description read; restatable terms in catalog row 46 |
| Central register shelf section | Member names + 2026-08-31 file readings — evidence, not authority |

### Tests actually run

- `node scripts/technique-lab/source-audit/validate-catalog.mjs` → PASS (50 sources, schema v1, wave-2 stamp).
- V1/V3 negative probes → both FAIL as designed, file restored, final re-run PASS.
- `node -e JSON.parse(...)` on the catalog → JSON-OK.
- `git status --porcelain` → only the 3 allowed untracked lane dirs; nothing references `source-catalog.json` outside this lane (wave-1 grep stands, no new consumers added).
- NOT run (forbidden/out of scope): Vite build, browsers, GPU rendering, full vitest, tsc on sibling code.

### OPEN items + root next actions

1. REVIEW FLAGS: rows 45/48 downgrades — confirm, or reverse with execution evidence (demo run / generated asset + provenance).
2. Kitchen prompt + owner followup still unlocated — interiors lane should request the URL from Dave.
3. Fable URL-tab binding + embed allowlist (catalog still emits link fallbacks only, no `embedUrl`).
4. Remaining `candidate` mappings (rows 26/36/40/49): skill bodies not read this lane — verify before ingestion (V4 enforces the pointer).
5. super-terrain re-pin to `b82e823`+ with licence file-read at adoption moment (rows 33/38).
6. Row 45 Comfy-Org repackage licence discrepancy: re-verify at install time (carried).
7. All pixel/visual acceptance stays OPEN; row 32 weight pins outstanding (carried).

---

# HANDOFF — sources-night-20260912 wave 1

Owner: OMP/muse-spark-1.3-contributor. Branch `contrib/dave-gaming-pc/omp/sources-night-20260912`,
base 6e9b2cafd318ca2b2f67f9eedcf8d624fee30453. NO commit/push/merge/deploy (per dispatch).
AKP check PASS (OMP trusted), audit GREEN (ambers are other-machine receipts only).
Preflight: routed (`sources-night-20260912`, registry dave-gaming-pc, lane expiry 2026-09-13T08:00+01:00).
Power plan: High performance (verified).

## Exact files / output (all inside the allowed patterns)

- `public/assets/skills-lab/source-catalog.json` — PUBLIC-SAFE catalog, schema v1, 50/50 sourceIds,
  SPEC schema (`sourceId,title,urls[{url,kind,label}],skillMappings[{skill,sourceReference,relation}],
  status,method,adaptation,blocker?,evidence[{url,pin?,inspectedAt,observation}],demo,limitations[]`).
  No embedUrl in wave 1 (link fallback everywhere); public-safety scanned (no local paths/creds).
- `scripts/technique-lab/source-audit/validate-catalog.mjs` — schema + 50-ID + blocker-completeness +
  public-safety gate. PASS.
- `docs/technique-lab/source-audit/GLM-BRIEF-RECOVERY.md` — recovered GLM restaurant/bar brief
  (fetched verbatim), kitchen extraction for interiors, honest unknown on a separate kitchen prompt.
- `docs/technique-lab/source-audit/METHOD-RANKING.md` — deep-read ranking for houses / interiors /
  lighting / nature / weather with explicit non-ranked rows.
- `docs/technique-lab/source-audit/SKILL-USE-RECEIPT.md` — full skill hashes, inspected sources,
  applied techniques, changed outputs, pending validation.
- `docs/technique-lab/source-audit/HANDOFF.md` — this file.

## Tests actually run

- `node scripts/technique-lab/source-audit/validate-catalog.mjs` → PASS (50 sources, schema v1).
  Two defects found and fixed during the run: an extra `}` closing source 36 early, and a missing
  top-level `updatedAt`. Both verified fixed by the green re-run.
- `git status --porcelain` → only the three allowed paths, all new files; no sibling writes.
- Targeted grep → NOTHING outside this lane references `source-catalog.json` yet: Fable's URL tab
  cannot break on this file today.
- NOT run (out of scope / forbidden): Vite build, browsers, GPU rendering, full vitest, tsc
  (my files are one `.mjs` + JSON + markdown; the `.mjs` executed clean under node 24).

## Checkpoint status vs SPEC

- Checkpoint 1 (all-50 URLs mapped with honest unknowns): DONE. 7 blocked rows (5, 15, 24, 30, 32
  + 25/46-release-blocked + 36-paid-tool + 43-paper-only — see catalog for exact per-row status),
  1 alias (21→19), 5 comparators (3, 14, 17, 22, 44), 1 archive (37). Every blocked row carries
  cause + unblock action + smallest experiment + pass/fail test + resources + alternate.
- GLM kitchen prompt + followup: PARTIAL (honest). Restaurant/bar prompt recovered verbatim with
  kitchen extraction; separate kitchen prompt + followup NOT located anywhere searched
  (repo/docs, group research, AKP register, vault register + Agent-Memory, brief host).
  Interiors lane should request the URL from the owner rather than accept a reconstruction.

## Unresolved falsifiers / needed root wiring

1. URL-tab binding (Fable): bind the tab to `public/assets/skills-lab/source-catalog.json`; decide
   the embed allowlist (wave 1 emits link fallbacks only).
2. Skill-relation verification: 6 `candidate` mappings (rows 26, 36, 40, 42, 49 + row 7 interior
   cross-ref) were NOT verified against those skill bodies — re-read before ingestion.
3. Row 45 repackage licence discrepancy (Comfy-Org repos vs announcement wording) must be re-verified
   at install time.
4. Row 38/33 re-pin (forest work postdates the pin); row 32 weight pins outstanding.
5. All lab-demo pixel validation remains OPEN (prior lanes' standing condition); root inspects
   runtime + visuals before acceptance.

## Next best improvement (wave 2, ~45 min)

Deep-fetch the top-ranked unread bodies this lane did NOT re-fetch (rows 48 post detail, 46 licence-adjacent
physics description, 40 Voxpolia descriptions, row 42 shelf repos' licence files), promote the 6
`candidate` mappings to `informs`/`compares` or drop them, and add `embedUrl` ONLY for allowlisted
embeds with per-embed fallback proof. Do not widen scope to editing skills or sibling outputs.
