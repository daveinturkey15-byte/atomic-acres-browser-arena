# Utility AC placement advice (props-utility-ac-r1)

Target: beside the Nuketown teal-house brick chimney on grade
(concept codex-clipboard-37cd28a5).

- Origin: unit centre at ground level. Drop the origin on grade; the concrete
  pad base is at local Y = 0 and the cabinet floats 0.06 m above the pad on
  rubber feet.
- Yaw: default heading 0 faces the louver intake toward local -Z (toward the
  yard) with the control box on local +X. Face the louvers outward and keep
  the control-box side accessible.
- Clearance: keep 0.3 m service clearance on the +X side and 0.2 m airflow gap
  behind the rear pipe stub. Total footprint is 1.2 x 1.0 m, 0.93 m tall.
- Surface: soil, gravel or concrete pad extension. On grass, sink the origin
  0.02 m so the pad edge bites instead of floating.
- Collision: presentation-only asset. The arena owner authors one box proxy
  (1.2 x 1.0 x 0.93 m, or cabinet-only 0.86 x 0.64 x 0.79 m if players may step
  onto the pad edge) and verifies it in both graphics profiles.
- Do not scale non-uniformly; the brushed-paint textures are metre-proportional.
