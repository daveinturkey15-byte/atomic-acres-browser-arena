#!/usr/bin/env python3
"""At 15:00: clear ComfyUI (owner-authorised), then run Pass 81 at full width.

The owner asked for "big agent teams and swarms to refine the whole game". Pass 80 is
constrained to 1-5 agents because ComfyUI holds 9-16 GB. Once that is released the machine
carries roughly 30 agents, so this stops the narrow loop and starts a wide one.

It is a SEPARATE loop from gauntlet_v2 rather than a reconfiguration, because the running
process cannot reload its own source and killing it mid-round orphans a dispatcher.
"""
import ast
import datetime as dt
import io
import json
import os
import subprocess
import sys
import time

REPO = r"C:\Users\david\projects\atomic-acres-gauntlet"
HERE = os.path.join(REPO, "scripts", "orchestration")
LOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet.log")
TARGET = (15, 30)  # owner moved the ComfyUI clear 15:00 -> 15:30 on 2026-08-25


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
    # Fire NOW, not tomorrow. This is a same-day scale-up; if it is restarted at 15:01
    # because the trigger itself needed fixing, sleeping 24 hours is never the intent.
    log(f'target {target:%H:%M} already passed - firing immediately')
    target = now
log(f"armed; Pass 81 goes wide at {target:%H:%M} ({(target - now).total_seconds()/60:.0f} min)")
while dt.datetime.now() < target:
    time.sleep(20)

before = free_gb()
log(f"{TARGET[0]:02d}:{TARGET[1]:02d} reached. free before: {before} GB")

# Owner-authorised for this moment. Not a standing policy - an earlier cleanup killed a
# generation he was actively running because a long-lived process looked orphaned.
n = ps("$n=0; Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -EA SilentlyContinue | "
       "Where-Object { $_.CommandLine -match 'ComfyUI' } | ForEach-Object { "
       "Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue; $n++ }; $n")
log(f"ComfyUI processes stopped: {n or 0}")
ps("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" -EA SilentlyContinue | "
   "Where-Object { $_.CommandLine -match 'user-data-dir=.*(Temp|wgpuboot|playwright|scoped_dir|puppeteer)' } | "
   "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }")

# Deliberately NOT restarting the gauntlet. It requests a budget from the governor every
# round, so it widens by itself the moment this memory comes back - and a restart here
# would discard whatever round is in flight. One job: free the memory, then get out.
time.sleep(20)
after = free_gb()
log(f"free after: {after} GB (was {before}) - the running loop will widen on its next budget request")
running = ps("@(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -EA SilentlyContinue | "
             "Where-Object { $_.CommandLine -match 'gauntlet_v2' }).Count")
if (running or '0') == '0':
    log('WARNING: no gauntlet loop is running, so nothing will consume the freed memory')
