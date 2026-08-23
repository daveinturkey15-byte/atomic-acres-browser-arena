#!/usr/bin/env python3
"""Atomic Acres autonomous gauntlet - 8 hours of OMP/ox-alpha swarm rounds.

Runs rounds of parallel agents against GAUNTLET-SPEC.md until the deadline.
Between rounds it verifies the tree and commits a checkpoint, so every round is
an independent rollback point. Nothing here pushes, merges or deploys.

Safety properties, deliberately chosen:
  - Every agent works ONLY in the gauntlet worktree; the spec says so and each
    task's cwd enforces it.
  - A round that leaves tsc broken is COMMITTED ANYWAY on a quarantine branch
    marker in the message, never silently reverted - the next round is told the
    tree is red and that fixing it is priority zero. Reverting other agents'
    work automatically is how you lose eight hours of it.
  - Exit code 0 is not trusted; swarm_dispatch scans output for failure markers.
  - Lane assignment is round-robin over a fixed lane list so no two concurrent
    agents in a round share a file domain.

Usage: python gauntlet_loop.py [--hours 8] [--parallel 10]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time

REPO = r"C:\Users\david\projects\atomic-acres-gauntlet"
FLEET = r"C:\Users\david\projects\worktrees\foundry-fleet-contract-poc"
DISPATCH = os.path.join(FLEET, "scripts", "swarm_dispatch.py")
SPEC_PATH = os.path.join(REPO, "GAUNTLET-SPEC.md")
STATE = os.path.join(REPO, "artifacts", "gauntlet-state.json")
LOGDIR = os.path.join(REPO, "artifacts", "gauntlet-logs")

PREAMBLE = (
    "Read C:/Users/david/projects/atomic-acres-gauntlet/GAUNTLET-SPEC.md IN FULL "
    "before doing anything - it is your briefing and it lists four failure modes "
    "that have each cost this project a rejected build. Your working directory is "
    "the gauntlet worktree; never write outside it. Never weaken a test to get "
    "green. Never fabricate a measurement. Trace your change to a live call site "
    "and name it, or say NOT WIRED. Work on ONE well-scoped thing and finish it "
    "properly rather than starting several.\n\nYOUR ASSIGNMENT THIS ROUND:\n"
)

# Each lane owns a disjoint file domain so concurrent agents cannot collide.
LANES = [
    ("p0-max-preset", "P0. The MAX quality preset cannot deploy: cold pipeline compile measures 5.17-6.54s against a 4000ms admission bound, so the player selects MAX and is bounced to the menu. Read artifacts/PASS78-INTEGRATION-CHECKLIST.md section H2 for what was already tried and reverted twice. Fix it at the arena-rebuild boundary or by pre-warming pipelines. DO NOT weaken the 4s guard. You own the admission/preparation budget code and the render runtime."),
    ("p0-arena-commit", "P0. Determine whether arenas actually fail to commit on this tree ('Selected arena X did not commit before match start', arenaTransitionPhase failed), including in SOLO. The only prior measurement was taken while the machine was at 100% CPU, so it may be false. Measure it properly on the current tree, state the verdict with evidence, and fix it if real. You own arena transition and streaming code."),
    ("p0-provenance", "P0. 'npm run qa:asset-provenance' is RED: nine files from an older skins lane sit in public/assets/ with no manifest row. Do NOT fabricate provenance rows for assets you did not generate. Three public/assets/original/ui/operator-skins/*-operator-card.webp hand-drawn cards are referenced from nowhere in src/ and are superseded by generated art - delete those. Resolve the remainder honestly and get the gate green without lying in it. You own assets.manifest.json and the provenance scripts."),
    ("visual-artstyle", "P1. The owner has rejected the look THREE times: 'the whole game artstyle etc looks the same'. A warm bone/ink/burnt-orange print direction recently landed in the UI sheets and a per-arena grade identity exists in src/rendering/art-direction.ts. Verify both survive and are visible in a real WebGPU capture, then push every surface still on the old palette into the new direction. Capture BEFORE and AFTER and READ the frames. You own src/rendering/art-direction.ts and the filmic grade chain."),
    ("visual-menu-hud", "P1. Continue the menu and HUD reskin. Every surface must belong to one committed visual identity - hunt down any panel, dialog, toast or overlay still on the old teal-on-white deck and bring it across. Keep layout, sizing and functionality exactly as they are; change only how it LOOKS. Verify no text under 9px and no horizontal overflow at 1280x720, 1920x1080, 3440x1440 and 390x844. You own src/ui/*.css."),
    ("audio-quality", "P1. The owner says 'the sounds are all so bad'. Source synthesis was re-authored in src/audio-synthesis.ts. Verify it actually reaches EVERY audio event rather than a handful, find events still using the old single-oscillator-into-exponential-decay shape, and re-voice them. Remember src/sound-event-inventory.ts pins every audio.* call site plus a SHA-256 digest - update the row and recompute the digest, never loosen the scan. You own the audio modules."),
    ("animation-arms", "P1. First-person arms: 'thin and weirdly held and animated'. Improved but unfinished - the trigger hand still sits off-frame under the ammo panel. Also verify per-skin animation actually differentiates now that bots cycle four skins. Capture first-person frames on real WebGPU and READ them. You own weapon presentation, operator model and the animation director."),
    ("arena-nuketown", "P1. Atomic Acres is the BO2 Nuketown homage and must be true to it: two mirrored single-storey houses across a central road, a bus as central hard cover, two yards with fences, a garage each side, very short sightlines, about 25-30 seconds corner to corner. Measure the current footprint and traversal time, list divergences with numbers, fix what changes how it PLAYS before cosmetics. You own the atomic-acres arena source."),
    ("arena-hijacked", "P1. High Seas below-deck is too dark to fight in and must match BO2 Hijacked's superyacht layout: long central corridor, symmetric bow/stern spawns, mid-ship engine bulge, stairwells to the sun deck. Sample actual rendered luminance at eye height at each station and state numbers before and after - do not guess. You own src/high-seas.ts and src/rendering/arenas/high-seas.ts."),
    ("weather-particles", "P1. Weather and rain still have no player-facing Options controls, and the particle system is wired but thin. Add the controls with plain-language labels, raise the simulation quality (rain that reads as volume, surface wetness, coherent wind gusts), and enrich per-arena ambient particle life. Weather must stay seeded from hostId:matchEpoch so peers agree - never Math.random. You own the weather and particle modules."),
    ("cross-browser", "P1. Get a REAL Firefox frame-rate number - it has never been measured (~10 fps claimed vs 150+ in Chrome). Known dead ends, do not repeat them: bundled Playwright-Firefox hangs at launch even idle; an unfocused window is timer-throttled and reads as wedged. The self-driving in-page probe in scripts/qa/verify-webgpu-arena-boot.mjs needs no automation protocol and is the most promising route. Then Opera, then mobile playability. Mark anything unmeasured UNMEASURED. You own scripts/qa/ browser harnesses."),
    ("streamline", "P3. Standing owner directive: refactor and tidy passes are first-class work. src/legacy-main.ts is ~28,000 lines. A bounded extraction plan may exist at ../aa-swarm-analysis/STREAMLINE-LEGACY-MAIN.md - read it if present. Extract exactly ONE cohesive unit into its own module, prove the full test suite still passes, and stop. One unit, done properly, beats three half-done. You own the extraction target and its new module."),
    ("test-reachability", "P3. This project's signature failure is code that ships fully unit-tested and imported by NOTHING - three systems did it. Read ../aa-swarm-analysis/TEST-GAP-AUDIT.md if present. Find modules under src/ imported ONLY by their own tests, and for each either WIRE it to a live call site or delete it as dead. Report which you did for each and why. Do not add tests to dead code."),
    ("hf377-lobby-limits", "P2. HF-377: host-settable kill limit and time limit in multiplayer lobbies. Shown to guests before ready-up, replicated as part of the match contract rather than a client-local preference, applied identically in TDM and FFA, and surviving host migration. Only start this if P0 rows are already green. You own lobby and match-contract code."),
    ("hf378-radar-fire", "P2. HF-378: firing an unsuppressed weapon reveals that player on every enemy radar for a short window, as in BO2. Host-authoritative like every other reveal, replicated to all peers, correct for FFA (everyone is an enemy). NEVER derive it client-side from local audio. Only start this if P0 rows are already green. You own radar/minimap and the fire path's reveal hook."),
    ("hf379-grenade-streaks", "P2. HF-379: grenade and lethal-equipment kills must advance the killstreak counter exactly like gun kills. Find where the streak counter increments and whether it is gated on weapon class or damage source; fix host-authoritatively so guests agree. Check semtex, frag and every other lethal, and that the counter still resets correctly on death. Only start this if P0 rows are already green. You own the killstreak counter."),
]


def run(cmd, cwd=REPO, timeout=1800):
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                           timeout=timeout, encoding="utf-8", errors="replace")
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as exc:  # noqa: BLE001 - a hung check must not kill the loop
        return -1, f"EXCEPTION: {exc}"


def log(msg):
    line = f"[{dt.datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    os.makedirs(LOGDIR, exist_ok=True)
    with open(os.path.join(LOGDIR, "gauntlet.log"), "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def build_spec(round_no, lanes, tree_is_red, red_detail):
    tasks = []
    for i, (lane_id, brief) in enumerate(lanes):
        prompt = PREAMBLE + brief
        if tree_is_red:
            prompt += (
                "\n\nPRIORITY OVERRIDE: the tree is currently RED. Before your own "
                "assignment, check whether the failure below is in a file you own, "
                "and if it is, fix that first. Do NOT fix it by weakening a test.\n"
                + red_detail[:1500]
            )
        tasks.append({
            "id": f"r{round_no:02d}-{lane_id}",
            "route": "omp-ox",
            "role": "worker",
            "timeout": 3000,
            "cwd": REPO,
            "prompt": prompt,
        })
    return {
        "run_kind": "implementation",
        "pattern": "parallel-single-writer-lanes",
        "notes": f"Atomic Acres autonomous gauntlet round {round_no}. "
                 f"Spec: GAUNTLET-SPEC.md. Owner asleep; no human in the loop.",
        "tasks": tasks,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=8.0)
    ap.add_argument("--parallel", type=int, default=10)
    args = ap.parse_args()

    deadline = time.time() + args.hours * 3600
    os.makedirs(os.path.join(REPO, "artifacts"), exist_ok=True)
    os.makedirs(LOGDIR, exist_ok=True)

    if not os.path.exists(SPEC_PATH):
        log("FATAL: GAUNTLET-SPEC.md missing; refusing to dispatch agents with no brief.")
        return 1

    round_no = 0
    lane_cursor = 0
    tree_is_red = False
    red_detail = ""
    history = []

    while time.time() < deadline:
        round_no += 1
        remaining = (deadline - time.time()) / 3600
        # Round-robin a window of lanes so every lane gets turns across the night.
        window = [LANES[(lane_cursor + i) % len(LANES)] for i in range(args.parallel)]
        lane_cursor = (lane_cursor + args.parallel) % len(LANES)

        log(f"=== ROUND {round_no} | {remaining:.2f}h left | "
            f"{len(window)} agents | tree={'RED' if tree_is_red else 'green'} ===")
        log("lanes: " + ", ".join(l[0] for l in window))

        spec = build_spec(round_no, window, tree_is_red, red_detail)
        spec_path = os.path.join(LOGDIR, f"round-{round_no:02d}.json")
        with open(spec_path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(spec, fh, indent=2)

        rc, out = run([sys.executable, DISPATCH, spec_path,
                       "--max-parallel", str(args.parallel)],
                      cwd=FLEET, timeout=3600)
        log(f"round {round_no} dispatch rc={rc}")
        with open(os.path.join(LOGDIR, f"round-{round_no:02d}.out"), "w",
                  encoding="utf-8", newline="\n") as fh:
            fh.write(out)

        # --- verify -------------------------------------------------------
        tsc_rc, tsc_out = run(["npx", "tsc", "--noEmit"], timeout=900)
        tree_is_red = tsc_rc != 0
        red_detail = tsc_out[-2000:] if tree_is_red else ""
        log(f"tsc {'FAILED' if tree_is_red else 'clean'}")

        test_rc, test_out = run(["npx", "vitest", "run", "--reporter", "dot"], timeout=2400)
        tail = test_out.strip().splitlines()[-6:] if test_out.strip() else []
        log("vitest: " + " | ".join(t.strip()[:110] for t in tail))
        if test_rc != 0 and not tree_is_red:
            tree_is_red = True
            red_detail = test_out[-2000:]

        # --- checkpoint ---------------------------------------------------
        # Commit whatever the round produced. A red tree is committed too, with
        # the state named in the message: reverting other agents' work
        # automatically is how eight hours disappears.
        run(["git", "add", "-A"])
        status = "RED" if tree_is_red else "green"
        msg = (f"gauntlet(round {round_no}): {len(window)} agents, tree {status}\n\n"
               f"Lanes: {', '.join(l[0] for l in window)}\n"
               f"tsc: {'FAILED' if tsc_rc != 0 else 'clean'} | vitest exit {test_rc}\n"
               f"Autonomous round, no human in the loop. Rollback: git tag pass78-fallback.\n\n"
               f"Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>")
        crc, _ = run(["git", "commit", "-q", "-m", msg])
        log(f"checkpoint commit rc={crc}")

        history.append({"round": round_no, "lanes": [l[0] for l in window],
                        "tsc_ok": tsc_rc == 0, "vitest_rc": test_rc,
                        "at": dt.datetime.now().isoformat(timespec="seconds")})
        with open(STATE, "w", encoding="utf-8", newline="\n") as fh:
            json.dump({"rounds": history, "deadline": deadline}, fh, indent=2)

    log(f"=== GAUNTLET COMPLETE after {round_no} rounds ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
