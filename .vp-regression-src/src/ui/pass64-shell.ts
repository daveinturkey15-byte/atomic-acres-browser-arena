import { WEAPONS } from '../gameplay';
import { FIELD_KITS } from '../loadout';
import { WEAPON_CATALOG } from '../combat/weapon-catalog';
import { GRENADE_CATALOG } from '../combat/grenade-catalog';
import { ARENA_SELECTIONS, arenaCanvasLabel, soloLaunchLabel } from '../map-selection';
import { DEFAULT_PRIVATE_MATCH_CONFIG, LOBBY_KILL_LIMITS, LOBBY_TIME_LIMITS_MS } from '../private-match';
import { CHAT_TEXT_MAX_CHARS } from '../text-chat';
import { AUDIO_BUS_IDS } from '../pass65-settings';
import { PASS65_KILLSTREAK_CATALOG } from '../killstreak-catalog';
import { DEFAULT_KILLSTREAK_LOADOUT } from '../killstreak-loadout';
import { killstreakLoadoutPanelMarkup } from './killstreak-loadout-menu';
import { projectMapButtonMarkup, projectMapDialogMarkup } from './project-map-dialog';
import { releaseHistoryButtonMarkup, releaseHistoryDialogMarkup } from './release-history-dialog';
import { PASS66_RELEASE_IDENTITY } from '../release-identity';
import { advancedGraphicsMarkup } from './advanced-graphics-controls';
import './advanced-graphics.css';
import { menuPreviewVideoDefinition, menuPreviewVideoMarkup } from './menu-preview-video';
import { OPERATOR_SKIN_CATALOG } from '../operator-skin-catalog'; // HF-360
import {
  DEFAULT_OPERATOR_EMOTE,
  DEFAULT_OPERATOR_STANCE,
  OPERATOR_EMOTES,
  OPERATOR_STANCES,
} from '../operator-appearance-catalog'; // Pass 75
import { weaponMenuPresentationMarkup, weaponMenuStatDeckMarkup } from './field-kit-weapon-presentation';
import { operatorSkinPortraitMarkup, operatorSkinSwatchMarkup } from './operator-skin-portrait'; // HF-366, HF-381
import {
  OPERATOR_PREVIEW_CANVAS_ID,
  OPERATOR_PREVIEW_PORTRAIT_ID,
  OPERATOR_PREVIEW_STATUS_ID,
  mountOperatorPreview,
} from './operator-preview'; // HF-366

export type Pass64ShellViewModel = Readonly<{
  playerName: string;
  releaseLabel: string;
}>;

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createPass64ShellViewModel(playerName: string): Pass64ShellViewModel {
  return Object.freeze({
    playerName: escapeAttribute(playerName),
    releaseLabel: PASS66_RELEASE_IDENTITY.runtimeLabel,
  });
}

function mapCardsMarkup(): string {
  return ARENA_SELECTIONS.map((entry, index) => `<button type="button" class="map-card${index === 0 ? ' selected' : ''}" data-arena-id="${entry.id}" data-arena-route="${entry.routeId}" aria-pressed="${index === 0}" disabled>
    <i class="map-index">0${index + 1}</i>
    <span>${entry.selectorLabel}</span>
    <strong>${entry.summary}</strong>
    <small>${entry.rulesLabel}</small>
  </button>`).join('');
}

function fieldKitCardsMarkup(): string {
  return FIELD_KITS.map((kit) => `<button type="button" class="kit-card" data-kit-id="${kit.id}" aria-pressed="false">
    <span>${kit.role}</span>
    <strong>${kit.title}</strong>
    <b>${WEAPONS[kit.weapon].name} · ${WEAPONS[kit.sidearm].name}</b>
    <p>${kit.summary}</p>
    ${weaponMenuPresentationMarkup(kit.weapon)}
    <em aria-hidden="true">✓ SELECTED</em>
  </button>`).join('');
}

function customPresetCardsMarkup(): string {
  const defaultPrimaryIds = ['m4a1', 'mp5', 'm14-ebr'] as const;
  const cards = [1, 2, 3].map((index) => `<button type="button" class="kit-card custom-kit-card" data-custom-preset-id="custom-${index}" aria-pressed="false">
    <span>CUSTOM LOADOUT // 0${index}</span>
    <strong data-custom-name>Custom ${index}</strong>
    <b data-custom-equipment>CONFIGURE PRIMARY · SECONDARY · GRENADE</b>
    <p>Persistent operator-defined equipment. Changes queue safely for the next deployment.</p>
    <i>1 primary · 1 secondary · 1 grenade</i>
    ${weaponMenuPresentationMarkup(defaultPrimaryIds[index - 1]!)}
    <em aria-hidden="true">✓ SELECTED</em>
    <span class="kit-modify-row"><small>RENAME / MODIFY</small><b data-custom-modify="custom-${index}" aria-controls="loadout-manager">EDIT</b></span>
  </button>`).join('');
  return cards;
}

function weaponOptionsMarkup(slot: 'primary' | 'secondary'): string {
  return WEAPON_CATALOG
    .filter((weapon) => weapon.slot === slot && weapon.policies.loadout === 'eligible')
    .map((weapon) => `<option value="${weapon.id}">${weapon.displayName}</option>`)
    .join('');
}

/**
 * Owner request: profile cards show the canonical weapon-menu stat deck (the
 * same CATALOG BALLISTICS figures as the loadout inspector). The older
 * real-stat strip was removed so each card carries exactly one stat deck.
 */
function grenadeOptionsMarkup(): string {
  return GRENADE_CATALOG
    .filter((grenade) => grenade.availability === 'shipped')
    .map((grenade) => `<option value="${grenade.id}">${grenade.displayName}</option>`)
    .join('');
}

