# Atomic Acres — Reference-Image Catalog: Prompt Template Pack

FROZEN visual bar for builder/critic gauntlet loop. Implementation screenshots are compared against this catalog.
Setting: ORIGINAL retro-future model-suburb FPS — two model homes, clean lawns, bright team-readable colour blocks, civic transit showcase; browser Three.js/WebGPU.
STRICT originality: no resemblance to Call of Duty, Nuketown, or any protected game art, signage, logos, or trade dress. No real brand marks. All weapons/sights are generic original designs.

Conventions:
- `STYLE BLOCK` is byte-identical in every prompt in the catalog. Copy verbatim.
- `NEGATIVE BLOCK` is byte-identical in every section. Copy verbatim.
- Every filled example prompt is under 75 tokens (CLIP truncates at 77).
- `[BRACKETS]` are variable slots. Fill with short plain values only.

---

## 1 — POV idle hip-fire viewmodel shot

Purpose: relaxed read of silhouette, colour blocks, and hands from player camera.

STYLE BLOCK (copy verbatim):
`retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Template:
`FPS POV hip-fire viewmodel, [WEAPON] with [SIGHT] lowered center-right, hands visible, clean lawn suburb, [COLORBLOCK], {STYLE BLOCK}`

VARIABLE SLOTS:
- `[WEAPON]`: `compact carbine` / `long sniper rifle`
- `[SIGHT]`: `aperture sight` / `scope`
- `[COLORBLOCK]`: `blue team block` / `orange team block`

Filled example A — carbine + aperture:
`FPS POV hip-fire viewmodel, compact carbine with aperture sight lowered center-right, hands visible, clean lawn suburb, blue team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Filled example B — sniper + scope:
`FPS POV hip-fire viewmodel, long sniper rifle with scope lowered center-right, hands visible, clean lawn suburb, orange team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

NEGATIVE BLOCK (copy verbatim):
`blurry, low quality, distorted anatomy, extra limbs, text, subtitles, watermark, logo, gore, dark horror lighting`

---

## 2 — POV ADS per sight variant

Purpose: aimed sight picture, reticle focus, peripheral suburb blur.

STYLE BLOCK (copy verbatim):
`retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Template:
`FPS POV ADS, [WEAPON] centered, [SIGHT-VIEW] reticle focus, blurred suburb street beyond, [COLORBLOCK], {STYLE BLOCK}`

VARIABLE SLOTS:
- `[WEAPON]`: `compact carbine` / `long sniper rifle`
- `[SIGHT-VIEW]`: `aperture ring` / `scope circle`
- `[COLORBLOCK]`: `blue team block` / `orange team block`

Filled example A — carbine + aperture:
`FPS POV ADS, compact carbine centered, aperture ring reticle focus, blurred suburb street beyond, blue team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Filled example B — sniper + scope:
`FPS POV ADS, long sniper rifle centered, scope circle reticle focus, blurred suburb street beyond, orange team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

NEGATIVE BLOCK (copy verbatim):
`blurry, low quality, distorted anatomy, extra limbs, text, subtitles, watermark, logo, gore, dark horror lighting`

---

## 3 — Side profile neutral

Purpose: clean orthographic-adjacent record of full weapon silhouette, no sight emphasis.

STYLE BLOCK (copy verbatim):
`retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Template:
`side profile neutral, [WEAPON] with [SIGHT] horizontal centered, plain light backdrop, [COLORBLOCK], {STYLE BLOCK}`

VARIABLE SLOTS:
- `[WEAPON]`: `compact carbine` / `long sniper rifle`
- `[SIGHT]`: `aperture sight` / `scope`
- `[COLORBLOCK]`: `blue team block` / `orange team block`

Filled example A — carbine + aperture:
`side profile neutral, compact carbine with aperture sight horizontal centered, plain light backdrop, blue team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Filled example B — sniper + scope:
`side profile neutral, long sniper rifle with scope horizontal centered, plain light backdrop, orange team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

NEGATIVE BLOCK (copy verbatim):
`blurry, low quality, distorted anatomy, extra limbs, text, subtitles, watermark, logo, gore, dark horror lighting`

---

## 4 — Side profile per sight variant

Purpose: compare iron vs aperture/reflex vs sniper scope silhouettes on identical body framing.

STYLE BLOCK (copy verbatim):
`retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Template:
`side profile closeup, [WEAPON] with [SIGHT-VARIANT] raised, horizontal centered, plain light backdrop, [COLORBLOCK], {STYLE BLOCK}`

