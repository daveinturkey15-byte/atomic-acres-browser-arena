"""Measure the authored ground speed of every operator locomotion clip.

Pass 77 / HF-375. The runtime plays the canonical operator locomotion clips at
timeScale 1 no matter how fast the character is actually travelling, so the feet
skate. Fixing that needs one number per clip that nothing in the repo had: the
ground speed the clip was authored FOR, i.e. the speed at which a planted foot
stays planted.

Method (the reason this is a measurement and not a guess):
  1. Rebuild the source rig's node hierarchy straight from the licence-vetted
     Quaternius glTF that `create-pass65-third-person-operator.py` derives the
     production operator family from. Every skin shares this skeleton and clip
     set by catalog contract, so one measurement covers the whole family.
  2. Forward-kinematics the ankle bones per sampled time, expressed relative to
     the hips, because these are in-place clips with no root motion.
  3. Gate on contact: a foot counts as planted only while its height sits in the
     bottom CONTACT_HEIGHT_FRACTION of the clip's whole ankle-height range. That
     excludes the swing phase and the heel-roll transitions that would otherwise
     drag the average toward zero.
  4. Take the MEDIAN backward ankle velocity over the contact samples. The median
     rejects the roll-in/roll-out tails that a mean would absorb; that velocity
     is, by definition, the ground speed that makes the stance foot stationary.

This deliberately reads the source glTF with the standard library only - no
Blender, no import of the runtime - so the constants baked into
`src/animation-locomotion.ts` can be re-derived and diffed by anyone.

Run:  python scripts/blender/measure-pass77-operator-locomotion.py
"""

from __future__ import annotations

import base64
import json
import math
import statistics
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_GLTF = ROOT / "public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf"

# Ankle bones plus the pelvis the in-place motion is measured against.
LEFT_FOOT = "Foot.L"
RIGHT_FOOT = "Foot.R"
HIPS = "Hips"

# The bottom fraction of the clip's ankle-height range that counts as ground
# contact. 0.10 keeps the deepest part of stance and drops the heel/toe roll.
CONTACT_HEIGHT_FRACTION = 0.10
SAMPLES_PER_CLIP = 960

LOCOMOTION_CLIPS = ("Walk", "Run", "Run_Shoot", "Run_Back", "Run_Left", "Run_Right")

COMPONENT_FORMATS = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
TYPE_COMPONENT_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load_document() -> dict:
    return json.loads(SOURCE_GLTF.read_text(encoding="utf8"))


def load_buffers(document: dict) -> list[bytes]:
    buffers: list[bytes] = []
    for buffer in document["buffers"]:
        uri = buffer["uri"]
        if not uri.startswith("data:"):
            buffers.append((SOURCE_GLTF.parent / uri).read_bytes())
            continue
        buffers.append(base64.b64decode(uri.split(",", 1)[1]))
    return buffers


def read_accessor(document: dict, buffers: list[bytes], index: int) -> list[tuple[float, ...]]:
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    fmt, component_size = COMPONENT_FORMATS[accessor["componentType"]]
    components = TYPE_COMPONENT_COUNTS[accessor["type"]]
    stride = view.get("byteStride") or component_size * components
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    data = buffers[view["buffer"]]
    return [
        struct.unpack_from("<" + fmt * components, data, base + index * stride)
        for index in range(accessor["count"])
    ]


def build_hierarchy(document: dict) -> tuple[list[str], list[int]]:
    nodes = document["nodes"]
    names = [node.get("name", f"node{index}") for index, node in enumerate(nodes)]
    parents = [-1] * len(nodes)
    for index, node in enumerate(nodes):
        for child in node.get("children", []):
            parents[child] = index
    return names, parents


def default_trs(document: dict, index: int) -> tuple[tuple[float, ...], tuple[float, ...], tuple[float, ...]]:
    node = document["nodes"][index]
    return (
        tuple(node.get("translation", (0.0, 0.0, 0.0))),
        tuple(node.get("rotation", (0.0, 0.0, 0.0, 1.0))),
        tuple(node.get("scale", (1.0, 1.0, 1.0))),
    )


def sample_track(track: tuple[list[float], list[tuple[float, ...]], str], time: float) -> tuple[float, ...]:
    times, values, interpolation = track
    if time <= times[0]:
        return values[0]
    if time >= times[-1]:
        return values[-1]
    low, high = 0, len(times) - 1
    while high - low > 1:
        middle = (low + high) // 2
        if times[middle] <= time:
            low = middle
        else:
            high = middle
    span = times[high] - times[low]
    ratio = 0.0 if span <= 0 else (time - times[low]) / span
    start, end = values[low], values[high]
    if interpolation == "STEP":
        return start
    if len(start) == 4:
        dot = sum(a * b for a, b in zip(start, end))
        if dot < 0:
            end = tuple(-value for value in end)
            dot = -dot
        if dot > 0.9995:
            blended = tuple(a + (b - a) * ratio for a, b in zip(start, end))
        else:
            theta = math.acos(max(-1.0, min(1.0, dot)))
            sine = math.sin(theta)
            first = math.sin((1 - ratio) * theta) / sine
            second = math.sin(ratio * theta) / sine
            blended = tuple(a * first + b * second for a, b in zip(start, end))
        length = math.sqrt(sum(value * value for value in blended)) or 1.0
        return tuple(value / length for value in blended)
    return tuple(a + (b - a) * ratio for a, b in zip(start, end))


