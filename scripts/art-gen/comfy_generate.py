#!/usr/bin/env python3
"""Lane I - repeatable local image generation via ComfyUI + Qwen-Image-2512.

Boots the local ComfyUI portable install if it is down, submits text-to-image
jobs through the HTTP API, polls history, and collects finished PNGs.

Everything runs on THIS machine (dave-gaming-pc, RTX 5080). No hosted or paid
API is ever called. Owner cleared local, non-commercial generation.

Model stack (proven July 2026 pipeline, restored 2026-08-23):
  unet  qwen_image_2512_fp8_e4m3fn.safetensors
  clip  qwen_2.5_vl_7b_fp8_scaled.safetensors
  vae   qwen_image_vae.safetensors
  lora  Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors (4-step Lightning)

Usage:
  python comfy_generate.py --prompt "..." --out out.png [--width W --height H --seed N]
  python comfy_generate.py --jobs jobs.json --out-dir DIR [--boot] [--shutdown]

jobs.json: [{"name": "x", "prompt": "...", "width": 1024, "height": 1024,
             "seed": 7}, ...]  (seed omitted -> deterministic from name)

IMPORTANT GPU ETIQUETTE (owner rule: one heavyweight at a time on the 5080):
  - --shutdown kills the ComfyUI instance this script booted (PID file), so
    batch runs leave the GPU free for game QA afterwards.
  - If a DIFFERENT ComfyUI is already on the port with the wrong models
    directory (e.g. the MiniMax H3 bundle via run_h3.bat), this script refuses
    to submit rather than silently queueing jobs that fail. Stop that instance
    first (its relaunch command is run_h3.bat) and re-run with --boot.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

COMFY_ROOT = r"C:\Users\david\Desktop\stuff\Comfy Fun\ComfyUI_portable"
COMFY_PY = os.path.join(COMFY_ROOT, "python_embeded", "python.exe")
COMFY_MAIN = os.path.join(COMFY_ROOT, "ComfyUI", "main.py")
COMFY_URL = "http://127.0.0.1:8188"
PID_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".comfy_boot.pid")
BOOT_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".comfy_boot.log")

REQUIRED_CLIP = "qwen_2.5_vl_7b_fp8_scaled.safetensors"
REQUIRED_UNET = "qwen_image_2512_fp8_e4m3fn.safetensors"
REQUIRED_VAE = "qwen_image_vae.safetensors"
REQUIRED_LORA = "Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors"


def build_workflow(prompt: str, width: int, height: int, seed: int, prefix: str) -> dict:
    """Qwen-Image-2512 fp8 + Lightning 4-step LoRA text-to-image graph.

    Mirrors the proven template C:/Users/david/Desktop/stuff/qwen_image_workflow_v2.json
    with width/height/seed/prefix made parametric.
    """
    return {
        "1": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": REQUIRED_CLIP, "type": "qwen_image", "device": "default"}},
        "2": {"class_type": "VAELoader", "inputs": {"vae_name": REQUIRED_VAE}},
        "3": {"class_type": "UNETLoader", "inputs": {
            "unet_name": REQUIRED_UNET, "weight_dtype": "default"}},
        "4": {"class_type": "LoraLoader", "inputs": {
            "model": ["3", 0], "clip": ["1", 0], "lora_name": REQUIRED_LORA,
            "strength_model": 1.0, "strength_clip": 0.0}},
        "5": {"class_type": "ModelSamplingFlux", "inputs": {
            "model": ["4", 0], "max_shift": 1.15, "base_shift": 0.5,
            "width": width, "height": height}},
        "6": {"class_type": "TextEncodeQwenImageEdit", "inputs": {
            "clip": ["1", 0], "prompt": prompt}},
        "7": {"class_type": "FluxGuidance", "inputs": {
            "conditioning": ["6", 0], "guidance": 3.5}},
        "8": {"class_type": "EmptyQwenImageLayeredLatentImage", "inputs": {
            "width": width, "height": height, "layers": 3, "batch_size": 1}},
        "9": {"class_type": "KSampler", "inputs": {
            "model": ["5", 0], "seed": seed, "steps": 4, "cfg": 1.0,
            "sampler_name": "euler", "scheduler": "simple",
            "positive": ["7", 0], "negative": ["7", 0],
            "latent_image": ["8", 0], "denoise": 1.0}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["2", 0]}},
        "11": {"class_type": "SaveImage", "inputs": {
            "filename_prefix": prefix, "images": ["10", 0]}},
    }


def _get(path: str, timeout: float = 10):
    with urllib.request.urlopen(f"{COMFY_URL}{path}", timeout=timeout) as resp:
        return json.loads(resp.read())


def is_up() -> bool:
    try:
        _get("/system_stats", timeout=5)
        return True
    except Exception:
        return False


def has_qwen_models() -> bool:
    """True when the running instance sees the Qwen-Image model files."""
    try:
        info = _get("/object_info/CLIPLoader", timeout=15)
        clips = info["CLIPLoader"]["input"]["required"]["clip_name"][0]
        return REQUIRED_CLIP in clips
    except Exception:
        return False


def boot() -> None:
    if is_up():
        return
    print("[comfy] booting ComfyUI (pinned tree, default models dir)...")
    log = open(BOOT_LOG, "ab")
    proc = subprocess.Popen(
        [COMFY_PY, "-s", COMFY_MAIN, "--windows-standalone-build",
         "--port", "8188", "--disable-auto-launch", "--log-stdout"],
        cwd=COMFY_ROOT, stdout=log, stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW)
    with open(PID_FILE, "w") as f:
        f.write(str(proc.pid))
    deadline = time.time() + 180
    while time.time() < deadline:
        if is_up():
            print(f"[comfy] up (pid {proc.pid})")
            return
        if proc.poll() is not None:
            raise RuntimeError(f"ComfyUI exited during boot; see {BOOT_LOG}")
        time.sleep(3)
    raise RuntimeError("ComfyUI did not come up within 180s")


def shutdown() -> None:
    """Kill only the instance this script booted (recorded in PID_FILE)."""
    if not os.path.exists(PID_FILE):
        print("[comfy] no boot PID recorded; leaving any running instance alone")
        return
    with open(PID_FILE) as f:
        pid = f.read().strip()
    subprocess.run(["taskkill", "/PID", pid, "/T", "/F"], capture_output=True)
    os.remove(PID_FILE)
    print(f"[comfy] shut down pid {pid}; GPU released")


def submit(workflow: dict) -> str:
    body = json.dumps({"prompt": workflow, "client_id": str(uuid.uuid4())}).encode()
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())["prompt_id"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"submit rejected: {e.read().decode()[:800]}") from e


def wait_for(prompt_id: str, timeout: float = 600) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        hist = _get(f"/history/{prompt_id}", timeout=15)
        if prompt_id in hist:
            entry = hist[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                msgs = [m for m in status.get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError(f"execution error: {json.dumps(msgs)[:800]}")
            return entry
        time.sleep(2)
    raise TimeoutError(f"prompt {prompt_id} not finished after {timeout}s")


def collect(entry: dict, out_path: str) -> str:
    for node_output in entry.get("outputs", {}).values():
        for img in node_output.get("images", []):
            q = urllib.parse.urlencode({
                "filename": img["filename"],
                "subfolder": img.get("subfolder", ""),
                "type": img.get("type", "output")})
            with urllib.request.urlopen(f"{COMFY_URL}/view?{q}", timeout=60) as resp:
                data = resp.read()
            os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(data)
            return out_path
    raise RuntimeError("prompt finished but produced no image")


def stable_seed(name: str) -> int:
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:6], "big")


def run_job(name: str, prompt: str, width: int, height: int, seed: int,
            out_path: str) -> dict:
    t0 = time.time()
    wf = build_workflow(prompt, width, height, seed, f"lane_i_{name}")
    pid = submit(wf)
    entry = wait_for(pid)
    collect(entry, out_path)
    dt = time.time() - t0
    digest = hashlib.sha256(open(out_path, "rb").read()).hexdigest()
    print(f"[comfy] {name}: {width}x{height} seed={seed} {dt:.1f}s -> {out_path}")
    return {"name": name, "prompt": prompt, "width": width, "height": height,
            "seed": seed, "steps": 4, "cfg": 1.0, "sampler": "euler",
            "scheduler": "simple", "guidance": 3.5,
            "model": REQUIRED_UNET, "textEncoder": REQUIRED_CLIP,
            "vae": REQUIRED_VAE, "lora": REQUIRED_LORA,
            "output": out_path.replace("\\", "/"), "sha256": digest,
            "seconds": round(dt, 1)}


def ensure_ready(allow_boot: bool) -> None:
    if not is_up():
        if not allow_boot:
            raise SystemExit("ComfyUI is down; re-run with --boot")
        boot()
    if not has_qwen_models():
        raise SystemExit(
            "A ComfyUI instance is on 127.0.0.1:8188 but it cannot see the "
            "Qwen-Image models (wrong --models-directory, e.g. the MiniMax H3 "
            "bundle). Stop it (relaunch later via run_h3.bat) and re-run with "
            "--boot so the pinned tree with its default models dir starts.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--prompt")
    ap.add_argument("--out")
    ap.add_argument("--jobs", help="JSON file with a list of job objects")
    ap.add_argument("--out-dir", default=".")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--seed", type=int)
    ap.add_argument("--boot", action="store_true", help="boot ComfyUI if down")
    ap.add_argument("--shutdown", action="store_true",
                    help="after the batch, kill the instance this script booted")
    ap.add_argument("--receipt", help="write a JSON generation receipt here")
    ap.add_argument("--only", help="comma-separated job names to re-roll; the "
                                   "rest of --jobs is skipped and their existing "
                                   "receipt entries are preserved")
    args = ap.parse_args()

    if not args.prompt and not args.jobs:
        ap.error("need --prompt or --jobs")

    ensure_ready(allow_boot=args.boot)

    receipts = []
    try:
        if args.prompt:
            name = os.path.splitext(os.path.basename(args.out or "single.png"))[0]
            seed = args.seed if args.seed is not None else stable_seed(name)
            receipts.append(run_job(name, args.prompt, args.width, args.height,
                                    seed, args.out or f"{name}.png"))
        if args.jobs:
            jobs = json.load(open(args.jobs, encoding="utf-8"))
            if args.only:
                wanted = {n.strip() for n in args.only.split(",") if n.strip()}
                known = {j["name"] for j in jobs}
                unknown = sorted(wanted - known)
                if unknown:
                    raise SystemExit(f"--only names not in {args.jobs}: {unknown}")
                jobs = [j for j in jobs if j["name"] in wanted]
            for job in jobs:
                name = job["name"]
                seed = job.get("seed", stable_seed(name))
                out_path = os.path.join(args.out_dir, job.get("out", f"{name}.png"))
                receipts.append(run_job(
                    name, job["prompt"], job.get("width", args.width),
                    job.get("height", args.height), seed, out_path))
    finally:
        if args.shutdown:
            shutdown()

    if args.receipt:
        # Merge into any existing receipt so a partial re-roll (--only) keeps the
        # recorded prompt/seed/hash of every master it did not regenerate.
        merged = {}
        if os.path.exists(args.receipt):
            try:
                prior = json.load(open(args.receipt, encoding="utf-8"))
                for entry in prior.get("jobs", []):
                    merged[entry["name"]] = entry
            except (OSError, ValueError, KeyError) as exc:
                print(f"[comfy] ignoring unreadable receipt {args.receipt}: {exc}")
        for entry in receipts:
            merged[entry["name"]] = entry
        # Order by the jobs file so the receipt reads in authored order.
        order = []
        if args.jobs:
            order = [j["name"] for j in json.load(open(args.jobs, encoding="utf-8"))]
        ordered = [merged.pop(n) for n in order if n in merged] + list(merged.values())
        with open(args.receipt, "w", encoding="utf-8", newline="\n") as f:
            json.dump({"generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
                       "machine": "dave-gaming-pc", "gpu": "RTX 5080 (local)",
                       "hostedApisUsed": "none", "jobs": ordered}, f, indent=2)
        print(f"[comfy] receipt -> {args.receipt} ({len(ordered)} jobs, "
              f"{len(receipts)} regenerated this run)")


if __name__ == "__main__":
    main()
