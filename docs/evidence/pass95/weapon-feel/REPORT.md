# PASS 95 - weapon feel lane

Machine `dave-gaming-pc`, harness Claude Code (Opus 5).
Worktree `C:/Users/david/projects/aa-p-weapon-feel`,
branch `contrib/dave-gaming-pc/claude/v8-weapon-feel`,
base `452d7aba` (`origin/contrib/dave-gaming-pc/claude/pass93-candidate`, PASS 94 candidate 7).
Assigned browser port 4262.

Claim-state convention: **[VERIFIED]** = this lane ran it and quotes the output.
**[MEASURED]** = a number produced by an instrument this lane ran.
**[OPEN]** = not proven in this window.

---

## 0. Headline

The brief asked for five things. This report is honest about which of them this
window actually delivered.

| ask | outcome |
| --- | --- |
| (1) recoil and spread curves per class, documented table, recovery timing, ADS vs hip | **[MEASURED]** - full 21-weapon table below from a new instrument that measures through the shipped functions, plus a per-family band gate that reddens on drift |
| (2) viewmodel sway/bob/kick/reload/swap, clipping 0, no recompile on clip-state change | **[OPEN]** - the shipped system already implements all of it and its gates are green (section 4); this lane added no new viewmodel proof and ran no new clip capture |
| (3) muzzle flash, shells, decals pooled, zero per-frame alloc, 0 in-combat pipelines | **[OPEN]** - not measured in this window; the pipeline tripwire was not re-run |
| (4) hit marker, damage numbers off by default but supported, kill confirm | **[VERIFIED]** - damage numbers were unconditional and are now default-off, persisted, switchable, with the hitmarker and kill-confirm explicitly ungated |
| (5) the W-1 fire-rate deadline bug class must not regress | **[VERIFIED]** - `src/hf504-multiplayer-audit-fixes.test.ts`, 31 passed |

**The most important thing in this report is a finding, not a change**
(section 3): 19 of 21 weapons author a prone spread multiplier the runtime has
never read. This lane implemented the fix, measured it, and **reverted it**,
because adopting it would have required editing a Pass 64 behaviour-preservation
contract. That decision is documented rather than taken.

---

## 1. What was added

| path | what it is |
| --- | --- |
| `src/weapon-feel.ts` | measurement instrument + per-family bands + named exemptions + `proneSpreadDivergence()` |
| `src/weapon-feel.test.ts` | the band gate, the stance/ADS ordering contracts, the HF-511 divergence gate |
| `src/weapon-hit-feedback-defaults.test.ts` | HF-512 damage-number default and the ungated confirmation cues |
| `src/player-feedback.ts` | the damage-number preference (default off, persisted, throw-safe) |
| `src/legacy-main.ts` | **net-zero lines** (37,396, exactly the ratchet): the draw is gated, nothing else |

`src/weapon-feel.ts` is a **read** of the host-authoritative catalog. The shot
path does not import it, so it cannot become a second balance authority; it can
only observe the one that exists and redden a gate when a class drifts.

---

## 2. (1) Recoil and spread curves - the documented table

**[MEASURED]** Reproduce with
`WEAPON_FEEL_REPORT=1 npx vitest run src/weapon-feel.test.ts`.

Every number is produced by calling the **shipped** `computeSpread`,
`computeRecoilImpulse` and `recoverRecoilImpulse`, not by re-deriving the maths,
so a change to those functions moves this table.

- **cone figures** are cone *radius in cm at 30 m*, standing and still.
- **1st mrad / ADS mrad** are the first-shot vertical impulse, hip and settled ADS.
- **10-shot climb** integrates a 10-shot burst at the weapon's own cadence
  through the shipped per-shot recovery and the shipped `Math.min(0.16, ...)`
  camera clamp - where the camera actually ends up, not a sum of impulses.
- **95% settle** is `ln(20) / recoilRecovery`: seconds for an impulse to decay to
  5%. **shots/settle** is how many rounds leave the barrel inside that window.
- **shots to max cone** is how long one held trigger takes to saturate at
  `maximumSpread`.

