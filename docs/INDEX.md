# Documentation index

## Current development

- [Pass 54 wall penetration specification](PASS54_WALL_PENETRATION_SPEC_2026-07-22.md) - canonical FMJ-like material, weapon, distance, angle, multiplayer-authority, and future-asset coverage rule.

## Current release

- [README](../README.md) — product overview, controls, setup, and current Pass 52 summary.
- [Pass 52 specification](PASS52_RECONCILED_MULTIPLAYER_CHANGELOG_SPEC_2026-07-21.md) — current product contract.
- [Pass 52 release record](PASS52_RECONCILED_MULTIPLAYER_CHANGELOG_RELEASE_2026-07-21.md) — release-facing implementation notes.
- [Verification and release hygiene](VERIFICATION_AND_RELEASE_HYGIENE.md) — canonical local/CI gates, portability, provenance, and legal-distinction rules.
- [QA release verification plan](QA-RELEASE-VERIFICATION-PLAN.md) — broader evidence and release-check strategy.

## Historical passes

The other dated pass documents in this directory are an implementation archive. They are evidence of the route to the current build, not independent sources of current product truth. When an older document conflicts with Pass 52 or the executable tests, use the current Pass 52 documents and tests.

## Asset sources and licensing

- [Art asset guide](../ART_ASSET_GUIDE.md)
- [Asset manifest](../assets.manifest.json)
- Third-party runtime license/readme files live beside their assets under `public/assets/third-party/`.
- Rejected candidates remain under `third-party-candidates/` and are excluded from the release tree.
