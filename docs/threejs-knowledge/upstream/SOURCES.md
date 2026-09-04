# Upstream Three.js documentation snapshots

Dated, unmodified copies of the official Three.js LLM documentation feeds. They exist so an
agent working offline, or one that wants a fast local grep, does not have to re-fetch. **They
are a convenience, not the authority** — when the answer matters, re-fetch from the URL.

| File | Source URL | Fetched | Bytes | SHA-256 |
|---|---|---|---|---|
| `threejs-docs-llms-2026-09-04.txt` | `https://threejs.org/docs/llms.txt` | 2026-09-04 | 5,388 | `409d89ee429023b21bf11d496681d91498c58d92438c370632cf3b3b0a13c9f7` |
| `threejs-docs-llms-full-2026-09-04.txt` | `https://threejs.org/docs/llms-full.txt` | 2026-09-04 | 132,070 | `298c42feb5600bb4c897c6cc696908bfed8ea09c0207de8d0f7f2bf7d4a655a5` |

Both were HTTP 200 and are kept in full: `llms-full.txt` is 132 KB, far under the 5 MB
threshold that would have forced keeping only the index.

## Refresh

```sh
D=$(date +%F)
curl -sSL -o docs/threejs-knowledge/upstream/threejs-docs-llms-$D.txt      https://threejs.org/docs/llms.txt
curl -sSL -o docs/threejs-knowledge/upstream/threejs-docs-llms-full-$D.txt https://threejs.org/docs/llms-full.txt
sha256sum docs/threejs-knowledge/upstream/threejs-docs-llms*-$D.txt
```

Add a row above; keep the previous snapshot until the new one is verified. Never edit a
snapshot in place — a modified "upstream" copy is worse than no copy.

## Version caveat

These feeds track the **published docs**, which follow the released Three.js. The version
installed in this repo is what actually compiles: `three@0.185.1` (`package.json` and
`node_modules/three/package.json` agreed on 2026-09-04). An API read from a doc page or from
upstream `main` that does not exist in `0.185.1` is a bug that type-checks. Point 7 of the
source-priority policy exists for exactly this.