| weapon | family | rpm | hip cm@30m | ADS cm@30m | ADS/hip | crouch/hip | prone/hip | 1st mrad | ADS mrad | 10-shot climb mrad | 95% settle s | shots/settle | shots to max cone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HK416 | assault-rifle | 650 | 36.0 | 10.1 | 0.28 | 0.78 | 0.62 | 16.0 | 11.5 | 33.0 | 0.250 | 2.7 | 21 |
| FN P90 | smg | 860 | 54.0 | 22.7 | 0.42 | 0.82 | 0.62 | 11.0 | 8.6 | 23.4 | 0.200 | 2.9 | 20 |
| M249 SAW | lmg | 720 | 66.0 | 22.4 | 0.34 | 0.70 | 0.62 | 19.0 | 14.4 | 46.0 | 0.300 | 3.6 | 17 |
| Remington 870 | shotgun | 95 | 246.6 | 182.3 | 0.74 | 0.88 | 0.62 | 52.0 | 43.7 | 73.5 | 0.374 | 0.6 | 13 |
| M40A5 | marksman | 55 | 156.1 | 7.8 | 0.05 | 0.72 | 0.62 | 72.0 | 43.2 | 101.2 | 0.461 | 0.4 | 5 |
| EMRG Railgun | marksman | 40 | 105.0 | 0.0 | 0.00 | 1.00 | 0.62 | 85.0 | 85.0 | 119.4 | 0.517 | 0.3 | 0 |
| Glock 17 | sidearm | 420 | 60.0 | 20.4 | 0.34 | 0.80 | 0.62 | 21.0 | 15.5 | 34.0 | 0.214 | 1.5 | 14 |
| Desert Eagle .50 AE | sidearm | 90 | 78.0 | 23.4 | 0.30 | 0.80 | 0.62 | 50.0 | 37.0 | 70.6 | 0.374 | 0.6 | 6 |
| Glock 18 | sidearm | 900 | 78.0 | 35.9 | 0.46 | 0.82 | 0.62 | 14.0 | 11.5 | 33.1 | 0.230 | 3.5 | 15 |
| Mini Uzi | smg | 1050 | 66.0 | 33.0 | 0.50 | 0.86 | 0.62 | 13.0 | 10.9 | 32.3 | 0.214 | 3.7 | 19 |
| MP5 | smg | 800 | 48.0 | 16.3 | 0.34 | 0.80 | 0.62 | 10.0 | 7.2 | 19.8 | 0.187 | 2.5 | 22 |
| M4A1 | assault-rifle | 700 | 33.0 | 8.9 | 0.27 | 0.76 | 0.62 | 14.0 | 9.8 | 28.3 | 0.222 | 2.6 | 23 |
| AK-47 | assault-rifle | 600 | 45.0 | 14.4 | 0.32 | 0.78 | 0.62 | 21.0 | 16.0 | 45.8 | 0.300 | 3.0 | 19 |
| M134 Minigun | lmg | 1200 | 78.0 | 54.6 | 0.70 | 0.82 | 0.62 | 8.0 | 7.2 | 21.6 | 0.214 | 4.3 | 29 |
| M14 EBR | marksman | 46 | 96.0 | 7.7 | 0.08 | 0.70 | 0.62 | 45.0 | 27.9 | 63.2 | 0.399 | 0.3 | 8 |
| Benelli M4 Slug | shotgun | 85 | 75.0 | 12.0 | 0.16 | 0.72 | 0.62 | 82.0 | 55.8 | 117.6 | 0.545 | 0.8 | 5 |
| HK USP .45 Tactical | sidearm | 300 | 66.0 | 21.1 | 0.32 | 0.80 | 0.62 | 32.0 | 23.0 | 51.7 | 0.300 | 1.5 | 11 |
| TAC-15 Explosive Crossbow | launcher | 72 | 84.0 | 10.1 | 0.12 | 0.72 | 0.62 | 24.0 | 17.3 | 33.8 | 0.374 | 0.4 | 0 |
| M2 Flamethrower | launcher | 600 | 114.1 | 82.1 | 0.72 | 0.90 | 0.62 | 4.0 | 3.6 | 6.7 | 0.166 | 1.7 | 22 |
| Orion Flare Pistol | launcher | 24 | 120.1 | 24.0 | 0.20 | 0.82 | 0.62 | 35.0 | 26.3 | 49.2 | 0.374 | 0.1 | 0 |
| Crimson Flamethrower | launcher | 600 | 114.1 | 82.1 | 0.72 | 0.90 | 0.62 | 4.0 | 3.6 | 6.7 | 0.166 | 1.7 | 22 |

