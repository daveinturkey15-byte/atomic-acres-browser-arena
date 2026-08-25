#!/usr/bin/env python3
"""Give the machine back when the owner's ComfyUI window closes (currently 18:00).

The owner asked for ~1 hour of ComfyUI at 16:35, so the governor was tightened
(reserve 5.5 -> 11.0 GB, browser and verify slots 2 -> 1) to starve the swarm rather than
kill agents mid-task. This restores it on the clock, so he does not have to ask for his own
machine back - and so the blitz does not sit at "granted 0" all evening because a temporary
window was never closed. That has already happened once today with a stale trigger.
"""
import datetime as dt
import io
import os
import time

REPO = r"C:\Users\david\projects\atomic-acres-gauntlet"
P = os.path.join(REPO, "scripts", "orchestration", "governor.py")
LOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet.log")

now = dt.datetime.now()
target = now.replace(hour=18, minute=0, second=0, microsecond=0)
if target < now:
    target = now
while dt.datetime.now() < target:
    time.sleep(15)

s = io.open(P, encoding="utf-8", newline="").read()
for a, b in [("RESERVE_GB = 11.0  # 18:00 window: owner needs ~9 GB for ComfyUI", "RESERVE_GB = 5.5"),
             ("BROWSER_SLOTS = 1  # 18:00 window", "BROWSER_SLOTS = 2"),
             ("VERIFY_SLOTS = 1  # 18:00 window; vitest peaks at 5.63 GB", "VERIFY_SLOTS = 2")]:
    s = s.replace(a, b, 1)
io.open(P, "w", encoding="utf-8", newline="").write(s)
line = f"[restore] {dt.datetime.now():%H:%M:%S} governor restored (reserve 5.5, slots 2/2) - blitz widens next round"
print(line, flush=True)
with open(LOG, "a", encoding="utf-8") as fh:
    fh.write(line + "\n")
