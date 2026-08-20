/** In-game release notes shown from the main-menu "Last release" control. */

export type ChangelogEntry = Readonly<{
  id: string;
  pass: string;
  title: string;
  releasedAt: string; // Protected production-build timestamp, with UTC offset, or the pending sentinel.
  areas: readonly string[];
  summary: string;
  highlights: readonly string[];
}>;

export const PENDING_PRODUCTION_RELEASE = 'PENDING_PRODUCTION';

/**
 * A new top entry may use PENDING_PRODUCTION in source. The protected release
 * workflow injects one immutable build timestamp into the production bundle,
 * avoiding a second metadata PR and a second deployment of identical gameplay.
 * The next substantive pass freezes the previous receipt timestamp in source.
 */
export function resolveProductionReleasedAt(
  sourceReleasedAt: string,
  injectedReleasedAt = import.meta.env.VITE_RELEASED_AT?.trim(),
): string {
  if (sourceReleasedAt !== PENDING_PRODUCTION_RELEASE) return sourceReleasedAt;
  if (!injectedReleasedAt) return sourceReleasedAt;
  if (Number.isNaN(Date.parse(injectedReleasedAt))) {
    throw new Error(`Invalid VITE_RELEASED_AT: ${injectedReleasedAt}`);
  }
  return injectedReleasedAt;
}

export function pass70ReleaseCopy(releasedAt: string): Readonly<{ summary: string; lineage: string }> {
  const released = releasedAt !== PENDING_PRODUCTION_RELEASE;
  return Object.freeze({
    summary: released
      ? 'Pass 70 improves first-person weapons and hands, support streaks, the Gun Range test bay, Field Kit clarity and multiplayer recovery without changing the retained Pass 63 fallback.'
      : 'Pass 70 is the local owner-review candidate, improving first-person weapons and hands, support streaks, the Gun Range test bay, Field Kit clarity and multiplayer recovery without changing the retained Pass 63 fallback.',
    lineage: released
      ? 'Pass 69 remains the immutable comparison benchmark and Pass 63 remains the only selectable stable WebGL fallback'
      : 'Pass 69 remains the immutable live comparison benchmark and Pass 63 remains the only selectable stable WebGL fallback until this exact candidate is approved',
  });
}

export function pass72ReleaseCopy(releasedAt: string): Readonly<{ summary: string; lineage: string }> {
  const released = releasedAt !== PENDING_PRODUCTION_RELEASE;
  return Object.freeze({
    summary: released
      ? 'Pass 72 adds host-authoritative private-lobby controls, combat corrections, readable support audio and squad presentation while preserving the tested release fallbacks.'
      : 'Pass 72 is the local owner-review candidate, adding host-authoritative private-lobby controls, combat corrections, readable support audio and squad presentation while preserving the tested release fallbacks.',
    lineage: released
      ? 'Pass 70 remains the exact previous live runtime, Pass 69 remains the immutable comparison build, and Pass 63 remains the stable WebGL fallback'
      : 'Pass 70 remains the exact previous live runtime, Pass 69 remains the immutable comparison build, and Pass 63 remains the stable WebGL fallback until this exact candidate is approved',
  });
}

const pass72ReleasedAt = resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE);
const pass72Copy = pass72ReleaseCopy(pass72ReleasedAt);
const pass70ReleasedAt = '2026-08-16T19:32:01Z';
const pass70Copy = pass70ReleaseCopy(pass70ReleasedAt);

/**
 * Newest first. Keep this player-facing rather than turning it into an internal
 * commit log. Historical `releasedAt` values come from protected production
 * receipts, not implementation or review-build time. A new top entry can use
 * the pending sentinel until the production workflow injects its build time.
 */
