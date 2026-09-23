const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./legacy-main-enQpHja_.js","./changelog-2L-416DW.js","./preload-helper-d_geVdlX.js","./vendor-three-aHPbjK02.js","./rolldown-runtime-B-1-B7_t.js","./gameplay-CLjw_XSX.js","./combat-feedback-BhVh1Qvu.js","./deterministic-rng-BQQqJEF8.js","./vendor-three-loaders-LNfkXuCO.js","./additional-maps-4DNt5pMv.js","./map-t3vJtFAI.js","./farcrysis-i8XQGDKh.js","./sky-backdrop-NeXnBnPk.js","./release-identity-BoQhyZ_A.js","./high-seas-BG_rJ6GR.js","./test-maps-Ch400swx.js","./gun-range-rack-presentation-D38rlkEx.js","./vendor-peer-BpCmABEN.js","./legacy-main-BYGxmfYB.css","./style-DakOjq2P.css"])))=>i.map(i=>d[i]);
/* empty css               */
import { t as __vitePreload } from "./preload-helper-d_geVdlX.js";
import { n as PASS66_RELEASE_IDENTITY } from "./release-identity-BoQhyZ_A.js";
//#region src/main.ts
try {
	await __vitePreload(() => import("./legacy-main-enQpHja_.js"), __vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]), import.meta.url);
} catch (error) {
	document.documentElement.dataset.renderBackend = "blocked";
	const app = document.querySelector("#app");
	if (app) {
		const message = error instanceof Error ? error.message : String(error);
		app.innerHTML = `<main id="webgpu-gameplay-blocked"><small>${PASS66_RELEASE_IDENTITY.pass} · ${PASS66_RELEASE_IDENTITY.label} · WEBGPU / TSL</small><h1>GAMEPLAY RENDERER BLOCKED</h1><p></p><p>Use <code>?renderer=webgl2</code> only for the explicit rollback-compatible renderer.</p></main>`;
		const paragraph = app.querySelector("p");
		if (paragraph) paragraph.textContent = message;
	}
	throw error;
}
//#endregion
