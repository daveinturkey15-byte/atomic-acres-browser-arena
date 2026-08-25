#!/usr/bin/env python3
"""Memory governor and browser semaphore — clever parallelism, not just fewer agents.

WHY THIS EXISTS. On 2026-08-24 a 52-agent swarm took the machine to 6 GB free of 31.6 GB
and the owner's headless Hermes agent on WSL began crashing. WSL is the invisible victim
here: its VM is not a normal process, so it does not show up when you eyeball a process
list, and Windows will happily starve it. Measured cost per OMP agent that day was roughly
320 MB (~220 MB agent + ~100 MB relay helper), and a single headed Chrome doing WebGPU
work is worth several agents on its own.

Two mechanisms, because agents and browsers are different problems:

  1. MEMORY GOVERNOR - reserves a floor of RAM that the swarm may never eat into, and
     derives a safe agent count from what is actually free right now rather than from a
     number someone guessed once.

  2. BROWSER SEMAPHORE - a filesystem lock with a small fixed number of slots. Agent code
     work is cheap and can run wide; headed-Chrome WebGPU verification is expensive and
     must run narrow. Without this, twenty agents all reach their verification step around
     the same time and launch twenty browsers at once, which is exactly the spike that
     kills WSL.

Usage:
    python governor.py status                 # what is free, what is safe
    python governor.py wait --need 4          # block until N agents' worth is free
    python governor.py plan --agents 52       # how to stage a wave of this size
    python governor.py browser-acquire --id X # take a browser slot (blocks)
    python governor.py browser-release --id X
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

# Measured on this machine, 2026-08-24: ~220 MB per omp-windows-x64 plus ~100 MB relay.
AGENT_GB = 0.35
# Never eat into this. WSL/Hermes, the owner's own browser, and the OS all live here.
#
# REVISED 2026-08-25 FROM MEASUREMENT, after 10.0 proved unachievable and therefore
# blocked every round forever - which is the same "it stopped working" failure as a crash,
# just quieter. What the machine actually looks like with almost no agents running:
#   free 6.6 GB / 31.6 GB, sum of ALL process working sets 20.9 GB,
#   Memory Compression 3.7 GB, commit charge 60.5 GB against an 85.6 GB limit.
# The load is broad and mostly not ours - svchost 2.3, explorer 1.8, chrome+edge 1.5,
# claude 1.6 - against roughly 2.9 GB of agents. A 10 GB reserve cannot be reached without
# closing the owner's own applications, so the governor would hold indefinitely.
#
# What the reserve actually has to protect is vmmemWSL, measured at 1.37 GB and healthy.
# Hermes began crashing when free fell to 3.5 GB. 5.5 GB leaves WSL its working set plus
# roughly 4 GB of margin, and still refuses to dispatch into the danger zone.
RESERVE_GB = 11.0  # 17:30 window: owner needs ~9 GB for ComfyUI
# Headed Chrome doing WebGPU is worth several agents. Keep it strictly narrow.
BROWSER_SLOTS = 1  # 17:30 window
# MEASURED 2026-08-25, and the single most important number here: an ox-alpha agent costs
# ~0.35 GB, but the `npx vitest run` it is told to perform peaks at 5.63 GB and `tsc
# --noEmit` at 3.41 GB. Verification is SIXTEEN TIMES the agent that requests it. Five
# agents verifying together is ~28 GB - the whole machine - which is why rounds appeared to
# be "too many agents" when they were really too many concurrent test runs.
VERIFY_SLOTS = 1  # 17:30 window; vitest peaks at 5.63 GB
VERIFY_GB = 5.7  # peak observed for a full vitest run
# A FIXED, CROSS-HARNESS path - deliberately NOT %TEMP%. Claude Code, OMP, Codex and the
# WSL-hosted Hermes agent must all see the SAME slots; if each harness gets its own private
# semaphore the whole point is lost. WSL reaches this as
# /mnt/c/Users/david/.agent-coordination/browser-slots
COORD = r"C:\Users\david\.agent-coordination"
LOCKDIR = os.path.join(COORD, "browser-slots")
VERIFYDIR = os.path.join(COORD, "verify-slots")


def free_gb() -> float:
    """Free physical memory in GB, via PowerShell because psutil is not guaranteed here."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return round(int(out) / 1024 / 1024, 2)
    except Exception:
        return -1.0


def safe_agents() -> int:
    """How many agents the CURRENT free memory can carry above the reserve."""
    f = free_gb()
    if f < 0:
        return 2  # cannot measure: assume the worst, not the best
    return max(0, int((f - RESERVE_GB) / AGENT_GB))


def cmd_status():
    f = free_gb()
    print(json.dumps({
        "free_gb": f,
        "reserve_gb": RESERVE_GB,
        "per_agent_gb": AGENT_GB,
        "safe_agents_now": safe_agents(),
        "browser_slots": BROWSER_SLOTS,
        "browser_slots_taken": len(os.listdir(LOCKDIR)) if os.path.isdir(LOCKDIR) else 0,
        "verify_slots": VERIFY_SLOTS,
        "verify_slots_taken": len(os.listdir(VERIFYDIR)) if os.path.isdir(VERIFYDIR) else 0,
    }, indent=2))


