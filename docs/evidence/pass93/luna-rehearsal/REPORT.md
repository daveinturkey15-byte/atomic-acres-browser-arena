# PASS 93 Luna weapon-rehearsal scope

**Worktree:** `C:\Users\david\projects\aa-claude-luna`
**Branch:** `contrib/dave-gaming-pc/claude/admission-rehearsal-scope`
**Base:** `ce1c8f7611bd93a26897c0be73abe1a5f3eebbc8` (live PASS 92 head supplied for this task)
**Date:** 2026-09-03

## Outcome

- **[VERIFIED]** Added `src/weapon-rehearsal-scheduler.ts` with a pure plan/state
  core. Admission IDs are derived from the actual primary and sidearm plus the
  arena's canonical pickup authorities: timed-map definitions, railgun spawn
  sites, field-support care-only rewards, and Gun Range stations. No weapon-name
  roster was added to the admission integration.
- **[VERIFIED]** The existing admission state walk now rehearses only
  `plan.admissionWeaponIds`. The full browser weapon catalog prewarm remains in
  place as the GPU vocabulary/readiness boundary.
- **[VERIFIED]** Remaining IDs are held in an explicit registry and selected one
  at a time by a deferred scheduler. It returns no deferred slice for `combat`
  and is wired only to menu, pre-match warmup/countdown, and respawn-safe frames.
  `admission-settle` is also an accepted safe-window decision in the pure core;
  the existing settle remains unchanged and is not duplicated.
- **[VERIFIED]** An unrehearsed switch crosses `prepareBrowserWeapon` before
  `setWeapon` commits, and the ID is recorded once the readiness barrier passes.
- **[VERIFIED]** `bootstrap.matchAdmissionProfile` now exposes
  `admissionWeaponIds`, `rehearsedWeaponIds`, and `deferredWeaponIds`.
- **[VERIFIED]** `src/legacy-main.ts` changed from 37,100 to 37,188 LF lines:
  104 insertions and 16 deletions, 88 net lines. The size-ratchet
  `CEILING_HISTORY` was updated to the measured 37,188-line ceiling.
- **[VERIFIED]** No admission-cadence logic was changed. The existing adaptive
  `waitForStableMatchAdmissionCadence()` branch remains the sole cadence wait.
- **[VERIFIED]** Neither the 12-second cold-generation WebGPU fence nor its
  completion guard was widened, removed, or weakened.

## Measured saving estimate

The PASS 92 deploy-attribution report measured:

- match admission **12,818.7–17,777.3 ms**, median **15,712.2 ms**;
- `weapon-switch-rehearsal` **3,550.5–6,408.7 ms**, median **5,056.2 ms**;
- the 21-weapon rehearsal was serial;
- `stable-cadence-wait` median **5,181.6 ms** and is deliberately untouched.

**[CLAIMED / DERIVED]** For the common four-ID hot set (player primary,
sidearm, and two arena-reachable pickups), a proportional upper estimate is
`5,056.2 ms * 17 / 21 = 4,093.5 ms`, or about **4.1 s** saved from the
serial state walk. The actual saving is expected to vary by arena and weapon
cost; Gun Range's canonical station roster intentionally admits all 21 IDs.
This is an estimate from PASS 92 timings, not a browser measurement of this
candidate.

## Unit evidence run tonight

- **[VERIFIED]** `npx tsc --noEmit` — exit code 0.
- **[VERIFIED]** `npx vitest run src/weapon-rehearsal-scheduler.test.ts src/presentation-prewarm-contract.test.ts src/legacy-main-size-ratchet.test.ts` — 3 files, 34 tests passed.
- **[VERIFIED]** `git diff --check` — no whitespace errors.
- **[OPEN]** The mandated preflight was attempted with the requested harness
  name and with the lowercase slug required by the guard. The first was rejected
  because the guard requires a lowercase slug; the second was rejected because
  the guard requires a `contrib/dave-gaming-pc/codex/...` branch while this task
  explicitly requires the existing `.../claude/...` branch. The branch was not
  renamed.

## Morning browser verification

No build and no browser were run tonight because the shared GPU is reserved.
The browser tripwire and admission probe are the morning reviewer's job.
After building and serving this exact candidate, run from the repository root:

```powershell
npx tsc --noEmit
npx vitest run src/weapon-rehearsal-scheduler.test.ts src/presentation-prewarm-contract.test.ts src/legacy-main-size-ratchet.test.ts
node scripts/qa/probe-pipeline-compile-stalls-cdp.mjs --dist dist --seconds 75 --label pass93-luna-rehearsal
node scripts/qa/measure-preset-admission.mjs --url http://127.0.0.1:41910 --preset max --arena atomic-acres --timeout-ms 240000
```

Repeat the admission command with `--arena skyline-terminal`,
`--arena rustworks-1v1`, and `--arena gun-range` to cover the different
canonical pickup rosters. The morning result must verify the admission profile
contains the expected admission/deferred IDs, the pipeline-compile tripwire
reports zero in-combat pipeline creations, and the first-live-frame timing
improves without a cadence or fence relaxation.

## Claim boundary

- **[VERIFIED]** Pure scheduler decisions, canonical roster projection, duplicate
  suppression, safe-window gating, source integration contracts, TypeScript,
  focused unit tests, and legacy size-ratchet procedure.
- **[OPEN]** Actual admission milliseconds, browser first-live-frame behavior,
  WebGPU queue behavior, and the in-combat pipeline tripwire. These require the
  morning installed-Chrome probes above and were not claimed from unit tests.
