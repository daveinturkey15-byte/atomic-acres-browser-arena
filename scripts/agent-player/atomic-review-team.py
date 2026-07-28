#!/usr/bin/env python3
"""Run the Atomic offline review team: Sol primary + Luna/Terra helpers.

All three lanes run in parallel with independent Hermes profiles. Their outputs
are archived for comparison/consensus only. This script has no browser/game
input path and cannot promote a gameplay policy by itself.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

LANES = (
    ("primary", "atomicplayer"),
    ("helper-luna", "atomicluna"),
    ("helper-terra", "atomicterra"),
)


def extract_json(stdout: str):
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return None


def invoke(lane: str, profile: str, prompt: str, timeout: int) -> dict:
    started = time.perf_counter()
    process = subprocess.run(
        [
            "hermes", "-p", profile, "chat", "-Q", "--ignore-rules",
            "--source", "tool", "-q", prompt,
        ],
        text=True,
        capture_output=True,
        timeout=timeout,
        cwd="/root/jigglyclaw/worktrees/atomic-player",
    )
    elapsed = time.perf_counter() - started
    session_match = re.search(r"session_id:\s*(\S+)", process.stdout)
    return {
        "lane": lane,
        "profile": profile,
        "elapsedSeconds": round(elapsed, 3),
        "exitCode": process.returncode,
        "sessionId": session_match.group(1) if session_match else None,
        "parsed": extract_json(process.stdout),
        "stdout": process.stdout,
        "stderr": process.stderr,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt-file", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    prompt_path = Path(args.prompt_file).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    prompt = prompt_path.read_text(encoding="utf-8")

    team_started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(LANES)) as pool:
        futures = [pool.submit(invoke, lane, profile, prompt, args.timeout) for lane, profile in LANES]
        lanes = [future.result() for future in futures]
    team_elapsed = time.perf_counter() - team_started

    parsed_values = [lane["parsed"] for lane in lanes if lane["parsed"] is not None]
    normalized = [json.dumps(value, sort_keys=True, separators=(",", ":")) for value in parsed_values]
    report = {
        "schemaVersion": 1,
        "kind": "atomic-offline-three-lane-review",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "authority": {
            "scope": "offline evidence review only",
            "liveInputAuthority": False,
            "automaticPromotionAuthority": False,
            "requiredHumanOrMechanicalGate": True,
        },
        "promptFile": str(prompt_path),
        "teamElapsedSeconds": round(team_elapsed, 3),
        "allLanesExitedZero": all(lane["exitCode"] == 0 for lane in lanes),
        "allLanesParseable": len(parsed_values) == len(lanes),
        "exactStructuredConsensus": len(normalized) == len(lanes) and len(set(normalized)) == 1,
        "lanes": lanes,
    }
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    summary = {key: report[key] for key in (
        "kind", "teamElapsedSeconds", "allLanesExitedZero", "allLanesParseable", "exactStructuredConsensus"
    )}
    summary["lanes"] = [
        {key: lane[key] for key in ("lane", "profile", "elapsedSeconds", "exitCode", "parsed")}
        for lane in lanes
    ]
    print(json.dumps(summary, indent=2))
    return 0 if report["allLanesExitedZero"] and report["allLanesParseable"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
