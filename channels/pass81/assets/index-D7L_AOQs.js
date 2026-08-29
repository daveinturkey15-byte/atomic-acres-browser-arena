const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./main-DWodmV-e.js","./preload-helper-DYl5dUZ5.js","./release-identity-2kiKd6G2.js","./style-AqIoN6Oe.css"])))=>i.map(i=>d[i]);
import{n as e,s as t,t as n}from"./changelog-DPZnVrXq.js";/* empty css              */import{t as r}from"./preload-helper-DYl5dUZ5.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();function i(e,t,n){let r=new URLSearchParams(e);if(r.get(`room`)?.trim())return`latest`;let i=r.get(`release`)?.trim().toLowerCase();return i===`latest`||i===`normal`||i===`experimental`?`latest`:i===`stable`?`stable`:i===`choose`||t.toLowerCase()===n.toLowerCase()?`choose`:`latest`}function a(e,t){let n=t.replace(/^\/+|\/+$/g,``);if(!n||n.split(`/`).some(e=>e===`.`||e===`..`))throw Error(`Stable release path must be a safe relative path`);let r=new URL(`./${n}/`,e);return r.searchParams.set(`release`,`latest`),r.toString()}var o=t,s=o.rollback??o.stable,c=n[0]?.releasedAt!==e,l=c?o.latest.description:`${o.latest.description} Local HITL candidate - not yet published.`,u=document.querySelector(`#app`);if(!u)throw Error(`Missing #app root`);var d=u;function f(){try{let e=localStorage.getItem(`atomic-acres:renderer-fallback:v1`);if(!e)return;if(JSON.parse(e).userAgent!==navigator.userAgent){localStorage.removeItem(`atomic-acres:renderer-fallback:v1`);return}let t=new URL(window.location.href);if(t.searchParams.has(`renderer`))return;t.searchParams.set(`renderer`,`webgl2`),window.history.replaceState(null,``,t)}catch{}}async function p(){document.title=`Nuke Town — Browser Arena FPS`,f(),d.replaceChildren(),await r(()=>import(`./main-DWodmV-e.js`),__vite__mapDeps([0,1,2,3]),import.meta.url)}function m(){window.location.assign(a(document.baseURI,s.path))}function h(){document.title=`Choose build — Nuke Town`,d.innerHTML=`
    <main id="release-channel-gate" aria-labelledby="release-channel-title">
      <section class="release-channel-card">
        <div class="release-channel-eyebrow">NUKE TOWN · BUILD SELECT</div>
        <h1 id="release-channel-title">CHOOSE YOUR <span>DEPLOYMENT</span></h1>
        <p>${c?`Load the newest approved build`:`Review the current release candidate`}, or keep playing the preserved version people already know.</p>
        <div class="release-channel-options">
          <button type="button" class="release-channel-option primary" data-release-choice="latest">
            <small>${o.experimental.pass} · ${c?`LIVE`:`RELEASE CANDIDATE`}</small>
            <strong>${o.latest.label}</strong>
            <span>${l}</span>
          </button>
          <button type="button" class="release-channel-option" data-release-choice="stable">
            <small>${s.pass} · STABLE WEBGL</small>
            <strong>${s.label}</strong>
            <span>${s.description}</span>
          </button>
        </div>
        <section class="release-channel-refresh" aria-label="Refresh this version chooser">
          <div><strong>VERSION NOT UPDATED?</strong><span>Press Ctrl+Shift+R, or use the same hard game refresh available in Options.</span></div>
          <button id="release-channel-hard-refresh" type="button">HARD RESET / REFRESH</button>
        </section>
        <footer>The stable copy stays frozen while new releases move forward. You can use your browser's Back button to switch again.</footer>
      </section>
    </main>
  `,d.querySelector(`[data-release-choice="latest"]`)?.addEventListener(`click`,()=>{let e=new URL(window.location.href);e.searchParams.set(`release`,`latest`),window.history.replaceState(null,``,e),p()}),d.querySelector(`[data-release-choice="stable"]`)?.addEventListener(`click`,m),d.querySelector(`#release-channel-hard-refresh`)?.addEventListener(`click`,async e=>{let t=e.currentTarget;t.disabled=!0;try{if(`caches`in window){let e=await window.caches.keys();await Promise.all(e.map(e=>window.caches.delete(e)))}}finally{let e=new URL(window.location.href);e.searchParams.set(`cachebust`,String(Date.now())),window.location.replace(e.toString())}})}var g=i(window.location.search,window.location.hostname,o.canonicalHostname);g===`choose`?h():g===`stable`?m():p();