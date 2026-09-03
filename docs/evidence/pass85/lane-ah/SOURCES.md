# Lane AH — sources, pins and licences, read 2026-09-02

Every line is claim-stated. VERIFIED = this lane measured it or read the file itself.
CLAIMED = an author or a metadata field says so and it was not independently confirmed.

## The announcement, resolved to primary sources

| Item | Value | State |
|---|---|---|
| Owner-shared post | `https://x.com/comfyui/status/2094561833638404449` (@ComfyUI, 31 Aug 2026) | VERIFIED (resolved via fxtwitter in the lane brief) |
| Blog | `https://blog.comfy.org/p/trellis2-and-pixal3d-are-now-native` | VERIFIED |
| Tutorial | `https://docs.comfy.org/tutorials/3d/trellis2` | VERIFIED |
| The PR that made them core | Comfy-Org/ComfyUI **#14718** "feat: Support Pixal3d and TRELLIS2 (CORE-278) (CORE-199) (CORE-236) (CORE-312)", merged **2026-08-22T00:32:26Z** into `master`, merge commit **`0e65cb907193cf1013bda474593eb48d8c53d848`** | VERIFIED (GitHub API) |
| Release that carries it | **v0.34.0** (its notes name the PR) | VERIFIED |
| Sibling release item | Sam3d-body support, PR #14370 | VERIFIED (release notes) |

## The owner's ComfyUI — version gap: NONE

| Fact | Value | State |
|---|---|---|
| Running version | **0.34.0** | VERIFIED — `GET /system_stats` |
| PyTorch | 2.11.0+cu130, embedded Python 3.13.12 | VERIFIED |
| GPU | RTX 5080, 15.9 GiB VRAM total | VERIFIED |
| Queue at check time | `queue_running: []`, `queue_pending: []` | VERIFIED — `GET /queue` |
| On-disk `ComfyUI/comfyui_version.py` | `0.34.0` (the sibling `ComfyUI_latest/` tree is **older**, 0.33.0 — a misleading directory name) | VERIFIED |
| 3D nodes present | 106 matched nodes, **every one from `comfy_extras.*` or `comfy_api_nodes.*`** — no third-party pack contributes any 3D node | VERIFIED — `comfyui-3d-node-inventory.json` |
| "No CUDA extensions" | `comfy_extras/nodes_mesh_postprocess.py` imports only `torch` and `scipy.ndimage`; the implementation is pure Python under `comfy_extras/mesh3d/{postprocess,uv_unwrap,fileio}`; `requirements.txt` names `scipy` and **no** `nvdiffrast`, `xatlas` or `pymeshlab` | VERIFIED by reading the files |
| Weights installed | **NONE** of the six Trellis.2 / Pixal3D / DINOv3 / MoGe / BiRefNet weights are resolvable by the running server | VERIFIED 2026-09-03 by the sound method — see **Minimum VRAM, and how the model folders were actually checked** below. The session-1 method (`ls` of `ComfyUI_portable/ComfyUI/models/`) was **unsound** and is retracted. |
| Free disk | 662 GB on C: | VERIFIED |
| Minimum VRAM | **not stated upstream** (see below); local box is RTX 5080, `vram_total` 15.9 GiB | VERIFIED that no figure is published; the requirement itself is OPEN until someone runs it |

The owner's ComfyUI was **not** updated, restarted or queued during this lane. Only read-only
HTTP GETs and file reads.

## Minimum VRAM, and how the model folders were actually checked (added 2026-09-03)

Two repairs from the skeptic pass. Both are method repairs; neither changes a conclusion.

### Minimum VRAM — NOT STATED UPSTREAM

Brief step 1 asked for minimum VRAM alongside node names and licences, and session 1 recorded no
figure at all. Fetched 2026-09-03:

