# Fence/gate placement advice (props-fence-gate-r1)

Target: Nuketown backyard boundary lines (teal concept codex-clipboard-37cd28a5;
same language in yellow concept codex-clipboard-b6a7a535).

- Origin: run centre at ground level. Drop the origin on the boundary line,
  Y = grade; the export already carries ground contact at local Y = 0.
- Yaw: rotate so the run lies along the boundary. Default heading 0 keeps the
  run on the X axis with the gate leaf opening toward local -Z (face that side
  into the yard).
- Clearance: keep player circulation outside the leaf swing (tip reaches
  ~0.99 m off the run line, total swept run is 5.52 m long, 1.97 m tall).
- Tiling: butt-joint repeated sections post-to-post (posts at +-2.7 m); height
  jitter is per-plank deterministic, so adjacent copies read as separate builds.
- Collision: presentation-only asset. The arena owner authors one thin box
  proxy per fixed bay plus one for the closed leaf plane (or the open-leaf
  swept quad if players can reach it) and verifies it in both graphics
  profiles.
- Do not scale non-uniformly; the wood-grain textures are metre-proportional.
