# UI ELEMENT INVENTORY - Atomic Acres menu
# Mark [x] next to any element you do NOT need; leave [ ] to keep.
# Grouped by source file and the markup function (panel/section) that renders it.

# ===== src/ui/pass64-shell.ts =====

## mapCardsMarkup
[ ] #${entry.id}

## fieldKitCardsMarkup
[ ] #${kit.id}

## customPresetCardsMarkup
[ ] #custom-${index}
[ ] #loadout-manage

## deploymentPanelMarkup
[ ] #menu-panel-deploy
[ ] #arena-title
[ ] #arena-lede
[ ] #menu-showcase
[ ] #match-pause-frame-fallback
[ ] #menu-preview-label
[ ] #menu-preview-motion
[ ] #map-selector
[ ] #player-name
[ ] #player-name-error
[ ] #team
[ ] #selected-kit-summary
[ ] #field-kit-redeploy
[ ] #resume
[ ] #main-menu
[ ] #solo
[ ] #host
[ ] #room-input
[ ] #join
[ ] #room-card
[ ] #room-code
[ ] #copy-room
[ ] #private-lobby
[ ] #private-lobby-title
[ ] #lobby-capacity-label
[ ] #lobby-arena
[ ] #lobby-mode
[ ] #lobby-capacity
[ ] #lobby-bots
[ ] #lobby-auto-balance
[ ] #lobby-balance
[ ] #lobby-roster
[ ] #lobby-ready
[ ] #lobby-start
[ ] #lobby-leave
[ ] #lobby-guidance
[ ] #network-status
[ ] #last-match-reports
[ ] #menu-download-match-summary
[ ] #menu-download-match-technical
[ ] #high-score-card
[ ] #global-leaderboard-status
[ ] #high-score-title
[ ] #personal-best
[ ] #high-score-list
[ ] #high-score-footnote

## fieldKitPanelMarkup
[ ] #menu-panel-kit
[ ] #loadout-manager
[ ] #loadout-manage-preset
[ ] #loadout-preset-name
[ ] #loadout-primary
[ ] #loadout-secondary
[ ] #loadout-grenade
[ ] #loadout-save
[ ] #loadout-inspector

## optionsPanelMarkup
[ ] #audio-${id}-gain
[ ] #audio-${id}-mute
[ ] #menu-panel-options
[ ] #sensitivity
[ ] #controller-sensitivity
[ ] #field-of-view
[ ] #graphics-settings
[ ] #graphics-settings-title
[ ] #graphics-effective
[ ] #graphics-save
[ ] #graphics-profile
[ ] #advanced-graphics
[ ] #audio-settings
[ ] #audio-settings-title
[ ] #accessibility-settings
[ ] #accessibility-settings-title
[ ] #accessibility-effective
[ ] #reduced-motion
[ ] #reduced-damage-flash
[ ] #reduced-sensory-effects
[ ] #damage-flash-scale
[ ] #weapon-motion-scale
[ ] #touch-controls-settings
[ ] #touch-controls-settings-title
[ ] #mobile-touch-controls-toggle
[ ] #privacy-settings
[ ] #privacy-settings-title
[ ] #global-leaderboard-sharing-state
[ ] #share-global-leaderboard

## menuMarkup
[ ] #menu
[ ] #menu-meta-actions
[ ] #menu-tab-deploy
[ ] #menu-tab-kit
[ ] #menu-tab-streaks
[ ] #menu-tab-options

## deploymentTransitionMarkup
[ ] #deployment-transition
[ ] #deployment-transition-poster
[ ] #deployment-transition-video
[ ] #deployment-transition-kicker
[ ] #deployment-transition-title
[ ] #deployment-transition-status

## chatMarkup
[ ] #text-chat
[ ] #text-chat-hint
[ ] #text-chat-log
[ ] #text-chat-form
[ ] #text-chat-input

