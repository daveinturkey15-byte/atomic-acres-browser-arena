# Pass 94 sound-design lane — HF-491

Status: implementation complete; owner listening review remains OPEN.

## Evidence

The HF-491 audio triage report established that the shipped graph was not
mechanically silent: contexts were running, five procedural buffers existed,
SFX gain was 0.78, movement gain was 0.34, game-music gain was 0.0135 at the
default slider, and the peak voice count was six. The complaint was therefore
treated as a synthesis and mix problem rather than a missing-buffer problem.

The table below is a deterministic 20-second, 8 kHz offline render. Each row
uses the requested scripted count for its category: five weapon reports, ten
surface steps, three material impacts, one match stinger, and a full music-bed
window. Values are linear full-scale amplitude, not dB. “Before” is a
reconstructed render of the previous flat shared-voice recipes; the HF-491
field report did not contain waveform peak/RMS samples, so it is not presented
as an owner microphone measurement.

| Category | Script | Before peak / RMS | After peak / RMS | Target peak / RMS | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Weapons | 5 reports | 0.224843 / 0.017515 | 0.471067 / 0.031537 | 0.12–0.78 / 0.025–0.24 | VERIFIED |
| Movement | 10 steps | 0.083773 / 0.005672 | 0.192342 / 0.007996 | 0.04–0.46 / 0.006–0.12 | VERIFIED |
| Impacts | 3 materials | 0.158712 / 0.005623 | 0.200942 / 0.006848 | 0.05–0.62 / 0.006–0.13 | VERIFIED |
| UI | 1 stinger | 0.152542 / 0.010173 | 0.230586 / 0.009898 | 0.035–0.42 / 0.004–0.09 | VERIFIED |
| Music | 20 s bed | 0.015040 / 0.007144 | 0.083768 / 0.020005 | 0.01–0.28 / 0.008–0.08 | VERIFIED |

The render gate also verified finite samples, no clipping above 0.999, exact
repeatability for the same seed, and different buffers for consecutive weapon
variants. The live runtime keeps the existing global 48, spatial 12,
continuous 8, and per-bus caps.

## Synthesis recipes

### Weapons

Every non-railgun report now follows click → crack → pressure body → reflected
tail. The click is a 6–9 ms crackle-textured high-pass transient. The crack is
a driven square shock-front with a front-loaded pitch fall. The body is a
saturated sawtooth pressure sweep layered with pink low-passed noise and a
barrel resonance. The tail is pink band-passed reflected energy with a delayed
attack and an exponential decay.

Weapon characters are numeric profiles in `src/audio.ts`: pistols are bright
and short; rifles carry a mid body; shotguns/snipers get more body and tail;
machine guns trade crack for a tighter, faster repeatable body; specials keep
their own pressure ranges. Per-report detune and noise-buffer offsets are
round-robin. Tail duration and centre come from the selected arena acoustic
space, distance, and occlusion response, bounded at one second. The railgun
keeps its existing ten-layer contract.

The inventory was checked for suppressed/silenced variants and contains none,
so no untracked suppressed voice was invented.

### Movement

Concrete, wood, grass, metal, soil/asphalt use separate heel textures,
resonance peaks, low body waves, and sole scuffs. The public footstep path now
accepts normalized velocity; speed scales heel/body/scuff energy while gait
still controls the walk/sprint/crouch character. Landing uses brown low-passed
weight plus a sub body and kit crackle. Jump uses a short pink air rush and a
small upward body sweep.

### Impacts and world

Bullet impacts retain the ballistics material mapping and now apply the
distance low-pass before the material strike. Glass uses crackle grains,
inharmonic ringing, and delayed shards; metal uses a tight white strike and
inharmonic plate partials; wood, concrete, and soil have separate absorbing or
spalling bodies. The optional positional impact route uses the existing HRTF,
inverse-distance, spatial-chain budget and cleanup path.

Shed perforation is a high-Q sheet puncture followed by flexing grit and chip
scatter. Vehicle hits add a low panel-flex sweep. Chopper rotors remain capped
at four loops, but now apply bounded radial Doppler from numeric position
history without per-frame position-object allocation. Drone support fire is a
sawtooth motor/triangle whine over pink air. Hunter-swarm pulses retain their
five bounded announcement voices with per-pulse variation.

### UI and music

Hit and kill confirmation remain short, hard-onset UI cues. `matchStinger()`
adds start, win, loss, and draw bookends with separate interval shapes.
Game-music remains the existing two-oscillator procedural rotation: its note
performance gain was restaged so the pinned settings coefficient remains
0.027 while the default slider is audible, its output is low-passed using the
selected arena’s air cutoff, and a combat ducker reduces it to 24% during
reports/blasts. No assets or extra music voices were added.

### Mix and safety

The fixed bus targets are master 0.34, SFX 0.78, movement 0.30, UI 0.45,
announcements 0.55, ambience 0.12, menu music 0.045, and game music 0.027
before the persisted sliders. SFX/movement/announcement/ambience also feed a
single shared return made from 37 ms and 89 ms feedback delays with allpass
diffusion and 0.12 return gain. This graph is feature-detected so partial test
contexts remain dry and safe. The master stage is a -1 dB, 20:1, 1 ms attack,
100 ms release limiter profile.

## OPEN — owner ears needed

- Listen in Nuketown2 at near, mid, and far range to confirm the crack/body/tail
  crossover and whether the urban-yard return is too long or too bright.
- Compare sprint metal versus grass and crouch concrete for gameplay stealth;
  the numeric bands are clean, but subjective footstep readability needs the
  owner’s speakers/headphones.
- Check helicopter orbit passes and drone support against active gunfire. The
  Doppler math and caps are VERIFIED; the preferred rotor level and stereo
  placement remain subjective.
- Confirm the newly audible game-music bed is useful rather than distracting.
  If it is not, the safe follow-up is to remove the bed and its two channels,
  not to raise the combat buses.
- The required legacy size fence remains OPEN on the unchanged base: 37,372
  lines versus the recorded 37,371 ceiling.

