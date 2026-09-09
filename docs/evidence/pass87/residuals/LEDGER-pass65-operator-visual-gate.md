# Ledger — `pass65-operator-visual-gate.spec.ts` stays RED, and now says why

PASS 87 Lane AR, item 8. Measured 2026-09-03 on `dave-gaming-pc`, headless
installed Chrome with a real WebGPU adapter (`PASS73_NATIVE_WEBGPU=1`), against
a freshly built and staged `dist` served by `vite preview` on 127.0.0.1:4173.
ComfyUI idle (`/queue` empty), GPU 7.2 GB of 16.3 GB used at launch.

## What was known

`docs/QA_CORPUS_AUDIT_2026-09-02.md` recorded this spec as ORPHAN — in no npm
script, no bounded group and neither workflow — and as "a genuine red, not rot:
it boots, runs, and fails an assertion about the canonical opaque PBR operator
in Quality and authored Performance LODs. It has been unreachable since
2026-07-27, so nothing has been checking that contract for five weeks."

## What it actually fails on

Run 1, spec unchanged:

```
Error: expect(received).toBe(expected)   Expected: true   Received: false
Call Log: - Timeout 10000ms exceeded while waiting on the predicate
  at stageOperator … snapshot().bots[0]?.operatorModel
```

That is `expect.poll`'s DEFAULT 10 s, and it starts the moment `startSolo()` is
called. Solo match admission takes 14–20 s per arena (the integration ledger's
own figure, Lane H2), so the poll could not have succeeded. The gate reported
"no operator model" having measured "the match had not started".

Run 2, with the wait made explicit — admission first, at the same 60 s the rest
of the browser suite gives it, then the unchanged operator poll:

```
TimeoutError: page.waitForFunction: Timeout 60000ms exceeded.
  () => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active'
```

The captured frame (`pass65-operator-visual-gate-stall-98pct.png`, and the full
accessibility snapshot in `pass65-operator-visual-gate-error-context.md`) shows
what the player would see for that whole minute:

```
PASS 86 // DEPLOYMENT STREAM
TERMINAL
Preparing Terminal operators and viewmodel…
[progressbar "Map loading progress"] 98%      status 98%      status ETA 2s
FINALIZING MATCH STATE · 100% = IN GAME
```

## The finding

Solo deployment on `skyline-terminal` in the Quality (`render=blender`) profile
parks at **98%**, on the step named "Preparing Terminal operators and
viewmodel", and does not reach `matchPhase === 'active'` within 60 s. The
progress bar keeps claiming `ETA 2s`.

This is owner-visible, it is the same class as three of the four remaining
`pass64-hud-menu.spec.ts` failures (all of them the 60 s `startDeterministicSolo`
admission wait), and it is squarely inside the block the ledger already names as
unexamined: "match admission (deploy) at 14–20 s per arena is the largest
unexamined block — attribute it and cut it" (Lane H2, held from PASS 86).

That the stall is on the OPERATOR preparation step means this gate is doing its
job: the contract it owns is the canonical rigged operator, and the operator
step is what does not finish.

## Why it is not fixed here

The repair is inside match admission and the operator/viewmodel preparation
path, which Lane AR does not own and cannot bound in the time this pass has.
Nothing was relaxed to make it green: the operator material/LOD/clip/mesh
assertions are byte-identical to the ones that have been red since 2026-07-27.

## What Lane AR did change

1. `?renderer=webgl2` removed from the spec's URL — the owner retired that
   route on 2026-08-30 and `resolveRenderRuntimeRequest` has voided its
   `search` argument ever since, so the parameter did nothing and only implied
   coverage of a route that no longer exists.
2. The admission wait is explicit and named, so this gate can never again
   report an operator defect when what it measured was a match that had not
   started. A failure now says which of the two happened.
3. The spec's own timeout is raised 150 s → 300 s, because it stages TWICE and
   each staging now waits for a real admission. This is the test's harness
   budget, not an assertion threshold.

## Falsifier for whoever takes it

`QA_EXTERNAL_PREVIEW=1 BASE_URL=<preview> PASS73_NATIVE_WEBGPU=1 npx playwright
test tests/e2e/pass65-operator-visual-gate.spec.ts --project=chromium
--workers=1 --retries=0` must reach `matchPhase === 'active'` on
skyline-terminal in both `blender` and `performance` profiles, and then satisfy
the unchanged operator telemetry. Wire it into `run-bounded-e2e.mjs` and both CI
group lists at that point — it is still executed by nothing, which is the other
half of why it went five weeks without being read.
