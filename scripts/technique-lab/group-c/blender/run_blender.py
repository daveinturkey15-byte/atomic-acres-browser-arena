"""Exclusive, windowless launcher for the group-C row 36 Blender recipe.

Blender on this machine is a shared, serialized resource: the root lane owns
render verification and other authors may hold it. This wrapper is the only
thing that invokes it from this lane, and it does three things and nothing
else:

  1. Acquires the task-local coordination lock at
     `<extra-quality>/blender-execution.lock` by atomic O_EXCL create, stamping
     tag / PID / ISO time into it. If another author holds it, it WAITS and
     polls; it never steals, never force-removes, and never kills a process.
  2. Spawns Blender with CREATE_NO_WINDOW so nothing pops onto the owner's
     desktop, `--background --factory-startup`, no render, no GPU bake.
  3. Releases ONLY a lock whose tag and PID are its own, in a finally block.

The lock file is the single write this lane makes outside its owned worktree
paths, and it is a coordination artefact, not a deliverable.
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

LOCK_PATH = (
    'C:/Users/david/Documents/Codex/2026-09-11/p-le/work/'
    'extra-quality-20260912/blender-execution.lock'
)
BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe'
TAG = 'claude-group-c-quality-20260912'
CREATE_NO_WINDOW = 0x08000000
POLL_SECONDS = 3.0


def acquire(max_wait_seconds: float) -> dict:
    payload = {
        'tag': TAG,
        'pid': os.getpid(),
        'acquiredAt': datetime.now(timezone.utc).isoformat(),
        'purpose': 'group-C row 36 headless voxel remesh + normal bake (CPU, no render)',
    }
    encoded = json.dumps(payload, indent=2).encode('utf-8')
    deadline = time.time() + max_wait_seconds
    while True:
        try:
            handle = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(handle, 'wb') as stream:
                stream.write(encoded)
            return payload
        except FileExistsError:
            try:
                with open(LOCK_PATH, 'r', encoding='utf-8') as stream:
                    holder = stream.read()
            except OSError:
                holder = '<unreadable>'
            if time.time() >= deadline:
                raise SystemExit(
                    'blender lock still held after %.0fs; not stealing it. Holder: %s'
                    % (max_wait_seconds, holder)
                )
            print('waiting for blender lock, holder: %s' % holder.replace('\n', ' '))
            time.sleep(POLL_SECONDS)


def release(payload: dict) -> None:
    """Release only our own lock. A foreign holder is left strictly alone."""
    try:
        with open(LOCK_PATH, 'r', encoding='utf-8') as stream:
            current = json.load(stream)
    except (OSError, ValueError):
        print('lock file missing or unreadable at release; leaving it alone')
        return
    if current.get('tag') != payload['tag'] or current.get('pid') != payload['pid']:
        print('lock is no longer ours (tag/pid mismatch); leaving it in place')
        return
    os.remove(LOCK_PATH)


def run(argv: list) -> int:
    command = [
        BLENDER,
        '--background',
        '--factory-startup',
        '--python', argv[0],
        '--',
    ] + argv[1:]
    print('COMMAND ' + json.dumps(command))
    completed = subprocess.run(
        command,
        creationflags=CREATE_NO_WINDOW,
        capture_output=True,
        text=True,
        timeout=900,
    )
    sys.stdout.write(completed.stdout)
    if completed.returncode != 0:
        sys.stdout.write(completed.stderr)
    return completed.returncode


def main() -> int:
    argv = sys.argv[1:]
    if not argv:
        raise SystemExit('usage: run_blender.py <script.py> [args...]')
    payload = acquire(max_wait_seconds=240.0)
    print('LOCK_ACQUIRED ' + json.dumps(payload))
    try:
        return run(argv)
    finally:
        release(payload)
        print('LOCK_RELEASED')


if __name__ == '__main__':
    raise SystemExit(main())