VARIABLE SLOTS:
- `[WEAPON]`: `compact carbine` / `long sniper rifle`
- `[SIGHT-VARIANT]`: `iron posts` / `aperture sight` / `reflex hood` / `scope tube`
- `[COLORBLOCK]`: `blue team block` / `orange team block`

Filled example A — carbine + aperture:
`side profile closeup, compact carbine with aperture sight raised, horizontal centered, plain light backdrop, blue team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Filled example B — sniper + scope:
`side profile closeup, long sniper rifle with scope tube raised, horizontal centered, plain light backdrop, orange team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

NEGATIVE BLOCK (copy verbatim):
`blurry, low quality, distorted anatomy, extra limbs, text, subtitles, watermark, logo, gore, dark horror lighting`

---

## 5 — Macro detail callout

Purpose: material, edge, and interface quality: receiver, mount, adjustment surfaces.

STYLE BLOCK (copy verbatim):
`retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Template:
`macro detail callout, [PART] of [WEAPON] with [SIGHT], clean machined edges, shallow depth, neutral light, {STYLE BLOCK}`

VARIABLE SLOTS:
- `[PART]`: `receiver seam` / `sight mount` / `scope turret` / `grip texture`
- `[WEAPON]`: `compact carbine` / `long sniper rifle`
- `[SIGHT]`: `aperture sight` / `scope`

Filled example A — carbine + aperture:
`macro detail callout, receiver seam of compact carbine with aperture sight, clean machined edges, shallow depth, neutral light, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Filled example B — sniper + scope:
`macro detail callout, scope turret of long sniper rifle with scope, clean machined edges, shallow depth, neutral light, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

NEGATIVE BLOCK (copy verbatim):
`blurry, low quality, distorted anatomy, extra limbs, text, subtitles, watermark, logo, gore, dark horror lighting`

---

## 6 — In-world placement on a sunny model-suburb street

Purpose: scale and palette fit against frozen setting: model homes, lawns, transit showcase.

STYLE BLOCK (copy verbatim):
`retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Template:
`in-world placement, [WEAPON] with [SIGHT] floating upright on sunny model-suburb street, two model homes lawns transit stop, [COLORBLOCK], {STYLE BLOCK}`

VARIABLE SLOTS:
- `[WEAPON]`: `compact carbine` / `long sniper rifle`
- `[SIGHT]`: `aperture sight` / `scope`
- `[COLORBLOCK]`: `blue team block` / `orange team block`

Filled example A — carbine + aperture:
`in-world placement, compact carbine with aperture sight floating upright on sunny model-suburb street, two model homes lawns transit stop, blue team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

Filled example B — sniper + scope:
`in-world placement, long sniper rifle with scope floating upright on sunny model-suburb street, two model homes lawns transit stop, orange team block, retro-future clean industrial design, bright suburban daylight, soft shadows, 16:9, game-screenshot realism, no text, no watermark`

NEGATIVE BLOCK (copy verbatim):
`blurry, low quality, distorted anatomy, extra limbs, text, subtitles, watermark, logo, gore, dark horror lighting`

---

## 7 — Generation settings guidance

- Single generator for whole catalog. Record model name, version, sampler, steps, CFG, resolution (16:9, e.g. 1280x720), and negative-block wiring. Do not mix generators mid-catalog.
- Deterministic seed per shot slug. Slug format: `aa-[family]-[weapon]-[sight]-[variant]` (e.g. `aa-pov-ads-carbine-aperture-blue`). Assign one fixed integer seed per slug, store in a seed table, never reuse a seed across slugs. Same slug + same prompt + same settings = byte-comparable regeneration.
- Freeze on acceptance. Accepted images are read-only; further tuning uses new slugs, never overwrites.
- Reject-and-regenerate if any of: text/watermark/logo appears; extra limbs or distorted hands/optics; sight reticle unreadable (families 2/4); wrong weapon length class; dark/horror/gore grading; protected-game resemblance (CoD/Nuketown cues, military grime, real brand marks); aspect ratio ≠ 16:9; style drift from STYLE BLOCK (overcast night, heavy shadows, photoreal grime).
- On reject: keep seed if composition is right but artifacted (1 retry same seed), else advance seed once, log old/new seeds and reason. Max 3 attempts per slug, then flag for brief review.
- Token hygiene: keep final positive prompts under 75 tokens; put all exclusions in NEGATIVE BLOCK, never in the positive prompt.
