# HF-500 HUD chat evidence

Date: 2026-09-04
Branch: `contrib/dave-gaming-pc/claude/hud-chat-hf500`
Base: `3e2fd273f385713f8e645ba39bdf12d530b546f4`

Claim states: `VERIFIED` means measured or executed in this run; `CLAIMED` means
derived from the final CSS/unit contract; `OPEN` means not re-captured because
the owner limited this task to one browser run.

## Single permitted capture

`VERIFIED`: `hud-chat-1440p.png` and `measurement.json` were captured from a
live Nuke Town match at 1440x900 using installed headless Chrome, native
WebGPU, stock flags plus `--mute-audio`, through preview port 4196. Backend was
`webgpu` and browser/page errors were empty.

The capture was intentionally used as a falsifier. It found that the initial
closed-state CSS was correctly positioned and pointer-inert but still painted a
tall blank panel. The final CSS repair below removes that residual height with
explicit closed-state sizing and hidden log/composer rules. No second browser
run was made.

## Before / after positions

| Surface | Before capture (1440x900) | Final target | State |
|---|---:|---:|---|
| Game chat left / top | x=21.6, y=150.0 | x=21.6, y=150.0 | `VERIFIED` / `CLAIMED` |
| Game chat closed bottom | y=370.0 (220px tall residual) | approximately y=178 (compact header) | `VERIFIED` / `CLAIMED` |
| Weapon/ammo panel top | y=772.7 | y=772.7 | `VERIFIED` / `CLAIMED` |
| Minimap bounds | x=1205.3..1425.8, y=14.7..300.1 | unchanged | `VERIFIED` / `CLAIMED` |
| Crosshair bounds | y=424.6..474.7 | unchanged | `VERIFIED` / `CLAIMED` |

The final pure layout contract proves the open-state ceiling ends before the
crosshair band and ammo cluster at 1920x1080, 2560x1440 and 390x844, with no
chat/minimap overlap. The final CSS contract proves closed game chat has
`pointer-events: none`, hides its log and form, and restores pointer access only
for `data-open="true"`. The game open path remains the explicit Enter handler;
the game panel click handler now returns without opening chat. Lobby chat and
the multiplayer protocol are unchanged.

Final visual-after inspection is `OPEN` by the one-browser limit; the static
repair and all focused gates are `VERIFIED`.