function deploymentPanelMarkup(model: Pass64ShellViewModel): string {
  return `<div id="menu-panel-deploy" class="menu-panel active" role="tabpanel" aria-labelledby="menu-tab-deploy" data-menu-panel="deploy">
    <section class="arena-command" aria-labelledby="arena-title">
      <header class="arena-brief">
        <div class="eyebrow">SELECTED THEATRE // 01</div>
        <h1 id="arena-title">NUKE <span>TOWN</span></h1>
        <p class="lede" id="arena-lede">Fight through an authored living neighbourhood with physical transit cover, tactical viewmodels, atmospheric dust and a contested 2× Damage Core.</p>
      </header>
      <aside id="menu-showcase" aria-hidden="true">
        <canvas id="match-pause-frame-fallback" aria-hidden="true" hidden width="1" height="1"></canvas>
        ${menuPreviewVideoMarkup()}
        <div class="showcase-telemetry"><span id="menu-preview-label">PRERECORDED HELO // NUKE TOWN</span><b id="menu-preview-motion">AUTHORED COCKPIT FLYOVER</b></div>
      </aside>
      <section id="map-selector" class="map-selector" aria-label="Choose map">
        <div class="map-selector-heading"><span>THEATRE INDEX</span><small>${ARENA_SELECTIONS.length} deployable spaces · choose before launch</small></div>
        <div class="map-card-grid">${mapCardsMarkup()}</div>
      </section>
    </section>
    <aside class="deployment-manifest" aria-label="Deployment manifest">
      <header class="manifest-heading"><small>DEPLOYMENT MANIFEST</small><strong>OPERATOR + SESSION</strong><span>Configure identity, kit and lobby channel.</span></header>
      <div class="setup-grid">
        <label>CALLSIGN<input id="player-name" maxlength="16" autocomplete="nickname" required aria-describedby="player-name-error" placeholder="Enter callsign" value="${model.playerName}"><small id="player-name-error" class="input-error" hidden>Enter a callsign before deployment.</small></label>
        <label>SQUAD<select id="team"><option value="0">Aqua</option><option value="1">Coral</option></select></label>
        <label>OPERATOR SKIN<select id="operator-skin">${OPERATOR_SKIN_CATALOG.definitions
          .filter((definition) => definition.availability === 'selectable')
          .map((definition) => `<option value="${definition.id}">${escapeAttribute(definition.displayName.toUpperCase())}</option>`)
          .join('')}</select></label>
      </div>
      <div id="selected-kit-summary" class="selected-kit-summary"></div>
      <button id="field-kit-redeploy" type="button" hidden>REDEPLOY NOW WITH SELECTED FIELD KIT</button>
      <div class="menu-actions">
        <button id="resume" class="primary" hidden>RETURN TO MATCH</button>
        <button id="main-menu" hidden>MAIN MENU · CHANGE MAP</button>
        <button id="solo" class="primary" disabled>${soloLaunchLabel(ARENA_SELECTIONS[0]!)}</button>
        <button id="host" disabled>HOST LOBBY</button>
      </div>
      <div class="join-row"><input id="room-input" placeholder="Paste room code" autocomplete="off" disabled><button id="join" disabled>JOIN</button></div>
      <div id="room-card" hidden><span>ROOM CODE</span><strong id="room-code"></strong><button id="copy-room" class="small-button" aria-label="Copy lobby code">COPY CODE</button></div>
      <section id="private-lobby" hidden aria-labelledby="private-lobby-title">
        <div class="private-lobby-heading"><span><small>PRIVATE MATCH</small><strong id="private-lobby-title">WAITING ROOM</strong></span><b id="lobby-capacity-label">1 / 4</b></div>
        <div class="lobby-settings">
          <label>MAP<select id="lobby-arena">${ARENA_SELECTIONS.map((entry) => `<option value="${entry.id}">${entry.displayName.toUpperCase()}</option>`).join('')}</select></label>
          <label>MODE<select id="lobby-mode"><option value="ffa" selected>FREE FOR ALL</option><option value="tdm">TEAM DEATHMATCH</option></select></label>
          <!-- HF-328: squad identity is prescribed (AQUA/CORAL colour names); the free name input and colour picker were removed. Swap-after stays available via the host-checked SWAP SIDES request. -->
          <div class="lobby-squad-identity" id="lobby-squad-identity"><small>SQUAD</small><strong id="lobby-squad-label" style="--lobby-squad-color:#55e6ff">AQUA</strong></div>
          <button id="lobby-swap-sides" type="button" disabled title="Request to swap sides — the host accepts only swaps that keep teams within one player.">SWAP SIDES</button>
          <label>CAPACITY<select id="lobby-capacity"><option value="4">4 PLAYERS</option><option value="6">6 PLAYERS</option></select></label>
          <label>HOSTED BOTS<select id="lobby-bots"><option value="0">NO BOTS</option><option value="2">2 BOTS</option><option value="4">4 BOTS</option></select></label>
          <!-- HF-377: host-settable match contract limits; guests see the host's values here before ready-up because renderPrivateLobby mirrors snapshot.config into these selects. -->
          <label>TIME LIMIT<select id="lobby-time-limit">${LOBBY_TIME_LIMITS_MS.map((ms) => `<option value="${ms}"${ms === DEFAULT_PRIVATE_MATCH_CONFIG.durationMs ? ' selected' : ''}>${Math.round(ms / 60_000)} MIN</option>`).join('')}</select></label>
          <!-- The initial DOM selection equals the contract default so a config change that fires before the first renderPrivateLobby mirror cannot silently publish a different clock. -->
          <label>KILL LIMIT<select id="lobby-kill-limit">${LOBBY_KILL_LIMITS.map((limit) => `<option value="${limit ?? ''}">${limit === null ? 'OFF · SCORE RACE' : `FIRST TO ${limit}`}</option>`).join('')}</select></label>
          <label class="lobby-check"><input id="lobby-auto-balance" type="checkbox" checked> AUTO BALANCE</label>
          <button id="lobby-balance" type="button">BALANCE TEAMS</button>
        </div>
        <div id="lobby-roster" class="lobby-roster"></div>
        <div class="lobby-actions">
          <button id="lobby-ready" type="button">READY</button>
          <button id="lobby-start" class="primary" type="button" disabled>START MATCH</button>
          <button id="lobby-reset" type="button">RESET LOBBY · NEW CODE</button>
          <button id="lobby-leave" type="button">LEAVE ROOM</button>
        </div>
        <p id="lobby-guidance">Choose teams, ready up, then the host starts one synchronized countdown.</p>
      </section>
      <div id="network-status" data-kind="ok">Ready for deployment.</div>
      <section id="last-match-reports" hidden aria-label="Last match reports">
        <span><small>LAST MATCH</small><strong>DOWNLOAD REPORTS</strong></span>
        <button id="menu-download-match-summary" type="button">HUMAN SUMMARY JSON</button>
        <button id="menu-download-match-technical" type="button">TECHNICAL DEBUG JSON</button>
      </section>
      <section id="high-score-card" aria-labelledby="high-score-title" data-board="streak">
        <div class="high-score-heading"><span><small id="global-leaderboard-status">GLOBAL STREAK RECORDS</small><strong id="high-score-title">NUKE TOWN LEADERBOARD</strong></span><b id="personal-best">NO PERSONAL BEST</b></div>
        <ol id="high-score-list"><li class="empty">Set the first named streak record.</li></ol>
        <p id="high-score-footnote">Global streak records sync across builds and devices · local cache remains available offline.</p>
      </section>
    </aside>
  </div>`;
}

