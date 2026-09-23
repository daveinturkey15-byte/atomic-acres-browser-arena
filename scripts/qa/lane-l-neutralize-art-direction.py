"""Lane L capture support: build a BEFORE bundle with the art direction neutralized.

HOW THE BEFORE/AFTER PAIR IS PRODUCED (reproduce with):
    python scripts/qa/lane-l-neutralize-art-direction.py patch  <repo-root>
    npx vite build --outDir dist-lanel-before
    python scripts/qa/lane-l-neutralize-art-direction.py restore <repo-root>
    npx vite build --outDir dist-lanel-after
    npx vite preview --outDir dist-lanel-before --port 41893 --strictPort --host 127.0.0.1 &
    npx vite preview --outDir dist-lanel-after  --port 41894 --strictPort --host 127.0.0.1 &
    LANE_L_PRESET=high bash scripts/qa/run-lane-l-capture-sweep.sh before http://127.0.0.1:41893
    LANE_L_PRESET=high bash scripts/qa/run-lane-l-capture-sweep.sh after  http://127.0.0.1:41894
    node scripts/qa/compare-lane-l-art-direction.mjs

`restore` is sha256-verified against the backup, so a killed run cannot leave
the neutralized source behind. The backup lands next to this script.

The owner's BEFORE has to be the tree as it is MINUS lane L, not HEAD — HEAD
would also strip every other lane's uncommitted work and the pair would then
prove nothing about art direction. So this makes exactly four surgical edits
that turn the routed art direction back into the shared look it replaced, and
`restore` puts the byte-exact original back (sha256-verified).

Usage: python neutralize-art-direction.py <patch|restore> <repo-root>
"""
import hashlib
import io
import os
import sys

ACTION = sys.argv[1]
ROOT = sys.argv[2]
TARGET = os.path.join(ROOT, 'src', 'rendering', 'art-direction.ts')
BACKUP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lane-l-art-direction.ts.orig')

# The pre-lane-L hardcoded atmosphere tints from pass64-tsl-scene.ts, and a
# density of 1 (the pre-lane-L opacity formulas carried no density term, so
# density 1 reproduces them exactly).
NEUTRAL = """
/** CAPTURE-ONLY neutral direction: the shared look lane L replaces. */
const __LANE_L_NEUTRAL: ArenaArtDirection = frozen({
  id: 'gun-range',
  brief: 'capture-only neutral',
  cdl: { gain: [1, 1, 1], lift: [0, 0, 0], gamma: [1, 1, 1] },
  saturationScale: 1,
  contrastScale: 1,
  crosstalkDelta: 0,
  splitTone: { shadowTint: 0x000000, highlightTint: 0xffffff, strengthScale: 1, shadowBalance: 0.5, highlightBalance: 0.5 },
  midtoneContrastDelta: 0,
  vignette: { base: 0, settingScale: 1 },
  bloom: { intensityScale: 1, thresholdScale: 1 },
  atmosphere: {
    mistNear: 0x7fa5ae, mistFar: 0xd0d9cf,
    smokeNear: 0x2f3b3e, smokeFar: 0x7d8984,
    dustNear: 0xd7b47b, dustFar: 0xffebc7,
    density: 1,
  },
});
"""

EDITS = [
    (
        "export function artDirectionForArena(arenaId: ArenaId | string): ArenaArtDirection {\n",
        "export function artDirectionForArena(arenaId: ArenaId | string): ArenaArtDirection {\n  return __LANE_L_NEUTRAL;\n",
    ),
    (
        "): FrozenFilmicGradeProfile {\n  const compose3 = (",
        "): FrozenFilmicGradeProfile {\n  return profile;\n  const compose3 = (",
    ),
    (
        "): Readonly<{ saturation: number; contrast: number }> {\n  return Object.freeze({",
        "): Readonly<{ saturation: number; contrast: number }> {\n  return authored;\n  return Object.freeze({",
    ),
    (
        "): number {\n  const base = Number.isFinite(settingStrength)",
        "): number {\n  return Number.isFinite(settingStrength) ? Math.max(0, settingStrength) : 0;\n  const base = Number.isFinite(settingStrength)",
    ),
]

ANCHOR = "/** Fail-closed lookup. Unknown arena ids are a construction error. */"


def read(path):
    with io.open(path, 'rb') as handle:
        return handle.read()


def sha(data):
    return hashlib.sha256(data).hexdigest()


if ACTION == 'patch':
    original = read(TARGET)
    with io.open(BACKUP, 'wb') as handle:
        handle.write(original)
    source = original.decode('utf-8')
    assert source.count(ANCHOR) == 1, 'neutral anchor missing'
    source = source.replace(ANCHOR, NEUTRAL + '\n' + ANCHOR)
    for old, new in EDITS:
        assert source.count(old) == 1, 'edit anchor missing or ambiguous: %r' % old[:60]
        source = source.replace(old, new)
    with io.open(TARGET, 'wb') as handle:
        handle.write(source.encode('utf-8'))
    print('patched; backup sha256=%s' % sha(original))
elif ACTION == 'restore':
    backup = read(BACKUP)
    with io.open(TARGET, 'wb') as handle:
        handle.write(backup)
    print('restored; sha256=%s' % sha(read(TARGET)))
else:
    raise SystemExit('unknown action %r' % ACTION)
