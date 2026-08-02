"""Author portable 4096x2048 Atomic Acres sky panoramas with Real-ESRGAN.

The official xinntao NCNN/Vulkan bundle is intentionally supplied from a
temporary directory. Nothing is installed and no downloaded executable or model
is copied into the repository. Exact upstream hashes fail closed before use.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
TOOL_RELEASE_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/"
    "realesrgan-ncnn-vulkan-20220424-windows.zip"
)
TOOL_RELEASE_SHA256 = "abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d"
TOOL_HASHES = {
    "realesrgan-ncnn-vulkan.exe": "07e49f7cbb4ede01ae4dd4c399d3a7e5846e3d2085c3128eff881e55cb7b1a0c",
    "models/realesrgan-x4plus.bin": "713ee713b0353afaa27976f0563a64a5043bd70b9bd8936c2e26e25ebcdbcddf",
    "models/realesrgan-x4plus.param": "35330ececcea33b6c397a72548e788d5d53becee4734c50b7fada36e89f10a86",
}
TARGET_SIZE = (4096, 2048)
SEAM_FEATHER_PIXELS = 48
NCNN_TILE_SIZE = 256
NCNN_GPU_INDEX = 0
MIN_RUNTIME_BYTES = 500_000
SKIES = (
    (
        "atomic-acres",
        "source-assets/skies/atomic-acres-sunset-generated.png",
        "public/assets/original/skies/atomic-acres-sunset.webp",
    ),
    (
        "rustworks-1v1",
        "source-assets/skies/rustworks-industrial-night-generated.png",
        "public/assets/original/skies/rustworks-industrial-night.webp",
    ),
    (
        "skyline-terminal",
        "source-assets/skies/terminal-airport-dawn-generated.png",
        "public/assets/original/skies/terminal-airport-dawn.webp",
    ),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_tool(tool_root: Path) -> None:
    for relative_path, expected in TOOL_HASHES.items():
        path = tool_root / relative_path
        if not path.is_file():
            raise RuntimeError(f"Real-ESRGAN tool file is missing: {path}")
        actual = sha256(path)
        if actual != expected:
            raise RuntimeError(f"Real-ESRGAN tool hash mismatch for {relative_path}: {actual}")


def feather_equirectangular_seam(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32).copy()
    for distance in range(SEAM_FEATHER_PIXELS):
        phase = distance / max(1, SEAM_FEATHER_PIXELS - 1)
        weight = 0.5 * (1 + math.cos(math.pi * phase))
        left = pixels[:, distance, :].copy()
        right = pixels[:, -1 - distance, :].copy()
        average = (left + right) * 0.5
        pixels[:, distance, :] = left * (1 - weight) + average * weight
        pixels[:, -1 - distance, :] = right * (1 - weight) + average * weight
    return Image.fromarray(np.clip(np.rint(pixels), 0, 255).astype(np.uint8), "RGB")


def pixel_evidence(image: Image.Image) -> dict[str, float | int]:
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32)
    luminance = pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722
    edge_mae = float(np.abs(pixels[:, -1, :] - pixels[:, 0, :]).mean())
    adjacent_mae = float(np.abs(pixels[:, 1:, :] - pixels[:, :-1, :]).mean())
    laplacian = np.abs(
        luminance[1:-1, 1:-1] * 4
        - luminance[1:-1, :-2]
        - luminance[1:-1, 2:]
        - luminance[:-2, 1:-1]
        - luminance[2:, 1:-1]
    )
    return {
        "width": image.width,
        "height": image.height,
        "edgeMae255": round(edge_mae, 6),
        "adjacentMae255": round(adjacent_mae, 6),
        "laplacianMae255": round(float(laplacian.mean()), 6),
    }


def quality_evidence(image: Image.Image) -> dict[str, float]:
    sample = image.convert("RGB").resize((512, 256), Image.Resampling.BOX)
    pixels = np.asarray(sample, dtype=np.float32)
    luminance = pixels[..., 0] * 0.2126 + pixels[..., 1] * 0.7152 + pixels[..., 2] * 0.0722
    horizontal = np.abs(pixels[:, 1:, :] - pixels[:, :-1, :]).mean()
    vertical = np.abs(pixels[1:, :, :] - pixels[:-1, :, :]).mean()
    laplacian = np.abs(
        luminance[1:-1, 1:-1] * 4
        - luminance[1:-1, :-2]
        - luminance[1:-1, 2:]
        - luminance[:-2, 1:-1]
        - luminance[2:, 1:-1]
    )
    histogram = np.bincount(
        np.clip(np.rint(luminance), 0, 255).astype(np.uint8).ravel(),
        minlength=256,
    ).astype(np.float64)
    probabilities = histogram[histogram > 0] / histogram.sum()
    p05, p95 = np.percentile(luminance, (5, 95))
    return {
        "meanLuminance255": round(float(luminance.mean()), 6),
        "p05Luminance255": round(float(p05), 6),
        "p95Luminance255": round(float(p95), 6),
        "luminanceSpread255": round(float(p95 - p05), 6),
        "rgbVariance": round(float(pixels.var(axis=(0, 1)).mean()), 6),
        "entropyBits": round(float(-(probabilities * np.log2(probabilities)).sum()), 6),
        "adjacentMae255": round(float((horizontal + vertical) * 0.5), 6),
        "laplacianMae255": round(float(laplacian.mean()), 6),
        "nonzeroRgbRatio": round(float((pixels > 0).mean()), 6),
    }


def require_authored_quality(
    evidence: dict[str, float],
    label: str,
    source_evidence: dict[str, float] | None = None,
    encoded_bytes: int | None = None,
) -> None:
    """Reject silent NCNN/Vulkan failures before they can replace an asset.

    The Windows NCNN executable can return exit code zero after a Vulkan
    allocation or queue failure. These independent gates catch black frames,
    flat placeholders, severe detail loss and suspiciously tiny encodes.
    """
    minimums = {
        "luminanceSpread255": 20.0,
        "rgbVariance": 100.0,
        "entropyBits": 4.0,
        "adjacentMae255": 1.0,
        "laplacianMae255": 2.0,
        "nonzeroRgbRatio": 0.8,
    }
    if source_evidence is not None:
        minimums.update({
            "luminanceSpread255": max(20.0, source_evidence["luminanceSpread255"] * 0.7),
            "rgbVariance": max(100.0, source_evidence["rgbVariance"] * 0.55),
            "entropyBits": max(4.0, source_evidence["entropyBits"] * 0.75),
            "adjacentMae255": max(1.0, source_evidence["adjacentMae255"] * 0.4),
            "laplacianMae255": max(2.0, source_evidence["laplacianMae255"] * 0.4),
        })
    failures = [
        f"{metric}={evidence[metric]} < {minimum}"
        for metric, minimum in minimums.items()
        if evidence[metric] < minimum
    ]
    if not 2.0 < evidence["meanLuminance255"] < 250.0:
        failures.append(f"meanLuminance255={evidence['meanLuminance255']} outside (2, 250)")
    if encoded_bytes is not None and encoded_bytes < MIN_RUNTIME_BYTES:
        failures.append(f"encodedBytes={encoded_bytes} < {MIN_RUNTIME_BYTES}")
    if failures:
        raise RuntimeError(f"{label} failed authored-sky quality gates: {'; '.join(failures)}")


def author_sky(tool_root: Path, arena_id: str, source_relative: str, output_relative: str) -> dict[str, object]:
    source = REPOSITORY_ROOT / source_relative
    output = REPOSITORY_ROOT / output_relative
    if not source.is_file():
        raise RuntimeError(f"Sky source is missing: {source}")
    with Image.open(source) as source_image:
        source_quality = quality_evidence(source_image)
    require_authored_quality(source_quality, f"{arena_id} source panorama")
    output.parent.mkdir(parents=True, exist_ok=True)
    executable = tool_root / "realesrgan-ncnn-vulkan.exe"
    model_root = tool_root / "models"
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    with tempfile.TemporaryDirectory(prefix=f"atomic-acres-{arena_id}-sky-") as temporary:
        restored = Path(temporary) / f"{arena_id}-x4.png"
        completed = subprocess.run(
            [
                str(executable),
                "-i", str(source),
                "-o", str(restored),
                "-m", str(model_root),
                "-n", "realesrgan-x4plus",
                "-s", "4",
                # A 1024px tile can make the Windows NCNN/Vulkan executable
                # return success after a device-memory failure, leaving a
                # black PNG. The verified 256px tile stays within the GPU
                # allocation budget while the final Lanczos reduction
                # suppresses the extra tile boundaries.
                "-t", str(NCNN_TILE_SIZE),
                "-g", str(NCNN_GPU_INDEX),
                "-f", "png",
            ],
            cwd=tool_root,
            check=True,
            creationflags=creation_flags,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        diagnostics = f"{completed.stdout}\n{completed.stderr}".lower()
        if "failed" in diagnostics:
            raise RuntimeError("Real-ESRGAN reported a Vulkan failure despite returning success")
        with Image.open(restored) as restored_image:
            restored_size = restored_image.size
            restored_quality = quality_evidence(restored_image)
            require_authored_quality(
                restored_quality,
                f"{arena_id} restored panorama",
                source_quality,
            )
            portable = restored_image.convert("RGB").resize(TARGET_SIZE, Image.Resampling.LANCZOS)
        portable = feather_equirectangular_seam(portable)
        temporary_output = output.with_name(f".{output.stem}-{arena_id}-authoring.webp")
        temporary_output.unlink(missing_ok=True)
        try:
            portable.save(temporary_output, format="WEBP", quality=96, method=6, exact=True)
            encoded_bytes = temporary_output.stat().st_size
            with Image.open(temporary_output) as runtime_image:
                runtime_quality = quality_evidence(runtime_image)
                require_authored_quality(
                    runtime_quality,
                    f"{arena_id} runtime panorama",
                    source_quality,
                    encoded_bytes,
                )
                evidence = pixel_evidence(runtime_image)
            os.replace(temporary_output, output)
        finally:
            temporary_output.unlink(missing_ok=True)
    return {
        "arenaId": arena_id,
        "source": source_relative,
        "sourceSha256": sha256(source),
        "restoredDimensions": list(restored_size),
        "runtime": output_relative,
        "runtimeSha256": sha256(output),
        "runtimeBytes": output.stat().st_size,
        "runtimeEvidence": evidence,
        "sourceQuality": source_quality,
        "restoredQuality": restored_quality,
        "runtimeQuality": runtime_quality,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tool-root", type=Path, required=True)
    arguments = parser.parse_args()
    tool_root = arguments.tool_root.resolve()
    verify_tool(tool_root)
    skies = [author_sky(tool_root, *entry) for entry in SKIES]
    print(json.dumps({
        "toolReleaseUrl": TOOL_RELEASE_URL,
        "toolReleaseSha256": TOOL_RELEASE_SHA256,
        "toolHashes": TOOL_HASHES,
        "model": "realesrgan-x4plus",
        "scale": 4,
        "tileSize": NCNN_TILE_SIZE,
        "gpuIndex": NCNN_GPU_INDEX,
        "targetDimensions": list(TARGET_SIZE),
        "seamFeatherPixels": SEAM_FEATHER_PIXELS,
        "skies": skies,
    }, indent=2))


if __name__ == "__main__":
    main()