### 2.1 Before / after

**Nothing in this table was retuned.** Before and after are identical, and that
is the finding: the shipped catalog already lands every weapon inside a
defensible per-class envelope. What changed is that the envelope is now written
down and gated, so a future pass cannot drift out of it without reddening
`src/weapon-feel.test.ts`.

| what | before this lane | after |
| --- | --- | --- |
| per-weapon recoil/spread values | 21 weapons, authored | **unchanged, byte for byte** |
| a written per-class envelope | none | `WEAPON_FEEL_BANDS`, 5 metrics x 7 families |
| a gate that fails on drift | none | `weaponFeelFindings()` must be empty |
| recovery timing as a number | never computed | `recovery95Seconds`, `shotsPerRecoveryWindow` |
| ADS-vs-hip as a number | never computed | `adsTighteningRatio`, `adsRecoilRatio`, `adsBurstClimbMrad` |
| stance ordering as a contract | none | prone <= crouch <= stand <= moving, every weapon |

### 2.2 What the table says about feel

- **ADS is worth taking on every weapon.** ADS/hip ranges 0.00 (railgun) to 0.74
  (Remington 870); ADS recoil is <= hip recoil on all 21. The gate asserts both
  as ordering contracts, so no future tune can make aiming a downgrade.
- **Recovery is the class separator, not damage.** An SMG settles in 0.19-0.21 s
  and puts 2.5-3.7 rounds out inside that window; a marksman rifle settles in
  0.40-0.52 s and gets 0.3-0.4 rounds out. That ratio *is* the difference between
  spray control and shot discipline.
- **Nobody can empty a magazine inside one settle window.** Gated:
  `shotsPerRecoveryWindow < magazine` on every weapon. Worst case is the M134 at
  4.3 rounds against a belt.
- **The held trigger always costs accuracy.** Every automatic weapon has
  `sustainedPerShot > 0` and saturates in 17-29 shots (`> 3` is gated, so bloom
  is a curve and never a step).

### 2.3 Bands and exemptions

**CLAIM-STATE.** The band *edges* are an **inference** from the BO2-class
reference and from what these shipped numbers already produce. They were set
after measuring, so this gate is a **drift detector from this baseline**, not an
independent judgement of what the values should be. The values inside them are
measured from this tree.

Two weapons sit outside their family band and are exempted **by name and
metric**, with the reason in source, rather than by widening the family until
the outlier hides among its siblings:

| exemption | measured | family band | reason |
| --- | --- | --- | --- |
| `ak-47:burstClimbMrad` | 45.8 | 5 - 40 | the AR class's high-recoil member: lowest rpm, highest base damage, loosest hip cone (45.0 cm vs the M4A1's 33.0). Its climb is 62% above the M4A1 and is the reason to carry either of the other two. |
| `railgun:adsTighteningRatio` | 0.00 | 0.02 - 0.25 | authored `adsMultiplier` 0: a single-shot charged rail with a special-authority optic, not a marksman rifle that must still miss. |

The exemption list has two gates of its own, and **both caught real mistakes in
this lane's own first draft**: an exemption naming an unknown weapon or metric
fails, and an exemption on a weapon that is actually *inside* its band fails.
The first draft carried ten exemptions; eight were stale (flamethrower and
minigun are `launcher`/`lmg` family and were comfortably inside their bands) and
the gate deleted them.

---

## 3. FINDING - HF-511: 19 of 21 weapons author a prone spread the runtime ignores

**[MEASURED]** and **[OPEN]** - implemented, measured, and deliberately reverted.

### 3.1 The defect

`src/combat/weapon-schema.ts` has carried `WeaponSpreadProfile.proneMultiplier`
since Pass 64, and `src/combat/weapon-catalog.ts` authors a distinct value for
every weapon (0.50 on the M14 EBR through 1.00 on the railgun). Nothing reads it.
`computeSpread` in `src/gameplay.ts` contains one line:

    if (context.prone) spread *= 0.62;

