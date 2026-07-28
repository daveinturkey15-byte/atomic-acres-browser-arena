#!/usr/bin/env python3
"""Benchmark Atomic review profiles on one fixed causal-review task.

Measures fresh-process end-to-end Hermes latency and exact structured-answer
quality. It never launches the game or grants a model live input authority.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import statistics
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

PROFILES = ["atomicnormal", "atomicplayer", "atomicsolmedium", "atomicluna", "atomicterra"]
QUICK_EXPECTED = {
    "causal_attribution": False,
    "promote": False,
    "next_experiment": "pending-hit-reacquisition",
    "reason_codes": ["mechanism-never-activated", "g0031-core-metrics-regressed"],
}
QUICK_PROMPT = """You are an offline Atomic Acres experiment reviewer. Do not use tools.
Observed evidence:
- retained fallback G0031: 4 kills, 8 deaths, K/D 0.50, 61.5% accuracy, 494 damage, streak 3;
- paired control G0074: 0 kills, 5 deaths, K/D 0.00, 10.0% accuracy, 25 damage;
- candidate G0075: 2 kills, 4 deaths, K/D 0.50, 38.9% accuracy, 200 damage, streak 2;
- candidate policy change: visible-hit finish latch;
- G0075 finishWindows=0 and finishFollowupPulses=0;
- all hard safety gates passed.
Return ONLY one JSON object, no markdown and no extra keys:
{"causal_attribution":false,"promote":false,"next_experiment":"pending-hit-reacquisition","reason_codes":["mechanism-never-activated","g0031-core-metrics-regressed"]}
"""

AUDIT_EXPECTED = {
    "retain": "G0031",
    "invalidate": ["G0068"],
    "reject": ["G0071", "G0075", "G0076", "R0016-combat-promotion"],
    "causal_claim": "none",
    "next_experiment": "pending-hit-reacquisition",
    "reason_codes": [
        "wrong-weapon-invalid",
        "range-is-not-combat-learning",
        "headline-kd-regresses-core-offense",
        "changed-mechanism-never-activated",
        "replication-failed",
    ],
}
AUDIT_PROMPT = """You are the independent offline verifier for an Atomic Acres policy review. Do not use tools. Apply zero-regression and causal-mechanism rules.

Evidence:
- G0031 retained fallback: 4-8, K/D 0.50, 61.5% accuracy, 494 damage, streak 3, correct carbine, hard gates clean.
- G0068: spawned with the wrong weapon and struck a cyan practice target.
- R0016: static cyan Gun Range calibration, 197/198 (99.5%); no moving-target combat model or weights were updated.
- G0071: 2-4, K/D 0.50, 24.2% accuracy, 278 damage, streak 2.
- G0075 changed only the visible-hit finish latch: 2-4, K/D 0.50, 38.9% accuracy, 200 damage, streak 2; finishWindows=0 and finishFollowupPulses=0.
- G0076 repeated the same candidate: 2-11, K/D 0.18, 30.0% accuracy, 272 damage; finishWindows=0 and finishFollowupPulses=0.
- A candidate cannot be credited for an improvement when its changed mechanism never activated. Matching headline K/D does not permit regression in kills, accuracy, damage, or streak. A valid promotion must replicate.