| Source | VRAM figure | State |
|---|---|---|
| `https://docs.comfy.org/tutorials/3d/trellis2` | **none stated anywhere on the page** | VERIFIED |
| `https://blog.comfy.org/p/trellis2-and-pixal3d-are-now-native` | **none**; strongest hardware claim is "everything runs on consumer hardware, and everything is free to use, including commercially" | VERIFIED |

So the honest answer to step 1 is **"upstream does not say"**, recorded as such rather than
guessed. The only measured local datum is the machine it would run on: RTX 5080, `vram_total`
17 094 475 776 bytes (15.9 GiB), `vram_free` 10 484 798 408 bytes at check time
(`GET /system_stats`). Register row 45 and the skill both now carry the absence explicitly and
instruct the first runner to measure peak VRAM and replace the line with a real number. Treat any
VRAM figure quoted for this route from anywhere else as CLAIMED.

### The model folders — ask the server, never guess the path

Session 1 concluded "no weights installed" from an `ls` of `ComfyUI_portable/ComfyUI/models/`.
That folder is **not** the tree the running process resolves:

```
GET /system_stats -> system.argv
["ComfyUI/main.py", "--windows-standalone-build", "--port", "8188", "--disable-auto-launch",
 "--log-stdout", "--use-sage-attention", "--disable-pinned-memory",
 "--models-directory", "C:\Users\david\Downloads\ComfyUI-H3-setup\downloads-current"]
```

The conclusion was right; the method could not have detected the weights had they been installed,
which makes it worthless as evidence. Re-measured by asking the server which files each folder
resolves to for *this* process:

| Endpoint | Response, 2026-09-03 |
|---|---|
| `GET /models/diffusion_models` | `["minimax_h3_fl2va_pruned_int8_convrot.safetensors", "minimax_music3_dit_fp16.safetensors"]` |
| `GET /models/vae` | `["minimax_h3_audio_vae_fp32.safetensors", "minimax_h3_video_vae_fp16.safetensors", "minimax_music3_dav.safetensors"]` |
| `GET /models/clip_vision` | `[]` |
| `GET /models/geometry_estimation` | `[]` |
| `GET /models/background_removal` | `[]` |

Zero of the six. **Step 5 remains genuinely blocked** on the ~9.95 GB download, now on evidence
that could have falsified it. The five files present are the owner's MiniMax H3 / Music3 set and
are nothing to do with this route.

The unsound method had been written into `comfyui-3d-native-pipeline`, a skill five other
harnesses read. Its preflight now resolves the root from `/system_stats.argv` and checks the five
`/models/<folder>` endpoints, and names this lane's own mistake as the worked example. Register
row 45 carries the same correction.

## Licences — observed vs claimed

| Component | Claimed | Observed (file read 2026-09-02) | State |
|---|---|---|---|
| `microsoft/TRELLIS.2` @ `75fbf0183001ed9876c8dbb35de6b68552ee08bd` | MIT | `LICENSE` = MIT, (c) Microsoft Corporation | VERIFIED |
| `TencentARC/Pixal3D` @ `f7cf38429b0bd264f1995f0f8743a88b1c728b94` | MIT | `LICENSE` = MIT, (c) 2026 Tencent, **no non-commercial or jurisdiction clause**. `NOTICE` names dinov2 (Apache-2.0), TRELLIS.2 (MIT, Microsoft), Direct3D-S2 (MIT, DreamTech), MoGe (MIT, Microsoft) | VERIFIED |
| `Comfy-Org/MoGe` @ `14cbe5bcaaab2fcabaccac085b24a82af2669b14` | MIT | real `LICENSE` file: MIT + Apache-2.0, (c) Microsoft | VERIFIED |
| `Comfy-Org/TRELLIS.2` @ `463441b1c32829ee876e4f297dcfff533cb357a7` | `license: mit` on the model card | **NO LICENSE FILE IN THE REPO** | VERIFIED |
| `Comfy-Org/Pixal3D` @ `b35ffffa61fa02a86c377d94b755d9fe65d185d9` | `license: mit` on the model card | **NO LICENSE FILE IN THE REPO** | VERIFIED |
| `Comfy-Org/BiRefNet` @ `5a1bd8ae750548f8cd42e3c8afa854fd3eba0fb1` | `license: mit` on the model card | **NO LICENSE FILE IN THE REPO** | VERIFIED |
| `dino_v3_L_naf_fp32.safetensors` (required `clip_vision` input) | shipped under the "MIT" Comfy-Org card | a **DINOv3** backbone — Meta's custom **DINOv3 License**: commercial use permitted, but with an attribution condition ("Built with DINOv3") and redistribution terms; DINOv2 was Apache-2.0, DINOv3 is not. NAF upsampler vendored from `valeoai/NAF` (Apache-2.0), credited in `comfy/image_encoders/naf.py` | VERIFIED that the component is DINOv3 + NAF; the DINOv3 licence terms are CLAIMED from Meta's published licence page, not read as a file in this lane |

