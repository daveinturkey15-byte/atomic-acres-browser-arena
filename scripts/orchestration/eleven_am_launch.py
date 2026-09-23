#!/usr/bin/env python3
"""At 11:00 exactly: clear ComfyUI and let the swarm scale up.

The owner authorised this explicitly on 2026-08-25 ("at 11 spin up everything we discussed
and clear comfyui regardless"). Before that authorisation it would have been wrong to touch
it - an earlier cleanup killed a generation he was actively running, because a 12-hour-old
process looked orphaned when it was not. So this waits for the clock rather than acting on
a memory reading.

It does NOT start the gauntlet: that loop is already running and polls the governor every
five minutes. Freeing the memory is sufficient - the next poll grants a full budget and it
dispatches itself. Anything else would risk two loops writing the same files.
"""
import datetime as dt
import os
import subprocess
import sys
import time

REPO = r"C:\Users\david\projects\atomic-acres-gauntlet"
LOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet.log")
# Owner moved this from 11:00 to 11:30 on 2026-08-25. Overridable from argv as HH:MM
TARGET_HOUR, TARGET_MIN = 11, 30
if len(sys.argv) > 1 and ":" in sys.argv[1]:
    TARGET_HOUR, TARGET_MIN = (int(x) for x in sys.argv[1].split(":", 1))


def log(m):
    line = f"[11am-launch] {dt.datetime.now():%H:%M:%S} {m}"
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def ps(cmd):
    return subprocess.run(["powershell", "-NoProfile", "-Command", cmd],
                          capture_output=True, text=True, timeout=180).stdout.strip()


def free_gb():
    try:
        return round(int(ps("(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory")) / 1024 / 1024, 2)
    except Exception:
        return -1.0


now = dt.datetime.now()
target = now.replace(hour=TARGET_HOUR, minute=TARGET_MIN, second=0, microsecond=0)
if target < now:
    target += dt.timedelta(days=1)
log(f"armed; will clear ComfyUI at {target:%H:%M}, {(target - now).total_seconds() / 60:.0f} min away")

while dt.datetime.now() < target:
    time.sleep(20)

before = free_gb()
log(f"11:00 reached. free before: {before} GB")

# Stop ComfyUI. Owner-authorised for this moment only; this script is not a standing policy.
killed = ps(
    "$n=0; Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -EA SilentlyContinue | "
    "Where-Object { $_.CommandLine -match 'ComfyUI' } | ForEach-Object { "
    "Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue; $n++ }; $n")
log(f"ComfyUI processes stopped: {killed or 0}")

# Orphaned automation browsers and relay helpers left by earlier rounds.
ps("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" -EA SilentlyContinue | "
   "Where-Object { $_.CommandLine -match 'user-data-dir=.*(Temp|wgpuboot|playwright|scoped_dir|puppeteer)' } | "
   "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }")
live = ps("@(Get-Process -Name omp-windows-x64 -EA SilentlyContinue).Count") or "0"
ps(f"$live={live}; $r=@(Get-Process -Name relay_win -EA SilentlyContinue | Sort-Object StartTime); "
   "$o=[Math]::Max(0,$r.Count-$live); $r | Select-Object -First $o | Stop-Process -Force -EA SilentlyContinue")

time.sleep(25)
after = free_gb()
log(f"free after: {after} GB (gained {round(after - before, 2)} GB)")
log("the running gauntlet polls the governor every 5 min and will dispatch on its next "
    "check - deliberately not starting a second loop")