Return ONLY JSON with exactly these keys and no markdown:
- retain: one game ID;
- invalidate: array selected from G0068;
- reject: array selected from G0071, G0075, G0076, R0016-combat-promotion, sorted in that order;
- causal_claim: one of none or finish-latch-supported;
- next_experiment: one of promote-G0075, lower-alignment, pending-hit-reacquisition;
- reason_codes: applicable items in this canonical order: wrong-weapon-invalid, range-is-not-combat-learning, headline-kd-regresses-core-offense, changed-mechanism-never-activated, replication-failed.
"""

EXPECTED = QUICK_EXPECTED
PROMPT = QUICK_PROMPT


def percentile(values: list[float], ratio: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, math.ceil(ratio * len(ordered)) - 1)
    return ordered[max(0, index)]


def extract_json(stdout: str) -> dict | None:
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
    match = re.search(r"\{.*\}", stdout, flags=re.DOTALL)
    if not match:
        return None
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def score(value: dict | None) -> tuple[bool, list[str]]:
    if value is None:
        return False, ["unparseable-json"]
    failures = []
    for key, expected_value in EXPECTED.items():
        if value.get(key) != expected_value:
            failures.append(f"{key}:expected={expected_value!r}:actual={value.get(key)!r}")
    if set(value) != set(EXPECTED):
        failures.append("schema:extra-or-missing-keys")
    return not failures, failures


def invoke(profile: str, timeout_seconds: int) -> dict:
    command = [
        "hermes", "-p", profile, "chat", "-Q", "--ignore-rules",
        "--source", "tool", "-q", PROMPT,
    ]
    started = time.perf_counter()
    process = subprocess.run(
        command,
        text=True,
        capture_output=True,
        timeout=timeout_seconds,
        cwd="/root/jigglyclaw/worktrees/atomic-player",
    )
    elapsed = time.perf_counter() - started
    parsed = extract_json(process.stdout)
    passed, failures = score(parsed)
    session_match = re.search(r"session_id:\s*(\S+)", process.stdout)
    return {
        "profile": profile,
        "elapsedSeconds": round(elapsed, 3),
        "exitCode": process.returncode,
        "sessionId": session_match.group(1) if session_match else None,
        "parsed": parsed,
        "qualityPass": process.returncode == 0 and passed,
        "qualityFailures": failures,
        "stderrTail": process.stderr[-1200:],
    }


def summarize(rows: list[dict]) -> dict:
    by_profile = {}
    for profile in PROFILES:
        selected = [row for row in rows if row["profile"] == profile and row["phase"] == "counted"]
        timings = [row["elapsedSeconds"] for row in selected if row["exitCode"] == 0]
        timing_p90 = percentile(timings, 0.9)
        by_profile[profile] = {
            "count": len(selected),
            "successful": sum(row["exitCode"] == 0 for row in selected),
            "qualityPasses": sum(row["qualityPass"] for row in selected),
            "qualityPassRate": round(sum(row["qualityPass"] for row in selected) / len(selected), 4) if selected else None,
            "latencySeconds": {
                "minimum": min(timings) if timings else None,
                "median": round(statistics.median(timings), 3) if timings else None,
                "mean": round(statistics.mean(timings), 3) if timings else None,
                "p90": round(timing_p90, 3) if timing_p90 is not None else None,
                "maximum": max(timings) if timings else None,
            },
        }
    normal = by_profile["atomicnormal"]["latencySeconds"]["median"]
    priority = by_profile["atomicplayer"]["latencySeconds"]["median"]
    high = priority
    medium = by_profile["atomicsolmedium"]["latencySeconds"]["median"]
    comparisons = {
        "solHighPriorityVsNormalMedianSeconds": round(priority - normal, 3) if normal is not None and priority is not None else None,
        "solHighPrioritySpeedupPercent": round((normal - priority) / normal * 100, 2) if normal and priority is not None else None,
        "solMediumVsHighPriorityMedianSeconds": round(medium - high, 3) if high is not None and medium is not None else None,
        "solMediumSpeedupPercent": round((high - medium) / high * 100, 2) if high and medium is not None else None,
    }
    eligible = [
        (profile, data["latencySeconds"]["median"])
        for profile, data in by_profile.items()
        if data["qualityPassRate"] == 1 and data["latencySeconds"]["median"] is not None
    ]
    return {
        "profiles": by_profile,
        "comparisons": comparisons,
        "fastestQualityCleanProfile": min(eligible, key=lambda item: item[1])[0] if eligible else None,
    }


def main() -> int:
    global EXPECTED, PROMPT
    parser = argparse.ArgumentParser()
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--seed", type=int, default=20260728)
    parser.add_argument("--suite", choices=("quick", "audit"), default="quick")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.suite == "audit":
        EXPECTED = AUDIT_EXPECTED
        PROMPT = AUDIT_PROMPT
    else:
        EXPECTED = QUICK_EXPECTED
        PROMPT = QUICK_PROMPT
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    raw_path = output.with_suffix(".jsonl")
    raw_path.unlink(missing_ok=True)
    rows = []
    randomizer = random.Random(args.seed)

    for phase, repetitions in (("warmup", 1), ("counted", args.repetitions)):
        for repetition in range(1, repetitions + 1):
            order = list(PROFILES)
            randomizer.shuffle(order)
            for order_index, profile in enumerate(order, start=1):
                row = invoke(profile, args.timeout)
                row.update({"phase": phase, "repetition": repetition, "orderIndex": order_index})
                rows.append(row)
                with raw_path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(row, sort_keys=True) + "\n")
                print(json.dumps({k: row[k] for k in ("phase", "repetition", "profile", "elapsedSeconds", "exitCode", "qualityPass")}), flush=True)

    report = {
        "schemaVersion": 1,
        "kind": "atomic-profile-orchestration-latency-benchmark",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "protocol": {
            "suite": args.suite,
            "profiles": PROFILES,
            "warmupsPerProfile": 1,
            "countedRepetitionsPerProfile": args.repetitions,
            "randomSeed": args.seed,
            "freshProcessPerInvocation": True,
            "prompt": PROMPT,
            "expected": EXPECTED,
        },
        "summary": summarize(rows),
        "rawResultsFile": raw_path.name,
    }
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    return 0 if all(row["exitCode"] == 0 for row in rows if row["phase"] == "counted") else 1


if __name__ == "__main__":
    raise SystemExit(main())
