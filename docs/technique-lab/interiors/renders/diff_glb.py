"""Says *what* differs between two GLBs produced by identical runs: content, or only order.

    python docs/technique-lab/interiors/renders/diff_glb.py a.glb b.glb
"""

from __future__ import annotations

import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..",
                                "scripts", "blender", "world-studio", "interiors"))
from inspect_glb import read_glb  # noqa: E402


def canonical(value):
    """Drops array order where glTF does not define it, so 'same set, different order' and
    'different data' stop looking alike."""
    if isinstance(value, list):
        return sorted((json.dumps(canonical(v), sort_keys=True) for v in value))
    if isinstance(value, dict):
        return {k: canonical(v) for k, v in sorted(value.items())}
    return value


def main() -> int:
    a_json, a_bin = read_glb(sys.argv[1])
    b_json, b_bin = read_glb(sys.argv[2])
    print(f"binary chunk: {len(a_bin)} vs {len(b_bin)} bytes, "
          f"{'identical' if a_bin == b_bin else 'DIFFERENT'}")
    print(f"json chunk exact: {'identical' if a_json == b_json else 'DIFFERENT'}")

    for key in sorted(set(a_json) | set(b_json)):
        left, right = a_json.get(key), b_json.get(key)
        if left == right:
            continue
        same_set = canonical(left) == canonical(right)
        detail = "SAME CONTENT, DIFFERENT ORDER" if same_set else "DIFFERENT CONTENT"
        size = f"{len(left)} vs {len(right)}" if isinstance(left, list) else ""
        print(f"  {key}: {detail} {size}")

    # Image payloads compared as a multiset: a reordered image array is not a changed texture.
    def image_hashes(gltf, blob):
        out = []
        for image in gltf.get("images", []):
            view = gltf["bufferViews"][image["bufferView"]]
            start = view.get("byteOffset", 0)
            out.append(hashlib.sha256(blob[start:start + view["byteLength"]]).hexdigest())
        return sorted(out)

    same_images = image_hashes(a_json, a_bin) == image_hashes(b_json, b_bin)
    print(f"embedded image payloads (as a set): {'identical' if same_images else 'DIFFERENT'}")

    if a_bin != b_bin and a_json == b_json:
        # Identical JSON means identical layout, so every differing byte can be attributed to
        # the accessor that owns it. Which attribute drifts decides whether this matters.
        from inspect_glb import COMPONENT_BYTES, TYPE_COUNTS  # noqa: PLC0415

        owners = []
        for index, accessor in enumerate(a_json.get("accessors", [])):
            view = a_json["bufferViews"][accessor["bufferView"]]
            start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            stride = COMPONENT_BYTES[accessor["componentType"]] * TYPE_COUNTS[accessor["type"]]
            owners.append((start, start + accessor["count"] * stride, index, accessor))

        attribute_of = {}
        for mesh in a_json.get("meshes", []):
            for primitive in mesh.get("primitives", []):
                for name, index in primitive.get("attributes", {}).items():
                    attribute_of[index] = name
                if "indices" in primitive:
                    attribute_of[primitive["indices"]] = "INDICES"

        differing = [i for i in range(len(a_bin)) if a_bin[i] != b_bin[i]]
        print(f"differing bytes: {len(differing)} of {len(a_bin)} "
              f"({100.0 * len(differing) / len(a_bin):.4f}%)")
        hit: dict[str, int] = {}
        worst = 0.0
        for offset in differing:
            for start, end, index, accessor in owners:
                if start <= offset < end:
                    name = attribute_of.get(index, f"accessor{index}")
                    hit[name] = hit.get(name, 0) + 1
                    if accessor["componentType"] == 5126:  # float
                        import struct  # noqa: PLC0415
                        base = start + (offset - start) // 4 * 4
                        left = struct.unpack_from("<f", a_bin, base)[0]
                        right = struct.unpack_from("<f", b_bin, base)[0]
                        worst = max(worst, abs(left - right))
                    break
        for name, count in sorted(hit.items(), key=lambda kv: -kv[1]):
            print(f"  {name}: {count} differing bytes")
        print(f"largest absolute float difference: {worst:.9g}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