export const CHANGELOG: readonly ChangelogEntry[] = Object.freeze([
  Object.freeze({
    id: 'pass72',
    pass: 'PASS 72',
    title: 'Pass 72 · Private Lobbies, Combat & Release Preservation',
    releasedAt: pass72ReleasedAt,
    areas: Object.freeze(['PRIVATE LOBBIES', 'COMBAT', 'SUPPORT', 'SQUADS', 'MULTIPLAYER', 'STABILITY']),
    summary: pass72Copy.summary,
    highlights: Object.freeze([
      'Private lobbies default to Free For All with selectable Team Deathmatch, host-only reset-to-new-code authority and checkpoint invalidation that prevents stale-room reuse',
      'Replicated squad names and colours improve presentation without replacing authoritative gameplay-team ownership or network validation',
      'M14 EBR damage is exactly 37.2 body / 24 head, the fall-damage envelope is halved without weakening impact-speed thresholds, and flare collision radius is 0.24 metres',
      'Carpet Bomber environment kills retain map-owned attribution, while hosted explosive-crossbow glass breaking remains occlusion-aware and authoritative',
      'Chopper and Drone support-shot audio is teammate-visible while owner-local HUD and tracer presentation stays local and bounded',
      'The exact Pass 70 live runtime is pinned as a selectable previous channel; Pass 69, Pass 67.1 and Pass 63 remain preserved for comparison, stable testing and rollback',
      pass72Copy.lineage,
    ]),
  }),
  Object.freeze({
    id: 'pass70',
    pass: 'PASS 70',
    title: 'Pass 70 · Combat, Support & Multiplayer Refinement',
    releasedAt: pass70ReleasedAt,
    areas: Object.freeze(['FIRST-PERSON', 'SUPPORT', 'MULTIPLAYER', 'GUN RANGE', 'LOADOUT', 'STABILITY']),
    summary: pass70Copy.summary,
    highlights: Object.freeze([
      'Carbine, Mini Uzi, Railgun and crossbow optics keep opaque weapon bodies while exposing the authored aim lane, clear scope glass and safe loaded-bolt path',
      'Connected first-person hands, catalog-wide wall and prone contact poses, persistent decals and grounded glass debris improve close-quarters presentation',
      'Chopper Gunner gains an authored readable cockpit, responsive instruments, authoritative muzzle feedback and complete exit cleanup while accepted support aircraft remain retained',
      'Flare direct hits resolve before ground impact and both flare and carpet fire apply an exact 10 damage per second for five seconds without duplicate damage lanes',
      'The Gun Range test bay has coherent collision and ballistics, a lit textured door, room-only timer freeze, forward-facing illuminated dummies and crossbow-valid targets',
      'Field Kit cards and Manage/Rename share one clear DPS plus five-stat projection on desktop and mobile, with an unmistakable selected state and verified save-to-close behavior',
      'Multiplayer corrections cover authoritative Railgun pickup convergence, same-room host recovery, the two-minute Gun Range contract, current arena accessibility copy and Pass-neutral soak tooling',
      pass70Copy.lineage,
    ]),
  }),
  Object.freeze({
    id: 'pass69',
    pass: 'PASS 69',
    title: 'Pass 69.3 · Mobile, Weapons & Support Reconciliation',
    releasedAt: '2026-08-10T21:19:47Z',
    areas: Object.freeze(['MOBILE', 'FIRST-PERSON', 'SUPPORT', 'DESTRUCTION', 'STABILITY']),
    summary: 'Pass 69.3 reconciles the rejected 69.2 work with responsive touch controls, clear physical ADS sightlines, visible authored support aircraft and bounded weapon-effect presentation.',
    highlights: Object.freeze([
      'Mobile play suppresses browser selection and callouts, preserves editable chat, supports both orientations and keeps touch controls plus critical HUD panels outside the central aim cone',
      'FIRE and ADS stay beside the look stick while RUN, SWAP, PRONE, support selection and CALL use the same semantic gameplay paths as keyboard and gamepad input',
      'HK416 and Mini Uzi first-person batches now expose a physical rear-to-front sight aperture instead of hiding empty semantic nodes',
      'First-person arm handedness follows the authored rig without the second X reflection, and restrained PBR materials replace the luminous teal plastic treatment',
      'Care-package and Carpet Bomber aircraft retain visible authored wing meshes across every LOD and fail closed instead of silently substituting a generic capsule plane',
      'Window glass uses irregular independently moving instanced shards; zero-light world prewarm prevents the first breach from compiling its physical-material programs on the shot frame',
      'M14 thermal ghosts, Flamethrower streams and Flare targeting/collision work use retained bounded storage instead of first-use or per-frame allocation waves',
      'The secure test bay has canonical gun labels, an attached textured and emissive door assembly, posed rigged dummies and one atomic pickup-prompt writer',
      'Pass 63 remains the selectable stable WebGL fallback while newer historical channel bytes stay retained off the chooser',
    ]),
  }),
  Object.freeze({
    id: 'pass66',
    pass: 'PASS 67.1',
    title: 'The Big One — Mobile Controls & Polish',
    releasedAt: '2026-08-03T11:34:38+01:00',
    areas: Object.freeze(['MOBILE', 'STABILITY', 'COMBAT', 'AI', 'VEHICLES', 'DESTRUCTION', 'HUD', 'GRAPHICS']),
    summary: 'Pass 67.1 ships The Big One with full touch support - dual on-screen thumbsticks, action buttons and a landscape-locked compact HUD - plus un-mirrored first-person arms, a glass-break frame-hitch fix, scoped-ADS repairs and regenerated chopper-gunner / carpet-bomber support aircraft, now pinned as the Stable Singleplayer build awaiting multiplayer testing.',
    highlights: Object.freeze([
      'Mobile play adds a left move thumbstick, a right look/aim thumbstick and FIRE / JUMP / ADS / RELOAD / CROUCH / GRENADE / KNIFE buttons, with an options toggle and auto-detection on touch devices',
      'Starting a match on mobile enters fullscreen and locks to landscape, and the HUD compacts so consoles never overlap the on-screen controls; a rotate hint covers devices without an orientation-lock API',
      'First-person arms are un-mirrored so the firing hand and knife sit on the correct side',
      'Breaking glass no longer hitches the frame - debris physics sync is deferred and shard materials are prewarmed',
      'Scoped ADS (sniper, railgun thermal, M14 thermal) first-frame stalls and un-stick behaviour are repaired across browsers',
      'Regenerated chopper-gunner, carpet-bomber and care-package support aircraft match the authored armored-airframe references',
      'Selected custom loadout cards use a calmer highlight so the kit grid stays readable',
      'Hidden tabs retain network authority and bounded preparation without rendering full presentation frames; one recovery generation restores display cadence on focus',
      'Crossbow bolts respect intact glass, while admitted knife, bullet and explosion damage advances one shared cracked, breached and detached pane authority',
      'A grenade collapses the destructible shed and the Carpet Bomber obliterates it into a bounded set of persistent physical pieces',
      'Pass 63 remains reconstructed byte-for-byte from its pinned Pages tree as the Stable rollback; Pass 64 remains failed-regression evidence only',
    ]),
  }),
  Object.freeze({
    id: 'pass64',
    pass: 'PASS 64',
    title: 'WebGPU Combat, Tactical HUD & Arena Forge',
    releasedAt: '2026-07-25T21:15:25Z',
    areas: Object.freeze(['WEBGPU', 'MULTIPLAYER', 'HUD', 'RAILGUN', 'TERMINAL', 'RUSTRIG', 'GUN RANGE']),
    summary: 'Pass 64 moves the complete playable game to hardware WebGPU/TSL, rebuilds the tactical interface, hardens multiplayer recovery and gives every arena a focused visual-quality pass.',
    highlights: Object.freeze([
      'The full playable game now runs through the hardware WebGPU renderer with a fail-closed required route, one controlled HDR pipeline and explicit WebGL2 compatibility coverage',
      'A brighter modern tactical HUD and menu reorganise combat, lobby, loadout and map information with readable type, responsive safe areas and animated arena previews',
      'Terminal gains renderer-state recovery and camera/root invariants so the 3D world cannot silently collapse to a flat fog-colour frame while the HUD continues',
      'Private-match rematches, close-tab rejoin, health regeneration authority, early-life damage admission, Free For All spawn separation and killstreak replication are hardened',
      'Nuke Town gains a host-authoritative eight-round railgun with high-refresh blue thermal silhouettes, full-map penetration, a visible map-spanning beam and unmistakable report',
      'RustRig receives richer industrial materials, rolling ocean presentation, illuminated mist and purposeful warm practical lights while coplanar deck surfaces stay stable',
      'Gun Range gains animated lit targets, coloured practicals and clearer shooting-bay illumination',
      'Material-aware impact decals and slightly stronger persistent tracers improve shot readability across every arena without changing weapon authority',
      'Bots use a restrained illumination profile, while players, bots and corpses retain the same canonical operator family',
      'Post-match diagnostics remain bounded and off the realtime gameplay channels, preserving exact Pass 63 production bytes as the stable rollback',
    ]),
  }),
  Object.freeze({
    id: 'pass63',
    pass: 'PASS 63',
    title: 'Project Cleanup, Shared Chat & Visual Repairs',
    releasedAt: '2026-07-25T02:50:32Z',
    areas: Object.freeze(['PROJECT MAP', 'MULTIPLAYER CHAT', 'NUKE TOWN', 'TERMINAL', 'CLEANUP']),
    summary: 'Pass 63 closes the visual defects deferred from Pass 62, adds private-room text chat, and starts a measured recurring cleanup with a visible, downloadable project architecture map.',
    highlights: Object.freeze([
      'Project Map adds Overview, Structure, Changes and Archive pages beside Last Release, with human Markdown and full agent JSON downloads derived from one canonical tree',
      'Hosted lobbies and live private matches gain bounded host-relayed Enter-to-chat without external storage or diagnostic-log capture',
      'Nuke Town opaque walls contain local lighting and the audited house openings no longer render as black slabs',
      'Terminal door, boarding and cockpit openings now match their movement and projectile authority in Performance and Quality',
      'Release-history and project-documentation dialogs move behind reusable UI controllers, reducing duplicate shell wiring while preserving gameplay authority',
      'Measured dead imports and locals are removed; larger domain moves remain bounded follow-up work instead of a risky tree-wide rename',
      'A narrow PostCSS patch override closes the current production dependency advisory without changing the Vite or gameplay stack',
      'The accepted RustRig rebuild and Pass 62 host-authoritative gameplay, physics, netcode and release topology remain unchanged',
    ]),
  }),
  Object.freeze({
    id: 'pass62',
    pass: 'PASS 62',
    title: 'Gameplay, Graphics & Netcode Reconciliation',
    releasedAt: '2026-07-24T16:36:32Z',
    areas: Object.freeze(['GAMEPLAY', 'HUD', 'MAPS', 'NETCODE', 'RENDERING', 'PERFORMANCE']),
    summary: 'Pass 62 combines the refined graphics pipeline, gameplay and arena repairs, and an immutable host-resolved bullet timeline for offline inspection before release.',
    highlights: Object.freeze([
      'Arena-scaled PMREM gives metals and glass a reflection response while authored sun, moon and practical lights remain the dominant source of shape and contrast',
      'Arena-specific key-to-fill tuning preserves dark zones; extra bounded spotlights are limited to Nuke Town and Terminal while RustRig and Gun Range retain their authored practical-light pools',
      'Quality Graphics adds restrained depth-buffer contact shading, low-altitude depth fog and bloom isolated to tagged emissive objects',
      'Each arena fits its own directional shadow volume instead of sharing one oversized global projection',
      'Adaptive quality now sheds contact shading, bloom resolution, fog, reflections, particles and decal persistence independently before relying on resolution alone',
      'Impact marks and particles use pooled procedural soft masks for cleaner decals and sparks without new downloaded art',
      'Nuke Town and RustRig Quality GLBs use lossless WebP textures plus Meshopt geometry and stream only when their arena is selected',
      'Compatibility retains the direct zero-post path, while Performance receives only the bounded low-cost subset',
      'A ready host can start alone or with hosted bots; no second human is required',
      'Sniper critical feedback shows total damage and overkill, while shot cadence is scheduled from the actual admitted shot time',
      'Every multiplayer bullet carries immutable connection, life, weapon and sequence identity with separate authored fire and target-view times',
      'The host resolves shooter origin at fire time and targets at target-view time, rejects stale or post-death fire, and retains valid pre-death trades',
      'Clock uncertainty, adaptive interpolation and per-shot timing telemetry expose the actual network decision instead of a cosmetic clamped timestamp',
      'Solo play avoids unnecessary rewind and high-frequency network bookkeeping, and the 2× Damage presentation is compiled before its first spawn',
      'The gameplay HUD is reduced while Field Support becomes a narrow readable column; dormant Team Ping UI and permanent damage headings are removed',
      'Nuke Town house debris, opaque apertures and poor bicycle props are removed; RustRig gains useful inner-yard container cover and a clearer Welsh dragon',
      'Terminal gains upper kiosks, a grey-concrete apron, large timber pallets and open aircraft walkways',
    ]),
  }),
  Object.freeze({
    id: 'pass61',
    pass: 'PASS 61',
    title: 'Experimental Netcode Pass',
    releasedAt: '2026-07-24T02:57:37Z',
    areas: Object.freeze(['MULTIPLAYER', 'NETCODE', 'HIT REGISTRATION', 'REJOIN', 'DIAGNOSTICS']),
    summary: 'Pass 61 isolates a new monotonic timing and host-authoritative firearm path for fast public testing without replacing normal Pass 60 or stable Pass 59.',
    highlights: Object.freeze([
      'Guest and host clocks map through rolling low-RTT four-timestamp probes with bounded uncertainty, slow-drift tracking and sudden-movement rejection',
      'Remote players use bounded-adaptive timestamped pose estimation in cadence-specific 20/30/40 Hz delay bands, with the chosen delay exposed in diagnostics',
      'Four cadence layers stay separate: display presentation, fixed-step simulation, adaptive 20/30/40 Hz movement and weapon-authored fire events',
      'Every guest trigger creates one reliable shot request and one cached idempotent host result; separate client-authored firearm hit claims are removed',
      'Confirmed hitmarkers, hit audio and damage numbers now occur only after host-applied damage agrees with the result',
      'Every bullet freezes separate fire and target-view times before local hit evaluation; the host reconstructs the shooter and targets on those authored timelines and rejects stale requests',
      'Private lobby identities are held for a monotonic 90-second rejoin window and transport recovery keeps retrying through that window',
      'Technical match JSON includes bounded host-time, movement-rate, interpolation and shot lifecycle diagnostics',
    ]),
  }),
  Object.freeze({
    id: 'pass60',
    pass: 'PASS 60',
    title: 'New Netcode',
    releasedAt: '2026-07-23T23:15:05Z',
    areas: Object.freeze(['COMBAT', 'MULTIPLAYER', 'HUD', 'DIAGNOSTICS', 'MAPS', 'GUN RANGE']),
    summary: 'Pass 60 prioritises fast player-visible feedback: larger HUD presentation, authoritative per-player handicaps, actionable reports, and screenshot-driven arena rebuilds while preserving Pass 59 as the exact stable fallback.',
    highlights: Object.freeze([
      'Sniper headshots deal 3x damage and scoped players retain the full HUD and match status',
      'Damage activity sits lower without duplicate hit notifications, while Field Support is 25% larger in the same compact format',
      'Every completed match exposes a human per-player scoreboard and timestamped damage timeline plus a separate large agent-readable diagnostics ledger',
      'Both upstairs house windows now break; Quality and Performance share collision for all substantial Nuke Town terrain and authored props',
      'Gun Range is a bot-free six-player FFA with real wallbang player damage, plus a 100 HP flying black cat worth 500 points that respawns after 30 seconds',
      'Player and bot hitboxes now follow the visible head in every stance instead of admitting critical hits above the model',
      'Gun Range gains a textured white-silver shell, slowly cycling neon light and a dedicated right-side target-damage feed',
      'Nuke Town duplicate floating house shells are removed, while RustRig gains centre cover and an open-tread ship ladder without coplanar deck flicker',
      'The 2× Damage Core lasts 30 seconds and now physically drops with its remaining time when its holder is eliminated',
      'Bounded target rewind improves moving-player hit registration, while degraded movement channels fall back reliably and active players can rejoin',
      'Inbound supports have clearer warnings, and bounded browser exception history is included in technical reports',
      'Desktop gameplay HUD presentation is 35% larger, while Scout Sweep now uses an exact 3 second scan cadence and 1.5 second reveal window',
      'Hosted lobbies expose each player’s DHV 10/8/6/4/2/X handicap; X is one-hit vulnerable and receives a headshot-only Verdict Magnum',
      'Nuke Town interiors no longer expose blue exterior siding or black upper apertures, and furniture is kept clear of the playable doorway routes',
      'RustRig is rebuilt around exactly 24 containers—18 closed, three open at both ends and three open at one end—with unsupported debris removed and an animated Welsh flag above the tower',
      'Terminal receives a visible white-silver, cyan and magenta architectural reskin with new ceilings, lighting, gate signage, apron markings and aircraft treatment',
    ]),
  }),
  Object.freeze({
    id: 'pass59',
    pass: 'PASS 59',
    title: 'Fairer private matches, safer spawns & arena repairs',
    releasedAt: '2026-07-23T11:17:26+01:00',
    areas: Object.freeze(['MULTIPLAYER', 'HOSTED BOTS', 'MAPS', 'HUD', 'DIAGNOSTICS']),
    summary: 'Private matches gain host-owned bots and tighter combat authority, while all four arenas receive safer spawns, targeted collision and layout repairs, and clearer combat feedback.',
    highlights: Object.freeze([
      'Hosts can add exactly two or four authoritative bots whose movement, combat, health, score, deaths, and restarts stay synchronized for guests',
      'The 2× Damage Core, grenades, support effects, damage, kill credit, and gun-only streak progress now follow explicit replicated authority and provenance rules',
      'Bounded timestamp and sequence admission improves host-versus-guest fairness while rejecting stale, future, duplicate, and excessive-gap combat events',
      'Nuke Town, RustRig, and Terminal receive targeted collision, floating-prop, doorway, cover, and central-layout repairs without changing profile gameplay semantics',
      'Map-aware spawn scoring, corrected LMG sights, separate damage feeds, a single-column support HUD, and private post-match diagnostic downloads improve play and troubleshooting',
    ]),
  }),
  Object.freeze({
    id: 'pass58',
    pass: 'PASS 58',
    title: 'Three arena overhauls & combat polish',
    releasedAt: '2026-07-22T21:25:35+01:00',
    areas: Object.freeze(['COMBAT', 'NUKE TOWN', 'TERMINAL', 'RUSTRIG', 'LEADERBOARD']),
    summary: 'Combat feels clearer and more physical, three arenas receive major authored overhauls, and the global streak board starts a clean season.',
    highlights: Object.freeze([
      'Weapon and operator presentation now stays coherent through standing, crouching, prone movement, knife use, death, and respawn',
      'Damage feedback, headshot callouts, round statistics, collision authority, and score-reset handling are clearer and more reliable',
      'Nuke Town gains a rebuilt model home, furnished interiors, denser garden life, richer materials, grass, and tuned lighting',
      'Terminal gains a more readable concourse, active aircraft cabin route, improved doors and aisles, apron detail, cover, and airport identity',
      'RustRig gains a 15.8-metre derrick, two-axis undercroft, four-exit service trench, and 16-container cargo ring with four walk-through routes',
      'The global leaderboard now uses the new season-aware Worker and a clean reset board while retaining browser-local fallback records',
    ]),
  }),
  Object.freeze({
    id: 'pass57',
    pass: 'PASS 57',
    title: 'RustRig rolling ocean & symmetric cargo ring',
    releasedAt: '2026-07-22T15:43:16+01:00',
    areas: Object.freeze(['RUSTRIG', 'WATER', 'FLOW', 'VISUALS']),
    summary: 'RustRig now has a lower, broader rolling ocean, a tidy central rig, and evenly distributed shipping cover around every side.',
    highlights: Object.freeze([
      'Five warped swell bands create larger pseudo-random wave patterns with matched visual height, buoyancy, and vertical water velocity',
      'The sea sits lower beneath the platform, reaches a wider horizon, and uses improved crest foam, normals, Fresnel, and specular lighting',
      'Six evenly spaced shipping containers line each of the north, south, east, and west sides',
      'Loose tanks, pallets, barriers, and other central clutter were removed from both Performance and Quality layouts',
      'Quality geometry was rebuilt and the lower and upper ramps now align cleanly with their walkable collision',
    ]),
  }),
  Object.freeze({
    id: 'pass56',
    pass: 'PASS 56',
    title: 'Operator rigs, weapon finishes & HUD spacing',
    releasedAt: '2026-07-22T15:06:07+01:00',
    areas: Object.freeze(['OPERATORS', 'WEAPONS', 'HUD']),
    summary: 'Operators hold their weapons cleanly through every stance, all seven guns have distinct authored finishes, and the combat HUD has more breathing room.',
    highlights: Object.freeze([
      'Standing, sprinting, crouched, and prone operators keep a forward-facing weapon with both hands connected',
      'Duplicate embedded weapons are suppressed and crouched feet stay planted instead of folding through the floor',
      'Carbine, SMG, scattergun, sniper, pistol, machine pistol, and LMG each use a distinct authored material finish',
      'Weapon, equipment, and match HUD groups have cleaner spacing without hiding combat information',
    ]),
  }),
  Object.freeze({
    id: 'pass55',
    pass: 'PASS 55',
    title: 'Multiplayer combat, wall penetration & indoor range',
    releasedAt: '2026-07-22T13:14:45+01:00',
    areas: Object.freeze(['MULTIPLAYER', 'COMBAT', 'GUN RANGE', 'SKYLINE']),
    summary: 'The reconciled combat release improves private matches, adds material-aware penetration, polishes Skyline, and turns Gun Range into a full indoor armory.',
    highlights: Object.freeze([
      'Host-selected maps, lobby state, respawns, and combat telemetry stay synchronized through private matches',
      'Bullets can penetrate supported thin surfaces with weapon, material, angle, and distance-aware damage loss',
      'Terminal gains refined routes, authored detail, lighting, collision, and multiplayer navigation',
      'Gun Range is now an indoor score-attack space with walk-up weapon pickups and the Mastiff 63 LMG',
      'Focus loss no longer pauses an active solo or multiplayer match or replaces play with the menu',
    ]),
  }),
  Object.freeze({
    id: 'pass53',
    pass: 'PASS 53',
    title: 'Terminal, repeatable streaks & lobby copy',
    releasedAt: '2026-07-22T09:27:28+01:00',
    areas: Object.freeze(['MAP', 'STREAKS', 'MULTIPLAYER']),
    summary: 'A fourth airport arena joins the rotation, high-tier streaks recycle during long lives, and lobby codes copy reliably.',
    highlights: Object.freeze([
      'Terminal is selectable for bot skirmishes and private matches',
      'Terminal, mezzanine, escalator, jetbridge, jetliner, and airstair routes use real collision and multilevel bot navigation',
      'Hunter Swarm returns at 8, 16, 24… kills without dying',
      'Nuke returns at 15, 30, 45… kills without dying',
      'Copy Code writes the actual 36-character lobby code and falls back on browsers that block the modern Clipboard API',
      'Multiplayer lifecycle, verification, and cross-platform asset checks include the reconciled Desky backlog',
    ]),
  }),
  Object.freeze({
    id: 'pass52',
    pass: 'PASS 52',
    title: 'Private-match map sync & combat telemetry',
    releasedAt: '2026-07-21T19:47:24+01:00',
    areas: Object.freeze(['MULTIPLAYER', 'COMBAT']),
    summary: 'Private matches now carry the host-selected arena cleanly through lobby, start, respawn, and live diagnostics.',
    highlights: Object.freeze([
      'Host arena selection is synchronized to every guest before the match starts',
      'Map selection locks in the lobby; Ready and Start wait for map collision sync',
      'Respawns use the active map bounds, including wide and non-square arenas',
      'Team and free-for-all spawn choices keep safer separation from opponents',
      'Combat telemetry now reports kills, deaths, damage dealt, damage taken, and ping',
      'Release notes now distinguish the actual public release time from implementation time',
    ]),
  }),
  Object.freeze({
    id: 'pass51',
    pass: 'PASS 51',
    title: 'RustRig cleanup & horizon ocean',
    releasedAt: '2026-07-21T19:17:57+01:00',
    areas: Object.freeze(['RUSTRIG', 'MAP']),
    summary: 'Cleaner tower, collision-backed shipping cover, and ocean to the horizon.',
    highlights: Object.freeze([
      'Removed floating light fixtures and disconnected crane/cable pieces',
      'Simplified the tower middle and crown without changing climb routes',
      'Added four shipping containers and pallet stacks with full collision',
      'Extended the animated sea into a far-ocean horizon ring',
    ]),
  }),
  Object.freeze({
    id: 'pass50',
    pass: 'PASS 50',
    title: 'Release notes menu',
    releasedAt: '2026-07-21T18:00:21+01:00',
    areas: Object.freeze(['MENU', 'RELEASE NOTES']),
    summary: 'Main-menu release notes now show what changed on the live build.',
    highlights: Object.freeze([
      'Top-right Last Release button opens recent player-facing changes',
      'Every entry now records its first successful public production time',
    ]),
  }),
  Object.freeze({
    id: 'pass49',
    pass: 'PASS 49',
    title: 'Headshot damage contract',
    releasedAt: '2026-07-21T17:55:17+01:00',
    areas: Object.freeze(['COMBAT', 'DAMAGE']),
    summary: 'Bullet headshots are true 1.5× body damage — not free instakills.',
    highlights: Object.freeze([
      'SMG body 23 · head 35 (needs 3 heads from full HP)',
      'Combat hits use shared hit-boxes only (fairer head/body)',
      'Damage feed shows HEADSHOT · XX DMG (and OD×4 if Overdrive finishes)',
      'Sniper head and close scattergun remain the intentional one-shots',
    ]),
  }),
  Object.freeze({
    id: 'pass48',
    pass: 'PASS 48',
    title: 'Scores & Gun Range board',
    releasedAt: '2026-07-21T17:37:44+01:00',
    areas: Object.freeze(['SCORES', 'GUN RANGE']),
    summary: 'Global streaks unlock past 100; Gun Range gets its own leaderboard.',
    highlights: Object.freeze([
      'Global leaderboard ceiling raised to 9,999 kills/streak',
      'Gun Range: 2-minute rounds, score · hits · accuracy board',
      'No grenades on the range — pure gun score attack',
    ]),
  }),
  Object.freeze({
    id: 'pass47',
    pass: 'PASS 47',
    title: 'RustRig night oil rig',
    releasedAt: '2026-07-21T17:29:52+01:00',
    areas: Object.freeze(['RUSTRIG', 'LIGHTING']),
    summary: 'Raised rig at night — cleaner lanes, deeper sea, floods + stars.',
    highlights: Object.freeze([
      'Sparse cover and open pathing (less collider mess)',
      'Ocean lower under the deck with bigger rolling waves',
      'Night sky, starfield, and flood lighting (no pitch-black pockets)',
    ]),
  }),
  Object.freeze({
    id: 'pass45',
    pass: 'PASS 45',
    title: 'RustRig flow + ocean',
    releasedAt: '2026-07-21T17:13:48+01:00',
    areas: Object.freeze(['RUSTRIG', 'FLOW']),
    summary: 'Earlier RustRig water/flow pass (superseded visually by Pass 47).',
    highlights: Object.freeze([
      'Flow lanes and ocean foundation for the industrial map',
    ]),
  }),
  Object.freeze({
    id: 'pass44',
    pass: 'PASS 44',
    title: 'RustRig Quality plant',
    releasedAt: '2026-07-21T16:43:42+01:00',
    areas: Object.freeze(['RUSTRIG', 'QUALITY']),
    summary: 'Sol-depth Blender industrial plant for Quality Graphics.',
    highlights: Object.freeze([
      'High-detail central plant asset for Quality mode',
    ]),
  }),
]);

