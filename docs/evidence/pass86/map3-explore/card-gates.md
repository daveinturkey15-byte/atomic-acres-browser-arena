# PASS 86 — Map 3 EXPLORE card: the gates that moved with it

Worktree `C:/Users/david/projects/aa-map3`; gates re-run in the clean worktree
`C:/Users/david/projects/aa-map3-laneV-verify` because `aa-map3` carries another
lane's uncommitted HF-412 work (`src/operator-model.ts` imports `./prone-transition`,
which does not exist there) and therefore does not typecheck.

## What the card cost, and how each cost was paid

Ten assertions in six files pinned `map3` hidden. None was weakened; each was
re-pointed at the truth.

| File | Was | Now |
|---|---|---|
| `src/map-selection.ts` | `selectable: false` | `selectable: true`, and a new REQUIRED `kind: 'team' \| 'explore'` field on every one of the nine registry rows |
| `src/spawn-layout-quality.test.ts` | "every other selectable arena is held to team separation" | reads the declared `kind`. An explore arena skips team separation (it has no second table) **and must prove** `multiplayer === false`, `soloBotCount === 0`, `maximumSoloBots === 0`, `fieldSupport === false`, `arenaFieldsBots() === false`, `arenaRunsTeamModes() === false`. Plus a new test pinning the explore set to exactly `['map3']`. |
| `src/arena-selectability.test.ts` x2 | hidden set `{farcrysis, map3}` | `{farcrysis}`; map3 asserted offered, `kind === 'explore'` |
| `src/map-selection.test.ts` | "keeps Map 3 a real solo-preview arena while its card is withdrawn" | "offers Map 3 as an explore arena, with no lobby, no bots and no clock pressure" |
| `src/ui/pass64-shell.test.ts` | `not.toContain('data-arena-route="map3"')` | `map3` last in the ordered player-facing routes |
| `scripts/qa/cross-browser-gate-contract.test.mjs` x2 | floor `>= 7`, map3 in the hidden set | floor `>= 8`, map3 in the **required** browser-tested set |
| `scripts/qa/eye-clearance-sweep-contract.test.mjs` x3 | floor pinned at 7 | pinned at 8 |
| `scripts/qa/eye-clearance-roster.mjs` | `MINIMUM_EYE_CLEARANCE_ARENAS = 7` | `= 8` |
| `scripts/qa/sweep-eye-clearance-spots.ts` | `MINIMUM_SWEPT_ARENAS = 7` | `= 8` |
| `docs/eye-clearance/ledger.json` | `"map3": "excluded — card withdrawn"` | back in `ceilings` at the `-1` sentinel with a dated `unmeasured` row, and a `runtimeRemaining` row |

The 8 → 7 drop the lane applied on 2026-09-02 lasted exactly as long as the
withdrawal did. Both floors are held in BOTH directions by the equality
assertion `MINIMUM_EYE_CLEARANCE_ARENAS === derived.length`, so the literals
cannot be edited alone.

## An arena kind, not an exemption list

The meta-assertion used to ask "is this arena on the free-for-all list?". It now
asks the registry what kind of arena it is. `kind` is REQUIRED, so tsc forces a
new arena to answer; and declaring `'explore'` is *more* expensive than declaring
`'team'`, because the explore branch asserts six properties that the team branch
does not. An explore arena that later gains a lobby or a single bot fails
immediately rather than quietly leaving the rule.

## The eye-clearance row is at the sentinel, and this is why

The brief asked for a **measured** ceiling. It is NOT delivered, and the reason
is a real blocker rather than a shortcut:

- Stage 1 DID run against map3 on this tree (`eye-clearance-stage1-sweep.txt`):
  **225 colliders (2 floor), 3013 legal hug spots, 3 colliders with no legal
  adjacent stance**. That also independently re-confirms the 225 figure.
- Stage 2 (`scripts/qa/sweep-eye-clearance-live.mjs`) probes through
  `__ATOMIC_ACRES_DEBUG__.traceBallistics`, which builds a **non-active** arena
  **synchronously**. map3 is code-split behind `src/arena-factory-registry.ts`,
  so `buildMap3` throws unless the chunk is already resolved. **No stage-2 number
  for map3 can be produced at all** until the prepare-then-build split lands.

So the row sits at the declared `-1` sentinel with a dated note naming that
blocker — which is the contract's own "a new arena enters the ratchet unmeasured,
never pre-forgiven" state, not a parking sentinel.

## Gates, clean worktree, this change set

- `npx tsc --noEmit` — exit 0.
- `npx vitest run src/map-selection.test.ts src/arena-selectability.test.ts src/spawn-layout-quality.test.ts src/ui/pass64-shell.test.ts src/release-topology.test.ts` — **5 files / 152 passed, 0 failed**.
- `node --test scripts/qa/cross-browser-gate-contract.test.mjs scripts/qa/eye-clearance-sweep-contract.test.mjs` — **22 tests, 22 pass, 0 fail**.
- `npx tsx scripts/qa/sweep-eye-clearance-spots.ts` — exit 0, all **8** arenas.
