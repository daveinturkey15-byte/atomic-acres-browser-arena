# Desky build bootstrap — Atomic Acres

This repository is the canonical, portable source for Atomic Acres builds. Desky should fetch it from GitHub rather than relying on files copied from Jigglyclaw's machine.

## Canonical source

- Repository: `https://github.com/daveinturkey15-byte/atomic-acres-browser-arena`
- Source branch for this reviewed candidate: `feature/skyline-terminal-review`
- Package manager: npm (`package-lock.json`)
- Production hosting branch: `gh-pages` — deployable output only; do not use it as the editable source tree.

```bash
git clone https://github.com/daveinturkey15-byte/atomic-acres-browser-arena.git
cd atomic-acres-browser-arena
git fetch origin --prune
git switch --track origin/feature/skyline-terminal-review
npm ci
npm run qa:asset-provenance
npm run verify:pass25a:core
```

Pin a handoff to an exact reviewed commit when one is supplied. Do not infer that a newer commit on another branch contains the latest production functionality; verify required ancestry first.

## Included build inputs

The repository contains both deployable assets and their editable/reconstructable inputs:

- `public/assets/` — runtime assets copied into the Vite build.
- `source-assets/blender/` — versioned `.blend` sources, specs, and provenance for the authored Blender environments/models.
- `source-assets/menu/` — full-resolution original menu image plus generation prompt/provenance.
- `scripts/blender/` — deterministic Blender generators, including `create-rustworks-central-tower.py`.
- `scripts/audio/` and texture-generation scripts — original audio/texture generators.
- `assets.manifest.json` — canonical provenance, licences, hashes, and source links.

The Rustworks runtime model is not a Jigglyclaw-only binary: its GLB, editable Blender source, and generator are all versioned. The menu image is original project art with its source PNG and generation provenance versioned beside it.

## Mechanical gates

Run these before accepting or handing off a build:

```bash
npm run qa:asset-provenance
npm run lint
npm test
npm run build
npm run verify:release-tree
npm audit --omit=dev
```

`qa:asset-provenance` fails if any `public/assets/**` file lacks manifest coverage, a declared source file is missing, or a declared SHA-256 no longer matches. Do not waive or weaken this gate; correct the manifest/source asset or remove the unapproved runtime asset.

## Blender rebuilds

Blender assets are committed so Desky can modify them without regeneration. When regeneration is needed, use the matching repository script and compare the resulting asset semantically and in-engine; Blender version differences may prevent byte-identical GLBs.

Example:

```bash
blender --background --factory-startup --python scripts/blender/create-rustworks-central-tower.py
```

After a deliberate rebuild, update the runtime/source SHA-256 values in `assets.manifest.json`, run the provenance gate, then run the full gameplay/build/browser verification. Do not modify third-party licence files.

## Handoff rule

A valid Desky handoff names:

1. repository URL;
2. exact branch and commit;
3. required source-head ancestry;
4. expected asset-provenance result;
5. exact test/build commands;
6. whether push/deploy is authorized.

If any named path is absent after checkout, Desky should report `BLOCKED→` with `git rev-parse HEAD`, branch, missing path, and the failed command rather than reconstructing from memory or an unrelated machine copy.
