# HF-542 before/after: which authored voices never sounded

Drop counts are measured (`inventory-baseline.json`, `dropped` field).
Voice identities below are derived from the verified call order in each cue
body plus the announcements cap of 4: `registerVoice` admits in call order
until the bus is full, and every `sweep`/`noise` voice registers with
identical priority/distance/startedAt, so no steal ever fires — the first 4
scheduled announcements voices are heard and the rest are disconnected
unheard. No claim here is about taste or rendered samples.

- `nukeWarning` (6 of 11 dropped): the 5th klaxon pulse and all 5
  confirmation pips never sounded. Heard: klaxons 1-4 plus the ambience
  pressure rise. After: 0 dropped; all 5 klaxons, all 5 pips, the rise.
- `scoutSweep` (6 of 10 dropped): the 5th sonar pulse and all 5 pips never
  sounded. Heard: sonar pulses 1-4. After: 0 dropped; all 10 pulses.
- `supportInbound('hunter-swarm')` (1 of 5 dropped): the 5th cascade whoosh
  never sounded. After (spacing 0.07 s -> 0.12 s, same 5 oscillators): 0
  dropped; peak concurrent announcements 5 -> 4.
- BURST nuke sequence (8 of 15 dropped): hostile sting fully heard; of the
  warning, only klaxons 1-2 sounded — klaxons 3-5 and all 5 pips never did.
  After: 0 dropped.
- BURST hunter-swarm activation (3 of 18 dropped): own sting and all 5
  hunter launches fully heard; swarm whooshes 3-5 never sounded. After: 0
  dropped.
- BURST tri-pass activation (1 of 10 dropped): the 3rd tri-pass flyover
  never sounded. After: 0 dropped.
- Every other probed cue and all 4 reference cues: 0 dropped before and
  after; nothing was ever unheard there. Their fix is envelopes only.