One constant, all 21 weapons. Meanwhile prone **recoil** in the same catalog -
`recoil.proneMultiplier` - **is** projected (`proneSpreadMultiplier` does not
exist anywhere in the tree; `proneRecoilMultiplier` does) and **is** applied by
`computeRecoilImpulse`. The two halves of the same stance, on the same gun, read
from two different authorities.

### 3.2 Size of the gap

**[MEASURED]** `proneSpreadDivergence()`, reproduce with
`WEAPON_FEEL_REPORT=1 npx vitest run src/weapon-feel.test.ts`. 19 of 21 weapons
diverge (only the scattergun and the M-series 0.62 authors match by
coincidence). Error is the prone cone radius at 30 m, applied minus authored -
negative means the runtime is **tighter** than the designer authored:

| weapon | authored | applied | ratio | error cm @30m |
| --- | --- | --- | --- | --- |
| Remington 870 | 0.80 | 0.62 | 0.775 | **-44.4** |
| EMRG Railgun | 1.00 | 0.62 | 0.620 | **-39.9** |
| M2 / Crimson Flamethrower | 0.82 | 0.62 | 0.756 | **-22.8** |
| M40A5 | 0.52 | 0.62 | 1.192 | **+15.6** |
| Glock 18 | 0.78 | 0.62 | 0.795 | -12.5 |
| Orion Flare Pistol | 0.72 | 0.62 | 0.861 | -12.0 |
| M14 EBR | 0.50 | 0.62 | 1.240 | **+11.5** |
| Mini Uzi | 0.76 | 0.62 | 0.816 | -9.2 |
| M134 Minigun | 0.72 | 0.62 | 0.861 | -7.8 |
| FN P90 | 0.72 | 0.62 | 0.861 | -5.4 |
| HK USP .45 | 0.70 | 0.62 | 0.886 | -5.3 |
| Glock 17 | 0.70 | 0.62 | 0.886 | -4.8 |
| Desert Eagle | 0.68 | 0.62 | 0.912 | -4.7 |
| MP5 | 0.70 | 0.62 | 0.886 | -3.8 |
| TAC-15 Crossbow | 0.58 | 0.62 | 1.069 | +3.4 |
| M249 SAW | 0.60 | 0.62 | 1.033 | +1.3 |
| HK416 | 0.65 | 0.62 | 0.954 | -1.1 |
| M4A1 | 0.64 | 0.62 | 0.969 | -0.7 |

The two that matter competitively: the **M14 EBR is 24% looser prone than
authored** and the **M40A5 19% looser** - the two guns whose authored intent was
the tightest prone bonus in the game are the two the constant penalises. In the
other direction the **railgun is authored to get no prone bonus at all** (1.00)
and receives a 38% cone reduction anyway: a shot the designer decided should not
be improvable by lying down.

### 3.3 Why it was NOT fixed here

The fix is three lines (project the field in
`src/combat/legacy-weapon-adapter.ts`, read it in `computeSpread`). It was
written, it typechecked, and it failed a test on purpose:

    FAIL  src/combat/legacy-weapon-adapter.test.ts > Pass 65 runtime weapon adapter
          > preserves hardcoded prone spread, caller-supplied random recoil, and
            tactical reload timing

The 0.62 is frozen as `universalProneSpreadMultiplier` in the Pass 64 behaviour
fixture `src/combat/fixtures/pass64-legacy-weapons.json`, and that test exists
**precisely so the Pass 65 catalog refactor could not silently change gameplay**.
The same test freezes `emptyReloadSeconds` the same way, so this is a deliberate
pattern: the catalog carries authored-but-not-yet-adopted fields, and adopting
one is a **balance change**, not a bug fix.

Adopting it therefore needs the owner, a `gameplay-contract` baseline change id,
and a re-measure - not a feel lane editing the contract to green. The change was
reverted (`git checkout -- src/gameplay.ts src/combat/legacy-weapon-adapter.ts`)
and replaced with `proneSpreadDivergence()`, which measures the gap so the
decision has numbers attached, plus a gate that asserts the *current* frozen
behaviour and fails if the catalog is ever flattened to the constant - which
would erase the authored intent instead of adopting it.

