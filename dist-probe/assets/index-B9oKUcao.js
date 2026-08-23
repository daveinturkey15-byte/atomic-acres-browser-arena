const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./main-Dch57e4o.js","./preload-helper-d_geVdlX.js","./release-identity-COb05uKQ.js","./style-DZ9EiXX0.css"])))=>i.map(i=>d[i]);
import { n as PENDING_PRODUCTION_RELEASE, s as release_channels_default, t as CHANGELOG } from "./changelog-Bsxmh-5B.js";
/* empty css               */
import { t as __vitePreload } from "./preload-helper-d_geVdlX.js";
//#region \0vite/modulepreload-polyfill.js
(function polyfill() {
	const relList = document.createElement("link").relList;
	if (relList && relList.supports && relList.supports("modulepreload")) return;
	for (const link of document.querySelectorAll("link[rel=\"modulepreload\"]")) processPreload(link);
	new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") continue;
			for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
		}
	}).observe(document, {
		childList: true,
		subtree: true
	});
	function getFetchOpts(link) {
		const fetchOpts = {};
		if (link.integrity) fetchOpts.integrity = link.integrity;
		if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
		if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
		else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
		else fetchOpts.credentials = "same-origin";
		return fetchOpts;
	}
	function processPreload(link) {
		if (link.ep) return;
		link.ep = true;
		const fetchOpts = getFetchOpts(link);
		fetch(link.href, fetchOpts);
	}
})();
//#endregion
//#region src/release-channel.ts
function releaseChannelDecision(search, hostname, canonicalHostname) {
	const params = new URLSearchParams(search);
	if (params.get("room")?.trim()) return "latest";
	const requested = params.get("release")?.trim().toLowerCase();
	if (requested === "latest" || requested === "normal" || requested === "experimental") return "latest";
	if (requested === "stable") return "stable";
	if (requested === "choose") return "choose";
	return hostname.toLowerCase() === canonicalHostname.toLowerCase() ? "choose" : "latest";
}
function stableReleaseUrl(baseUri, configuredPath) {
	const path = configuredPath.replace(/^\/+|\/+$/g, "");
	if (!path || path.split("/").some((part) => part === "." || part === "..")) throw new Error("Stable release path must be a safe relative path");
	const target = new URL(`./${path}/`, baseUri);
	target.searchParams.set("release", "latest");
	return target.toString();
}
//#endregion
//#region src/bootstrap.ts
var releaseChannels = release_channels_default;
var stableFallback = releaseChannels.rollback ?? releaseChannels.stable;
var newestBuildIsPublished = CHANGELOG[0]?.releasedAt !== PENDING_PRODUCTION_RELEASE;
var latestDescription = newestBuildIsPublished ? "The approved Pass 70 gameplay and presentation build." : "The local Pass 70 HITL candidate. Publication remains disabled until owner approval.";
var appElement = document.querySelector("#app");
if (!appElement) throw new Error("Missing #app root");
var app = appElement;
async function loadLatestBuild() {
	document.title = "Nuke Town — Browser Arena FPS";
	app.replaceChildren();
	await __vitePreload(() => import("./main-Dch57e4o.js"), __vite__mapDeps([0,1,2,3]), import.meta.url);
}
function openStableBuild() {
	window.location.assign(stableReleaseUrl(document.baseURI, stableFallback.path));
}
function showReleaseChooser() {
	document.title = "Choose build — Nuke Town";
	app.innerHTML = `
    <main id="release-channel-gate" aria-labelledby="release-channel-title">
      <section class="release-channel-card">
        <div class="release-channel-eyebrow">NUKE TOWN · BUILD SELECT</div>
        <h1 id="release-channel-title">CHOOSE YOUR <span>DEPLOYMENT</span></h1>
        <p>${newestBuildIsPublished ? "Load the newest approved build" : "Review the current release candidate"}, or keep playing the preserved version people already know.</p>
        <div class="release-channel-options">
          <button type="button" class="release-channel-option primary" data-release-choice="latest">
            <small>${releaseChannels.experimental.pass} · ${newestBuildIsPublished ? "LIVE" : "RELEASE CANDIDATE"}</small>
            <strong>${releaseChannels.latest.label}</strong>
            <span>${latestDescription}</span>
          </button>
          <button type="button" class="release-channel-option" data-release-choice="stable">
            <small>${stableFallback.pass} · STABLE WEBGL</small>
            <strong>${stableFallback.label}</strong>
            <span>${stableFallback.description}</span>
          </button>
        </div>
        <section class="release-channel-refresh" aria-label="Refresh this version chooser">
          <div><strong>VERSION NOT UPDATED?</strong><span>Press Ctrl+Shift+R, or use the same hard game refresh available in Options.</span></div>
          <button id="release-channel-hard-refresh" type="button">HARD RESET / REFRESH</button>
        </section>
        <footer>The stable copy stays frozen while new releases move forward. You can use your browser's Back button to switch again.</footer>
      </section>
    </main>
  `;
	app.querySelector("[data-release-choice=\"latest\"]")?.addEventListener("click", () => {
		const next = new URL(window.location.href);
		next.searchParams.set("release", "latest");
		window.history.replaceState(null, "", next);
		loadLatestBuild();
	});
	app.querySelector("[data-release-choice=\"stable\"]")?.addEventListener("click", openStableBuild);
	app.querySelector("#release-channel-hard-refresh")?.addEventListener("click", async (event) => {
		const button = event.currentTarget;
		button.disabled = true;
		try {
			if ("caches" in window) {
				const keys = await window.caches.keys();
				await Promise.all(keys.map((key) => window.caches.delete(key)));
			}
		} finally {
			const url = new URL(window.location.href);
			url.searchParams.set("cachebust", String(Date.now()));
			window.location.replace(url.toString());
		}
	});
}
var decision = releaseChannelDecision(window.location.search, window.location.hostname, releaseChannels.canonicalHostname);
if (decision === "choose") showReleaseChooser();
else if (decision === "stable") openStableBuild();
else loadLatestBuild();
//#endregion
