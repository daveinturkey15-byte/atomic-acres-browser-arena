# HF-498 multiplayer bug evidence

Date: 2026-09-04  
Lane: `contrib/dave-gaming-pc/claude/mp-bugs-hf498`  
Arena: original `nuketown2`

## Claim state

| State | Evidence |
| --- | --- |
| VERIFIED | HF-498 was entered in the owner-feedback ledger and pushed on `contrib/dave-gaming-pc/omp/pass84-overnight` before source changes. |
| VERIFIED | Baseline real-menu host+guest run passed on `nuketown2`; `artifacts/qa/mp-bugs/hf498-before/summary.json`. |
| VERIFIED | Native headless host+guest run passed all five HF-498 assertions at `2026-09-04T20:32:10.890Z`; `artifacts/qa/mp-bugs/hf498-host-guest/result.json`. Both clients reported `webgpu`; `nativeWebGpuEnv=true`; stock/headless/mute-audio; only ports 4191/4192. |
| VERIFIED | Focused typecheck and expanded requested Vitest gate passed: 47 files, 513 tests. The unchanged `legacy-main.ts` ratchet passed. |
| OPEN | A later duplicate final-tree E2E invocation reached the outer command ceiling during slow WebGPU admission and produced no result artifact. Its helper tree was verified by command line and stopped; it is not counted as evidence. The successful native run used the same behavior, with only semantics-preserving line compaction afterward. |

## Reproduction trace

The baseline driver established a real host and guest through the menu, joined the
original Nuketown arena, synchronized the lobby, and deployed both peers. The
HF-498 driver then enabled the bounded 250 ms event delay only after deployment so
admission timing did not become the fault under test.

Reload staging is host-side QA setup because the production host correctly rejects
guest-selected inventory splits. The guest then used the real `reload()` path.
The successful bounded trace had one stable request key across retransmissions:

```text
guest send start requested       actionSequence=0
guest send start requested       actionSequence=0   same requestId
host admit start accepted
host send result started accepted
host cache-hit start started
guest receive result started
host send result committed
guest receive result committed
```

The artifact recorded `reloadRetrySent=true`, `hostCacheHit=true`, and
`reloadCommitted=true`. No page errors were recorded.

For the respawn reproduction, the guest was staged on a depleted railgun, the host
applied authoritative lethal damage, and the guest respawned. The recorded
checkpoint changed from `alive=false, weapon=railgun, primary=carbine` to
`alive=true, weapon=carbine, primary=carbine, secondary=pistol`; the host's remote
checkpoint also ended at `hp=100, weapon=carbine, primary=carbine,
secondary=pistol`.

## Causes and fixes

### Guest reload loss

Cause: guest reload intent had been sent as a one-shot event without a stable
idempotency identity. A lost event left the local presentation pending while the
host had no way to distinguish a safe retry from a second transaction.

Fix: protocol 19 requires a bounded `requestId` on reload intent/result messages
([protocol.ts](../../../../src/protocol.ts#L89), [protocol.ts](../../../../src/protocol.ts#L560)).
The local authority creates stable start/cancel keys and retries while the same
pending request remains live ([local-reload-authority.ts](../../../../src/local-reload-authority.ts#L72), [legacy-main.ts](../../../../src/legacy-main.ts#L6312)).
The host caches each result by player, authenticated connection epoch, life, and
request key and replays it on duplicate intent ([legacy-main.ts](../../../../src/legacy-main.ts#L6289), [legacy-main.ts](../../../../src/legacy-main.ts#L6489)).
Guest result application is keyed to the same request and clears stale presentation
on terminal/expiry paths.

### Stale special weapon after death

Cause: the guest could carry a transient special weapon/swap selection and depleted
inventory through a death boundary; host remote admission previously retained the
incoming weapon/loadout instead of treating respawn as a new class-authored life.

Fix: `authoredRespawnLoadout` defines the canonical primary, secondary, grenade, and
current weapon ([respawn-loadout-authority.ts](../../../../src/respawn-loadout-authority.ts#L17)).
Local respawn restores authored weapons with full class ammo and always selects the
authored primary ([legacy-main.ts](../../../../src/legacy-main.ts#L17358)). Host remote
respawn admission applies the retained authored class fields and rebuilds the remote
inventory before accepting the new life ([legacy-main.ts](../../../../src/legacy-main.ts#L13591)).
Guest packets remain observations; they do not choose the host's respawn loadout.

### Fire blocked on stairs

Cause: the old fire admission used a conservative obstruction/contact result based
on nearby collider geometry, so a stair/ramp collider could block firing even when
the actual muzzle was clear.

Fix: firing now updates the weapon view, samples the actual socket from
`weaponView.muzzleWorldPosition()`, and refuses only when that point is inside an
existing viewmodel surface clipping plane ([legacy-main.ts](../../../../src/legacy-main.ts#L19527), [legacy-main.ts](../../../../src/legacy-main.ts#L19530)).
The probe is the existing surface-clip calculation, including the authored
presentation/dressing and ground surfaces ([legacy-main.ts](../../../../src/legacy-main.ts#L11716));
the decision does not branch on stair or collider class. The pure point/plane
predicate is covered in [viewmodel-surface-clip.ts](../../../../src/systems/viewmodel-surface-clip.ts#L385).

## Verification commands

```text
npx tsc --noEmit
npx vitest run <expanded requested network/protocol/weapon/loadout/respawn/reload/ratchet paths> src/hf498-multiplayer-bugs.test.ts
PASS73_NATIVE_WEBGPU=1 node scripts/qa/mp-lab/run-hf498-multiplayer-bugs.mjs --port 4191 --peer-port 4192 --renderer webgpu --render performance
```

The focused state-machine coverage is in
[hf498-multiplayer-bugs.test.ts](../../../../src/hf498-multiplayer-bugs.test.ts#L1),
with protocol/local/guest authority fixtures updated for request identity.
The run uses no credentials or raw transport payloads in the evidence artifact.
