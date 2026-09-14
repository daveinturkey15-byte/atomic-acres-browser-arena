# MP soak v2.1 — explicit death/support/render domains

CLAIMED root authorized this separately identified correction after source review on10September2026. Existing v2 attempt1 stays FAILED/INCOMPLETE. This is not an owner-threshold waiver or product authority change.

## Source-backed mapping

VERIFIED `processDeath` advances host support actor life to remote continuity+1 at death (legacy-main16660). Host admitted remote state uses registered actor life (13687–13720), while the subject's local continuity changes only in new-life respawn (17307). `HostKillstreakRuntime.recordActorDeath` sets its nextLifeId and resets authority sequences (killstreak-runtime1466). These are separate clocks, so requiring equal dead render continuity was an unproven QA assumption.

VERIFIED for the host QA lethal gun trigger, publishRemoteHealthAuthority first emits the old-life lethal fact, then canonicalDeath/processDeath advances support life and commits canonical scores (36711–36739,15295,16655–16726). The host-as-killer branch calls awardSupportElimination, which refreshes the host cached support snapshot synchronously (25441–25446). No additional snapshot-mutating debug call is needed.

VERIFIED new contract `mp-soak-gate-v2.1`, lifecycle `death-support-render-domains-v1`, driver `scripts/qa/mp-soak-gate-v21.mjs`. For baseline life L and canonical death count D:

| Stage | Subject local continuity | Host/observer remote continuity | Support actor life, all peers | Canonical deaths, all peers |
|---|---|---|---|---|
| Settled alive100HP | L | L | L | D |
| Observed dead0HP | L | L+1 | L+1 | D+1 |
| Natural respawn100HP | L+1 | L+1 | L+1 | D+1 |

VERIFIED every stage is observed explicitly with the same subject/match epoch. The host trigger independently records HP100->0, supportL->L+1 and deathsD->D+1 in one synchronous call. The processed-event identity is match epoch+subject+old life+canonical death count, not a claim to capture the wire nonce. Duplicate transport delivery may be idempotent; duplicate committed death cannot pass. A corpse's transient old generation is not accepted as an alternative: observers must actually exhibit the mapped next support/render generation while dead. Missing the window fails.

VERIFIED before each serialized lethal probe, all peers must show a common full-health/support/render/counter baseline for250ms within6s, with raw prerequisite observations retained. All timed replication samples continue and divergences are never excluded. Death watches start before the host trigger; natural respawn requires exact L+1 agreement, primary weapon and positive ammo/reserve. No manual respawn or baseline HP/life mutation.

VERIFIED old v2 consumer is unchanged. The v2.1 wrapper reuses every numeric/presence/latency/artifact row; only the separately named mapped-death row replaces the old same-dead-life assumption. Reports lacking the exact v2.1 contract cannot pass this new row.180 connected samples/1s spacing/1.5m/120ms/1%/299s and clipping UNKNOWN remain unchanged.

VERIFIED53 combined Node tests PASS:41 retained tests plus12 mapping tests covering exact domains, both subjects, no death, duplicate committed death, stale count/epoch/life, extra increment, old-or-new wildcard rejection, failed post-respawn agreement/loadout, pre-existing mismatch, wrong subject, old contract rejection and non-mutating browser callback.

OPEN fresh runtime proof. The independently recorded16m replication, reload visibility and staircase failures remain OPEN; this contract correction does not repair them. Full-network/WAN, stock performance, smoke and final visual acceptance remain separate.
