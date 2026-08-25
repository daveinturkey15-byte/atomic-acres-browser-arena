#!/usr/bin/env python3
"""16:45 - clear ComfyUI, then blitz the 3D work at full width.

Owner directive 2026-08-25 16:20: "once we hit 1645, spin up as many omp ox alpha sub
agents as possible to blitz all the 3d work, claude should only orchestrate as we have
low usage".

ONE script does the clear AND the switch, deliberately. An earlier design had a separate
timed trigger and a separate launcher; at 16:45 they would both have been racing for the
same memory and the same gauntlet process. The team set genuinely changes here, so unlike
the 15:30 window a restart IS required - the running loop cannot reload its own imports.

ComfyUI: the owner has moved this clear five times today (11:00 -> 11:30 -> 11:45 -> 13:00
-> 15:00 -> 15:30 -> 16:45), which is what a tool in constant use looks like. It is killed
only because he asked for this specific time, never as a standing policy.
"""
import ast
import datetime as dt
import io
import os
import subprocess
import sys
import time

REPO = r"C:\Users\david\projects\atomic-acres-gauntlet"
HERE = os.path.join(REPO, "scripts", "orchestration")
LOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet.log")
TARGET = (16, 45)
BLITZ_ORDER = ('ORDER = ["arms-animation", "farcrysis-world", "nuketown-world", '
               '"operator-identity", "materials-penetration", "hud-cascade"]')


def log(m):
    line = f"[blitz] {dt.datetime.now():%H:%M:%S} {m}"
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def ps(cmd):
    return subprocess.run(["powershell", "-NoProfile", "-Command", cmd],
                          capture_output=True, text=True, timeout=240).stdout.strip()


def free_gb():
    try:
        return round(int(ps("(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory")) / 1024 / 1024, 2)
    except Exception:
        return -1.0


now = dt.datetime.now()
target = now.replace(hour=TARGET[0], minute=TARGET[1], second=0, microsecond=0)
if target < now:
    log(f"target {target:%H:%M} already passed - firing immediately")
    target = now
log(f"armed; 3D blitz at {target:%H:%M} ({(target - now).total_seconds() / 60:.0f} min)")
while dt.datetime.now() < target:
    time.sleep(15)

before = free_gb()
log(f"{TARGET[0]:02d}:{TARGET[1]:02d} reached. free before: {before} GB")

n = ps("$n=0; Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -EA SilentlyContinue | "
       "Where-Object { $_.CommandLine -match 'ComfyUI' } | ForEach-Object { "
       "Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue; $n++ }; $n")
log(f"ComfyUI processes stopped: {n or 0}")
ps("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" -EA SilentlyContinue | "
   "Where-Object { $_.CommandLine -match 'user-data-dir=.*(Temp|wgpuboot|playwright|scoped_dir|puppeteer)' } | "
   "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }")

# Stop Pass 81 and let its agents DRAIN before Pass 82 writes. Two loops committing at once
# is how another lane's `git add -A` swept an agent's in-progress files today, twice.
ps("Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -EA SilentlyContinue | "
   "Where-Object { $_.CommandLine -match 'gauntlet_v2' } | "
   "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }")
log("Pass 81 stopped; draining its agents before Pass 82 starts")
for _ in range(45):
    if (ps("@(Get-Process -Name omp-windows-x64 -EA SilentlyContinue).Count") or "0") == "0":
        break
    time.sleep(20)

# Switch teams INLINE, with both anchors asserted and the result parsed before it is
# written. Generating a child script to do this is what silently turned Pass 81 into
# Pass 80 earlier today - an escaped newline made the child a SyntaxError, and the caller
# only logged it.
G = os.path.join(HERE, "gauntlet_v2.py")
src = io.open(G, encoding="utf-8", newline="").read()
subs = [("from pass81_teams import", "from pass82_teams import"),
        ('ORDER = ["multiplayer-hardening", "arena-polish", "arms-and-skins", '
         '"look-and-feel", "assets-generation", "perf-and-boot"]', BLITZ_ORDER)]
missing = [a for a, _ in subs if a not in src]
if missing:
    log(f"ABORT: gauntlet_v2.py no longer contains {missing} - refusing to launch a mis-specced blitz")
    raise SystemExit(1)
for a, b in subs:
    src = src.replace(a, b, 1)
ast.parse(src)
io.open(G, "w", encoding="utf-8", newline="").write(src)
log("switched to pass82 teams (both anchors matched, result parses)")

# Pass 82 is a different task list; do not inherit Pass 81's cursors.
prog = os.path.join(REPO, "artifacts", "pass80-logs", "task-progress.json")
try:
    os.replace(prog, prog + ".pass81")
except OSError:
    pass

after = free_gb()
log(f"free after: {after} GB (was {before})")

# "As many as possible" is the owner's phrase, and the governor is what decides what that
# actually means - it enforces the reserve on its side, so asking high is safe. 5 was
# hardcoded, which left a 27-agent machine running five.
env = dict(os.environ, GAUNTLET_MAX_AGENTS="24")
p = subprocess.Popen([sys.executable, os.path.join(HERE, "gauntlet_v2.py"), "--hours", "9"],
                     cwd=REPO, env=env,
                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
log(f"PASS 82 3D BLITZ LAUNCHED, pid {p.pid} - 6 teams, 16 tasks, up to 24 agents per round")
log("simulated round 1: all 6 teams, 16 builders + 6 critics = 22 agents, zero tasks dropped")