def compose(translation: tuple[float, ...], rotation: tuple[float, ...], scale: tuple[float, ...]) -> list[list[float]]:
    x, y, z, w = rotation
    x2, y2, z2 = x + x, y + y, z + z
    return [
        [(1 - (y * y2 + z * z2)) * scale[0], (x * y2 - w * z2) * scale[1], (x * z2 + w * y2) * scale[2], translation[0]],
        [(x * y2 + w * z2) * scale[0], (1 - (x * x2 + z * z2)) * scale[1], (y * z2 - w * x2) * scale[2], translation[1]],
        [(x * z2 - w * y2) * scale[0], (y * z2 + w * x2) * scale[1], (1 - (x * x2 + y * y2)) * scale[2], translation[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def multiply(left: list[list[float]], right: list[list[float]]) -> list[list[float]]:
    return [[sum(left[row][k] * right[k][column] for k in range(4)) for column in range(4)] for row in range(4)]


def clip_tracks(document: dict, buffers: list[bytes], animation: dict) -> dict[int, dict[str, tuple]]:
    tracks: dict[int, dict[str, tuple]] = {}
    for channel in animation["channels"]:
        target = channel["target"]
        if "node" not in target:
            continue
        sampler = animation["samplers"][channel["sampler"]]
        times = [entry[0] for entry in read_accessor(document, buffers, sampler["input"])]
        values = read_accessor(document, buffers, sampler["output"])
        tracks.setdefault(target["node"], {})[target["path"]] = (times, values, sampler.get("interpolation", "LINEAR"))
    return tracks


def world_positions(
    document: dict,
    names: list[str],
    parents: list[int],
    tracks: dict[int, dict[str, tuple]],
    time: float,
    wanted: tuple[str, ...],
) -> dict[str, tuple[float, float, float]]:
    cache: dict[int, list[list[float]]] = {}

    def solve(index: int) -> list[list[float]]:
        cached = cache.get(index)
        if cached is not None:
            return cached
        translation, rotation, scale = default_trs(document, index)
        animated = tracks.get(index, {})
        if "translation" in animated:
            translation = sample_track(animated["translation"], time)
        if "rotation" in animated:
            rotation = sample_track(animated["rotation"], time)
        if "scale" in animated:
            scale = sample_track(animated["scale"], time)
        local = compose(translation, rotation, scale)
        parent = parents[index]
        matrix = local if parent < 0 else multiply(solve(parent), local)
        cache[index] = matrix
        return matrix

    result = {}
    for name in wanted:
        matrix = solve(names.index(name))
        result[name] = (matrix[0][3], matrix[1][3], matrix[2][3])
    return result


def measure(document: dict, buffers: list[bytes], names: list[str], parents: list[int], clip_name: str) -> dict:
    animation = next(entry for entry in document["animations"] if entry["name"] == clip_name)
    tracks = clip_tracks(document, buffers, animation)
    duration = max(times[-1] for channels in tracks.values() for times, _, _ in channels.values())
    step = duration / SAMPLES_PER_CLIP
    frames = [
        world_positions(document, names, parents, tracks, duration * index / SAMPLES_PER_CLIP, (LEFT_FOOT, RIGHT_FOOT, HIPS))
        for index in range(SAMPLES_PER_CLIP + 1)
    ]
    left = [(frame[LEFT_FOOT][0] - frame[HIPS][0], frame[LEFT_FOOT][1], frame[LEFT_FOOT][2] - frame[HIPS][2]) for frame in frames]
    right = [(frame[RIGHT_FOOT][0] - frame[HIPS][0], frame[RIGHT_FOOT][1], frame[RIGHT_FOOT][2] - frame[HIPS][2]) for frame in frames]
    heights = [point[1] for point in left] + [point[1] for point in right]
    threshold = min(heights) + CONTACT_HEIGHT_FRACTION * (max(heights) - min(heights))

    forward_samples: list[float] = []
    lateral_samples: list[float] = []
    for foot in (left, right):
        for index in range(1, len(foot)):
            if foot[index][1] > threshold or foot[index - 1][1] > threshold:
                continue
            forward_samples.append(-(foot[index][2] - foot[index - 1][2]) / step)
            lateral_samples.append(-(foot[index][0] - foot[index - 1][0]) / step)

    forward = statistics.median(forward_samples)
    lateral = statistics.median(lateral_samples)
    return {
        "clip": clip_name,
        "durationS": round(duration, 4),
        "contactSamples": len(forward_samples),
        "authoredForwardMps": round(forward, 4),
        "authoredLateralMps": round(lateral, 4),
        "authoredGroundSpeedMps": round(math.hypot(forward, lateral), 4),
    }


def main() -> None:
    document = load_document()
    buffers = load_buffers(document)
    names, parents = build_hierarchy(document)
    measurements = [measure(document, buffers, names, parents, clip) for clip in LOCOMOTION_CLIPS]
    print(json.dumps({
        "source": str(SOURCE_GLTF.relative_to(ROOT)).replace("\\", "/"),
        "method": "median-contact-phase-ankle-velocity-relative-to-hips",
        "contactHeightFraction": CONTACT_HEIGHT_FRACTION,
        "samplesPerClip": SAMPLES_PER_CLIP,
        "clips": measurements,
    }, indent=2))


if __name__ == "__main__":
    main()
