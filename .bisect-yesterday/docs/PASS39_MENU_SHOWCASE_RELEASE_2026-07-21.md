# Pass 39 — Main-menu Squad Showcase Release

Date: 2026-07-21
Status: promoted to public production after isolated HTTPS and exact-byte review
Functional source revision: `1f6b7248b402d6a129eae285faef188becbe07d5`
Source branch: `overhaul/pass39-menu-showcase`
Reviewed preview revision: `4e43cc90f9f0ce34296dbd04c88b1cdf8aa65c21`
Production `gh-pages` revision: `bca63537f704d702f1fbf23ecc2514b17e2cc1e0`
Rollback revision: `7978c33de7a6ece7a69eaec4bd8d313966782f94`
Public route: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/>
Immutable review route: <https://daveinturkey15-byte.github.io/atomic-acres-v2-preview/review/pass39-menu-showcase-1f6b724-20260721-1230/>

## Change

- Added Dave's supplied 1280×720 JPEG as a decorative main-menu squad showcase.
- Positioned it in a separate fixed region to the right of the 540 px menu panel with a responsive gap, so menu controls never cover the image.
- Hidden on viewports at or below 980 px where a safe side-by-side composition is unavailable.
- Hidden while the expanded Field Kit/private-lobby panel is active and whenever gameplay hides the menu.
- Decorative-only semantics (`aria-hidden`, empty alt) prevent duplicated screen-reader content.

## Verification

- `npx tsc --noEmit` passed.
- Production build passed.
- Vitest: 70 files / 348 tests passed.
- `git diff --check` passed.
- Image asset verified as JPEG, 1280×720, 80,846 bytes; source SHA-256 `a6be60c6920dcce4505f86598ae677bb8af6ff5018ec54fe93258fb6b50fae2f`.
- Responsive geometry checks passed at 1280×720, 1920×1080 and 1024×768 with positive menu/image gaps; the image is deliberately hidden at 900×720.
- Local browser review confirmed the image is right-aligned, unobscured, framed intentionally, hidden for the expanded Field Kit panel, and absent during gameplay.
- Immutable HTTPS review passed with zero JavaScript errors.
- All 57 HTTP-served review and production files match the frozen local artifact byte-for-byte: 20,623,465 bytes, manifest SHA-256 `55926d62fd0319c0bd7239477c4381c59b954095b441998cb19a4b2dca53f6b1`.
- Final live production review confirmed the intended placement. The only console message was the expected unsupported `KHR_parallel_shader_compile` warning.

## Deployment gotcha

The canonical `gh-pages` branch contains historical immutable review directories in addition to the production root. The first root-replacement commit accidentally removed those directories. A forward corrective commit immediately restored all 1,055 tracked `review/` files from the rollback revision while retaining the new production root. Future root promotions must replace only root production files and preserve `review/` explicitly.

## Rollback

Revert production commits `bca63537f704d702f1fbf23ecc2514b17e2cc1e0` and `13297577a2a8412e5a71a21813485a78c8cfc277` as a pair, or restore the root production files from `7978c33de7a6ece7a69eaec4bd8d313966782f94` while preserving the current `review/` directory. Do not delete immutable review builds during rollback.
