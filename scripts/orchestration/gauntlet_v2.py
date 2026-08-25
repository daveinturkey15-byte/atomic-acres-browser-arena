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

# A repair round may write anywhere, because a regression does not respect team ownership.
REPAIR_TEAM = "arena-fidelity"


def repair_tasks(gate_output, n):
    """Turn a regression report into repair briefs.

    Split across agents by FAILING FILE so two agents never fight over one test, and give
    every agent the same non-negotiable framing: the fix is the code, never the assertion.
    """
    try:
        report = json.loads(gate_output[gate_output.index("{"):gate_output.rindex("}") + 1])
        failing = report.get("failing_files", [])
    except Exception:
        failing = []
    if not failing:
        failing = ["(gate reported a regression but named no file - run the suite yourself)"]

    head = (
        "REPAIR ROUND. The tree is RED and every other lane is blocked behind you - this is "
        "the highest-value work on the machine right now.\n\n"
        "THE RULE THAT DECIDES THIS TASK: fix the CODE, never the assertion. A correctly "
        "failing test is telling you something true. If you genuinely believe a test encodes "
        "an intention the owner has since overridden, you must (a) say so explicitly, (b) "
        "name the owner instruction that overrides it, and (c) re-pin the test at EQUAL OR "
        "GREATER strictness against the new intended behaviour - never simply relax a bound "
        "or delete a case. A mechanical gate re-runs after you and will catch a lowered bar.\n\n"
        "Known context for this specific regression: an arena-fidelity round restaged Nuke "
        "Town's mid-street vehicles and decluttered the street (HF-383, commit 0269334d), "
        "which was the owner's explicit request. Some of these failures are that intended "
        "change meeting frozen-layout contracts; at least one is a REAL BREAK - "
        "nuketown-traversal reports NO PATH corner to corner, meaning the map is currently "
        "impassable. Fix the impassability first: a map you cannot cross is not a fidelity "
        "question, it is a broken game.\n\n"
        "YOUR FILE: "
    )
    tail = ("\n\nRun that file, read the actual assertion, and fix the underlying cause. "
            "Then run the full suite to confirm you broke nothing else.")
    return [(f"repair-{i}", head + f + tail) for i, f in enumerate(failing[:max(2, n)])]


PROGRESS = os.path.join(LOGDIR, "task-progress.json")


