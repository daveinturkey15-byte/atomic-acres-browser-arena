"""Minimal dependency-free glTF-binary reader for CPU-only audits.

This exists so the houses lane can measure the *shipped* GLB without Blender,
a browser or a GPU. It decodes only what the surface audit needs: node
transforms, primitive positions/UVs/indices and the material each primitive
draws with. Anything it cannot decode it raises on, rather than guessing.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field

_COMPONENT = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}

_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


@dataclass
class Primitive:
    mesh_name: str
    node_name: str
    material: str
    positions: list[tuple[float, float, float]]
    uvs: list[tuple[float, float]]
    indices: list[int]
    extras: dict = field(default_factory=dict)


def _mat_mul(a: list[float], b: list[float]) -> list[float]:
    """Column-major 4x4 multiply, matching glTF's matrix convention."""
    out = [0.0] * 16
    for col in range(4):
        for row in range(4):
            out[col * 4 + row] = sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
    return out


def _identity() -> list[float]:
    return [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]


def _trs(node: dict) -> list[float]:
    if "matrix" in node:
        return list(node["matrix"])
    m = _identity()
    if "rotation" in node:
        x, y, z, w = node["rotation"]
        m = [
            1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
            2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
            2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
            0, 0, 0, 1,
        ]
    if "scale" in node:
        sx, sy, sz = node["scale"]
        for col, s in enumerate((sx, sy, sz)):
            for row in range(4):
                m[col * 4 + row] *= s
    if "translation" in node:
        tx, ty, tz = node["translation"]
        m[12], m[13], m[14] = tx, ty, tz
    return m


def _apply(m: list[float], p: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = p
    return (
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    )


class Glb:
    def __init__(self, path: str) -> None:
        with open(path, "rb") as handle:
            data = handle.read()
        magic, version, _total = struct.unpack_from("<III", data, 0)
        if magic != 0x46546C67:
            raise ValueError(f"{path}: not a GLB container")
        if version != 2:
            raise ValueError(f"{path}: unsupported glTF version {version}")
        offset = 12
        json_chunk = None
        bin_chunk = b""
        while offset < len(data):
            length, kind = struct.unpack_from("<II", data, offset)
            body = data[offset + 8 : offset + 8 + length]
            if kind == 0x4E4F534A:
                json_chunk = body
            elif kind == 0x004E4942:
                bin_chunk = body
            offset += 8 + length + (-length % 4)
        if json_chunk is None:
            raise ValueError(f"{path}: no JSON chunk")
        self.path = path
        self.gltf = json.loads(json_chunk.decode("utf-8"))
        self.bin = bin_chunk
        self._accessor_cache: dict[int, list] = {}

    def accessor(self, index: int) -> list:
        if index in self._accessor_cache:
            return self._accessor_cache[index]
        acc = self.gltf["accessors"][index]
        if "sparse" in acc:
            raise ValueError(f"{self.path}: sparse accessor {index} is not supported")
        fmt, size = _COMPONENT[acc["componentType"]]
        n = _COUNT[acc["type"]]
        count = acc["count"]
        if "bufferView" not in acc:
            values = [tuple([0] * n) if n > 1 else 0] * count
            self._accessor_cache[index] = values
            return values
        view = self.gltf["bufferViews"][acc["bufferView"]]
        if view.get("buffer", 0) != 0:
            raise ValueError(f"{self.path}: external buffer is not supported")
        base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stride = view.get("byteStride") or size * n
        unpack = struct.Struct("<" + fmt * n).unpack_from
        out = []
        for i in range(count):
            chunk = unpack(self.bin, base + i * stride)
            out.append(chunk[0] if n == 1 else chunk)
        self._accessor_cache[index] = out
        return out

    def material_name(self, index) -> str:
        if index is None:
            return "<none>"
        mat = self.gltf.get("materials", [])[index]
        return mat.get("name", f"material-{index}")

    def primitives(self) -> list[Primitive]:
        """Every primitive in the default scene, in world space."""
        gltf = self.gltf
        scene = gltf.get("scenes", [{}])[gltf.get("scene", 0)]
        out: list[Primitive] = []
        stack = [(idx, _identity()) for idx in scene.get("nodes", [])]
        while stack:
            node_index, parent = stack.pop()
            node = gltf["nodes"][node_index]
            world = _mat_mul(parent, _trs(node))
            for child in node.get("children", []):
                stack.append((child, world))
            if "mesh" not in node:
                continue
            mesh = gltf["meshes"][node["mesh"]]
            for prim in mesh.get("primitives", []):
                if prim.get("mode", 4) != 4:
                    continue
                attrs = prim["attributes"]
                raw = self.accessor(attrs["POSITION"])
                positions = [_apply(world, p) for p in raw]
                uvs = self.accessor(attrs["TEXCOORD_0"]) if "TEXCOORD_0" in attrs else []
                if "indices" in prim:
                    indices = list(self.accessor(prim["indices"]))
                else:
                    indices = list(range(len(positions)))
                out.append(
                    Primitive(
                        mesh_name=mesh.get("name", f"mesh-{node['mesh']}"),
                        node_name=node.get("name", f"node-{node_index}"),
                        material=self.material_name(prim.get("material")),
                        positions=positions,
                        uvs=[tuple(uv) for uv in uvs],
                        indices=indices,
                        extras=node.get("extras", {}) or {},
                    )
                )
        return out
