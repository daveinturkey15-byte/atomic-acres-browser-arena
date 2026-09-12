# Garden set placement advice (props-garden-set-r1)

Target: Nuketown yellow-house rear deck (concept codex-clipboard-b6a7a535).

- Origin: set centre at ground level. Drop the origin on the deck boards, Y = deck
  surface height; the export already carries ground contact at local Y = 0.
- Yaw: rotate so one chair gap faces the sliding door; default heading 0 keeps the
  script yaw (chairs at 25/115/205/295 degrees).
- Clearance: keep a 0.35 m walkway outside the 1.446 m footprint half-extent for
  player circulation. Total swept disc is ~2.9 m across, 2.41 m tall.
- Surface: deck boards or patio slab. On grass, sink the origin 0.02 m so the pole
  base and chair feet bite instead of floating.
- Collision: presentation-only asset. The arena owner authors one cylinder proxy
  (radius 1.45 m, height 2.4 m, or table-only radius 0.6 m if players may walk
  under the canopy edge) and verifies it in both graphics profiles.
- Do not scale non-uniformly; the weave textures are metre-proportional.
