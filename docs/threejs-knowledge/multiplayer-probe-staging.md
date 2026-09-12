# Multiplayer reload probe setup

VERIFIED 2026-09-12: the three-player soak on450134666 completed but its guestB
reload-after-death row failed the other-guest animation observation. Both local
and host magazines finished at30, the guest sent an intent and received a result.
The trace recorded message types without acceptance reasons, so that evidence
alone cannot prove that the host accepted this particular reload.

Source inspection found a definite setup mismatch. `setAmmo` in legacy-main.ts
changes only the local player. `acceptRemoteReloadIntent` uses the host's
separate combat inventory; `admitGuestReloadIntent` rejects a full magazine as
`nothing-to-reload`. A rejected reload can therefore restore the local magazine
without having started the remote animation.

The probe now uses the existing fenced host-authority QA hook and local hook to
set the same target magazine, then reads both actual states. A missing hook,
unchanged full host magazine, changed identity or different held weapon fails
setup. All original animation, ammo, intent, result, delay and acknowledgement
conditions remain in place. The bounded host protocol trace is also retained
with the result to distinguish accepted, rejected and committed actions.

VERIFIED:13 focused Node checks pass, including actual serialized page callbacks
in separate VM contexts and negative setup controls. The first VM fixtures
omitted document query methods used by the existing view reader; those fixtures
were corrected before acceptance. No application reload behavior changed.

VERIFIED: the fresh 99c1e6a three-player WebGPU soak completed 180009 ms and
both reload-after-death checks passed. The whole soak remains RED. It recorded
30 presence failures during intentional disconnect/rejoin, rejoin damage
observed as host80/guestA100/guestB80, and target first-seen165 ms against120 ms.
Guest A also failed the stair probe. The new protocol trace caught pre-death
requests with lifeId3 rejected by host lifeId2; post-death reloads succeeded.
This resembles the owner's deferred movement report but does not establish
its full historical cause. No application admission or movement fix was made.

OPEN: those multiplayer findings, their measurement/runtime causes and the
owner-deferred feature work. The original failed soak remains at
`artifacts/pipeline/completion-mp-soak-450134/`; the new failed bundle is in
`artifacts/pipeline/completion-mp-soak-reload-99c1e6/`.