function fieldKitPanelMarkup(): string {
  return `<div id="menu-panel-kit" class="menu-panel" role="tabpanel" aria-labelledby="menu-tab-kit" data-menu-panel="kit" hidden>
    <div class="kit-heading"><div><b>FIELD KIT</b><span>Choose one of exactly three custom presets or a curated kit.</span></div><small>One primary · one secondary · one selected grenade. Mid-life changes queue for redeploy.</small></div>
    <section id="loadout-manager" class="loadout-manager" hidden aria-label="Manage and rename custom loadouts">
      <header><span>MANAGE / RENAME</span><strong>THREE CUSTOM SLOTS</strong></header>
      <div class="loadout-manager-workspace">
      <div class="loadout-manager-grid">
        <label>SLOT<select id="loadout-manage-preset"><option value="custom-1">Custom 1</option><option value="custom-2">Custom 2</option><option value="custom-3">Custom 3</option></select></label>
        <label>NAME<input id="loadout-preset-name" type="text" maxlength="32" autocomplete="off"></label>
        <label>PRIMARY<select id="loadout-primary">${weaponOptionsMarkup('primary')}</select></label>
        <label>SECONDARY<select id="loadout-secondary">${weaponOptionsMarkup('secondary')}</select></label>
        <label>GRENADE<select id="loadout-grenade">${grenadeOptionsMarkup()}</select></label>
        <button id="loadout-save" type="button">SAVE LOADOUT</button>
        <p id="loadout-save-status" class="loadout-save-status" role="status" aria-live="polite" hidden></p>
      </div>
      <aside id="loadout-inspector" class="loadout-inspector" aria-live="polite">
        ${weaponMenuStatDeckMarkup('m4a1')}
        <p data-loadout-grenade-detail>FRAG / TIMED EXPLOSIVE / ONE CARRIED</p>
      </aside>
      </div>
    </section>
    <div class="kit-grid custom-kit-grid">${customPresetCardsMarkup()}</div>
    <div class="kit-grid curated-kit-grid">${fieldKitCardsMarkup()}</div>
  </div>`;
}

