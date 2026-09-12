# Attribution correction for commit `c7944d82`

## What happened

`c7944d82` was committed with `git add -A` while four delegated agents were live in
this same worktree. It therefore swept in two lanes' work that the orchestrator had
**not reviewed**, and its message credited neither:

| Swept-in file | Lane | Route |
| --- | --- | --- |
| `src/farcrysis-tsl-foliage.ts`, `src/farcrysis-tsl-foliage.test.ts` | `wind-uniform-growth-retry` (HF-363) | ox-openrouter |
| `docs/PASS74_HF336_SPECTATOR_COST.md` | `hf336-spectator-cost-measure` (HF-336) | gemini (Antigravity) |

`docs/PASS74_HF347_GUNRANGE_DIAGNOSIS.md` was also included; that one was deliberate
and is described in the surrounding work, but it originated from the
`hf347-gunrange-mp-only` lane (ox-openrouter).

## Review performed after the fact

**`src/farcrysis-tsl-foliage.ts` — accepted.** `_windUniforms` was a module-global
array with no removal path, pushed once per foliage material (~50 per farcrysis
build) and iterated every frame by `tslAdvanceWind`, so uniforms belonging to
disposed arenas kept being written for the rest of the session. The fix registers a
`dispose` listener on each material and splices its entry out. That is the correct
mechanism: three.js materials emit `dispose`, and legacy-main's arena teardown
disposes every foliage material.

One caveat recorded rather than hidden: the exported `tslResetWindUniforms()` safety
net has **no production caller**. The primary mechanism (the per-material dispose
listener) is genuinely wired, so the leak is fixed, but that export is an HF-364-class
landed-but-unwired symbol and must not be read as active protection.

**`docs/PASS74_HF336_SPECTATOR_COST.md` — accepted as measurement, not as a fix.** It
changes no production code. Its central finding explains the owner's report directly:
the PILOT's client hides the entire exterior airframe via
`setSupportFirstPersonVisibility(root, true)` and renders only the cockpit viewmodel,
paying zero exterior draw calls and zero shadow-caster rasterisations, while a
SPECTATOR renders the full airframe including its shadow casters. The asymmetry is
structural, which is why the pilot is smooth and everyone else is not.

## Why this is recorded rather than quietly amended

The commit is local and unpushed, so amending was possible. It was not amended because
an integration worktree already branches from `c7944d82`, and because a correction
that erases its own cause teaches nothing. The message on `c7944d82` remains accurate
about what it *claims*; it was incomplete about what it *contained*.

## The rule this produces

**Never `git add -A` while delegated agents are live in the same worktree.** Stage
explicit paths. The orchestrator has to be able to say, for every hunk in a commit,
who wrote it and whether it was reviewed - and `add -A` destroys exactly that
property at the moment it matters most.
