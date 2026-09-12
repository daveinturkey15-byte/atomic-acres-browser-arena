# Checks that are green because they are not looking

Audit run 2026-08-31 after four separate instances of the same defect shipped in one day.
Read-only sweep; every finding was verified by reading the source of truth and diffing it
against the list, not by pattern-matching the shape. Eleven candidates were examined and
**rejected** as legitimate frozen baselines (see the bottom) — that discipline matters,
because a finding list padded with legitimate freezes buries the real ones.

## The shape

A check's **coverage is a literal written by hand**, or its **evidence is something other
than an observation of the thing itself**. Both produce a confident pass over nothing.

The four already fixed:

| Fix | What was green while not looking |
|---|---|
| `5ac48931` | Two arenas shipped **byte-identical copies** of other maps' preview videos. Digest checks compared each file to *its own* recorded hash — taken from the copy. |
| `144ead77` | Test1/Test2 were **never opened in any browser** by the cross-browser gate, which still returned a per-lane verdict. |
| `60886c35` | The eye-clearance sweep produced 2,262 spots for Test1 of which **zero were inside the playable bounds** — it probed 0.75 m underground. |
| `465879c5` | A regression test asserted the *presence of my patch* — including the very call that threw — so the same bug walked back through it within a day. |

## Findings

### 1. `sweep-eye-clearance-live.mjs:21` — CRITICAL

`60886c35` fixed **stage 1 of a three-stage pipeline**. Stage 2 still hardcodes five
arenas; stage 3 (`verify-eye-clearance-runtime.mjs:14`) hardcodes four, silently dropping
`rustworks-1v1` too. `docs/eye-clearance/ledger.json` carries ratchet ceilings for the same
five, so the missing-ceiling guard **can never fire** for the two skipped arenas — a roster
that never reaches the loop never asks for a ceiling.

So `npm run qa:eye-clearance` generates spots for seven arenas, measures five, and prints a
green ratchet. The contract test pins only the spots sweep.

### 2. `legacy-main.ts:33522` `collisionProbeAt` — HIGH

The capsule-model twin, still live. `collisionProbe` was fixed on 2026-08-31; the three-arg
variant was left with **three** divergences from the runtime it stands in for: `isBlocked`
reads its point as the capsule *top* while every caller passes a height above the feet
(`feetY + 0.9`, `position[1] - 1.05`); radius 0.36 against the mover's 0.44; and no
`collidersOverlappingVerticalSpan` filter.

Masked today only because the same scripts' rosters also exclude Test1/Test2 — so
**repairing those rosters will make nine probe scripts report both arenas as entirely
solid**, which reads as catastrophic traversal failure rather than a probe bug.

### 3. `viewpoint-catalog.mjs:15-71` — HIGH

`ARENA_SOURCES` is a hand-written map of six arena files; Test1 and Test2 both declare
`reviewCameras` and neither is in it. The completeness assertion compares the literal
**against itself** — both sides derive from the same six-arena decision, so they can never
disagree. The docstring claims it "never drifts from the AUTHORED review cameras … (both
directions)"; the glob it describes is not in the code.

Concretely: `test1-into-sun-hardpan` was authored specifically to review the sun disc and
backlit rims that the 2026-08-31 sky pass changed, and nothing renders or compares it.

### 4. `graphics-settings-registry.test.ts:58` and the Pass 65 inventory — HIGH

Evidence is `expect(readFileSync(probe.path)).toContain(probe.symbol)` — a string appearing
in a source file. Nothing observes a scene, frame, uniform or telemetry value. The
`inventorySha256` hashes the report the same run just produced.

**This already cost us:** it is why `scene.environment` being null on the first arena of
every page load passed nine tests (see `IBL_FIRST_ARENA_BUG_2026-08-31.md`).

### 5. `tests/e2e/pass74-arena-boot-smoke.spec.ts` — HIGH

Six hardcoded ids, missing Test1/Test2. Worse: **nothing runs it.** Not in `package.json`,
not in `run-bounded-e2e.mjs`'s `SUITES`, not in either workflow file. Its header says "This
spec opens the page, for all six arenas, before the owner does." Written after an incident,
then orphaned.

### 6-10 (medium / low)

- `sweep-invisible-walls-cdp.mjs` — six arenas with **hand-copied bounds**, duplicated again
  in `build-invisible-wall-map.mjs` under a "keep in sync" comment.
- `pass66-prone-contact-matrix.spec.ts` — four of seven arenas, and `EXPECTED_CELLS` is
  computed from that same literal, so the completeness assertion cannot fail.
- `verify-pass65-weapon-production.mjs` — 20 ids against `WEAPON_IDS`' 21. The omission
  (`crimson-flamethrower`, which aliases another chassis) is legitimate **by coincidence
  rather than by rule**.
- `collider-visual-parity-core.ts:699` — roster is correct today, but the gate compares the
  run against the literal that produced it.
- `verify-pass33-maps.mjs` — four of seven. Ambiguous: plausibly a frozen Pass-33 budget
  oracle. Decide and write it down.

## Rejected as legitimate (not findings)

Frozen release oracles, retained-family provenance records and pinned regression corpora are
supposed to be fixed. Examples deliberately **not** reported: the killstreak catalog
verifier (runs against frozen fixtures *and* adversarial mutations by design), the ballistic
parity ledger (carries all 8 arenas with a written rule for how new ones enter), the HF-347
movement matrix (incident-scoped subset, stated), and the operator-skin integration test
(looks like a hand-written roster, actually derives its ids).

## The structural fix

**Require every gate to emit a receipt of what it MEASURED, then add one union gate.**

Each verifier writes `artifacts/coverage/<gate>.json` with `covered: [...ids actually
iterated at runtime...]`, appended as each unit *completes* rather than declared up front. A
`qa:coverage-union` gate unions those per roster kind and fails unless the union equals the
derived roster minus an exemption file where each entry names the id, the gate, a reason and
a machine-checkable proof.

**Why not the obvious alternative.** The instinctive fix is a lint rule banning arena-id
literals in `scripts/qa` and `tests/e2e`. It is cheaper, and it would have caught findings 1
and the two already fixed. It would **not** have caught three of the five high findings:

- The live eye-clearance sweep takes `--arenas` and reads a default from a string — lint
  could force derivation, but the ledger would still hold five ceilings.
- `pass74-arena-boot-smoke.spec.ts` would satisfy any lint after one edit and **still never
  execute**. A source-shape rule cannot tell "derives correctly" from "derives correctly and
  ran".
- The graphics-registry family has no roster literal at all; its defect is that
  presence-of-a-symbol is accepted as evidence.

A receipt of what actually ran catches all three, because it is an observation rather than a
statement about source.