export function latestChangelogEntry(entries: readonly ChangelogEntry[] = CHANGELOG): ChangelogEntry {
  return entries[0] ?? {
    id: 'none',
    pass: 'BUILD',
    title: 'Nuke Town',
    releasedAt: '2026-07-21T19:47:24+01:00',
    areas: Object.freeze(['GAME']),
    summary: 'No changelog entries yet.',
    highlights: Object.freeze([] as string[]),
  };
}

type ParsedReleaseTimestamp = Readonly<{
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  zone: string;
  offsetLabel: string;
}>;

const UK_RELEASE_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

function parseReleaseTimestamp(isoTimestamp: string): ParsedReleaseTimestamp | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(isoTimestamp)) return null;
  const instant = new Date(isoTimestamp);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Map(UK_RELEASE_TIMESTAMP_FORMATTER.formatToParts(instant).map((part) => [part.type, part.value]));
  const zone = parts.get('timeZoneName');
  if (!zone) return null;
  return {
    year: parts.get('year') ?? '',
    month: parts.get('month') ?? '',
    day: parts.get('day') ?? '',
    hour: parts.get('hour') ?? '',
    minute: parts.get('minute') ?? '',
    second: parts.get('second') ?? '',
    zone,
    offsetLabel: zone === 'BST' ? 'UTC+1' : 'UTC',
  };
}

export function formatChangelogTimestamp(isoTimestamp: string): string {
  const parsed = parseReleaseTimestamp(isoTimestamp);
  if (!parsed) return isoTimestamp;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[Number(parsed.month) - 1] ?? parsed.month;
  return `${Number(parsed.day)} ${month} ${parsed.year} · ${parsed.hour}:${parsed.minute} ${parsed.zone}`;
}

export function formatChangelogTimestampDetail(isoTimestamp: string): string {
  const parsed = parseReleaseTimestamp(isoTimestamp);
  if (!parsed) return isoTimestamp;
  return `${formatChangelogTimestamp(isoTimestamp)} · ${parsed.offsetLabel} · ${parsed.hour}:${parsed.minute}:${parsed.second}`;
}

export function lastUpdatedButtonLabel(entry: ChangelogEntry = latestChangelogEntry()): string {
  if (entry.releasedAt === PENDING_PRODUCTION_RELEASE) return 'CURRENT CANDIDATE · OWNER REVIEW PENDING';
  return `LAST RELEASE · ${formatChangelogTimestamp(entry.releasedAt)}`;
}
