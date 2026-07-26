import { WEAPONS } from '../gameplay';
import { FIELD_KITS } from '../loadout';
import { ARENA_SELECTIONS } from '../map-selection';
import { CHAT_TEXT_MAX_CHARS } from '../text-chat';
import { projectMapButtonMarkup, projectMapDialogMarkup } from './project-map-dialog';
import { releaseHistoryButtonMarkup, releaseHistoryDialogMarkup } from './release-history-dialog';

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
    releaseLabel: 'PASS 64 · HITL CANDIDATE',
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
  return FIELD_KITS.map((kit) => `<button type="button" class="kit-card" data-kit-id="${kit.id}">
    <span>${kit.role}</span>
    <strong>${kit.title}</strong>
    <b>${WEAPONS[kit.weapon].name} · ${WEAPONS[kit.sidearm].name}</b>
    <p>${kit.summary}</p>
    <i>${kit.traits.join(' · ')}</i>
    <em>SELECTED</em>
  </button>`).join('');
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
        <img class="preview-poster" src="./assets/original/menu/atomic-acres-menu-squad-joke.jpg?v=20260722-mapshot-operators" alt="" decoding="async">
        <div id="menu-preview-frame" data-frame="helicopter" data-arena="atomic-acres" data-motion="orbit">
          <div class="preview-helicopter" data-cockpit-asset="pass65-sleek-cockpit-v1" data-asset-owner="atomic-acres-original">
            <i class="cockpit-spine"></i><i class="cockpit-strut cockpit-strut-left"></i><i class="cockpit-strut cockpit-strut-right"></i>
            <span class="cockpit-canopy-glass"></span>
            <span class="cockpit-glareshield"><em></em><em></em><em></em><strong>AA // NAV</strong></span>
            <b id="menu-preview-flight-data">ALT 018 // SPD 064</b>
          </div>
          <div class="preview-cat"><i></i><i></i><b></b><b></b><span>CAT-CAM</span></div>
          <div class="preview-reticle"><i></i><b></b></div>
        </div>
        <div class="showcase-telemetry"><span id="menu-preview-label">HELO FLYOVER // NUKE TOWN</span><b id="menu-preview-motion">LIVE ORBIT</b></div>
      </aside>
      <section id="map-selector" class="map-selector" aria-label="Choose map">
        <div class="map-selector-heading"><span>THEATRE INDEX</span><small>Four deployable spaces · choose before launch</small></div>
        <div class="map-card-grid">${mapCardsMarkup()}</div>
      </section>
    </section>
    <aside class="deployment-manifest" aria-label="Deployment manifest">
      <header class="manifest-heading"><small>DEPLOYMENT MANIFEST</small><strong>OPERATOR + SESSION</strong><span>Configure identity, kit and lobby channel.</span></header>
      <div class="setup-grid">
        <label>CALLSIGN<input id="player-name" maxlength="16" autocomplete="nickname" required aria-describedby="player-name-error" placeholder="Enter callsign" value="${model.playerName}"><small id="player-name-error" class="input-error" hidden>Enter a callsign before deployment.</small></label>
        <label>SQUAD<select id="team"><option value="0">Aqua</option><option value="1">Coral</option></select></label>
      </div>
      <div id="selected-kit-summary" class="selected-kit-summary"></div>
      <button id="field-kit-redeploy" type="button" hidden>REDEPLOY NOW WITH SELECTED FIELD KIT</button>
      <div class="menu-actions">
        <button id="resume" class="primary" hidden>RETURN TO MATCH</button>
        <button id="main-menu" hidden>MAIN MENU · CHANGE MAP</button>
        <button id="solo" class="primary">BOT SKIRMISH</button>
        <button id="host">HOST LOBBY</button>
      </div>
      <div class="join-row"><input id="room-input" placeholder="Paste room code" autocomplete="off"><button id="join">JOIN</button></div>
      <div id="room-card" hidden><span>ROOM CODE</span><strong id="room-code"></strong><button id="copy-room" class="small-button" aria-label="Copy lobby code">COPY CODE</button></div>
      <section id="private-lobby" hidden aria-labelledby="private-lobby-title">
        <div class="private-lobby-heading"><span><small>PRIVATE MATCH</small><strong id="private-lobby-title">WAITING ROOM</strong></span><b id="lobby-capacity-label">1 / 4</b></div>
        <div class="lobby-settings">
          <label>MODE<select id="lobby-mode"><option value="tdm">TEAM DEATHMATCH</option><option value="ffa">FREE FOR ALL</option></select></label>
          <label>CAPACITY<select id="lobby-capacity"><option value="4">4 PLAYERS</option><option value="6">6 PLAYERS</option></select></label>
          <label>HOSTED BOTS<select id="lobby-bots"><option value="0">NO BOTS</option><option value="2">2 BOTS</option><option value="4">4 BOTS</option></select></label>
          <label class="lobby-check"><input id="lobby-auto-balance" type="checkbox" checked> AUTO BALANCE</label>
          <button id="lobby-balance" type="button">BALANCE TEAMS</button>
        </div>
        <div id="lobby-roster" class="lobby-roster"></div>
        <div class="lobby-actions">
          <button id="lobby-ready" type="button">READY</button>
          <button id="lobby-start" class="primary" type="button" disabled>START MATCH</button>
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
    <div class="kit-heading"><div><b>FIELD KIT</b><span>Choose the primary and issued sidearm.</span></div><small>Changes made mid-life queue for the next deployment.</small></div>
    <div class="kit-grid">${fieldKitCardsMarkup()}</div>
  </div>`;
}

function optionsPanelMarkup(): string {
  return `<div id="menu-panel-options" class="menu-panel" role="tabpanel" aria-labelledby="menu-tab-options" data-menu-panel="options" hidden>
    <div class="options-heading"><b>OPTIONS</b><span>Input and view settings apply immediately.</span></div>
    <div class="settings-grid">
      <label>MOUSE SENSITIVITY<input id="sensitivity" type="range" min="0.6" max="2" step="0.05" value="1"></label>
      <label>CONTROLLER LOOK<input id="controller-sensitivity" type="range" min="0.5" max="1.8" step="0.05" value="1"></label>
      <label>FIELD OF VIEW<input id="field-of-view" type="range" min="70" max="100" step="1" value="82"></label>
      <label>GRAPHICS<select id="graphics-profile"><option value="performance">PERFORMANCE</option><option value="blender">QUALITY GRAPHICS</option></select></label>
    </div>
    <div class="controls"><b>WASD</b> move · <b>SHIFT</b> sprint · <b>C</b> crouch · <b>Z/CTRL</b> prone · <b>SPACE</b> jump · <b>RMB</b> ADS · <b>LMB</b> fire · <b>R</b> reload · <b>V</b> knife · <b>G</b> frag · <b>F</b> weapon pickup · <b>WALK OVER DROPS</b> ammo/frag · <b>1/2</b> primary/sidearm · <b>TAB</b> roster · <b>ENTER</b> chat<br><b>PAD</b> left stick move · right stick aim · <b>LT/RT</b> ADS/fire · <b>A</b> jump · <b>B</b> crouch · <b>D-PAD DOWN</b> prone · <b>X</b> reload · <b>Y</b> switch · <b>RB</b> knife</div>
    <p class="legal">Fan-made original arena. No Activision assets, branding, code or ripped map geometry. Keyboard/mouse and standard gamepads supported.</p>
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
          <button id="menu-tab-options" type="button" role="tab" data-menu-tab="options" aria-controls="menu-panel-options" aria-selected="false" tabindex="-1"><i>03</i><span>OPTIONS</span><small>INPUT + VIDEO</small></button>
        </nav>
        <footer><span>SESSION</span><strong>SECURE / LOCAL</strong><small>HITL REVIEW DECK</small></footer>
      </aside>
      <main class="command-workspace">
        ${deploymentPanelMarkup(model)}
        ${fieldKitPanelMarkup()}
        ${optionsPanelMarkup()}
      </main>
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
  return `<div id="hud" hidden>
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
      <div id="equipment-block"><span id="stance">STANDING</span><b id="grenades">FRAG ×2</b><small>V KNIFE · G THROW</small></div>
      <div id="room-hud"></div>
    </section>
    <section class="hud-weapon-console" aria-label="Weapon and ammunition">
      <div id="weapon-block">
        <span id="weapon-name">M86 CARBINE</span>
        <div class="ammo-row"><b id="ammo">30</b><div class="reserve-stack"><small>RESERVE</small><span><i>/</i><em id="reserve">120</em></span></div></div>
        <small id="reload-state"></small>
        <small id="railgun-status" hidden></small>
      </div>
    </section>
    <aside id="support-block" aria-label="Field support">
      <div class="support-heading"><span>FIELD SUPPORT</span><strong id="support-streak">STREAK 0</strong></div>
      <div class="support-list">
        <b data-support="scout-sweep"><span class="support-meta"><kbd>3</kbd><small>3 KILLS</small></span><span class="support-name">SCOUT SWEEP</span><em class="support-state">LOCKED</em></b>
        <b data-support="yardhawk"><span class="support-meta"><kbd>4</kbd><small>5 KILLS</small></span><span class="support-name">YARDHAWK</span><em class="support-state">LOCKED</em></b>
        <b data-support="tri-pass"><span class="support-meta"><kbd>5</kbd><small>7 KILLS</small></span><span class="support-name">TRI-PASS</span><em class="support-state">LOCKED</em></b>
        <b data-support="hunter-swarm"><span class="support-meta"><kbd>6</kbd><small>8 KILLS</small></span><span class="support-name">HUNTER SWARM</span><em class="support-state">LOCKED</em></b>
        <b data-support="nuke"><span class="support-meta"><kbd>7</kbd><small>15 KILLS</small></span><span class="support-name">NUKE</span><em class="support-state">LOCKED</em></b>
      </div>
      <small class="support-help">KEYS 3–7 · PAD ◀/▶ SELECT · PAD ▲ ACTIVATE</small>
    </aside>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hitmarker">×</div>
    <div id="damage-numbers" aria-live="polite" aria-label="Damage dealt"></div>
    <div id="sniper-scope" hidden aria-label="3x sniper scope"><div class="scope-ring"></div><div class="scope-reticle"><i></i><b></b><span></span><em></em></div><small>3×</small></div>
    <div id="railgun-thermal" hidden aria-label="Railgun thermal scope" aria-live="off"><span>VX-8 THERMAL · HOSTILES</span></div>
    <div id="killfeed" aria-live="polite" aria-label="Match events"></div>
    <div id="damage-feeds" aria-label="Damage activity"><section class="damage-feed done" aria-label="Damage dealt"><div id="damage-done-feed" aria-live="polite"></div></section><section class="damage-feed taken" aria-label="Damage received"><div id="damage-taken-feed" aria-live="assertive"></div></section></div>
    <div id="overdrive-hud" hidden><small>2× DAMAGE</small><strong id="overdrive-time">30.0</strong><span>OVERDRIVE</span></div>
    <div id="power-announcement" hidden aria-live="assertive"><small>MID-MAP POWER WEAPON</small><strong>2× DAMAGE</strong><span>30 SECONDS</span></div>
    <div id="pickup-prompt" hidden><kbd>F</kbd><span>PICK UP</span><strong></strong></div>
    <div id="respawn" hidden><strong>ELIMINATED</strong><span id="respawn-countdown">REDEPLOYING</span></div>
    <div id="countdown" hidden></div>
    <div id="banner" hidden></div>
    <div id="roster" hidden><h2>FIELD ROSTER</h2><div id="roster-list"></div></div>
  </div>`;
}