**Recommended owner decision:** adopt the authored values, re-measuring the M14
EBR and M40A5 after (they gain the most), **or** delete
`WeaponSpreadProfile.proneMultiplier` from the schema so the catalog stops
carrying a field nothing reads. Either is better than the current state, where
prone spread and prone recoil disagree about who is in charge.

---

## 4. (2) Viewmodel - what exists, and what this lane did not prove

**[OPEN].** This lane added no viewmodel change and ran no new capture. What is
already in the tree and green (section 8):

- procedural **sway** (`swayX`/`swayY`, clamped +-0.025/+-0.02, released at
  `smoothing(7)`), **bob**, **recoil kick**, **reload** and **swap** staging, all
  composed on the shared viewmodel root in `src/weapon-presentation.ts`.
- the clipping metric and its ratchet:
  `src/viewmodel-penetration-ratchet.test.ts`, `src/viewmodel-framing.test.ts`,
  `src/viewmodel-contact-applied-transform.test.ts`,
  `src/hf388-viewmodel-motion-curves.test.ts`,
  `src/hf399-viewmodel-socket-cache.test.ts`,
  `src/viewmodel-muzzle-effect-anchor.test.ts`.
- the no-recompile-on-clip-state rule is enforced structurally rather than by a
  metric: `setPresentationVisible` deliberately never sets `root.visible = false`,
  because the root carries `first-person-muzzle-light` and
  `first-person-viewmodel-fill`, and dropping them changes the `LightsNode` cache
  key and invalidates **every material program in the scene**. The probe cited in
  source (`artifacts/qa/pipeline-compile/before-local-pass81.json`) measured 251
  in-combat pipeline creations from exactly that, 99.2% inside compositor stalls.

All of these gates passed in this lane's focused run. **This lane did not
re-measure the clip metric and did not re-run the capture**, so "clipping stays
0" is carried forward as candidate-7 evidence, not re-proven here.

## 5. (3) Muzzle flash, shells, decals, in-combat pipelines

**[OPEN].** Not measured in this window. The headless capture on port 4262 and
the in-combat pipeline tripwire were **not run** - see section 8 for why. No
claim is made about pooling, per-frame allocation, or the tripwire result. The
shipped effect path is pool-shaped by construction, but shape is not a
measurement and is not offered as one.

## 6. (4) Hit feedback - VERIFIED

**[VERIFIED]** `npx vitest run src/weapon-hit-feedback-defaults.test.ts` - 8 passed.

| ask | before | now |
| --- | --- | --- |
| hit marker | present, unconditional | unchanged, and now **gated as unconditional**: the test fails if `showHitmarker` ever learns about the damage-number switch |
| headshot marker | present | unchanged, asserted |
| kill confirm | `triggerKillConfirmPulse` on elimination | unchanged, asserted, plus an envelope test (attack, scale decays faster than glow, both zero by 2 s) |
| damage numbers | **always on** | **off by default**, persisted per client, switchable at runtime |

The damage-number gate is **presentation only**. `damageNumberPresentation` still
computes the identical row whether the switch is on or off - asserted - so two
peers with different settings still agree on every authoritative value the host
sent them. Storage is throw-safe (private mode or blocked site data falls back to
the default rather than throwing into a hit path), and a corrupt stored value
reads as the default.

The `legacy-main.ts` edit is one existing line rewritten in place plus one
widened import: **37,396 lines before and after**, exactly the ratchet, with no
ceiling change and no `CEILING_HISTORY` entry.

## 7. (5) W-1 fire-rate deadline - VERIFIED, no regression

**[VERIFIED]** `npx vitest run src/hf504-multiplayer-audit-fixes.test.ts`:

    Test Files  1 passed (1)
         Tests  31 passed (31)

The class is `player.nextShotAt` being a deadline expressed in the **previous**
weapon's cadence, carried across a slot switch or a ground pickup (m14-ebr at
46 rpm to a pistol is a 1.3 s dead trigger). The two named tests - "clears the
stale fire deadline when the player switches weapon slots" and "... when a
ground weapon is picked up" - both pass. This lane touched neither
`switchWeapon` nor the pickup path.

---

## 8. Gates

