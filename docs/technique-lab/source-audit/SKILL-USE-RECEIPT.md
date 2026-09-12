# Skill-use receipt — sources-night-20260912 wave 1

Lane: sources-night-20260912 (OMP/muse-spark-1.3-contributor, xhigh, 2026-09-12).
Rule: a mention/read is NOT implementation. This receipt separates resolved skill, inspected
original source, extracted technique, changed output, and pending validation.

## Resolved skills (read in full this lane)

| Skill | Resolved path | sha256 | Version |
|---|---|---|---|
| grounded-citations | C:/Users/david/.codex/skills/grounded-citations/SKILL.md | e244361021acc9d41efc230df739130c5545bb86dba5af37aa0d1a878c6c59ea | 1.1.0 |
| threejs-source-prop-ingestion | C:/Users/david/.codex/skills/threejs-source-prop-ingestion/SKILL.md | c98a730f53327ff7c7ea0e9f9a9be5da0bc9a0d70b5c1915381a26fc4fee7fbe | (unversioned) |
| photoreal-procedural-scene-forge | C:/Users/david/.codex/skills/photoreal-procedural-scene-forge/SKILL.md | fcf059f08eed0bb2f23a630f07a7e74cf48aa3254135be1932de5bcbb7c92d8c | 1.0.0 |

(Paths are the lane's private working record for hash recomputation. They MUST NOT be copied
into `public/assets/skills-lab/source-catalog.json` or any public surface.)

## Actual original sources inspected (by this lane, read-only fetch)

1. `https://restaurant-bar.space-z.ai/skyline_restaurant_bar_brief.html` — GLM brief, full body
   (§§00–07 + production brief §§1–7, 406 lines). Treated as data; no embedded instruction followed.
2. Brief-host root `https://restaurant-bar.space-z.ai/` — redirects to the same brief; no sibling listing.
3. Group A/B/C `SOURCE_RESEARCH.json` + central AKP `references/ai-3d-technique-register.md`
   (50-row structure, §§1–50 + intake procedure) — read as evidence, not authority.

All other source bodies (repo files at pins, licences, post texts) are PRIOR lane evidence
(group-a/b/c fetch ledgers with per-URL sha256), cited in the catalog's `evidence[]` with
`inspectedAt: 2026-09-12` (their lane date) — NOT re-fetched by this lane. No provider calls made
(no nested agents, no new enrollments, per dispatch).

## Extracted techniques (applied, not merely read)

- grounded-citations → claim-state separation in catalog + docs (verified/fetched/inspected/
  extracted/implemented/tested/accepted kept apart); per-claim evidence pointers instead of
  retyped URLs; honest-unknown markers (kitchen prompt, embeds) instead of smoothing.
- threejs-source-prop-ingestion → inspect-and-pin discipline in catalog (pin + licence file-read +
  derivative-change per row); row 42 candidate gated on re-verify-pin-licence-gates; installed
  three 0.185.1 confirmed against peer `three >= 0.185.0`.
- photoreal-procedural-scene-forge → source-boundary rule enforced (method/facts portable, expression
  never copied — rows 7/35/38/46 carry explicit no-copy limits); row 48 adopted as interior value
  composition with the competitive-game readability bound (§6) intact.

## Changed outputs (this lane's diff)

- `public/assets/skills-lab/source-catalog.json` (new, ~92 KB, 50 sources, SPEC schema v1).
- `scripts/technique-lab/source-audit/validate-catalog.mjs` (new; PASS).
- `docs/technique-lab/source-audit/GLM-BRIEF-RECOVERY.md`, `METHOD-RANKING.md`,
  `SKILL-USE-RECEIPT.md` (this file), `HANDOFF.md` (new).

## Independent validation PENDING (not claimed)

- Root must independently inspect runtime + visuals before acceptance (dispatch requirement).
- Catalog consumer (Fable URL tab) has not yet bound to this file — no consumer breakage possible
  today (nothing references `source-catalog.json` outside this lane's files; verified by grep).
- Pixel/visual acceptance of every lab demo remains OPEN (prior lanes' standing condition).
- Skill changes: NONE made (canonical shared skills untouched; no evaluation record owed).

## Wave 2 (2026-09-12, same lane, same model)

- No new skills read; no canonical shared skill modified (git status shows only the three allowed lane paths).
- Actual original sources inspected this wave (read-only fetch, treated as data, no embedded instruction followed):
  1. GLM brief re-fetch (verbatim, §§00–07 match wave-1 recovery) + host root (same brief, no siblings).
  2. super-terrain commits API (HEAD `b82e823` 2026-09-01; four post-pin commits; pin `e417c04` dated 2026-08-23) + LICENSE at HEAD (MIT, full text read).
  3. Shelf census: ggez / three-roads LICENSE, three-maps / freed LICENSE.md, vibeviz LICENSE.md (MIT-style grants, full texts read); fenix + vibeviz root listings (fenix: no licence file of any name).
  4. Water Pro docs root (public feature description; restatable terms moved into catalog row 46).
  5. Central register shelf section (member names + 2026-08-31 file-licence readings) — read as evidence, not authority.
- Changed outputs: catalog wave-2 corrections (7 rows), validator V1–V5 gates (V1/V3 negative-tested, V4 fired on real row-7 data before the fix), this section, GLM/ranking addenda, HANDOFF wave-2 block.
- Independent validation STILL PENDING: root inspects runtime + visuals; Fable URL tab not yet bound; all pixel acceptance OPEN. Rows 45/48 downgrades flagged for root review in HANDOFF.