export function renderPass64Shell(model: Pass64ShellViewModel): string {
  return `<canvas id="game" aria-label="Nuke Town multiplayer arena"></canvas>
    <div id="color-grade"></div><div id="film-grain"></div>
    <div id="vignette"></div><div id="damage-flash"></div><div id="damage-direction"><i></i></div>
    <div id="nuke-flash" hidden></div>
    <section id="nuke-warning" hidden aria-live="assertive"><small>ATOMIC EVENT</small><strong>NUKE INBOUND</strong><b>5</b><span>SEEK COVER · HOSTILE EVENT</span></section>
    ${menuMarkup(model)}
    ${chatMarkup()}
    ${releaseHistoryDialogMarkup()}
    ${projectMapDialogMarkup()}
    <div id="refresh-warning" hidden><strong>30 HZ DISPLAY LIMIT</strong><span>Set Windows Advanced display or the remote-stream client to 60 Hz+ for synchronized motion.</span></div>
    <section id="strike-map-overlay" hidden aria-label="Tri-Pass tactical targeting map"><header><span>TRI-PASS</span><strong>SELECT THREE TARGETS</strong><b id="strike-target-count">0 / 3</b></header><canvas id="strike-map" width="480" height="480"></canvas><footer><strong id="strike-hostile-count">ENEMIES LIVE · 0</strong><span>CLICK THREE LOCATIONS · <kbd>ESC</kbd> CANCELS AND REFUNDS</span></footer></section>
    ${hudMarkup()}`;
}