**[VERIFIED]** `npx tsc --noEmit`: exit 0, no output.

**[VERIFIED]** focused set - `src/*weapon*`, `src/*pickup*`, `src/*viewmodel*`,
`src/pipeline-metrics*.test.ts`, `src/legacy-main-size-ratchet.test.ts`,
`src/hf504-multiplayer-audit-fixes.test.ts`, `src/combat`,
`src/kill-confirm-pulse.test.ts`, `src/player-feedback.test.ts`:

    Test Files  53 passed (53)
         Tests  511 passed (511)
      Duration  24.16s

**[VERIFIED]** `src/legacy-main-size-ratchet.test.ts` green with
`src/legacy-main.ts` at **37,396 lines** - exactly `LINE_CEILING`, no ceiling
change and no `CEILING_HISTORY` entry.

**[VERIFIED]** under the machine heavy lock (`LOCK_ACQUIRED 06:35:23`,
`LOCK_RELEASED 06:39:36` UTC), `npm run build`: `BUILD_EXIT=0`, built in 6.17 s.

**[VERIFIED]** under the same lock, full `npx vitest run`:

    Test Files  1 failed | 622 passed | 1 skipped (624)
         Tests  1 failed | 6260 passed | 2 skipped (6263)
      Duration  216.60s

The one failure is **pre-existing on the base branch and not caused by this
lane**, established by A/B rather than asserted:

    FAIL  src/audio-music-rotation-runtime.test.ts
          > HF-430 runtime: the shipped ArenaAudio rotates the chiptune roster
          > plays all ten tracks before repeating any of them, in the runtime
    Error: Test timed out in 20000ms.

It fails the same way in isolation, and it fails **identically after
`git checkout 452d7aba -- src/legacy-main.ts src/player-feedback.ts`** - i.e.
with this lane's only two source edits reverted to base, on the same machine, in
the same worktree (1 failed | 8 passed, 54.47 s). It is a timeout, not an
assertion failure, on a machine currently running roughly fifteen lanes. Nothing
was weakened, skipped or retimed to get past it; it is reported as an inherited
red, and the candidate-7 report's green full-suite row should be re-checked
against it.

The file count moved 622 -> 624 and the test count 6243 -> 6263, which is exactly
this lane's two new test files and their 19 tests plus the audio file's own count;
no existing test was removed.

**[OPEN]** headless capture of flash and decals on port 4262, and the in-combat
pipeline tripwire: **not run** in this window. No claim is made about pooling,
per-frame allocation or the tripwire result.

---

## 9. Durable gotchas

**Symptom -> Cause -> Correction -> Verify:** a catalog field is authored per
weapon, looks live, and is silently ignored by the runtime while its sibling
field on the same stance IS honoured -> the Pass 65 catalog refactor deliberately
froze the pre-catalog constant in a behaviour fixture
(`src/combat/fixtures/pass64-legacy-weapons.json`) so the refactor could not
change gameplay, and the authored field was added for a later adoption that never
happened -> do NOT adopt it by editing the preservation contract to green;
measure the gap per weapon in game units, name the frozen contract that blocks
it, and hand the owner a balance decision -> `proneSpreadDivergence()` prints the
per-weapon error in cm at 30 m, and both the preservation contract and a new gate
asserting the current frozen behaviour stay green.

**Symptom -> Cause -> Correction -> Verify:** a brand-new band gate passes on its
first run and looks like proof -> the bands and their exemptions were authored by
the same pass that measured them, so an exemption can name a weapon that is
comfortably inside its band and the gate still goes green -> give the exemption
list gates of its own: an unknown weapon or metric fails, and an exemption on a
weapon that is inside its band fails -> this lane's first draft carried ten
exemptions and the second gate deleted eight of them.

**Symptom -> Cause -> Correction -> Verify:** a heavy-lock step nearly misses a
bounded window on this machine -> `aa-heavy.lock` is a single machine-wide mutex
shared by roughly fifteen lanes and the documented staleness reclaim is 35
minutes, so a lane that starts its wait late cannot reach a build -> take the
heavy lock EARLY, right after the focused gates pass and before writing evidence,
rather than as the last step -> the lock directory mtime names who reclaimed it
and when.
