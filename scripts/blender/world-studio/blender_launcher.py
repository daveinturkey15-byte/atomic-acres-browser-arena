"""Headless Blender launcher for world-studio hero assets.

Invokes the verified installed Blender 5.1 executable through ``subprocess`` with
``CREATE_NO_WINDOW`` so no window is ever presented, and serialises every run behind the
task-local exclusive lock shared with the other Blender-capable lanes on this machine.

Contract:
  * CPU modelling/export only. This launcher never requests a GPU render, never enables
    Cycles GPU compute and never opens a browser.
  * The lock is acquired with ``O_EXCL``; a run waits while another owner holds it and
    releases **only its own** lock (owner tag is re-read and compared before unlink).
  * stdout/stderr/returncode are captured verbatim so the provenance report can quote them.

Usage:
    python scripts/blender/world-studio/blender_launcher.py <inner-script.py> [-- args...]
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

BLENDER_EXE = Path(r"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe")
LOCK_PATH = Path(
    r"C:/Users/david/Documents/Codex/2026-09-11/p-le/work/extra-quality-20260912/blender-execution.lock"
)
OWNER_TAG = "claude/blender-hero-20260912"
CREATE_NO_WINDOW = 0x08000000


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def acquire_lock(timeout_s: float = 600.0, poll_s: float = 2.0) -> dict:
    """Create the coordination lock exclusively, waiting while another owner holds it."""
    payload = {
        "pid": os.getpid(),
        "tag": OWNER_TAG,
        "acquiredAt": _now(),
        "purpose": "world-studio hero bus: headless CPU Blender authoring + glTF export",
    }
    encoded = json.dumps(payload, indent=2).encode("utf-8")
    deadline = time.time() + timeout_s
    waited = False
    while True:
        try:
            fd = os.open(str(LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if time.time() >= deadline:
                raise TimeoutError(
                    f"blender-execution.lock held by another owner for >{timeout_s:.0f}s: "
                    f"{_read_lock_holder()}"
                )
            if not waited:
                print(f"[launcher] waiting on lock held by {_read_lock_holder()}", flush=True)
                waited = True
            time.sleep(poll_s)
            continue
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
        print(f"[launcher] acquired lock {LOCK_PATH} as {OWNER_TAG} pid={os.getpid()}", flush=True)
        return payload


def _read_lock_holder() -> str:
    try:
        return LOCK_PATH.read_text(encoding="utf-8").replace("\n", " ")[:200]
    except OSError as exc:  # pragma: no cover - diagnostic path only
        return f"<unreadable: {exc}>"


def release_lock(payload: dict) -> None:
    """Release the lock only when it is still ours; never remove another owner's lock."""
    try:
        held = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"[launcher] lock not readable at release: {exc}", flush=True)
        return
    if held.get("pid") == payload["pid"] and held.get("tag") == payload["tag"]:
        LOCK_PATH.unlink()
        print("[launcher] released own lock", flush=True)
    else:
        print(f"[launcher] lock now owned by {held}; leaving it alone", flush=True)


def run_blender(inner_script: Path, extra_args: list[str]) -> subprocess.CompletedProcess:
    if not BLENDER_EXE.exists():
        raise FileNotFoundError(f"Blender executable not found: {BLENDER_EXE}")
    cmd = [
        str(BLENDER_EXE),
        "--background",
        "--factory-startup",
        "--python-exit-code",
        "9",
        "--python",
        str(inner_script),
    ]
    if extra_args:
        cmd += ["--"] + extra_args
    print(f"[launcher] {' '.join(cmd)}", flush=True)
    started = time.time()
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        creationflags=CREATE_NO_WINDOW,
        cwd=str(Path(__file__).resolve().parents[3]),
    )
    print(f"[launcher] returncode={proc.returncode} elapsed={time.time() - started:.1f}s", flush=True)
    return proc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("script", type=Path, help="Python file executed inside Blender")
    parser.add_argument("rest", nargs=argparse.REMAINDER)
    args = parser.parse_args()

    extra = [a for a in args.rest if a != "--"]
    payload = acquire_lock()
    try:
        proc = run_blender(args.script.resolve(), extra)
    finally:
        release_lock(payload)

    sys.stdout.write(proc.stdout)
    sys.stderr.write(proc.stderr)
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
