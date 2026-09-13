# Reference Catalog — in-repo snapshot

Owner-facing visual bar for Atomic Acres - New World. Generated 2026-09-13 via the
reference-image-catalog pipeline (Codex/GPT-Image renderer, Gemini/GLM vision judging).

- `batch-1/` — v1 proof plates (superseded by batch-1b; retained for comparison).
- `batch-1b/` — v2 identity-fixed weapon plates + first map plate.
- `batch-2-layout/` — layout-locked map plates (LAYOUT_CONTRACT binding).
- `batch-3/` — environment-first fan-out: maps, props, weapon details, experience plates.
- `../plates.json` — formal manifest (id, title, category, map, detail, src, dimensions,
  bytes, sha256, generator) mirroring the astralwar.io/refs plate model.

Rules: never hand-edit a plate; regenerate via the catalog workspace
(`Desktop/stuff/atomic-acres-catalog/`); variants append, originals stay. Provenance for
every plate lives in plates.json (sha256). Desktop preview gallery is view-only convenience,
regenerated from this manifest.
