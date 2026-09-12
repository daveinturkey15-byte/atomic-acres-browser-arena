#!/usr/bin/env python3
"""Wait for the current gauntlet round to finish, then relaunch with the fixed code.

The running loop holds an older gauntlet_v2 in memory - it drops tasks 3+ of every team
and does not check the tree before its first round. Both are fixed on disk, but a running
Python process does not reload its own source.

Killing it mid-round would orphan its dispatcher and leave agents writing files while a
fresh loop dispatched overlapping work into the same team's files. So: wait for the round
to complete, kill only then, and relaunch.
"""
import os
import subprocess
import sys
import time

REPO = r"C:\Users\david\projects\atomic-acres-gauntlet"
LOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet.log")
PY = sys.executable
GAUNTLET = os.path.join(REPO, "scripts", "orchestration", "gauntlet_v2.py")
OLD_PID = int(sys.argv[1]) if len(sys.argv) > 1 else 0


def log(m):
    line = f"[restart-watch] {time.strftime('%H:%M:%S')} {m}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def alive(pid):
    if not pid:
        return False
    out = subprocess.run(["powershell", "-NoProfile", "-Command",
                          f"if (Get-Process -Id {pid} -ErrorAction SilentlyContinue)"
                          f" {{'Y'}} else {{'N'}}"],
                         capture_output=True, text=True, timeout=60).stdout.strip()
    return out == "Y"


def rounds_done():
    """Count completed rounds by their gate lines - the last thing a round writes."""
    try:
        with open(LOG, encoding="utf-8", errors="replace") as fh:
            return sum(1 for ln in fh if "gate:" in ln and "round" in ln)
    except OSError:
        return 0


start = rounds_done()
log(f"waiting for the in-flight round to land (gate lines seen: {start})")

deadline = time.time() + 7200  # a round is capped at 90 min; 2h is a generous backstop
while time.time() < deadline:
    if not alive(OLD_PID):
        log("old loop already exited")
        break
    if rounds_done() > start:
        log("round landed")
        break
    time.sleep(30)

if alive(OLD_PID):
    subprocess.run(["powershell", "-NoProfile", "-Command",
                    f"Stop-Process -Id {OLD_PID} -Force -ErrorAction SilentlyContinue"],
                   capture_output=True, timeout=60)
    log(f"stopped old loop pid {OLD_PID}")

# Let any agents from that round finish writing before a new loop touches the same files.
time.sleep(60)

p = subprocess.Popen([PY, GAUNTLET, "--hours", "11"], cwd=REPO,
                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
log(f"relaunched gauntlet with task-progress tracking, pid {p.pid}")
