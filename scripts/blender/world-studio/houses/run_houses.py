"""Headless CPU launcher for the world-studio house shells.

Wraps ``scripts/blender/world-studio/blender_launcher.py``'s contract with this lane's own
owner tag and lock so the houses lane never collides with the hero-vehicle lane or any other
Blender-capable worker on this machine.

    python scripts/blender/world-studio/houses/run_houses.py --variant teal
    python scripts/blender/world-studio/houses/run_houses.py --variant all --render

Contract: ``--background --factory-startup``, ``--python-exit-code 9``, CPU threads capped at
4, no GPU compute, no window. stdout/stderr/returncode are echoed verbatim so a provenance
report can quote them — a script existing on disk is not evidence that Blender ran.
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

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[3]

BLENDER_EXE = Path(r"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe")
LOCK_PATH = Path(
    r"C:/Users/david/Documents/Codex/2026-09-11/p-le/work/extra-quality-20260912/blender-execution.lock"
)
OWNER_TAG = "claude/houses-night-20260912"
CREATE_NO_WINDOW = 0x08000000
MAX_THREADS = 4


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def acquire_lock(timeout_s: float = 900.0, poll_s: float = 2.0) -> dict | None:
    payload = {
        "pid": os.getpid(),
        "tag": OWNER_TAG,
        "acquiredAt": _now(),
        "purpose": "world-studio house shells: headless CPU Blender authoring + glTF export",
    }
    encoded = json.dumps(payload, indent=2).encode("utf-8")
    deadline = time.time() + timeout_s
    announced = False
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    while True:
        try:
            fd = os.open(str(LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if time.time() >= deadline:
                raise TimeoutError(f"blender-execution.lock held for >{timeout_s:.0f}s: {_holder()}")
            if not announced:
                print(f"[houses] waiting on lock held by {_holder()}", flush=True)
                announced = True
            time.sleep(poll_s)
            continue
        with os.fdopen(fd, "wb") as handle:
            handle.write(encoded)
        print(f"[houses] acquired lock as {OWNER_TAG} pid={os.getpid()}", flush=True)
        return payload


def _holder() -> str:
    try:
        return LOCK_PATH.read_text(encoding="utf-8").replace("\n", " ")[:200]
    except OSError as exc:
        return f"<unreadable: {exc}>"


def release_lock(payload: dict) -> None:
    """Release only our own lock; another owner's lock is never removed."""
    try:
        held = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"[houses] lock not readable at release: {exc}", flush=True)
        return
    if held.get("pid") == payload["pid"] and held.get("tag") == payload["tag"]:
        LOCK_PATH.unlink()
        print("[houses] released own lock", flush=True)
    else:
        print(f"[houses] lock now owned by {held}; leaving it alone", flush=True)


def run(script: Path, extra: list[str]) -> subprocess.CompletedProcess:
    if not BLENDER_EXE.exists():
        raise FileNotFoundError(f"Blender executable not found: {BLENDER_EXE}")
    cmd = [
        str(BLENDER_EXE),
        "--background",
        "--factory-startup",
        "--threads",
        str(MAX_THREADS),
        "--python-exit-code",
        "9",
        "--python",
        str(script),
        "--",
        *extra,
    ]
    print(f"[houses] {' '.join(cmd)}", flush=True)
    env = dict(os.environ, PYTHONHASHSEED="0")
    started = time.time()
    proc = subprocess.run(
        cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW,
        cwd=str(REPO_ROOT), env=env,
    )
    print(f"[houses] returncode={proc.returncode} elapsed={time.time() - started:.1f}s", flush=True)
    sys.stdout.write(proc.stdout)
    sys.stderr.write(proc.stderr)
    return proc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variant", default="all", choices=["teal", "yellow", "all"])
    parser.add_argument("--render", action="store_true", help="also render the CPU thumbnails")
    parser.add_argument(
        "--review", action="store_true",
        help="also re-shoot the evaluator's wave-2 three-view recipe into source-assets/.../review",
    )
    parser.add_argument("--skip-build", action="store_true", help="render only, from the GLBs already on disk")
    args = parser.parse_args()

    variants = ["teal", "yellow"] if args.variant == "all" else [args.variant]
    payload = acquire_lock()
    worst = 0
    try:
        if not args.skip_build:
            for variant in variants:
                proc = run(HERE / "build_house_shell.py", ["--variant", variant])
                worst = max(worst, proc.returncode)
                if proc.returncode != 0:
                    break
        if args.render and worst == 0:
            for variant in variants:
                proc = run(HERE / "render_thumbnails.py", ["--variant", variant])
                worst = max(worst, proc.returncode)
        if args.review and worst == 0:
            for variant in variants:
                proc = run(HERE / "render_thumbnails.py", ["--variant", variant, "--review"])
                worst = max(worst, proc.returncode)
    finally:
        release_lock(payload)
    return worst


if __name__ == "__main__":
    raise SystemExit(main())