function optionsPanelMarkup(): string {
  const audioBusLabels: Record<typeof AUDIO_BUS_IDS[number], string> = {
    master: 'MASTER', sfx: 'SFX', movement: 'MOVEMENT', ui: 'UI', announcements: 'ANNOUNCEMENTS',
    ambience: 'AMBIENCE', 'menu-music': 'MENU MUSIC', 'game-music': 'GAME MUSIC',
  };
  const audioRows = AUDIO_BUS_IDS.map((id) => `<label class="audio-setting-row" for="audio-${id}-gain"><span>${audioBusLabels[id]}</span><input id="audio-${id}-gain" data-audio-bus="${id}" type="range" min="0" max="100" step="1" value="100"><input id="audio-${id}-mute" data-audio-mute="${id}" type="checkbox"><small>MUTE</small></label>`).join('');
  return `<div id="menu-panel-options" class="menu-panel" role="tabpanel" aria-labelledby="menu-tab-options" data-menu-panel="options" hidden>
    <div class="options-heading"><b>OPTIONS</b><span>Settings persist locally. Graphics changes reload the renderer; audio and accessibility apply live.</span></div>
    <div class="settings-grid">
      <label>MOUSE SENSITIVITY<input id="sensitivity" type="range" min="0.6" max="2" step="0.05" value="1"></label>
      <label>CONTROLLER LOOK<input id="controller-sensitivity" type="range" min="0.5" max="1.8" step="0.05" value="1"></label>
      <label>FIELD OF VIEW<input id="field-of-view" type="range" min="70" max="100" step="1" value="82"></label>
    </div>
    <section id="graphics-settings" class="settings-section" aria-labelledby="graphics-settings-title">
      <header><b id="graphics-settings-title">GRAPHICS</b><span id="graphics-effective">EFFECTIVE: QUALITY</span><button id="graphics-save" type="button">SAVE GRAPHICS</button></header>
      <div class="graphics-preset-row">
        <label>GRAPHICS MODE<select id="graphics-profile"><option value="high">QUALITY</option><option value="performance">PERFORMANCE</option><option value="raytraced">RAY TRACED</option><option value="max">MAX</option><option value="custom">CUSTOM</option></select></label>
        <p>Quality is the balanced default. Performance reduces presentation cost. Max cranks every setting. Editing any advanced control saves the mode as Custom.</p>
      </div>
      <details id="advanced-graphics" class="advanced-settings">
        <summary><span>ADVANCED GRAPHICS</span><small>REAL WEBGPU / PRESENTATION CONTROLS + CAPABILITY LIMITS</small></summary>
        ${advancedGraphicsMarkup()}
      </details>
    </section>
    <section id="audio-settings" class="settings-section" aria-labelledby="audio-settings-title">
      <header><b id="audio-settings-title">AUDIO BUSES</b><span>INDEPENDENT VOLUME + MUTE</span></header>
      <div class="audio-settings-grid">${audioRows}</div>
    </section>
    <section id="accessibility-settings" class="settings-section" aria-labelledby="accessibility-settings-title">
      <header><b id="accessibility-settings-title">ACCESSIBILITY</b><span id="accessibility-effective">STANDARD SENSORY</span></header>
      <div class="settings-grid">
        <label class="setting-check"><input id="reduced-motion" type="checkbox"> REDUCED MOTION</label>
        <label class="setting-check"><input id="reduced-damage-flash" type="checkbox"> REDUCED DAMAGE FLASH</label>
        <label class="setting-check"><input id="reduced-sensory-effects" type="checkbox"> REDUCED SENSORY EFFECTS</label>
        <label>DAMAGE FLASH<input id="damage-flash-scale" type="range" min="0" max="1" step="0.05" value="1"></label>
        <label>WEAPON MOTION<input id="weapon-motion-scale" type="range" min="0" max="1" step="0.05" value="1"></label>
      </div>
    </section>
    <section id="key-bindings-settings" class="settings-section" aria-labelledby="key-bindings-settings-title">
      <header><b id="key-bindings-settings-title">KEY BINDINGS</b><span id="key-bindings-status">DEFAULT PROFILE</span><button id="key-bindings-reset" type="button">RESET TO DEFAULTS</button></header>
      <div class="key-binding-grid" id="key-binding-rows"></div>
      <p>Click a binding to reassign it (press a key to capture, Escape to cancel). Conflicts are rejected. Bindings apply immediately and persist on this browser; the default profile is always shown and restorable.</p>
    </section>
    <section id="touch-controls-settings" class="settings-section" aria-labelledby="touch-controls-settings-title">
      <header><b id="touch-controls-settings-title">TOUCH / MOBILE CONTROLS</b><span>ON-SCREEN THUMBSTICKS + BUTTONS</span></header>
      <div class="settings-grid">
        <label class="setting-check"><input id="mobile-touch-controls-toggle" type="checkbox"> ENABLE MOBILE TOUCH CONTROLS</label>
      </div>
      <p>Shows a left movement thumbstick, a right look/aim thumbstick, and FIRE / JUMP / ADS / RELOAD / CROUCH / GRENADE / KNIFE buttons. Auto-detected on touch devices; toggle here to force it on or off.</p>
    </section>
    <section id="game-refresh-settings" class="settings-section" aria-labelledby="game-refresh-settings-title">
      <header><b id="game-refresh-settings-title">GAME REFRESH</b><span>FORCE THE LATEST BUILD</span></header>
      <div class="game-refresh-row">
        <button id="hard-refresh-button" type="button">HARD REFRESH NOW</button>
        <p>Clears cached game files and reloads the newest version from the server. Use this when a new release has not appeared after an update — the clickable equivalent of Ctrl+Shift+R on desktop, built for mobile. Settings and loadouts are kept.</p>
      </div>
    </section>
    <section id="privacy-settings" class="settings-section" aria-labelledby="privacy-settings-title">
      <header><b id="privacy-settings-title">PRIVACY + ONLINE SHARING</b><span id="global-leaderboard-sharing-state">SHARING OFF</span></header>
      <div class="privacy-setting-row">
        <label class="setting-check"><input id="share-global-leaderboard" type="checkbox"> SHARE MY GLOBAL LEADERBOARD RESULTS</label>
        <p>Off by default. If enabled, completed streaks send your chosen callsign, streak, kills, deaths, build/season and a pseudonymous browser ID to the public leaderboard service. No account credentials are sent. Turning this off stops future submissions and forgets this browser ID; rows already published may remain public.</p>
      </div>
    </section>
    <div class="controls"><b>WASD</b> move · <b>SHIFT</b> sprint · <b>C</b> crouch · <b>Z/CTRL</b> prone · <b>SPACE</b> jump · <b>RMB</b> ADS · <b>LMB</b> fire · <b>R</b> reload · <b>V</b> knife · <b>G</b> selected grenade · <b>F</b> weapon pickup · <b>WALK OVER DROPS</b> ammo/grenade · <b>1/2</b> primary/sidearm · <b>TAB</b> roster · <b>ENTER</b> chat<br><b>PAD</b> left stick move · right stick aim · <b>LT/RT</b> ADS/fire · <b>A</b> jump · <b>B</b> crouch · <b>D-PAD DOWN</b> prone · <b>X</b> reload · <b>Y</b> switch · <b>RB</b> knife</div>
    <p class="legal">Fan-made original arena. No Activision assets, branding, code or ripped map geometry. Keyboard/mouse and standard gamepads supported.</p>
  </div>`;
}

function fieldSupportRowsMarkup(): string {
  return DEFAULT_KILLSTREAK_LOADOUT.slots.map((id, index) => {
    const definition = PASS65_KILLSTREAK_CATALOG.definitions.find((entry) => entry.id === id)!;
    return `<b role="listitem" data-support="${id}" data-support-slot="${index + 1}"><span class="support-meta"><kbd>${index + 3}</kbd><small>${definition.cost} KILLS</small></span><span class="support-name">${definition.displayName.toUpperCase()}</span><em class="support-state">LOCKED</em></b>`;
  }).join('');
}

