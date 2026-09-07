# Multi-agent repository discipline

Status: active project rule. Applies to **every** harness and every person working in this
repository — Claude Code, Codex, Cursor, Antigravity/Gemini, Pi, OMP, Hermes desktop and
Hermes headless, and any future agent.

Canonical control remains AKP (`%LOCALAPPDATA%\hermes\.akephalos`): `rules.md`,
`principles.md` and `harness-bootstrap-contract.md`. This document does not replace them.
It adds the repository-specific discipline that AKP's existing rule
*"each concurrent coding harness uses its own isolated branch/worktree; never allow several
agents to write the same worktree silently"* implies but does not yet spell out.

Every rule below exists because it was violated, on this machine, with real damage. The
incident is named so the rule is arguable rather than arbitrary.

---

## 1. Worktree lifecycle — the sprawl is the hazard

**Measured 2026-08-22: 365 worktrees and 458 branches on this repository.**

No agent — frontier or otherwise — reliably picks the right target from 365 options. This
is not a model-quality problem and cannot be fixed by using a better model.

- **One worktree per pass or per bounded task.** Create it, use it, remove it at merge.
- **`git worktree prune` is part of finishing**, not housekeeping someone does later.
- **A worktree older than its pass is a trap.** It looks like current source and is not.
- **Never create a worktree inside another worktree**, and never beside one with a similar
  name. Similar names are how the wrong one gets chosen.

> **Incident.** A worker wrote `src/test-bay-dummy-colliders.ts`, its test, and a 19-line
> `legacy-main.ts` edit into `atomic-acres-production-27e0858` — a *different* checkout, on
> `main` at `249a7ee7`, which is the owner's designated Pass 62 netcode benchmark and must
> stay byte-exact. The adversarial critic then reviewed **that copy** and returned GO. The
> pipeline reported a fully green four-stage chain while the work sat in the wrong
> repository and a protected artefact was dirty.

## 2. `cwd` is where a harness starts, not a boundary it respects

An agent with filesystem tools can path anywhere. Assume it will.

- **Snapshot sibling worktrees around every delegated run** and fail the run if anything
  outside the assigned tree changed. Reference implementation:
  `hermes-universal-orchestration/scripts/swarm_dispatch.py` → `_worktree_guard()`.
- **Recovery must be surgical, never a blanket reset.** The contaminated checkout above
  held **1,489 staged files of the owner's own work**; `git reset --hard` would have
  destroyed vastly more than the contamination. `git status --short` separated the agent's
  *unstaged* 19 lines from the owner's *staged* 26,232, so only the former was reverted.

## 3. Publishing has exactly one path

Adopting the owner's Ops-Brain model, generalised:

- **Feature worktrees may edit and test. They may never publish.**
- **One canonical checkout** runs release, compliance, vault sync, backup and any
  irreversible outward action.
- A feature branch becomes visible to others only when pushed. A local worktree is not a
  publication and must never be treated as one.
- For this repository that means: contributors stop at a green PR; only
  `.github/workflows/release-production.yml` publishes, with an exact green `main` SHA.
  **The folder-level rule is the upgrade** — a process rule alone did not stop a worker
  dirtying a protected checkout.

## 4. When several agents must share one worktree

Sometimes genuine parallelism inside one tree is worth it. Then these are mandatory.

- **Strict file allowlist per agent**, stated in the brief, non-overlapping by construction.
- **Every brief carries this sentence:** *"Other agents are editing other files. `tsc` will
  show errors outside your scope — ignore them and never fix them."* Without it, each agent
  runs a project-wide typecheck, sees another's half-finished file, and helpfully edits it.
- **Serialise any file many tasks touch.** Here that is `src/legacy-main.ts` and
  `index.html` — one writer at a time, never parallel.
- **Cross-file coupling is the residual risk and allowlists do not catch it.**

> **Incident.** One agent removed `#lobby-squad-name` from the lobby markup because squad
> identity became prescribed. Another file still resolved that element at module scope. All
> **2,858 tests passed** — they assert markup structure and never boot the DOM — and the
> game showed `GAMEPLAY RENDERER BLOCKED` on load. Found by the owner opening the page.

## 5. Exit code 0 is not success

