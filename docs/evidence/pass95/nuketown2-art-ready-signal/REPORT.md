# Pass 95 — Nuketown2 cold-session art-ready signal

## Scope

This lane adds a generic, optional per-arena authored-art contract and wires
`nuketown2` to it. The contract is published on the existing
`window.__ATOMIC_ACRES_DEBUG__.snapshot().render` surface as `arenaArtReady`.
The cold-admission smoke selects the contract assertions at runtime; arenas
without that contract retain the existing `coverageNotes` path.

## Implementation

- **[VERIFIED]** `src/arena-art-ready.ts` defines `arena-art-ready-v1` with
  `authoredArtRootVisible`, `authoredMaterialsResolved`, `streamingSettled`,
  `ready`, and registry counts.
- **[VERIFIED]** The contract derives its material registry by traversing the
  live arena root. It rejects explicit `placeholder`/`fallback` material
  states, rejects pending texture/LUT counts, and rejects the existing
  `asset-loading` sky-backdrop state. There is no arena-name allowlist in the
  contract.
- **[VERIFIED]** `buildNuketown2` publishes the contract for its actual
  authored root. Other arena factories can publish the same optional
  `ArenaMap.artReadyContract`; arenas that do not publish one remain covered by
  the smoke's coverage note.
- **[VERIFIED]** The smoke asserts all three contract fields for a contract
  subject and prints the complete art snapshot per trial.
- **[VERIFIED]** `src/legacy-main.ts` remains exactly 37,396 lines, preserving
  the legacy-main size ratchet.

## Evidence

Base checkout: **[VERIFIED]** `235432d5` (gate-audit fix lane).

Branch: **[VERIFIED]**
`contrib/dave-gaming-pc/claude/nuketown2-art-ready-signal`.

Commits:

- **[VERIFIED]** `0ecbb25d` — `feat(cold): art-ready signal - runtime contract`
- **[VERIFIED]** `ef436584` — `feat(cold): art-ready signal - smoke contract assertions`

Gates:

- **[VERIFIED]** `npm ci` completed successfully.
- **[VERIFIED]** `npx tsc --noEmit` passed.
- **[VERIFIED]** `node --test scripts/qa/cold-admission-art-assertions.test.mjs` passed: 2 tests.
- **[VERIFIED]** `npx vitest run src/arena-art-ready.test.ts src/pipeline-metrics.test.ts src/legacy-main-size-ratchet.test.ts` passed: 3 files, 8 tests.
- **[VERIFIED]** The Nuketown2 contract test uses the real `buildNuketown2` factory and passes both placeholder-not-ready and resolved-ready cases.
- **[VERIFIED]** `npx vitest run src/nuketown2-pipeline-budget.test.ts` preserved the existing base failure: `painted metal: panelled vs plain` in the graph-topology test; 9 of 10 tests passed. No threshold, test, or budget was changed.
- **OPEN** The repository preflight's lockfile check passed, but its branch-name guard rejects the user-required `.../claude/...` branch because that guard requires `.../codex/...`. The branch was not renamed.
- **OPEN** The browser cold-admission smoke was not run. The first-45-minute no-browser rule applied, so no browser or port 4189 admission was attempted.

## Claim-state boundary

**[VERIFIED]** Static/runtime contract wiring and all permitted non-browser gates
are complete. **[OPEN]** A real cold browser trial must still verify the emitted
art lines and WebGPU presentation on the shared machine after the admission
window and lock conditions allow it.
