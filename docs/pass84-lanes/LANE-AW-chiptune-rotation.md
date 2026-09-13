# Lane AW — HF-430: chiptune music at half volume, ~10 variations of ~90 s, random order

Worktree `C:\Users\david\projects\aa-claude-music`, branch
`contrib/dave-gaming-pc/claude/chiptune-rotation` (base = current integration head).
1. Find the music: grep -ri chiptune src (the procedural synth/sequencer and the
   audio bus). Measure the current music gain relative to SFX (read the constants;
   if there is an audio-immersion mix table, use it).
2. Halve the MUSIC gain only (-6 dB), leaving SFX/voice untouched; keep the user's
   persisted volume setting semantics (the slider still scales the halved base).
3. Build ~10 distinct variations/tracks in code (different scales/keys, tempos,
   arpeggio patterns, drum patterns, lead timbres - all procedural, nothing
   imported), each ~90 s (85-95 s), then a shuffle rotation: random order with no
   immediate repeat and no repeat until all ten have played, seamless swap on a bar
   boundary, deterministic under a seed for tests.
4. Tests: count 10, duration band per track, no-repeat shuffle property, gain
   exactly half of the previous constant (pin the old and new values), and the
   swap happens on a bar boundary. A headless 5-minute run logs the track ids
   played (evidence under docs/evidence/pass89/lane-aw/).
5. tsc, focused vitest, commit with explicit paths, push. Machine rules as every
   lane; never touch aa-omp-pass84's working tree.

## Also in this lane — Lane AX, HF-431: drop shot from sprint
In `src/legacy-main.ts` (LF-terminated: edit with python newline='' or sed; never
rewrite with CRLF) and `src/prone-transition.ts` (HF-412): when the prone /
drop-shot key is pressed while sprinting, perform the drop shot AND clear the
sprint latch, so a still-held Shift does not resume sprinting while prone or on
standing up; sprint requires a fresh Shift press after the stance returns to
stand. Pin it with a unit test on the stance/sprint state machine and extend
tests/e2e/pass85-drop-shot.spec.ts with the keyboard sequence (Shift held, Z ->
prone, not sprinting; stand -> still not sprinting until Shift is pressed again).
Keep the drop-shot timing constants unchanged. tsc + focused vitest
(src/prone-transition.test.ts, src/key-bindings.test.ts, src/gameplay.test.ts)
+ the e2e spec headless (PASS73_NATIVE_WEBGPU=1, private port).
