# IBL contract reconciliation (2026-09-12)

The original Pass 62 check in `63978ef67` constrained four named arenas to the
0.1–0.3 range. `79d91dc9d` broadened its loop to every selectable arena during
High Seas work. `be8a2545d` subsequently authored Nuke Town's IBL at 0.32 against
measured shadow-floor and board visibility, with an independent exact lighting pin.
At df933ec48 those two tests cannot both pass on the same runtime value.

Root inspected the original and broadened test histories and the live lighting
configuration. The independent Opus High review supports reconciling that scope.
The check now requires exactly 0.32 for Nuke Town, retains the 0.1 lower bound and
all existing ordering checks, and retains the 0.3 upper bound on every other arena.
The existing exact Nuke Town night-lighting assertion remains. Runtime values are
unchanged. This is an explicit resolution of conflicting contracts, not permission
to raise any general lighting, performance or geometry limit.

Owner visual acceptance and full release acceptance remain OPEN. This record
records agent review of implementation history, not owner approval of the look.