/**
 * Pass 75 - the OPERATOR panel.
 *
 * The owner asked for skins AND animations to be easy to select in their own
 * menu option. Previously the skin was one dropdown buried in the deployment
 * manifest and animations were not selectable at all.
 *
 * HF-366 (2026-08-23) replaced the card art. The panel now opens with a LIVE
 * 3D turntable of the selected operator in the selected skin, and each card
 * carries a procedural portrait built from that skin's own palette - the same
 * palette that tints the first-person arms.
 */
function operatorPanelMarkup(): string {
  // HF-366: every card now carries a procedural portrait drawn from that
  // skin's own palette - the same palette that tints the first-person arms.
  // The previous art was three near-identical dark renders plus a typographic
  // emblem for the standard operator, which is exactly the "they all looked
  // greyed out" the owner reported. No card may fall back to a placeholder:
  // a skin with no portrait is a load-time error in the palette catalog.
  const skins = OPERATOR_SKIN_CATALOG.definitions
    .filter((definition) => definition.availability === 'selectable')
    .map((definition) => `<button type="button" class="operator-skin-card" data-operator-skin="${escapeAttribute(definition.id)}" aria-pressed="false">
        <span class="operator-skin-art" data-operator-art="portrait">${operatorSkinPortraitMarkup(definition.id)}</span>
        <strong>${escapeAttribute(definition.displayName.toUpperCase())}</strong>
        <small>${escapeAttribute(definition.archetype.toUpperCase())} ARCHETYPE</small>
        ${operatorSkinSwatchMarkup(definition.id)}
      </button>`).join('');

  const stances = OPERATOR_STANCES.map((stance) => `<button type="button" class="operator-anim-card" data-operator-stance="${escapeAttribute(stance.id)}" aria-pressed="${stance.id === DEFAULT_OPERATOR_STANCE}">
      <strong>${escapeAttribute(stance.displayName.toUpperCase())}</strong>
      <small>${escapeAttribute(stance.description)}</small>
    </button>`).join('');

  const emotes = OPERATOR_EMOTES.map((emote) => `<button type="button" class="operator-anim-card" data-operator-emote="${escapeAttribute(emote.id)}" aria-pressed="${emote.id === DEFAULT_OPERATOR_EMOTE}">
      <strong>${escapeAttribute(emote.displayName.toUpperCase())}</strong>
      <small>${escapeAttribute(emote.description)}</small>
    </button>`).join('');

  return `<div id="menu-panel-operator" class="menu-panel" role="tabpanel" aria-labelledby="menu-tab-operator" data-menu-panel="operator" hidden>
    <div class="kit-heading"><small>OPERATOR</small><strong>APPEARANCE + ANIMATION</strong><span>Your squad sees every choice here. None of it changes how you play.</span></div>
    <div id="operator-appearance" class="operator-appearance-layout">
      <section class="operator-group" aria-labelledby="operator-preview-heading">
        <h3 id="operator-preview-heading">YOU</h3>
        <!-- HF-366: the owner could not tell what they looked like. This is the
             live 3D half - the SELECTED operator in the SELECTED skin, turning
             slowly. It carries its own layout because the operator panel's
             stylesheet belongs to another lane; the canvas is sized by the
             inline box below and the renderer follows its client size. -->
        <div class="operator-preview" style="display:grid;grid-template-columns:minmax(210px,290px) minmax(0,1fr);gap:18px;align-items:stretch">
          <canvas id="${OPERATOR_PREVIEW_CANVAS_ID}" width="580" height="760" aria-label="Live rotating preview of your selected operator" style="display:block;width:100%;aspect-ratio:3/4;border-radius:10px;background:linear-gradient(160deg,#34251b 0%,#1e130c 100%)"></canvas>
          <div style="display:flex;flex-direction:column;justify-content:center;gap:10px;min-width:0">
            <!-- The 2D half. Same portrait art as the card the player pressed,
                 at a size you can actually read it at, so the card and the
                 turntable are visibly the same operator. -->
            <span id="${OPERATOR_PREVIEW_PORTRAIT_ID}" class="operator-skin-art" data-operator-art="portrait" style="display:block;width:100%;max-width:280px;border-radius:10px;overflow:hidden;aspect-ratio:4/3">${operatorSkinPortraitMarkup('default')}</span>
            <p id="${OPERATOR_PREVIEW_STATUS_ID}" class="operator-preview-status" aria-live="polite" style="margin:0;font-size:13px;line-height:1.5">Standard Operator · live preview</p>
            <p style="margin:0;font-size:12px;line-height:1.5;opacity:.75">Card art above, live turntable to the left, and your own first-person arms in the match all use this skin's colours.</p>
          </div>
        </div>
      </section>
      <section class="operator-group" aria-labelledby="operator-skins-heading">
        <h3 id="operator-skins-heading">SKIN</h3>
        <div class="operator-skin-grid">${skins}</div>
      </section>
      <section class="operator-group" aria-labelledby="operator-stance-heading">
        <h3 id="operator-stance-heading">IDLE STANCE</h3>
        <div class="operator-anim-grid">${stances}</div>
      </section>
      <section class="operator-group" aria-labelledby="operator-emote-heading">
        <h3 id="operator-emote-heading">EMOTE</h3>
        <div class="operator-anim-grid">${emotes}</div>
      </section>
      <p id="operator-appearance-status" class="operator-appearance-status" aria-live="polite">Standard Operator · Weapon Ready · no emote.</p>
    </div>
  </div>`;
}