def cmd_wait(need: int, timeout_s: int):
    """Block until `need` agents' worth of headroom exists, or give up honestly."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if safe_agents() >= need:
            print(f"OK {free_gb()} GB free; {need} agents fit")
            return 0
        print(f"waiting: {free_gb()} GB free, need room for {need} "
              f"({safe_agents()} fit now)", flush=True)
        time.sleep(20)
    print(f"TIMEOUT after {timeout_s}s; only room for {safe_agents()}", file=sys.stderr)
    return 1


def cmd_plan(agents: int):
    """Stage a wave so it never exceeds what is safe, instead of firing it all at once."""
    n = safe_agents()
    if n <= 0:
        print(json.dumps({
            "verdict": "HOLD",
            "reason": f"only {free_gb()} GB free; reserve is {RESERVE_GB} GB",
            "advice": "close browsers or let the current wave drain before dispatching",
        }, indent=2))
        return 1
    waves = (agents + n - 1) // n
    print(json.dumps({
        "verdict": "GO",
        "free_gb": free_gb(),
        "concurrent_agents": n,
        "requested": agents,
        "waves": waves,
        "note": ("run each wave to completion before starting the next; "
                 "browser verification is separately capped at "
                 f"{BROWSER_SLOTS} concurrent"),
    }, indent=2))
    return 0


def cmd_verify(action: str, ident: str, timeout_s: int):
    """Slot for `tsc`/`vitest`. Same shape as the browser semaphore, different budget.

    Without this, every agent runs a full suite whenever it likes and the machine sees
    several 5.6 GB node processes at once. With it, verification queues instead of
    colliding - slower per agent, but the run stops dying.
    """
    os.makedirs(VERIFYDIR, exist_ok=True)
    path = os.path.join(VERIFYDIR, f"{ident}.slot")
    if action == "release":
        try:
            os.remove(path)
        except OSError:
            pass
        print(f"released verify {ident}")
        return 0
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        now = time.time()
        for f in os.listdir(VERIFYDIR):
            fp = os.path.join(VERIFYDIR, f)
            try:
                if now - os.path.getmtime(fp) > 900:  # a suite run is ~30s; 15 min is dead
                    os.remove(fp)
            except OSError:
                pass
        if len(os.listdir(VERIFYDIR)) < VERIFY_SLOTS and free_gb() > VERIFY_GB:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(str(os.getpid()))
            print(f"acquired verify {ident}")
            return 0
        time.sleep(10)
    print(f"TIMEOUT waiting for a verify slot ({ident})", file=sys.stderr)
    return 1


def cmd_browser(action: str, ident: str, timeout_s: int):
    """A slot-based semaphore. Stale slots are reclaimed so a crashed agent cannot wedge it."""
    os.makedirs(LOCKDIR, exist_ok=True)
    path = os.path.join(LOCKDIR, f"{ident}.slot")
    if action == "release":
        try:
            os.remove(path)
        except OSError:
            pass
        print(f"released {ident}")
        return 0

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        # Reclaim slots older than 20 minutes: an agent that died holding one must not
        # block every other agent forever.
        now = time.time()
        for f in os.listdir(LOCKDIR):
            p = os.path.join(LOCKDIR, f)
            try:
                if now - os.path.getmtime(p) > 1200:
                    os.remove(p)
            except OSError:
                pass
        if len(os.listdir(LOCKDIR)) < BROWSER_SLOTS and free_gb() > RESERVE_GB:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(str(os.getpid()))
            print(f"acquired {ident}")
            return 0
        time.sleep(15)
    print(f"TIMEOUT waiting for a browser slot ({ident})", file=sys.stderr)
    return 1


def cmd_budget(want: int, who: str):
    """Ask permission to start `want` agents. ANY harness may call this.

    This is the central-coordination entry point. OMP, Codex or the WSL Hermes agent call
    it exactly as Claude Code does, so every caller sees the same arithmetic against the
    same live measurement rather than each guessing privately.

    It grants a NUMBER, never a yes/no: a caller that asked for twelve and can have three
    still makes progress instead of stalling, which is what keeps a coordinator useful
    under pressure rather than merely obstructive.
    """
    n = safe_agents()
    grant = max(0, min(want, n))
    os.makedirs(COORD, exist_ok=True)
    rec = {
        "harness": who,
        "requested": want,
        "granted": grant,
        "free_gb": free_gb(),
        "reserve_gb": RESERVE_GB,
        "reason": "ok" if grant == want else
                  f"capped: only {n} agents fit above the {RESERVE_GB} GB reserve",
    }
    # Append-only, so humans and other harnesses can see who asked for what and when.
    with open(os.path.join(COORD, "budget-log.jsonl"), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec) + "\n")
    print(json.dumps(rec, indent=2))
    return 0 if grant > 0 else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("verb", choices=["status", "wait", "plan", "budget",
                                     "browser-acquire", "browser-release",
                                     "verify-acquire", "verify-release"])
    ap.add_argument("--need", type=int, default=4)
    ap.add_argument("--agents", type=int, default=10)
    ap.add_argument("--want", type=int, default=4)
    ap.add_argument("--who", default="unknown")
    ap.add_argument("--id", default="anon")
    ap.add_argument("--timeout", type=int, default=1800)
    a = ap.parse_args()

    if a.verb == "status":
        cmd_status(); return 0
    if a.verb == "wait":
        return cmd_wait(a.need, a.timeout)
    if a.verb == "plan":
        return cmd_plan(a.agents)
    if a.verb == "budget":
        return cmd_budget(a.want, a.who)
    if a.verb.startswith("verify-"):
        return cmd_verify(a.verb.split("-", 1)[1], a.id, a.timeout)
    return cmd_browser(a.verb.split("-", 1)[1], a.id, a.timeout)


if __name__ == "__main__":
    sys.exit(main())
