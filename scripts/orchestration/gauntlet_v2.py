#!/usr/bin/env python3
"""Pass 80 autonomous gauntlet — memory-governed rounds of OMP/ox-alpha teams.

    python scripts/orchestration/gauntlet_v2.py --hours 8

WHAT IS DIFFERENT FROM v1, and why each change exists:

1. MEMORY-GOVERNED. v1 fired a fixed agent count every round. That took the machine to
   3.5 GB free of 31.6 GB and crashed the owner's headless Hermes agent on WSL. Every
   round now asks governor.budget first and dispatches only what fits above the reserve.
   A grant of zero means WAIT, not proceed.

2. VERIFICATION ACTUALLY RUNS. v1 invoked `npx` directly; on Windows that is `npx.cmd`,
   so every tsc and vitest call threw WinError 2 and each round was told "tree is RED"
   with no usable detail. Ten agents per round then chased a phantom failure. Commands
   now route through the shell.

3. REGRESSION FLOOR IS MECHANICAL. regression_gate.py holds the measured floor. A round
   that lowers it stops the run rather than letting later rounds build on a broken tree.

4. BROWSER WORK IS CAPPED SEPARATELY. Agent code work is cheap; a headed Chrome doing
   WebGPU is worth several agents. The semaphore lives in governor.py and is machine-wide,
   shared with OMP, Codex and Hermes.

A round that leaves the tree red is still COMMITTED, with the state named in the message.
Auto-reverting other agents' work is how a night's output disappears.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
FLEET = r"C:\Users\david\projects\worktrees\foundry-fleet-contract-poc"
DISPATCH = os.path.join(FLEET, "scripts", "swarm_dispatch.py")
GOVERNOR = os.path.join(HERE, "governor.py")
GATE = os.path.join(HERE, "regression_gate.py")
LOGDIR = os.path.join(REPO, "artifacts", "pass80-logs")

sys.path.insert(0, HERE)
from pass80_teams import TEAMS, SKILLS, SKILL_ROOT  # noqa: E402
from teams import BUILDER_PREAMBLE, CRITIC_PREAMBLE  # noqa: E402

ORDER = ["gameplay-test", "arena-fidelity", "graphics-aaa",
         "polish-vfx", "assets-imagegen", "rigging-motion"]


def sh(cmd, cwd=REPO, timeout=1800):
    """Run through the shell: bare `npx` is npx.cmd on Windows and raises WinError 2."""
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout,
                           encoding="utf-8", errors="replace", shell=isinstance(cmd, str))
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as exc:  # noqa: BLE001
        return -1, f"EXCEPTION: {exc}"


def log(msg):
    line = f"[{dt.datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    os.makedirs(LOGDIR, exist_ok=True)
    with open(os.path.join(LOGDIR, "gauntlet.log"), "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def granted(want):
    rc, out = sh([sys.executable, GOVERNOR, "budget", "--want", str(want),
                  "--who", "gauntlet-v2"], timeout=180)
    try:
        return json.loads(out[out.index("{"):out.rindex("}") + 1]).get("granted", 0)
    except Exception:
        return 0


def build_spec(team_name, round_no, tasks):
    team = TEAMS[team_name]
    names = SKILLS.get(team_name, [])
    skill_lines = "\n".join(f"  {os.path.join(SKILL_ROOT, n, 'SKILL.md')}" for n in names)
    skills = (f"\n\nSKILLS TO READ IN FULL BEFORE DESIGNING ANYTHING ({len(names)}):\n"
              f"{skill_lines}\n") if names else ""
    coord = (
        "\n\nMACHINE COORDINATION - THIS IS BINDING. The owner's headless Hermes agent on "
        "WSL crashes when this machine runs out of RAM, and a swarm did exactly that today. "
        "Before launching ANY headed browser you MUST take a slot:\n"
        f"  python {GOVERNOR} browser-acquire --id <your-task-id>\n"
        "and release it when done, in a finally so a crash still frees it:\n"
        f"  python {GOVERNOR} browser-release --id <your-task-id>\n"
        "There are only 2 slots machine-wide, shared with every other harness. Do not "
        "start long-lived servers; a shared preview already runs on 127.0.0.1:41911. Never "
        "touch ports 41900/41901 - those are the owner's own builds.\n")
    entries = []
    ids = []
    for tid, brief in tasks:
        ids.append(tid)
        entries.append({
            "id": f"r{round_no:02d}-{tid}",
            "route": "omp-ox",
            "role": "worker",
            "timeout": 3000,
            "cwd": REPO,
            "prompt": (BUILDER_PREAMBLE.replace("SKILL_ROOT", SKILL_ROOT) + brief
                       + f"\n\nYOUR TEAM ({team_name}) OWNS THESE FILES AND NOTHING ELSE:\n"
                       + team["owns"] + "\n" + skills + coord),
        })
    entries.append({
        "id": f"r{round_no:02d}-{team_name}-critic",
        "route": "omp-ox",
        "role": "verifier",
        "timeout": 3000,
        "cwd": REPO,
        "depends_on": [f"r{round_no:02d}-{t}" for t in ids],
        "prompt": (CRITIC_PREAMBLE + f"Team: {team_name}\nOwns: {team['owns']}\n"
                   + "Tasks:\n" + "\n".join(f"  - {t}: {b[:400]}" for t, b in tasks)),
    })
    return {"run_kind": "implementation", "pattern": "team-builders-then-critic",
            "notes": f"Pass 80 round {round_no}, team {team_name}.", "tasks": entries}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=8.0)
    args = ap.parse_args()
    deadline = time.time() + args.hours * 3600
    os.makedirs(LOGDIR, exist_ok=True)

    # Capture the floor once, from the tree as it stands now.
    sh([sys.executable, GATE, "capture"], timeout=3600)
    log("regression floor captured")

    round_no = 0
    cursor = 0
    while time.time() < deadline:
        round_no += 1
        remaining = (deadline - time.time()) / 3600

        # Ask before spawning. A grant of zero means wait, not proceed.
        want = 5
        n = granted(want)
        if n < 2:
            log(f"round {round_no}: budget granted {n}; holding 5 min for headroom")
            time.sleep(300)
            round_no -= 1
            continue

        team = ORDER[cursor % len(ORDER)]
        cursor += 1
        tasks = TEAMS[team]["tasks"][:n]
        log(f"=== ROUND {round_no} | {remaining:.2f}h left | team {team} | "
            f"{len(tasks)} agents (granted {n}) ===")

        spec = build_spec(team, round_no, tasks)
        path = os.path.join(LOGDIR, f"r{round_no:02d}-{team}.json")
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(spec, fh, indent=2)

        rc, out = sh([sys.executable, DISPATCH, path, "--max-parallel", str(max(2, n))],
                     cwd=FLEET, timeout=3600)
        with open(os.path.join(LOGDIR, f"r{round_no:02d}-{team}.out"), "w",
                  encoding="utf-8", newline="\n") as fh:
            fh.write(out)
        log(f"round {round_no} dispatch rc={rc}")

        rc_gate, gate_out = sh([sys.executable, GATE, "check"], timeout=3600)
        verdict = "OK" if rc_gate == 0 else "REGRESSED"
        log(f"round {round_no} gate: {verdict}")

        sh("git add -A", timeout=300)
        msg = (f"gauntlet80(r{round_no}): team {team}, {len(tasks)} agents, gate {verdict}\n\n"
               f"Autonomous round, no human in the loop. Rollback: git tag pass78-fallback.\n"
               f"{gate_out[:1200]}\n\n"
               "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>")
        sh(["git", "commit", "-q", "-m", msg], timeout=300)

        if rc_gate != 0:
            log(f"round {round_no} REGRESSED - stopping so later rounds do not build on it")
            break

    log(f"=== PASS 80 COMPLETE after {round_no} rounds ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
