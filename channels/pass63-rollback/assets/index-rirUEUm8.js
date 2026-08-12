const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./main-BVGFg3jz.js","./vendor-peer-vSyl0g0-.js","./preload-helper-sDs5rksm.js","./preload-helper-DXqZTwxt.css","./vendor-three-C8G6ZTW4.js","./vendor-three-loaders-BusXIR_G.js","./main-C4eZpOpU.css"])))=>i.map(i=>d[i]);
import{o as e,s as t,t as n}from"./preload-helper-sDs5rksm.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function r(e,t,n){let r=new URLSearchParams(e);if(r.get(`room`)?.trim())return`latest`;let i=r.get(`release`)?.trim().toLowerCase();return i===`latest`||i===`normal`||i===`experimental`?`latest`:i===`stable`?`stable`:i===`choose`||t.toLowerCase()===n.toLowerCase()?`choose`:`latest`}function i(e,t){let n=t.replace(/^\/+|\/+$/g,``);if(!n||n.split(`/`).some(e=>e===`.`||e===`..`))throw Error(`Stable release path must be a safe relative path`);let r=new URL(`./${n}/`,e);return r.searchParams.set(`release`,`latest`),r.toString()}var a=t,o=e(),s=document.querySelector(`#app`);if(!s)throw Error(`Missing #app root`);var c=s;async function l(){document.title=`Atomic Acres — Browser Arena FPS`,c.replaceChildren(),await n(()=>import(`./main-BVGFg3jz.js`),__vite__mapDeps([0,1,2,3,4,5,6]),import.meta.url)}function u(){window.location.assign(i(document.baseURI,a.stable.path))}function d(){document.title=`Choose build — Atomic Acres`,c.innerHTML=`
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