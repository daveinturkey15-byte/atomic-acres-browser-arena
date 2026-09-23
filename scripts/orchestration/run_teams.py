#!/usr/bin/env python3
"""Dispatch OMP/ox-alpha teams, then gate them.

    python scripts/orchestration/run_teams.py mp-core farcrysis
    python scripts/orchestration/run_teams.py --all --parallel 12

Each team becomes one swarm_dispatch spec: N builders plus a critic that `depends_on`
every builder, so the critic runs only once its team has finished and can falsify their
claims with the tree in its post-team state.

Teams run CONCURRENTLY with each other because their file ownership is disjoint by
construction (see teams.py). Within a team, builders also run concurrently - they share
a domain but the dispatcher's own sizing lesson applies: small sharply-scoped tasks
complete, large open-ended briefs exit 0 having produced nothing.

After every team returns, the regression gate runs. A regression is reported and the run
STOPS rather than letting 40 more agents pile work on top of a broken tree.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
FLEET = r"C:\Users\david\projects\worktrees\foundry-fleet-contract-poc"
DISPATCH = os.path.join(FLEET, "scripts", "swarm_dispatch.py")
LOGDIR = os.path.join(REPO, "artifacts", "team-logs")

sys.path.insert(0, HERE)
from teams import (  # noqa: E402
    TEAMS, BUILDER_PREAMBLE, CRITIC_PREAMBLE, SKILLS, SKILL_ROOT,
)


def skill_section(team_name):
    """The curated skills this team must read before designing anything.

    Named with absolute paths because an agent that has to go looking will not look.
    """
    names = SKILLS.get(team_name, [])
    if not names:
        return ""
    lines = "\n".join(f"  {os.path.join(SKILL_ROOT, n, 'SKILL.md')}" for n in names)
    return ("\n\nSKILLS TO READ IN FULL BEFORE DESIGNING ANYTHING "
            f"({len(names)} for this team):\n{lines}\n")


def build_spec(team_name, team, timeout):
    owns = team["owns"]
    skills = skill_section(team_name)
    tasks = []
    ids = []
    for task_id, brief in team["tasks"]:
        ids.append(task_id)
        tasks.append({
            "id": task_id,
            "route": "omp-ox",
            "role": "worker",
            "timeout": timeout,
            "cwd": REPO,
            "prompt": (BUILDER_PREAMBLE.replace("SKILL_ROOT", SKILL_ROOT) + brief
                       + f"\n\nYOUR TEAM ({team_name}) OWNS THESE FILES AND NOTHING ELSE:\n{owns}\n"
                       + skills),
        })
    tasks.append({
        "id": f"{team_name}-critic",
        "route": "omp-ox",
        "role": "verifier",
        "timeout": timeout,
        "cwd": REPO,
        "depends_on": ids,
        "prompt": (CRITIC_PREAMBLE
                   + f"Team: {team_name}\nTeam file ownership: {owns}\n"
                   + "Tasks the team was given:\n"
                   + "\n".join(f"  - {i}: {b[:400]}" for i, b in team["tasks"])),
    })
    return {
        "run_kind": "implementation",
        "pattern": "team-builders-then-critic",
        "notes": f"Pass 79 blitz, team {team_name}. Claude orchestrates and integrates; "
                 f"OMP/ox-alpha implements. Regression floor in artifacts/regression-floor.json.",
        "tasks": tasks,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("teams", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--parallel", type=int, default=10)
    ap.add_argument("--timeout", type=int, default=3000)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    names = list(TEAMS) if args.all else args.teams
    if not names:
        print("no teams named; use --all or list team names:", ", ".join(TEAMS))
        return 2
    unknown = [n for n in names if n not in TEAMS]
    if unknown:
        print(f"unknown team(s): {unknown}. Known: {list(TEAMS)}", file=sys.stderr)
        return 2

    os.makedirs(LOGDIR, exist_ok=True)
    procs = []
    for name in names:
        spec = build_spec(name, TEAMS[name], args.timeout)
        path = os.path.join(LOGDIR, f"spec-{name}.json")
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(spec, fh, indent=2)
        n = len(spec["tasks"])
        print(f"[team] {name:<12} {n} agents ({n-1} builders + 1 critic) -> {path}")
        if args.dry_run:
            continue
        log = open(os.path.join(LOGDIR, f"{name}.log"), "w", encoding="utf-8")
        procs.append((name, subprocess.Popen(
            [sys.executable, DISPATCH, path, "--max-parallel", str(args.parallel)],
            cwd=FLEET, stdout=log, stderr=subprocess.STDOUT), log))

    if args.dry_run:
        total = sum(len(TEAMS[n]["tasks"]) + 1 for n in names)
        print(f"\nDRY RUN. {len(names)} teams, {total} agents total.")
        return 0

    print(f"\n{len(procs)} teams dispatched. Waiting...")
    for name, proc, log in procs:
        rc = proc.wait()
        log.close()
        print(f"[team] {name} finished rc={rc}")

    print("\n=== REGRESSION GATE ===")
    rc = subprocess.run([sys.executable,
                         os.path.join(HERE, "regression_gate.py"), "check"],
                        cwd=REPO).returncode
    if rc != 0:
        print("\nSTOPPING: the tree regressed. Fix or revert before dispatching more teams.",
              file=sys.stderr)
    return rc


if __name__ == "__main__":
    sys.exit(main())