function menuMarkup(model: Pass64ShellViewModel): string {
  return `<section id="menu" class="panel pass64-command-deck">
    <header class="command-header">
      <div class="command-brand"><small>AA // ARENA COMMAND</small><strong>BLACKSITE NETWORK</strong><span>${model.releaseLabel}</span></div>
      <div id="menu-meta-actions">${releaseHistoryButtonMarkup()}${projectMapButtonMarkup()}</div>
    </header>
    <div class="command-body">
      <aside class="command-rail">
        <div class="tactical-rail"><span>OPERATIONS</span><b>ONLINE</b></div>
        <nav class="menu-tabs" role="tablist" aria-label="Deployment menu">
          <button id="menu-tab-deploy" type="button" role="tab" data-menu-tab="deploy" class="active" aria-controls="menu-panel-deploy" aria-selected="true" tabindex="0"><i>01</i><span>DEPLOY</span><small>ARENA + LOBBY</small></button>
          <button id="menu-tab-kit" type="button" role="tab" data-menu-tab="kit" aria-controls="menu-panel-kit" aria-selected="false" tabindex="-1"><i>02</i><span>FIELD KIT</span><small>LOADOUT</small></button>
          <button id="menu-tab-streaks" type="button" role="tab" data-menu-tab="streaks" aria-controls="menu-panel-streaks" aria-selected="false" tabindex="-1"><i>03</i><span>STREAKS</span><small>FIVE SLOTS</small></button>
          <button id="menu-tab-operator" type="button" role="tab" data-menu-tab="operator" aria-controls="menu-panel-operator" aria-selected="false" tabindex="-1"><i>04</i><span>OPERATOR</span><small>SKIN + ANIMATION</small></button>
          <button id="menu-tab-options" type="button" role="tab" data-menu-tab="options" aria-controls="menu-panel-options" aria-selected="false" tabindex="-1"><i>05</i><span>OPTIONS</span><small>INPUT + VIDEO</small></button>
        </nav>
        <footer><span>SESSION</span><strong>SECURE / LOCAL</strong><small>${PASS66_RELEASE_IDENTITY.pass}</small></footer>
      </aside>
      <main class="command-workspace">
        ${deploymentPanelMarkup(model)}
        ${fieldKitPanelMarkup()}
        ${killstreakLoadoutPanelMarkup()}
        ${operatorPanelMarkup()}
        ${optionsPanelMarkup()}
      </main>
    </div>
  </section>`;
}

function deploymentTransitionMarkup(): string {
  const preview = menuPreviewVideoDefinition('atomic-acres');
  return `<section id="deployment-transition" hidden aria-hidden="true" aria-live="polite" aria-busy="true" data-arena="atomic-acres" data-media="prerecorded-video" data-live-render="false">
    <img id="deployment-transition-poster" src="${preview.poster}" width="${preview.width}" height="${preview.height}" alt="" decoding="async" fetchpriority="high">
    <video id="deployment-transition-video" width="${preview.width}" height="${preview.height}" muted playsinline preload="none" hidden aria-hidden="true"></video>
    <div class="deployment-transition-scrim" aria-hidden="true"></div>
    <div class="preview-cockpit-hud deployment-cockpit-hud" aria-hidden="true">
      <div class="cockpit-heading"><span>33</span><b>N</b><span>03</span></div>
      <div class="cockpit-instruments"><span><small>ALT</small><b>024 M</b></span><span><small>HDG</small><b>049</b></span><span><small>ROTOR</small><b>ARMED</b></span></div>
    </div>
    <div class="deployment-transition-console">
      <small id="deployment-transition-kicker">${PASS66_RELEASE_IDENTITY.pass} // DEPLOYMENT STREAM</small>
      <strong id="deployment-transition-title">NUKE TOWN</strong>
      <span id="deployment-transition-status">Preparing authoritative arena state…</span>
      <progress id="deployment-transition-progress" max="100" value="0" aria-label="Map loading progress">0%</progress>
      <div class="deployment-transition-progress-meta">
        <output id="deployment-transition-percent">0%</output>
        <output id="deployment-transition-eta">ETA ESTIMATING…</output>
      </div>
      <em id="deployment-transition-stage">DOWNLOADING GLBS, DECODING TEXTURES, PREPARING AUDIO, SHADERS &amp; PHYSICS · 100% = IN GAME</em>
    </div>
  </section>`;
}

function chatMarkup(): string {
  return `<section id="text-chat" hidden aria-label="Room text chat" data-open="false" data-visible="false">
    <header><strong>ROOM CHAT</strong><small id="text-chat-hint">ENTER TO CHAT</small></header>
    <div id="text-chat-log" role="log" aria-live="polite" aria-relevant="additions text"></div>
    <form id="text-chat-form" autocomplete="off">
      <label for="text-chat-input">MESSAGE</label>
      <input id="text-chat-input" type="text" maxlength="${CHAT_TEXT_MAX_CHARS}" autocomplete="off" spellcheck="true" aria-label="Chat message">
      <button type="submit">SEND</button>
    </form>
  </section>`;
}