## hudMarkup
[ ] #hud
[ ] #pause-hint
[ ] #matchbar
[ ] #match-mode-label
[ ] #timer
[ ] #scoreline
[ ] #aqua-label
[ ] #aqua-score
[ ] #score-limit
[ ] #coral-score
[ ] #coral-label
[ ] #connection-pill
[ ] #objective
[ ] #fps-counter
[ ] #network-strip
[ ] #minimap
[ ] #map-heading
[ ] #location-label
[ ] #health-block
[ ] #health
[ ] #health-fill
[ ] #combat-stats
[ ] #damage-dealt
[ ] #damage-taken
[ ] #equipment-block
[ ] #stance
[ ] #grenades
[ ] #room-hud
[ ] #weapon-block
[ ] #weapon-name
[ ] #ammo
[ ] #reserve
[ ] #reload-state
[ ] #railgun-status
[ ] #support-block
[ ] #support-title
[ ] #support-streak
[ ] #support-combat-feedback
[ ] #support-platform-name
[ ] #support-platform-mode
[ ] #support-platform-health
[ ] #support-platform-ammo
[ ] #support-platform-time
[ ] #support-platform-altitude
[ ] #support-platform-speed
[ ] #chopper-damage-dealt
[ ] #support-control-action
[ ] #adrenaline-hud
[ ] #adrenaline-time
[ ] #support-interaction-prompt
[ ] #crosshair
[ ] #hitmarker
[ ] #damage-numbers
[ ] #sniper-scope
[ ] #railgun-thermal
[ ] #dmr-thermal
[ ] #killfeed
[ ] #damage-feeds
[ ] #damage-done-feed
[ ] #damage-taken-feed
[ ] #overdrive-hud
[ ] #overdrive-time
[ ] #power-announcement
[ ] #pickup-prompt
[ ] #gunner-cockpit-hud
[ ] #gunner-hull
[ ] #gunner-ammo
[ ] #runtime-error-log
[ ] #death-fade
[ ] #respawn
[ ] #respawn-countdown
[ ] #countdown
[ ] #banner
[ ] #roster
[ ] #roster-list

## renderPass64Shell
[ ] #game
[ ] #match-pause-backdrop
[ ] #color-grade
[ ] #film-grain
[ ] #vignette
[ ] #low-health-vignette
[ ] #damage-flash
[ ] #damage-direction
[ ] #ordnance-flash
[ ] #nuke-flash
[ ] #nuke-warning
[ ] #refresh-warning
[ ] #strike-map-overlay
[ ] #strike-target-mode
[ ] #strike-target-instruction
[ ] #strike-target-count
[ ] #strike-map
[ ] #strike-hostile-count
[ ] #strike-target-help

# ===== src/ui/killstreak-loadout-menu.ts =====

## killstreakLoadoutPanelMarkup
[ ] #killstreak-detail-${slot.slot}
[ ] #menu-panel-streaks
[ ] #killstreak-loadout-status

# ===== src/ui/project-map-dialog.ts =====

## projectMapButtonMarkup
[ ] #project-map-btn

## projectMapDialogMarkup
[ ] #project-map-backdrop
[ ] #project-map-panel
[ ] #project-map-title
[ ] #project-map-close
[ ] #project-map-tabs
[ ] #project-map-page-overview
[ ] #project-map-download-human
[ ] #project-map-download-agent
[ ] #project-map-page-structure
[ ] #project-map-page-changes
[ ] #project-map-page-archive

# ===== src/ui/release-history-dialog.ts =====

## releaseHistoryButtonMarkup
[ ] #last-updated-btn

## releaseHistoryDialogMarkup
[ ] #changelog-backdrop
[ ] #changelog-panel
[ ] #changelog-title
[ ] #changelog-close
[ ] #changelog-list
[ ] #${escapeHtml(entry.id)}

# ===== src/ui/advanced-graphics-controls.ts =====

## controlMarkup
[ ] #${definition.id}
[ ] #${definition.id}-value

## advancedGraphicsMarkup
[ ] #graphics-target-fps-marks
[ ] #graphics-frame-limit-marks

