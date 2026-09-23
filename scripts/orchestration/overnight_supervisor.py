#!/usr/bin/env python3
"""Keep the overnight pass alive, and publish the moment it deserves it.

Owner, 2026-08-25 19:00: "work continuously ... please dont stop to ask silly questions
just find ways to solve problems without me and work continuously on a smart hillclimb
loop", and publish to gh-pages when confident so he can test in the morning.

Three jobs, and each exists because of something that actually went wrong today:

1. RESTART THE LOOP IF IT DIES. The gauntlet died once today and sat dead for 25 minutes
   before anyone noticed. An unattended run that silently stops is worse than no run,
   because the morning verdict is "you had twelve hours and did nothing".

2. HEAL A BROKEN TOOLCHAIN. node_modules/.bin vanished mid-pass, npx could resolve neither
   tsc nor vitest, the gate "failed" in three seconds and the round committed anyway.
   The gate now reports CANNOT_MEASURE; this repairs the cause rather than waiting for a
   human, because there is no human until morning.

3. PUBLISH WHEN IT HAS EARNED IT, and keep publishing as it improves. Each attempt
   re-proves the gate, the production build and a six-arena WebGPU boot, so a later publish
   can only ever replace an earlier one with something equally verified. If the checks fail
   the build simply is not published and the previous one stands.

Deliberately NOT here: anything that touches ComfyUI, and anything that lowers the
governor's reserve. Hermes on WSL crashes below 3.5 GB free and that floor is not the
swarm's to negotiate, least of all unattended at 3 a.m.
"""
from __future__ import annotations

import datetime as dt
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
LOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet.log")
PUBLISH = os.path.join(HERE, "publish_pass80.py")
GAUNTLET = os.path.join(HERE, "gauntlet_v2.py")
PUBLISH_EVERY_S = 2 * 3600
CHECK_EVERY_S = 300


def log(m):
    line = f"[supervisor] {dt.datetime.now():%H:%M:%S} {m}"
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def ps(cmd):
    return subprocess.run(["powershell", "-NoProfile", "-Command", cmd],
                          capture_output=True, text=True, timeout=240).stdout.strip()


def loop_alive():
    n = ps("@(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" -EA SilentlyContinue | "
           "Where-Object { $_.CommandLine -match 'gauntlet_v2' }).Count")
    return (n or "0") != "0"


def toolchain_ok():
    p = subprocess.run("npx tsc --version", cwd=REPO, shell=True, capture_output=True,
                       text=True, timeout=300)
    return p.returncode == 0 and "Version" in (p.stdout or "")


def heal_toolchain():
    log("toolchain is broken - repairing node_modules/.bin")
    # --ignore-scripts is required: npm rebuild deadlocks because its own precompile step
    # needs rimraf, which is itself one of the missing shims.
    p = subprocess.run("npm install --ignore-scripts --no-audit --no-fund --prefer-offline",
                       cwd=REPO, shell=True, capture_output=True, text=True, timeout=1800)
    log(f"repair rc={p.returncode}; toolchain ok now: {toolchain_ok()}")


CRASHLOG = os.path.join(REPO, "artifacts", "pass80-logs", "gauntlet-stderr.log")


def start_loop(hours):
    """Start the loop with its output CAPTURED.

    It was previously launched detached with stdout and stderr discarded, so when it died of
    a KeyError on its first repair round the traceback went nowhere and it simply appeared
    'not running' minutes later. A crash nobody can see is indistinguishable from a crash
    nobody had - and it cost most of an evening.
    """
    env = dict(os.environ, GAUNTLET_MAX_AGENTS="24")
    fh = open(CRASHLOG, "a", encoding="utf-8")
    fh.write(os.linesep + f"===== loop start {dt.datetime.now():%Y-%m-%d %H:%M:%S} =====" + os.linesep)
    fh.flush()
    p = subprocess.Popen([sys.executable, GAUNTLET, "--hours", str(hours)],
                         cwd=REPO, env=env, stdout=fh, stderr=subprocess.STDOUT,
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    log(f"gauntlet started, pid {p.pid}, {hours:.1f}h budget (output -> {os.path.basename(CRASHLOG)})")


def report_recent_crash():
    """If the loop died, surface WHY into the main log instead of restarting blind."""
    try:
        tail = open(CRASHLOG, encoding="utf-8", errors="replace").read()[-1200:]
    except OSError:
        return
    if "Traceback" in tail:
        for line in tail.strip().splitlines()[-4:]:
            log(f"  crash: {line.strip()[:160]}")


def main():
    deadline = time.time() + 12 * 3600
    next_publish = time.time() + 45 * 60      # first attempt once a round has landed
    published = 0
    log("overnight supervisor up: keeping the loop alive, healing the toolchain, "
        "publishing when the build earns it")

    while time.time() < deadline:
        if not toolchain_ok():
            heal_toolchain()

        if not loop_alive():
            remaining = max(0.5, (deadline - time.time()) / 3600)
            log("gauntlet is NOT running - restarting it")
            report_recent_crash()
            start_loop(remaining)

        if time.time() >= next_publish:
            next_publish = time.time() + PUBLISH_EVERY_S
            log("attempting a publish; it self-verifies and will refuse if unproven")
            p = subprocess.run([sys.executable, PUBLISH], cwd=REPO, capture_output=True,
                               text=True, timeout=7200)
            tail = (p.stdout or "").strip().splitlines()[-3:]
            for line in tail:
                log(f"  {line}")
            if p.returncode == 0:
                published += 1
                log(f"PUBLISHED (attempt count {published})")
            else:
                log("not published this cycle - the build has not earned it yet")

        time.sleep(CHECK_EVERY_S)

    log(f"supervisor finished its 12 hours; publishes: {published}")
    # One last attempt, so the morning gets the best verified state rather than whatever
    # happened to be true two hours ago.
    subprocess.run([sys.executable, PUBLISH], cwd=REPO, timeout=7200)


if __name__ == "__main__":
    main()
