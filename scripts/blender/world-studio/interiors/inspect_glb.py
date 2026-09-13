"""Blender-free audit of an exported interiors GLB.

The build script reports its own census from the Blender scene. That is the thing being
tested, so it cannot also be the evidence: this reads the container itself and reports what a
glTF loader would actually see, plus whether the embedded images are byte-identical to the
maps `source-assets` holds.

    python scripts/blender/world-studio/interiors/inspect_glb.py \
        --glb public/assets/world-studio/blender/interiors/interior-hero-teal-living-kitchen.glb \
        --textures source-assets/world-studio/interiors/textures

Stdlib only, no Blender, no network. Exit code 1 if a hard check fails.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys

# Accessor component sizes, glTF 2.0 section 5.1.
COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
# Modes 4/5/6 are triangles, strip and fan; the exporter only writes 4.
TRIANGLE_MODES = {4, 5, 6}

# Extensions the repo's own loader implements natively (three 0.185.1 GLTFLoader registers
# both by default). Anything else in `extensionsRequired` needs a decoder this runtime does not
# install - Draco and Meshopt above all - and is a hard failure, not a taste call.
LOADER_SUPPORTED_EXTENSIONS = {"KHR_texture_transform", "KHR_materials_emissive_strength"}


def read_glb(path: str) -> tuple[dict, bytes]:
    with open(path, "rb") as handle:
        blob = handle.read()
    magic, version, length = struct.unpack_from("<III", blob, 0)
    if magic != 0x46546C67:
        raise SystemExit(f"{path}: not a GLB (magic {magic:#x})")
    if version != 2:
        raise SystemExit(f"{path}: GLB version {version}, expected 2")
    if length != len(blob):
        raise SystemExit(f"{path}: header length {length} != file size {len(blob)}")
    offset = 12
    gltf: dict | None = None
    binary = b""
    while offset < len(blob):
        chunk_len, chunk_type = struct.unpack_from("<II", blob, offset)
        payload = blob[offset + 8 : offset + 8 + chunk_len]
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(payload.decode("utf-8"))
        elif chunk_type == 0x004E4942:
            binary = payload
        offset += 8 + chunk_len + (-chunk_len % 4)
    if gltf is None:
        raise SystemExit(f"{path}: no JSON chunk")
    return gltf, binary


IDENTITY = (1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0)


def mat_mul(a: tuple, b: tuple) -> tuple:
    """Row-major 4x4 multiply, stdlib only (no numpy in the audit path)."""
    return tuple(
        sum(a[row * 4 + k] * b[k * 4 + col] for k in range(4)) for row in range(4) for col in range(4)
    )


def node_matrix(node: dict) -> tuple:
    if "matrix" in node:
        m = node["matrix"]  # glTF stores column-major; transpose to the row-major used here.
        return tuple(m[col * 4 + row] for row in range(4) for col in range(4))
    tx, ty, tz = node.get("translation", (0.0, 0.0, 0.0))
    qx, qy, qz, qw = node.get("rotation", (0.0, 0.0, 0.0, 1.0))
    sx, sy, sz = node.get("scale", (1.0, 1.0, 1.0))
    rot = (
        1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw),
        2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw),
        2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy),
    )
    return (
        rot[0] * sx, rot[1] * sy, rot[2] * sz, tx,
        rot[3] * sx, rot[4] * sy, rot[5] * sz, ty,
        rot[6] * sx, rot[7] * sy, rot[8] * sz, tz,
        0.0, 0.0, 0.0, 1.0,
    )


def transform_point(m: tuple, p: tuple) -> tuple:
    return tuple(m[row * 4 + 0] * p[0] + m[row * 4 + 1] * p[1] + m[row * 4 + 2] * p[2] + m[row * 4 + 3] for row in range(3))


def walk_node(gltf: dict, index: int, parent: tuple, lo: list, hi: list) -> None:
    node = gltf["nodes"][index]
    world = mat_mul(parent, node_matrix(node))
    if "mesh" in node:
        for primitive in gltf["meshes"][node["mesh"]].get("primitives", []):
            accessor = gltf["accessors"][primitive["attributes"]["POSITION"]]
            amin, amax = accessor["min"], accessor["max"]
            for corner in range(8):
                local = (
                    amax[0] if corner & 1 else amin[0],
                    amax[1] if corner & 2 else amin[1],
                    amax[2] if corner & 4 else amin[2],
                )
                point = transform_point(world, local)
                for axis in range(3):
                    lo[axis] = min(lo[axis], point[axis])
                    hi[axis] = max(hi[axis], point[axis])
    for child in node.get("children", []):
        walk_node(gltf, child, world, lo, hi)


def triangle_count(gltf: dict, primitive: dict) -> int:
    if primitive.get("mode", 4) not in TRIANGLE_MODES:
        return 0
    if "indices" in primitive:
        count = gltf["accessors"][primitive["indices"]]["count"]
    else:
        count = gltf["accessors"][primitive["attributes"]["POSITION"]]["count"]
    return count // 3


def image_bytes(gltf: dict, binary: bytes, image: dict) -> bytes | None:
    if "bufferView" not in image:
        return None
    view = gltf["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return binary[start : start + view["byteLength"]]


def inspect(glb_path: str, texture_dir: str | None) -> dict:
    gltf, binary = read_glb(glb_path)
    meshes = gltf.get("meshes", [])
    triangles = 0
    vertices = 0
    primitives = 0
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            primitives += 1
            triangles += triangle_count(gltf, primitive)
            vertices += gltf["accessors"][primitive["attributes"]["POSITION"]]["count"]

    # Accessor min/max are mesh-local. Walking the node tree and transforming the eight corners
    # of each local box is the only way this says anything about where the set actually sits:
    # the first version of this reported +/-2.22 m for a 14 m room because it skipped the nodes.
    bounds_min = [float("inf")] * 3
    bounds_max = [float("-inf")] * 3
    for node_index in gltf.get("scenes", [{}])[gltf.get("scene", 0)].get("nodes", []):
        walk_node(gltf, node_index, IDENTITY, bounds_min, bounds_max)

    # Accessor byte budget, so a silently fat export is visible as a number.
    accessor_bytes = 0
    for accessor in gltf.get("accessors", []):
        accessor_bytes += (
            accessor["count"]
            * COMPONENT_BYTES[accessor["componentType"]]
            * TYPE_COUNTS[accessor["type"]]
        )

    images = []
    source_hashes: dict[str, str] = {}
    if texture_dir and os.path.isdir(texture_dir):
        for name in sorted(os.listdir(texture_dir)):
            if name.endswith(".png"):
                with open(os.path.join(texture_dir, name), "rb") as handle:
                    source_hashes[hashlib.sha256(handle.read()).hexdigest()] = name
    for image in gltf.get("images", []):
        payload = image_bytes(gltf, binary, image)
        digest = hashlib.sha256(payload).hexdigest() if payload is not None else None
        images.append(
            {
                "name": image.get("name"),
                "mimeType": image.get("mimeType"),
                "bytes": len(payload) if payload is not None else None,
                "sha256": digest,
                "matchesSourceAsset": source_hashes.get(digest or ""),
            }
        )

    materials = []
    for material in gltf.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        materials.append(
            {
                "name": material.get("name"),
                "baseColorFactor": pbr.get("baseColorFactor"),
                "metallic": pbr.get("metallicFactor"),
                "roughness": pbr.get("roughnessFactor"),
                "baseColorTexture": "baseColorTexture" in pbr,
                "metallicRoughnessTexture": "metallicRoughnessTexture" in pbr,
                "doubleSided": material.get("doubleSided", False),
                "alphaMode": material.get("alphaMode", "OPAQUE"),
            }
        )

    with open(glb_path, "rb") as handle:
        file_sha = hashlib.sha256(handle.read()).hexdigest()

    return {
        "file": os.path.basename(glb_path),
        "bytes": os.path.getsize(glb_path),
        "sha256": file_sha,
        "generator": gltf.get("asset", {}).get("generator"),
        "version": gltf.get("asset", {}).get("version"),
        "extensionsUsed": gltf.get("extensionsUsed", []),
        "extensionsRequired": gltf.get("extensionsRequired", []),
        "nodes": len(gltf.get("nodes", [])),
        "meshes": len(meshes),
        "primitives": primitives,
        "vertices": vertices,
        "triangles": triangles,
        "accessorBytes": accessor_bytes,
        "materials": materials,
        "images": images,
        "cameras": len(gltf.get("cameras", [])),
        "lights": len(gltf.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])),
        "boundsMin": [round(v, 4) for v in bounds_min],
        "boundsMax": [round(v, 4) for v in bounds_max],
    }


def check(result: dict) -> list[str]:
    """Hard failures only: things that would break the runtime contract, not taste."""
    failures = []
    if result["version"] != "2.0":
        failures.append(f"asset.version {result['version']!r}, expected '2.0'")
    unsupported = [e for e in result["extensionsRequired"] if e not in LOADER_SUPPORTED_EXTENSIONS]
    if unsupported:
        failures.append(f"extensionsRequired {unsupported} - this runtime registers no such decoder")
    if result["cameras"] or result["lights"]:
        failures.append(
            f"preview rig leaked into the export: {result['cameras']} cameras, {result['lights']} lights"
        )
    if result["triangles"] <= 0:
        failures.append("no triangles")
    # Albedo must survive byte-identical. Roughness must NOT: glTF carries roughness in the
    # green channel of a packed metallicRoughness image, so the exporter legitimately rewrites
    # those maps. Demanding a match there was this script's error, not the export's.
    unmatched = [
        i["name"]
        for i in result["images"]
        if i["matchesSourceAsset"] is None and "roughness" not in (i["name"] or "")
    ]
    if unmatched:
        failures.append(f"embedded albedo not byte-identical to source-assets: {unmatched}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True, nargs="+")
    parser.add_argument("--textures", default=None)
    parser.add_argument("--json", action="store_true", help="print the full report")
    args = parser.parse_args()

    failed = False
    for path in args.glb:
        result = inspect(path, args.textures)
        failures = check(result)
        failed = failed or bool(failures)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(
                f"{result['file']}: {result['bytes']} bytes  nodes={result['nodes']} "
                f"meshes={result['meshes']} prims={result['primitives']} "
                f"verts={result['vertices']} tris={result['triangles']} "
                f"mats={len(result['materials'])} imgs={len(result['images'])} "
                f"ext={result['extensionsUsed'] or '[]'}"
            )
            print(f"  bounds min={result['boundsMin']} max={result['boundsMax']}")
            print(f"  sha256 {result['sha256']}")
        for failure in failures:
            print(f"  FAIL {failure}")
        if not failures:
            matched = sum(1 for i in result["images"] if i["matchesSourceAsset"])
            print(
                f"  OK   container, extensions loader-supported, no rig leak, "
                f"{matched}/{len(result['images'])} images byte-identical to source-assets "
                f"(the rest are the exporter's packed metallicRoughness)"
            )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
