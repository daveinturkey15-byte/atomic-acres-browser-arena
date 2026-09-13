# Historical acceptance records

Passes 80, 94 and 95 were added on the recovered contribution line and were never accepted on main. Their exact Git blobs are preserved here, including unfinished states and missing approval. Moving a record does not make that historical release approved.

`archive-map.json` binds each archived file to its original blob at the recovered baseline. `requirement-projection.json` accounts for every original requirement and identifies the retained product obligation in the current Pass 96 candidate. All 22 original IDs must remain accounted for exactly once. Pass-specific implementation restrictions remain historical; current gameplay and verification obligations remain required.

The active candidate is `acceptance/pass-96.json`, matching the already existing release identity. Its unfinished states and null preview/approval deliberately leave acceptance red until actual verification and owner review. The existing multiplayer soak remains required; later feature notes did not waive it. Existing accepted manifests are unchanged. The ordinary one-manifest selector and all browser/release guards remain in force.

`src/acceptance-archive-coverage.test.ts` protects byte identity, complete requirement coverage and valid projection targets, including negative cases for omissions and duplicates. This is a preservation check, not an acceptance or publication grant.
