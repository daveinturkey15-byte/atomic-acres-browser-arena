const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./main-ZWtcij5f.js","./preload-helper-B4lneSWH.js","./preload-helper-DwyImu5v.css","./release-identity-COpDpLVV.js"])))=>i.map(i=>d[i]);
import{t as e}from"./release-channels-uGLX39Bj.js";import{t}from"./preload-helper-B4lneSWH.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function n(e,t,n){let r=new URLSearchParams(e);if(r.get(`room`)?.trim())return`latest`;let i=r.get(`release`)?.trim().toLowerCase();return i===`latest`||i===`normal`||i===`experimental`?`latest`:i===`stable`?`stable`:i===`choose`||t.toLowerCase()===n.toLowerCase()?`choose`:`latest`}function r(e,t){let n=t.replace(/^\/+|\/+$/g,``);if(!n||n.split(`/`).some(e=>e===`.`||e===`..`))throw Error(`Stable release path must be a safe relative path`);let r=new URL(`./${n}/`,e);return r.searchParams.set(`release`,`latest`),r.toString()}var i=e,a=document.querySelector(`#app`);if(!a)throw Error(`Missing #app root`);var o=a;async function s(){document.title=`Nuke Town — Browser Arena FPS`,o.replaceChildren(),await t(()=>import(`./main-ZWtcij5f.js`),__vite__mapDeps([0,1,2,3]),import.meta.url)}function c(){window.location.assign(r(document.baseURI,i.stable.path))}function l(e){let t=new URL(`./${e.replace(/^\/+|\/+$/g,``)}/`,document.baseURI);t.searchParams.set(`release`,`latest`),window.location.assign(t.toString())}function u(){document.title=`Choose build — Nuke Town`,o.innerHTML=`
    <main id="release-channel-gate" aria-labelledby="release-channel-title">
      <section class="release-channel-card">
        <div class="release-channel-eyebrow">NUKE TOWN · BUILD SELECT</div>
        <h1 id="release-channel-title">CHOOSE YOUR <span>DEPLOYMENT</span></h1>
        <p>Load the newest approved build, or keep playing the preserved version people already know.</p>
        <div class="release-channel-options">
          ${i.prePass?`
          <button type="button" class="release-channel-option" data-release-choice="pre-pass">
            <small>${i.prePass.pass} · PRE-PASS</small>
            <strong>${i.prePass.label}</strong>
            <span>${i.prePass.description}</span>
          </button>`:``}
          <button type="button" class="release-channel-option primary" data-release-choice="latest">
            <small>${i.experimental.pass} · LIVE TARGET</small>
            <strong>${i.latest.label}</strong>
            <span>${i.latest.description}</span>
          </button>
          <button type="button" class="release-channel-option" data-release-choice="stable">
            <small>${i.stable.pass} · PINNED COPY</small>
            <strong>${i.stable.label}</strong>
            <span>${i.stable.description}</span>
          </button>
        </div>
        <footer>The stable copy stays frozen while new releases move forward. You can use your browser's Back button to switch again.</footer>
      </section>
    </main>
  `,o.querySelector(`[data-release-choice="latest"]`)?.addEventListener(`click`,()=>{let e=new URL(window.location.href);e.searchParams.set(`release`,`latest`),window.history.replaceState(null,``,e),s()}),o.querySelector(`[data-release-choice="pre-pass"]`)?.addEventListener(`click`,()=>{i.prePass&&l(i.prePass.path)}),o.querySelector(`[data-release-choice="stable"]`)?.addEventListener(`click`,c)}var d=n(window.location.search,window.location.hostname,i.canonicalHostname);d===`choose`?u():d===`stable`?c():s();