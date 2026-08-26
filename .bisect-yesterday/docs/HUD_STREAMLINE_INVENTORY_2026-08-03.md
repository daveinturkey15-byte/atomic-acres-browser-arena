# HUD Streamline — UI Hierarchy Inventory (for Dave to mark up)

- **Date:** 2026-08-03
- **Branch:** `contrib/dave-gaming-pc/hermes/v68-bugfixes`
- **Source of truth:** `src/ui/surface-registry.ts` (typed surface + lifecycle-state inventory; every surface below is mechanically covered there) and `src/ui/pass64-shell.ts` (markup root).
- **How to mark up:** put a single letter in the **DECISION** column — `K` keep as-is, `T` trim/declutter, `M` merge into another surface, `X` remove entirely, `?` needs discussion. Add one line of notes if you want specifics. Reply with the table or a list of `surfaceId -> decision` and I will implement it in a focused HUD pass with the surface-registry tests kept green.
- **Guardrails:** a redesign may restyle any surface but must not drop multiplayer state, loadout, accessibility, diagnostics, keyboard/gamepad focus, or return-to-lobby controls. All menu labels ≥ 9px and primary actions/values ≥ 12px at 1280×720, and every review viewport (laptop/desktop/ultrawide/narrow/high-DPI/live-HUD/returned-lobby/match-end) stays free of clipping and overlap.

## 1. Menu / pre-match surfaces

| surfaceId | Root element | What it shows today | Critical | DECISION |
|---|---|---|---|---|
| deployment-shell | `#menu` | Main menu shell: title, mode tabs, version/release strip, background | yes | |
| field-kit-panel | `#menu-panel-kit` | FIELD KIT tab: 4 curated kits + 3 Custom cards with nested EDIT + loadout manager | yes | |
| killstreak-loadout-panel | `#menu-panel-streaks` | STREAKS tab: 3-slot killstreak loadout with previews/posters | yes | |
| options-panel | `#menu-panel-options` | OPTIONS tab: controls, key bindings, GAME REFRESH, save | yes | |
| graphics-settings | `#graphics-settings` | Graphics profile select + Advanced Graphics panel | yes | |
| audio-settings | `#audio-settings` | Per-bus volume/mute sliders | yes | |
| accessibility-settings | `#accessibility-settings` | Reduced motion/flash/sensory, damage flash scale, weapon motion scale | yes | |
| privacy-settings | `#privacy-settings` | Leaderboard share, telemetry | yes | |
| menu-showcase | `#menu-showcase` | Arena preview video showcase (Nuke Town/Terminal/RustRig/Gun Range) | no | |
| match-pause-backdrop | `#match-pause-backdrop` | Pause veil behind pause menu | yes | |
| menu-meta-actions | `#menu-meta-actions` | Social/link row on the menu | no | |
| arena-selector | `#map-selector` | Arena cards + difficulty/reinforcement toggles | yes | |
| field-kit | `#selected-kit-summary` | Selected-kit summary strip | yes | |
| room-join | `#room-card` | Host/join/private-lobby entry | yes | |
| private-lobby | `#private-lobby` | Private lobby: players, roles, settings, chat | yes | |
| network-status | `#network-status` | Connection/authority indicator | yes | |
| match-reports | `#last-match-reports` | Post-match report card | no | |
| leaderboard | `#high-score-card` | High-score card | no | |
| room-chat | `#text-chat` | Chat panel | yes | |
| release-history | `#changelog-panel` | Changelog/release history | no | |
| project-map | `#project-map-panel` | Project map / ownership | no | |
| targeting-map | `#strike-map-overlay` | Point-targeting strike map overlay | yes | |

## 2. In-match HUD surfaces

| surfaceId | Root element | What it shows today | Critical | DECISION |
|---|---|---|---|---|
| match-hud | `#hud` | Root HUD layer (layout container) | yes | |
| damage-direction | `#damage-direction` | Directional damage indicators | yes | |
| nuke-warning | `#nuke-warning` | NUKE INCOMING warning banner | yes | |
| refresh-warning | `#refresh-warning` | Update-available warning | no | |
| match-bar | `#matchbar` | Score, time, tickets, mode status | yes | |
| performance | `#fps-counter` | FPS/performance counter | no | |
| latency | `#network-strip` | Latency/ping strip | yes | |
| aim | `#crosshair` | Crosshair + hitmarker | yes | |
| sniper-scope | `#sniper-scope` | Sniper magnified scope overlay | yes | |
| railgun-thermal | `#railgun-thermal` | Railgun thermal overlay | yes | |
| dmr-thermal | `#dmr-thermal` | M14 thermal optic overlay | yes | |
| damage-numbers | `#damage-numbers` | Damage numbers (incl. support target-anchored) | yes | |
| combat-feed | `#killfeed` | Kill feed | yes | |
| damage-activity | `#damage-feeds` | Damage taken/dealt activity feed | yes | |
| objective | `#objective` | Objective text (bomb/flag/tickets) | yes | |
| minimap | `#minimap` | Minimap | yes | |
| vitals | `#health-block` | Health/armour block | yes | |
| combat-stats | `#combat-stats` | K/D, streak counters | yes | |
| weapon | `#weapon-block` | Current weapon, ammo, reload state | yes | |
| equipment | `#equipment-block` | Grenades/equipment slots | yes | |
| support | `#support-block` | Killstreak slots/charges | yes | |
| support-combat-feedback | `#support-combat-feedback` | Support weapon hit/damage feedback | yes | |
| adrenaline-status | `#adrenaline-hud` | Adrenaline boost timer/status | yes | |
| support-interaction | `#support-interaction-prompt` | Care package / possession F prompt | yes | |
| overdrive | `#overdrive-hud` | Overdrive status | yes | |
| power-announcement | `#power-announcement` | Power weapon announcements | yes | |
| room-state | `#room-hud` | Room/test-bay state | yes | |
| pickup | `#pickup-prompt` | Weapon/armory pickup prompt | yes | |
| respawn | `#respawn` | Respawn timer/countdown | yes | |
| countdown | `#countdown` | Round countdown | yes | |
| round-banner | `#banner` | Round/match banners | yes | |
| roster | `#roster` | Team roster | yes | |
| killstreak-logo-flash | `#killstreak-logo-flash` | Half-screen Palantir/US-flag activation flash | yes | |
| chopper-thermal-hud | (pass65-hud) | Chopper cockpit thermal HUD banner | yes | |

## 3. Lifecycle states covered by `UI_STATE_INVENTORY`

`offline · host · guest · reconnecting · syncing · waiting · ready · countdown · live · dead · respawning · match-ended · returned-lobby · modal-open · chat-typing · loading · error · reduced-motion · reduced-sensory · pointer-lock-requesting · pointer-lock-denied · focus-suspended · paused-match · killstreak-possession · chopper-gunner · adrenaline-active · care-package-nearby · narrow-height · narrow-width · ultrawide · high-dpi`

A streamline pass may restyle any surface above, but every state in this inventory and every surface marked `yes` must remain reachable and mechanically covered by `src/ui/surface-registry.test.ts` plus the e2e `tests/e2e/pass64-hud-menu.spec.ts`.
