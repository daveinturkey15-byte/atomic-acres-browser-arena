# Lane AH — intake: ComfyUI native Trellis.2 / Pixal3D 3D pipeline as a shared skill, plus the animation pipeline options

Orchestrator: Claude Code (Fable 5.1). Owner (2026-09-02 17:45): "even if you
are rebuilding nuketown from code I am sure we still use assets for some
things? I think we still need to experiment with smart decent pipelines
especially for animations etc. https://x.com/comfyui/status/2094561833638404449
This looks useful, worth adding it as a skill all our harnesses etc can use
and stored centrally in our obs vault and akp knowledge?"

Resolved post (fxtwitter, 2026-08-31, @ComfyUI): "Trellis.2 and Pixal3D are
now native in ComfyUI core. No custom nodes. No CUDA extensions. No PyTorch
downgrade. No non-commercial license traps. Plus a rebuilt 3D pipeline:
Load/Preview/Save 3D nodes, mesh post-processing, and PBR texturing that
bakes normals + AO for a full material set. Runs on consumer hardware. Free to
use commercially." Link: comfy.org. Video attached (not needed).

## Where this goes (governed skill work - follow the standing intake procedure)
Memory `ai-3d-technique-register` has the procedure; the canonical register
is `C:\Users\david\AppData\Local\hermes\.akephalos\references\ai-3d-technique-register.md`;
skills live in the vault `C:\Users\david\Documents\desky-bootstrap-clone\Skills\<category>\<skill>\SKILL.md`
(nested), with the flat view at `~/.agents/skills` rebuilt by
`<vault>\_Scripts\link_skills.ps1`. Every skill add or update needs a paired
evaluation record in `.akephalos\skill-evaluations\<skill>.json` and a SCOPED
`skill_regression_guard.py accept --skill <name>`; commit eval records +
`skill-baseline.json` to AKP by explicit `git add`, push, read back. Never
blanket-accept pre-existing drift. Run SkillScan (`skillscan`) on any new or
changed skill before use.

## Job
1. Resolve to primary sources: the ComfyUI release notes / blog / GitHub
   release that made Trellis.2 and Pixal3D core nodes; the model licences
   (read LICENSE FILES, not API fields; record observed vs claimed); minimum
   VRAM and the exact node names (Load 3D, Preview 3D, Save 3D, mesh
   post-processing, PBR texturing normals+AO). Pin versions. Check whether
   the owner's portable ComfyUI (`Desktop\stuff\Comfy Fun\ComfyUI_portable`)
   is at a version that includes them (read its version files; DO NOT update
   or restart his ComfyUI; report the version gap if any).
2. Register row(s) in the technique register (image-to-3D with PBR bake,
   native pipeline), per the procedure; run `technique_register_guard.py check
   --machine dave-gaming-pc`.
3. Skill: extend `ai-3d-asset-generation-loop` (supply-route choice +
   closed-loop generate/inspect) with the native ComfyUI 3D route: inputs
   (concept image from Qwen-Image via the existing `comfy_generate.py`
   pattern), the node chain, post-processing (decimation, UV/PBR bake),
   export to glTF, the repo's provenance requirements (assets.manifest.json,
   `qa:asset-provenance`), and the acceptance loop (headless render compare).
   If a separate skill is cleaner (`comfyui-3d-native-pipeline`), author it
   nested under the right category with a SKILL.md under 360 chars of
   description, plus the eval record. Mirror is automatic via the flat view;
   re-run `link_skills.ps1 -VerifyOnly` and report.
4. Animations: the owner wants "smart decent pipelines especially for
   animations". Review the options already in the register and the
   `game-animation-asset-pipeline` skill (text-to-motion, mocap retarget,
   the mixamo-llm-mocap repo) against the game's operator rig contract
   (62 joints / 24 clips): what would produce new clips (reload variants,
   prone transition for drop shots, melee) with the least manual work, what
   runs locally on this machine, licences, and a recommended first
   experiment with a time estimate. Write it as a section of the skill or a
   vault note `Dev-Practices/Animation Pipeline Options 2026-09.md`, linked
   from the technique register note.
5. Only if the owner's ComfyUI already has the nodes AND its queue is idle:
   one bounded local test generation (a single prop, e.g. a mailbox) through
   the native route, headless, saved under `docs/evidence/pass87/comfy-3d/`
   with timings; otherwise record exactly what would be needed. Never invoke
   a paid generation API.
6. Vault note update (`Dev-Practices/AI 3D Technique Register.md`), AKP
   commit + push of the register row, eval record and baseline; report.

## Boundaries
- You own: the register row, the skill and its eval record, the vault notes,
  the optional evidence. Do not touch game source. Do not update, restart or
  queue jobs on the owner's ComfyUI beyond the single bounded test in step 5.
- Machine rules as every lane; no browsers except the in-app fetch route if
  x.com blocks (fxtwitter JSON already resolved the post).

## Report
Sources with pinned versions and licences, the register row ids, skill
path(s) and eval record, guard results, the animation options table with
the recommended first experiment, the local ComfyUI version gap, commits.
Claim-state every line.
