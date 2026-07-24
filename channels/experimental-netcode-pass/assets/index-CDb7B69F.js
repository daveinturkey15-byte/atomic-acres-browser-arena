const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./main-Dfyb4GaU.js","./vendor-peer-vSyl0g0-.js","./preload-helper-BemplcI3.js","./preload-helper-C5qjly_W.css","./vendor-three-C4vkaCNH.js","./vendor-three-loaders-Oidku-D7.js"])))=>i.map(i=>d[i]);
import{a as e,t}from"./preload-helper-BemplcI3.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var n={schemaVersion:2,canonicalHostname:`daveinturkey15-byte.github.io`,latest:{label:`EXPERIMENTAL NETCODE PASS`,description:`The isolated Pass 61 experimental networking client.`},normal:{label:`NEW NETCODE`,description:`The normal live Pass 60 build.`,pass:`PASS 60`,sourceSha:`b1af49be064610126a80c2ee538af334389f8f43`,pagesSha:`fb06eeeefc42f35d591e9ee340a3adab62916883`,path:`channels/new-netcode`},experimental:{label:`EXPERIMENTAL NETCODE PASS`,description:`Pass 61 host-time, adaptive movement and host-authoritative firearm results.`,pass:`PASS 61`,path:`channels/experimental-netcode-pass`},stable:{label:`RECENT STABLE`,description:`The exact version that was live immediately before the new build.`,pass:`PASS 59`,pagesSha:`b29d44f1f45a6ade65e72738fc4adb58235f6f26`,path:`channels/recent-stable`}};function r(e,t,n){let r=new URLSearchParams(e);if(r.get(`room`)?.trim())return`latest`;let i=r.get(`release`)?.trim().toLowerCase();return i===`latest`?`latest`:i===`stable`?`stable`:i===`choose`||t.toLowerCase()===n.toLowerCase()?`choose`:`latest`}function i(e,t){let n=t.replace(/^\/+|\/+$/g,``);if(!n||n.split(`/`).some(e=>e===`.`||e===`..`))throw Error(`Stable release path must be a safe relative path`);return new URL(`./${n}/`,e).toString()}var a=n,o=e(),s=document.querySelector(`#app`);if(!s)throw Error(`Missing #app root`);var c=s;async function l(){document.title=`Atomic Acres — Browser Arena FPS`,c.replaceChildren(),await t(()=>import(`./main-Dfyb4GaU.js`),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url)}function u(){window.location.assign(i(document.baseURI,a.stable.path))}function d(){document.title=`Choose build — Atomic Acres`,c.innerHTML=`
    <main id="release-channel-gate" aria-labelledby="release-channel-title">
      <section class="release-channel-card">
        <div class="release-channel-eyebrow">ATOMIC ACRES · BUILD SELECT</div>
        <h1 id="release-channel-title">CHOOSE YOUR <span>DEPLOYMENT</span></h1>
        <p>Load the newest approved build, or keep playing the preserved version people already know.</p>
        <div class="release-channel-options">
          <button type="button" class="release-channel-option primary" data-release-choice="latest">
            <small>${o.pass} · LATEST APPROVED</small>
            <strong>${a.latest.label}</strong>
            <span>${a.latest.description}</span>
          </button>
          <button type="button" class="release-channel-option" data-release-choice="stable">
            <small>${a.stable.pass} · PINNED COPY</small>
            <strong>${a.stable.label}</strong>
            <span>${a.stable.description}</span>
          </button>
        </div>
        <footer>The stable copy stays frozen while new releases move forward. You can use your browser's Back button to switch again.</footer>
      </section>
    </main>
  `,c.querySelector(`[data-release-choice="latest"]`)?.addEventListener(`click`,()=>{let e=new URL(window.location.href);e.searchParams.set(`release`,`latest`),window.history.replaceState(null,``,e),l()}),c.querySelector(`[data-release-choice="stable"]`)?.addEventListener(`click`,u)}var f=r(window.location.search,window.location.hostname,a.canonicalHostname);f===`choose`?d():f===`stable`?u():l();