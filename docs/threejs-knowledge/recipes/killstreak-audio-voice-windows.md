# Recipe: time-aware voice windows for scheduled Web Audio cues

What: size a voice budget by *sounding* overlap, not by scheduled count.
A cue that schedules five 0.64 s pulses 1.0 s apart never has more than one
voice sounding, but a register-at-schedule-time budget sees five voices and
drops one. The fix is to record each voice's audible window
`[scheduleTime + delay, scheduleTime + delay + duration]` at admission and
count, for each bus, only the incumbents whose windows overlap the
candidate's (half-open: an ending voice frees its slot the instant the next
starts). Callers that cannot declare a window (continuous loops) register an
unbounded one and behave exactly as before.

Numbers that make it work (Atomic Acres, HF-542): announcements cap 4;
`nukeWarning` (10 scheduled, peak sounding 1) and `scoutSweep` (10
scheduled, peak 2) went from 6 drops each to 0 with no authoring change. A
cue that genuinely overlaps — five 0.44 s voices spaced 0.07 s, peak 5 —
still drops until re-authored (spacing 0.12 s, peak 4, same 5 oscillators).

Failure mode it avoids: the budget silently disconnects scheduled voices,
so the same cue sounds different every playthrough depending on what else is
playing. The anti-cheat is a test that stacks more genuinely simultaneous
voices than the cap and requires drops — without it, "zero drops" only
proves a disabled budget.

Upstream: Web Audio API, AudioParam automation constraints
(`exponentialRampToValueAtTime` needs strictly positive values and
increasing times — the reason envelopes are asserted as schedules, see
`applyEnvelope` in `src/audio.ts`) — https://webaudio.github.io/web-audio-api/#dom-audioparam-exponentialramptovalueattime