**Verdict.** The announcement's "No non-commercial license traps" is **TRUE** — nothing in this
stack is non-commercial. "It's all MIT" is **NOT** true, and the repackaged model cards are where
that error would come from. If output from this route ever ships publicly, the DINOv3 attribution
condition is the item to clear with the owner.

## Weights that would have to be downloaded (owner decision, not taken)

Pixal3D route, int8: `pixal3d_int8_convrot` 5.58 GB → `models/diffusion_models/`;
`trellis_2_shape_vae_bf16` 1.10 GB and `trellis_2_texture_vae_bf16` 0.95 GB → `models/vae/`;
`dino_v3_L_naf_fp32` 1.22 GB → `models/clip_vision/`; `moge_2_vitl_normal_fp16` 0.66 GB →
`models/geometry_estimation/`; `birefnet` 0.44 GB → `models/background_removal/`.
**9.95 GB.** Trellis.2 route adds `trellis_2_int8_convrot` 5.25 GB. Sizes read from the
HuggingFace API with `blobs=true`. VERIFIED.

Those folder names resolve under the **server's** models root, which on this machine is
`C:\Users\david\Downloads\ComfyUI-H3-setup\downloads-current` (`--models-directory`), not the portable install's own `models/`.
Read the root from `/system_stats` before downloading anything.

## Animation-relevant discovery in the same release

ComfyUI 0.34.0 also ships a **core** video-mocap chain: `LoadVideo → SAM3_VideoTrack →
RTDETR_detect → SAM3DBody_Predict → SAM3DBody_Smooth → BuildPoseFile`, where `BuildPoseFile`
("Create 3D Animation File") writes an **animated GLB or a BVH** at a chosen fps. VERIFIED —
nodes present on the running server; template `utility_sam3d_body.json` shipped.

Its weights (`Comfy-Org/sam-3d-body` 2.83 GB, `Comfy-Org/sam3.1` 1.75 GB, RT-DETR 0.25 GB, MoGe
0.66 GB — ~5.5 GB, **not gated** on HuggingFace) come under the **SAM License**, whose
acceptable-use clause reads, verbatim: *"You agree not to use, or permit others to use, SAM
Materials for any activities subject to the International Traffic in Arms Regulations (ITAR) or
end uses prohibited by Trade Controls, including those related to military or warfare purposes,
nuclear industries or applications, espionage, or the development or use of guns or illegal
weapons."* VERIFIED — read from `Comfy-Org/sam3.1/LICENSE`.

That clause plainly targets real-world weapons rather than fiction, but Atomic Acres is a game
about guns and **that is an owner decision, not a lane decision.** Recorded, not acted on.

## Not done, and why

No generation was run. The nodes are present and the queue was idle, but **none of the weights are
installed**, so the bounded test in the brief's step 5 would have required a ~10 GB download into
the owner's own ComfyUI install on his shared workstation. That is a download plus a material
change to his environment: owner authorisation required. Everything needed to run it in one sitting
is written down in the `comfyui-3d-native-pipeline` skill.
