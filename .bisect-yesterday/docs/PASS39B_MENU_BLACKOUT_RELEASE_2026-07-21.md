# Pass 39B — Black Main-menu Backdrop Release

Date: 2026-07-21
Status: live in production
Functional source revision: `8e2617ef452903ea5584926a29f82b6cd7780a42`
Source branch: `overhaul/pass39b-menu-blackout`
Immutable review revision: `a4c7f2b16ce5e854143276e783aba51f153ec2aa`
Production revision: `2399798b34676a24e33582f490943137e2fa5911`
Rollback revision: `bca63537f704d702f1fbf23ecc2514b17e2cc1e0`
Public URL: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/>
Review URL: <https://daveinturkey15-byte.github.io/atomic-acres-v2-preview/review/pass39b-menu-blackout-8e2617e/>

## Requested revision

- Removed the visible 3D arena render from all menu states.
- Made the remaining area solid black.
- Enlarged the supplied squad image to consume the available right-side region.
- Reduced the 1280 px desktop gap between the menu and image to approximately 12.8 px without overlap.
- Preserved normal 3D rendering when the menu is hidden for gameplay.
- Preserved the narrow-layout rule: the image is hidden at 980 px and below rather than covering controls.

## Verification

- TypeScript passed.
- Production build passed.
- Vitest: 70 files / 348 tests passed.
- `git diff --check` passed.
- Desktop CSS geometry:
  - 1280×720: menu right `616.80`, image left `629.61`, gap `12.81`, image right `1272.33`.
  - 1920×1080: menu right `630`, image left `648.02`, gap `18.02`, image right `1908.48`.
- 900×720: image display `none`, canvas hidden, background `rgb(0, 0, 0)`.
- Simulated active-game menu state restores canvas visibility and hides the decorative image.
- Local and immutable HTTPS visual checks confirmed black surroundings, no 3D menu render, no overlap, and full image framing.
- All 57 review and production files matched the local artifact byte-for-byte: 20,623,641 bytes; manifest SHA-256 `5fadd51e4ea8285d68449f2da26cdb8839bd99aeb69d0b01341fb907c293b9dc`.
- Final production Playwright check reported zero page errors and the same 12.81 px gap.
- The production promotion preserved all 1,055 tracked historical `review/` files; a prior review route still returned HTTP 200.

## Rollback

Restore production-root files from `bca63537f704d702f1fbf23ecc2514b17e2cc1e0` while preserving the current `review/` directory. Do not remove immutable review builds.