function hudMarkup(): string {
  return `<div id="hud" hidden data-hud-contract="pass65-responsive-v1">
    <div id="pause-hint">ESC · MENU</div>
    <section class="hud-mission-console" aria-label="Match status">
      <header id="matchbar"><div><span class="tiny" id="match-mode-label">TEAM DEATHMATCH</span><strong id="timer">05:00</strong></div><div id="scoreline"><span class="aqua"><em id="aqua-label">AQUA</em> <b id="aqua-score">0</b></span><i id="score-limit">—</i><span class="coral"><b id="coral-score">0</b> <em id="coral-label">CORAL</em></span></div><div id="connection-pill">SOLO</div></header>
      <div id="objective">NUKE TOWN · FIVE MINUTES · MOST KILLS WINS</div>
      <div class="hud-performance-row"><div id="fps-counter" aria-label="Frame rate"><b>--</b><span>FPS</span></div><div id="network-strip" aria-label="Live player latency"></div></div>
    </section>
    <section class="hud-map-console" aria-label="Tactical map and position">
      <canvas id="minimap" width="360" height="360" aria-label="Tactical minimap"></canvas>
      <div id="map-heading">N · 000°</div>
      <div id="location-label">CIVIC TRANSIT</div>
    </section>
    <section class="hud-operator-console" aria-label="Operator condition">
      <div id="health-block"><div><span>VITALS</span><b id="health">100</b></div><div class="health-track"><i id="health-fill"></i></div></div>
      <div id="combat-stats" aria-label="Match damage"><span>DEALT <b id="damage-dealt">0</b></span><span>TAKEN <b id="damage-taken">0</b></span></div>
      <div id="equipment-block"><span id="stance">STANDING</span><b id="grenades">FRAG ×1</b><small>V KNIFE · G THROW</small></div>
      <div id="room-hud"></div>
    </section>
    <section class="hud-weapon-console" aria-label="Weapon and ammunition">
      <div id="weapon-block">
        <span id="weapon-name">${WEAPONS.carbine.name.toUpperCase()}</span>
        <div class="ammo-row"><b id="ammo">30</b><div class="reserve-stack"><small>RESERVE</small><span><i>/</i><em id="reserve">120</em></span></div></div>
        <small id="reload-state"></small>
        <small id="railgun-status" hidden></small>
      </div>
    </section>
    <aside id="support-block" aria-labelledby="support-title" aria-live="polite">
      <div class="support-heading"><span id="support-title">FIELD SUPPORT</span><strong id="support-streak">STREAK 0</strong></div>
      <div class="support-list" role="list">${fieldSupportRowsMarkup()}</div>
      <small class="support-help">KEYS 3–7 · PAD ◀/▶ SELECT · PAD ▲ ACTIVATE</small>
    </aside>
    <section id="support-combat-feedback" hidden aria-live="polite" data-support-kind="none" data-possessed="false">
      <header><small id="support-platform-name">SUPPORT PLATFORM</small><b id="support-platform-mode">AI FLIGHT</b></header>
      <div class="support-optic-frame" aria-hidden="true"><i></i><i></i><span></span></div>
      <div class="support-platform-readout">
        <span>LINK <b>SECURE</b></span><span>HP <b id="support-platform-health">100</b></span>
        <span>AMMO <b id="support-platform-ammo">--</b></span><span>TIME <b id="support-platform-time">30.0</b></span>
        <span>ALT <b id="support-platform-altitude">0</b>M</span><span>SPD <b id="support-platform-speed">0</b></span>
      </div>
      <strong class="support-damage-total"><span id="chopper-damage-dealt">0</span><small> DAMAGE</small></strong>
      <footer id="support-control-action">PRESS ITS SLOT KEY · OPERATE · AI FLIGHT CONTINUES</footer>
    </section>
    <section id="adrenaline-hud" hidden aria-live="polite">
      <small>ADRENALINE ACTIVE</small><strong><span id="adrenaline-time">15.0</span>S</strong>
    </section>
    <div id="support-interaction-prompt" hidden><kbd>F</kbd><span>COLLECT KILLSTREAK</span><i class="f-hold-progress" aria-hidden="true"><b></b></i></div>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hitmarker">×</div>
    <div id="damage-numbers" aria-live="polite" aria-label="Damage dealt"></div>
    <div id="sniper-scope" hidden aria-label="3x sniper scope"><div class="scope-ring"></div><div class="scope-reticle"><i></i><b></b><span></span><em></em></div><small>3×</small></div>
    <div id="railgun-thermal" hidden aria-label="Railgun 2.5x clear thermal scope" aria-live="off">
      <div class="railgun-scope-window" aria-hidden="true">
        <div class="railgun-scope-glass"></div>
        <div class="railgun-scope-reticle"><i></i><b></b><span></span><em></em></div>
      </div>
      <span>${WEAPONS.railgun.name.toUpperCase()} · 2.5× THERMAL · HOSTILES</span>
    </div>
    <div id="dmr-thermal" hidden aria-label="M14 EBR 2.5x smoke-penetrating thermal scope" aria-live="off"><span>${WEAPONS['m14-ebr'].name.toUpperCase()} · 2.5× THERMAL · FRIEND / FOE</span><div class="dmr-thermal-reticle"><i></i><b></b></div></div>
    <div id="killfeed" aria-live="polite" aria-label="Match events"></div>
    <div id="damage-feeds" aria-label="Damage activity"><section class="damage-feed done" aria-label="Damage dealt"><div id="damage-done-feed" aria-live="polite"></div></section><section class="damage-feed taken" aria-label="Damage received"><div id="damage-taken-feed" aria-live="assertive"></div></section></div>
    <div id="overdrive-hud" hidden><small>2× DAMAGE</small><strong id="overdrive-time">30.0</strong><span>OVERDRIVE</span></div>
    <div id="power-announcement" hidden aria-live="assertive"><small>MID-MAP POWER WEAPON</small><strong>2× DAMAGE</strong><span>30 SECONDS</span></div>
    <div id="pickup-prompt" hidden><kbd>F</kbd><span>PICK UP</span><strong></strong></div>
    <div id="gunner-cockpit-hud" hidden aria-hidden="true" data-support-kind="none" data-hit-confirm="false">
      <div class="gunner-status"><small id="gunner-platform">GUNNER</small><strong id="gunner-weapon-mode">30MM AUTOCANNON</strong><span>AI FLIGHT · OWNER CONTROL</span></div>
      <div class="gunner-reticle" data-centre-clear="true" aria-hidden="true"><span class="north"></span><span class="east"></span><span class="south"></span><span class="west"></span><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>
      <div id="gunner-target-confirm" hidden aria-hidden="true"><span>HIT</span><strong>0</strong></div>
      <!-- HF-335: one legible control strip along the bottom-right rail reading
           LMB GUN | RMB MISSILES xN. The strip itself is gated by the existing
           #gunner-cockpit-hud[data-support-kind] lifecycle in CSS, so no bespoke
           overlay or extra show/hide plumbing is introduced; the missile panel
           keeps its own id, hidden flag and data-ready contract. -->
      <div id="gunner-control-strip" role="group" aria-label="Chopper gunner controls">
        <div id="gunner-gun-control" class="gunner-control" role="group" aria-label="Gun on left mouse button">
          <kbd>LMB</kbd><span>GUN</span><strong class="gunner-control-value"><b id="gunner-control-gun-ammo">&infin;</b></strong>
        </div>
        <div id="gunner-missile-status" class="gunner-control" hidden aria-hidden="true" aria-live="polite" data-ready="false">
          <kbd>RMB</kbd><span>MISSILES</span><strong class="gunner-control-value"><i aria-hidden="true">&times;</i><b id="gunner-missile-ammo">0 / 6</b></strong><em id="gunner-missile-cooldown">OFFLINE</em>
        </div>
      </div>
      <div class="gunner-instruments" aria-hidden="true">
        <div class="gunner-readout"><small>HULL</small><strong id="gunner-hull">100</strong></div>
        <div class="gunner-readout"><small>AMMO</small><strong id="gunner-ammo">&infin;</strong></div>
        <div class="gunner-readout"><small>ALT</small><strong id="gunner-altitude">0M</strong></div>
        <div class="gunner-readout"><small>SPD</small><strong id="gunner-speed">0</strong></div>
        <div class="gunner-readout"><small>TIME</small><strong id="gunner-time">0.0</strong></div>
        <div class="gunner-readout"><small>DAMAGE</small><strong id="gunner-damage">0</strong></div>
      </div>
      <div id="chopper-thermal" hidden aria-hidden="true"><span>THERMAL · THROUGH-WALL AUTOCANNON · HOSTILES</span></div>
    </div>
    <pre id="runtime-error-log" hidden aria-hidden="true"></pre>
    <div id="death-fade" aria-hidden="true"></div>
    <div id="respawn" hidden><strong>ELIMINATED</strong><span id="respawn-countdown">REDEPLOYING</span></div>
    <div id="sticky-warning" hidden role="alert" aria-live="assertive" aria-atomic="true"><small>EXPLOSIVE ATTACHED</small><strong>STUCK</strong></div>
    <div id="countdown" role="status" aria-live="assertive" aria-atomic="true" hidden></div>
    <div id="banner" hidden></div>
    <div id="roster" hidden><h2>FIELD ROSTER</h2><div id="roster-list"></div></div>
  </div>`;
}