- **Treat every agent report as a claim and the repository as the only evidence.**
- **A worker that changed no files did not succeed**, whatever it exited with.
- **Scan output for concealed failure**: quota rejections, `no final response was produced`,
  API-failure notices, blocked permission prompts, near-empty output. Reference
  implementation: `swarm_dispatch.py` → `_failure_marker()`.

> **Incident.** Eleven workers reported `succeeded`; **six had done nothing** —
> `HTTP 429: Monthly usage limit reached`, exit 0. One of the six was the adversarial critic
> guarding the riskiest change of the night.

## 6. Verification rules that catch what tests cannot

- **A build nobody launched is not verified.** Boot the app in a real browser and read the
  console before claiming a candidate works. Unit tests cannot catch a missing element,
  a wrong asset path, or a renderer that fails to initialise.
- **Never weaken a test, threshold, timeout or assertion to reach green.** If a test fails
  because it correctly detects a real defect, **leave it failing** and mark the row OPEN. A
  red test you can trust beats a green one you cannot.
- **Recomputing a digest is legitimate; editing an expected count is usually not.** When
  counts disagree, the *definitions* are what should change.
- **Any claim about provenance** — "pre-existing", "not ours", "unrelated" — **requires a
  git command before it is repeated**, especially before it enters a commit message where
  it becomes durable.

> **Incident.** A lockfile break was reported to the owner as pre-existing and that claim
> was written into a commit message. `git log -- package-lock.json` showed our own wave-1
> commit had dropped the entries. An independent audit caught it, not our own checks.

## 7. Critics, and what makes one worthless

- **A critic must not have written the code it reviews**, and should sit on a **different
  provider**, not merely a different model — one quota ceiling otherwise removes the
  builder's only independent check.
- **A critic's verdict is void unless it reviewed the same paths the work was supposed to
  touch.** Check the file paths it cites, not just its GO/NO-GO.
- **Route critic duty on measured evidence.** A model that cannot answer "no" to a leading
  question produces confident wrong fixes, which is the dominant swarm failure mode. See
  `hermes-universal-orchestration/control-plane/ROUTE-CAPABILITY-FINDINGS.md`.

## 8. Assets

- **Assets are manifested, never duplicated between worktrees.** Every model, texture,
  sound and generated asset carries source, licence, derivative note and a recomputed
  digest in `assets.manifest.json`. 365 checkouts × binary assets is both disk and a
  standing temptation to copy files and lose provenance.
- **Never fabricate an asset to satisfy a gate.** A missing authored video stays missing
  and the surface degrades to a deliberate placeholder; a fake or borrowed one is worse
  than the gap, because it silently passes review.
- **External sources need an exact pin, a licence, and a bounded decision** before adoption
  — see `docs/PASS73_OWNER_FEEDBACK_SOURCE_AUDIT_2026-08-21.md` §4 for the worked form.

## 9. Refactoring

- **Incremental extraction as you go**, whenever a fix naturally lifts logic into a typed,
  tested module.
- **Large refactors happen when the fleet is quiet**, never during concurrent writes, and
  are measured before and after.
- **A move is not a rewrite.** If an extraction cannot preserve behaviour verbatim, it is a
  redesign and needs its own review.

> **Incident.** A lane attempted a ~2,700-line extraction mid-flight while eight agents were
> writing, could not resolve the captured closures, and left a 23KB module importing a
> `./types` that does not exist. Parked rather than repaired.

## 10. Match task risk to measured capability

- **Never give memory-lifetime, authority, or fail-closed code to an unproven route.**
- **A large confident rewrite from a weak model is worse than no change**, because the
  review cost exceeds the value and the damage surfaces weeks later.

> **Incident.** A route measured at 0/3 rewrote 90 lines of cache and disposal logic twice.
> The second attempt broke the gun-range rack's fail-closed contract — a failure path
> resolved where it must reject. Both reverted; the row stayed OPEN.

---

## Quick checklist before any agent starts work here

1. Confirm the repository, the **worktree path**, and the branch — do not infer them.
2. Confirm you are the only writer of your files, or hold an explicit allowlist.
3. Never publish from a feature worktree.
4. Verify claims against the repository, not against reports.
5. Leave correct failures failing; mark the row OPEN with the reason.
6. Prune your worktree when the task is done.
