const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./legacy-main-B2rqRXEO.js","./vendor-peer-CPnTsciW.js","./changelog-Bsxmh-5B.js","./preload-helper-d_geVdlX.js","./vendor-three-VV5gneRl.js","./gameplay-D7mQKMV7.js","./vendor-three-loaders-ChXO8WLw.js","./additional-maps-CaqfawcT.js","./combat-feedback-bO2zzrSz.js","./farcrysis-Bte6TqEY.js","./sky-backdrop-6F0V0pgq.js","./release-identity-COb05uKQ.js","./high-seas-CzSFpiSU.js","./gun-range-rack-presentation-BFlDcKf0.js","./map-6sdiIB8g.js","./legacy-main-BjtD-D7M.css","./style-DZ9EiXX0.css"])))=>i.map(i=>d[i]);
/* empty css               */
import { t as __vitePreload } from "./preload-helper-d_geVdlX.js";
import { n as PASS66_RELEASE_IDENTITY } from "./release-identity-COb05uKQ.js";
//#region src/main.ts
try {
	await __vitePreload(() => import("./legacy-main-B2rqRXEO.js"), __vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]), import.meta.url);
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
