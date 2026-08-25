#!/usr/bin/env python3
"""At 15:00: clear ComfyUI (owner-authorised), then run Pass 81 at full width.

The owner asked for "big agent teams and swarms to refine the whole game". Pass 80 is
constrained to 1-5 agents because ComfyUI holds 9-16 GB. Once that is released the machine
carries roughly 30 agents, so this stops the narrow loop and starts a wide one.

It is a SEPARATE loop from gauntlet_v2 rather than a reconfiguration, because the running
process cannot reload its own source and killing it mid-round orphans a dispatcher.
"""
import datetime as dt
import json
import os
import subprocess
import sys
import time

REPO = r"C:\Users\david\projects\atomic-acres-gauntlet"
HERE = os.path.join(REPO, "scripts", "orchestration")
LOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet.log")
TARGET = (15, 0)


def log(m):
    line = f"[scale-up] {dt.datetime.now():%H:%M:%S} {m}"
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
    target += dt.timedelta(days=1)
log(f"armed; Pass 81 goes wide at {target:%H:%M} ({(target - now).total_seconds()/60:.0f} min)")
while dt.datetime.now() < target:
    time.sleep(20)

before = free_gb()
log(f"15:00 reached. free before: {before} GB")

# Owner-authorised for this moment. Not a standing policy - an earlier cleanup killed a
# generation he was actively running because a long-lived process looked orphaned.
n = ps("$n=0; Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -EA SilentlyContinue | "
       "Where-Object { $_.CommandLine -match 'ComfyUI' } | ForEach-Object { "
       "Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue; $n++ }; $n")
log(f"ComfyUI processes stopped: {n or 0}")
ps("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" -EA SilentlyContinue | "
   "Where-Object { $_.CommandLine -match 'user-data-dir=.*(Temp|wgpuboot|playwright|scoped_dir|puppeteer)' } | "
   "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }")

# Stop the narrow Pass 80 loop and let its agents drain, so two loops never write at once.
ps("Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -EA SilentlyContinue | "
   "Where-Object { $_.CommandLine -match 'gauntlet_v2' } | "
   "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }")
log("Pass 80 loop stopped; waiting for its agents to drain before starting Pass 81")
for _ in range(30):
    if (ps("@(Get-Process -Name omp-windows-x64 -EA SilentlyContinue).Count") or "0") == "0":
        break
    time.sleep(20)

time.sleep(20)
log(f"free after: {free_gb()} GB")

# Pass 81 reuses the same loop with the refinement team set.
sw = os.path.join(HERE, "pass81_switch.py")
with open(sw, "w", encoding="utf-8", newline="\n") as fh:
    fh.write(
        "import io, os, sys\n"
        "p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gauntlet_v2.py')\n"
        "s = io.open(p, encoding='utf-8', newline='').read()\n"
        "s = s.replace('from pass80_teams import', 'from pass81_teams import')\n"
        "s = s.replace('ORDER = [\"gameplay-test\", \"arena-fidelity\", \"assets-imagegen\"]',\n"
        "              'ORDER = [\"multiplayer-hardening\", \"arena-polish\", \"arms-and-skins\",\\n"
        "         \"look-and-feel\", \"assets-generation\", \"perf-and-boot\"]')\n"
        "io.open(p, 'w', encoding='utf-8', newline='').write(s)\n"
        "print('gauntlet switched to pass81 teams')\n")
rc = subprocess.run([sys.executable, sw], cwd=REPO, capture_output=True, text=True, timeout=180)
log(rc.stdout.strip() or rc.stderr.strip()[:200])

# Fresh progress file: Pass 81 is a different task list, not a continuation of Pass 80's.
prog = os.path.join(REPO, "artifacts", "pass80-logs", "task-progress.json")
try:
    os.replace(prog, prog + ".pass80")
except OSError:
    pass

p = subprocess.Popen([sys.executable, os.path.join(HERE, "gauntlet_v2.py"), "--hours", "10"],
                     cwd=REPO, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
log(f"PASS 81 LAUNCHED WIDE, pid {p.pid} - 6 teams, 22 refinement tasks, ~30 agent budget")