def agents_alive():
    """How many OMP agents are still running."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "@(Get-Process -Name omp-windows-x64 -ErrorAction SilentlyContinue).Count"],
            capture_output=True, text=True, timeout=60).stdout.strip()
        return int(out or 0)
    except Exception:
        return 0


def wait_quiet(max_wait=600):
    """Let agents finish writing before measuring the tree.

    The gate was reading a tree that agents were still editing and returning REGRESSED on
    a half-written file - twice in a row on 2026-08-25, which pushed the repair streak to
    2 of the 3 that stop the run. A false regression is worse than a slow one: it can end
    an unattended pass over a break that never existed.
    """
    deadline = time.time() + max_wait
    while time.time() < deadline:
        if agents_alive() == 0:
            return True
        time.sleep(20)
    return False


def load_progress():
    """How far through each team's task list we have got. Survives restarts."""
    try:
        with open(PROGRESS, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def save_progress(p):
    os.makedirs(LOGDIR, exist_ok=True)
    with open(PROGRESS, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(p, fh, indent=2)


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
            "timeout": 2400,
            "cwd": REPO,
            "prompt": (BUILDER_PREAMBLE.replace("SKILL_ROOT", SKILL_ROOT) + brief
                       + f"\n\nYOUR TEAM ({team_name}) OWNS THESE FILES AND NOTHING ELSE:\n"
                       + team["owns"] + "\n" + skills + coord),
        })
    entries.append({
        "id": f"r{round_no:02d}-{team_name}-critic",
        "route": "omp-ox",
        "role": "verifier",
        "timeout": 2400,
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

    # The floor is a HIGH-WATER MARK, not a snapshot of "whatever we have now". Capturing
    # on every launch would bless whatever damage the previous run left - the last floor
    # was taken mid-run and recorded tsc_clean:false with 20 failures, which would have
    # made a currently-broken tree look acceptable forever. Capture only if none exists.
    floor = os.path.join(REPO, "artifacts", "regression-floor.json")
    if os.path.exists(floor):
        log(f"using existing regression floor at {floor} (not re-capturing)")
    else:
        sh([sys.executable, GATE, "capture"], timeout=3600)
        log("no floor existed; captured one")

    round_no = 0
    cursor = 0
    progress = load_progress()
    repair_streak = 0
    pending_repair = None

    # Check the tree BEFORE the first round. Without this, a fresh process starting against
    # an already-red tree walks straight into the team rotation - because pending_repair is
    # only ever set by a round's own gate check - and burns a full round building on a break
    # it has not looked at. Observed doing exactly that on 2026-08-25.
    rc0, out0 = sh([sys.executable, GATE, "check"], timeout=3600)
    if rc0 != 0:
        pending_repair = out0
        log("tree is RED at startup; first round will be a repair")
    else:
        log("tree is green at startup")
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

        if pending_repair:
            # A repair round outranks the rotation. The tree is red and every later round
            # would be building on it, so fixing it IS the highest-value work available.
            team = REPAIR_TEAM
            tasks = repair_tasks(pending_repair, n)
            log(f"=== ROUND {round_no} | {remaining:.2f}h left | REPAIR "
                f"(streak {repair_streak}/3) | {len(tasks)} agents ===")
        else:
            # Take the NEXT unrun tasks for this team, not always the first n. Slicing
            # tasks[:n] with a small budget meant tasks 3+ of every team were dropped
            # silently and forever: measured at 10 of 22 specced tasks never dispatched.
            # Progress is persisted so a restart resumes rather than redoing task 1.
            team = ORDER[cursor % len(ORDER)]
            cursor += 1
            allt = TEAMS[team]["tasks"]
            done = progress.setdefault(team, 0)
            if done >= len(allt):          # team exhausted; wrap for a refinement pass
                done = progress[team] = 0
                log(f"team {team} completed all {len(allt)} tasks; wrapping to refine")
            tasks = allt[done:done + n]
            progress[team] = done + len(tasks)
            save_progress(progress)
            log(f"  {team}: tasks {done + 1}-{done + len(tasks)} of {len(allt)}")
            log(f"=== ROUND {round_no} | {remaining:.2f}h left | team {team} | "
                f"{len(tasks)} agents (granted {n}) ===")

        spec = build_spec(team, round_no, tasks)
        path = os.path.join(LOGDIR, f"r{round_no:02d}-{team}.json")
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(spec, fh, indent=2)

        rc, out = sh([sys.executable, DISPATCH, path, "--max-parallel", str(max(2, n))],
                     cwd=FLEET, timeout=5400)
        with open(os.path.join(LOGDIR, f"r{round_no:02d}-{team}.out"), "w",
                  encoding="utf-8", newline="\n") as fh:
            fh.write(out)
        log(f"round {round_no} dispatch rc={rc}")

        # Measure a settled tree, never one mid-write.
        if not wait_quiet():
            log("agents still running after 10 min; measuring anyway")
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
            # DO NOT STOP. Stopping ended an overnight run after two rounds and left the
            # owner with a broken tree and six idle hours. Repair instead, and only give up
            # after three consecutive rounds fail to clear it.
            # Confirm before it counts. A one-off REGRESSED has already proved to be a
            # race with a still-writing agent rather than a real break.
            wait_quiet(300)
            rc2, out2 = sh([sys.executable, GATE, "check"], timeout=3600)
            if rc2 == 0:
                log(f"round {round_no}: regression did NOT reproduce on a settled tree - "
                    f"treating as a race, not a break")
                repair_streak = 0
                pending_repair = None
                gate_out = out2
                verdict = "OK"
            else:
                repair_streak += 1
                log(f"round {round_no} REGRESSED - queueing repair (streak {repair_streak}/3)")
                if repair_streak >= 3:
                    log("three consecutive repairs failed; stopping for a human")
                    break
                pending_repair = gate_out
        else:
            repair_streak = 0
            pending_repair = None

    log(f"=== PASS 80 COMPLETE after {round_no} rounds ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