let operatorPreviewHandle: ReturnType<typeof mountOperatorPreview> = null;

/**
 * HF-366 + HF-364: the OPERATOR panel owns its own live preview, so the feature
 * ships wired rather than landing as another module with no production caller.
 * The shell's markup is assigned into the document by the caller immediately
 * after this function returns, so the mount is deferred by one frame and then
 * retried for a bounded window in case a caller inserts it later. Everything is
 * a no-op outside a browser, and the preview itself creates no GPU resources
 * until the OPERATOR tab is actually on screen.
 */
function scheduleOperatorPreviewMount(): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  let attempts = 0;
  const attempt = (): void => {
    if (operatorPreviewHandle) return;
    operatorPreviewHandle = mountOperatorPreview(document);
    attempts += 1;
    if (!operatorPreviewHandle && attempts < 120) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

/** The live preview handle, once mounted. Diagnostics and tests only. */
export function operatorPreview(): ReturnType<typeof mountOperatorPreview> {
  return operatorPreviewHandle;
}

export function renderPass64Shell(model: Pass64ShellViewModel): string {
  scheduleOperatorPreviewMount();
  return `<canvas id="game" aria-label="${arenaCanvasLabel(ARENA_SELECTIONS[0]!)}"></canvas>
    <div id="match-pause-backdrop" class="match-pause-backdrop" aria-hidden="true" hidden data-frame-provenance="game-canvas-css-compositor" data-capture-status="empty" data-contract="game-canvas-css-compositor-v1" data-periodic-readback-count="0" data-source-capture-attempt-count="0" data-source-capture-count="0" data-presentation-count="0" data-fallback-count="0"></div>
    <div id="color-grade"></div><div id="film-grain"></div>
    <div id="vignette"></div><div id="low-health-vignette" aria-hidden="true"></div><div id="damage-flash"></div><div id="damage-direction" aria-hidden="true"></div><div id="ordnance-flash" hidden></div><div id="killstreak-logo-flash" hidden></div>
    <div id="nuke-flash" hidden></div>
    <section id="nuke-warning" hidden aria-live="assertive"><small>ATOMIC EVENT</small><strong>NUKE INBOUND</strong><b>5</b><span>SEEK COVER · HOSTILE EVENT</span></section>
    ${menuMarkup(model)}
    ${deploymentTransitionMarkup()}
    ${chatMarkup()}
    ${releaseHistoryDialogMarkup()}
    ${projectMapDialogMarkup()}
    <div id="refresh-warning" hidden><strong>30 HZ DISPLAY LIMIT</strong><span>Set Windows Advanced display or the remote-stream client to 60 Hz+ for synchronized motion.</span></div>
    <section id="strike-map-overlay" hidden aria-label="Support targeting map"><header><span id="strike-target-mode">TRI-PASS</span><strong id="strike-target-instruction">SELECT THREE TARGETS</strong><b id="strike-target-count">0 / 3</b></header><canvas id="strike-map" width="480" height="480"></canvas><footer><strong id="strike-hostile-count">ENEMIES LIVE · 0</strong><span id="strike-target-help">CLICK THREE LOCATIONS · <kbd>ESC</kbd> CANCELS AND REFUNDS</span></footer></section>
    ${hudMarkup()}`;
}
