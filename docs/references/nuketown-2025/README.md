# Nuketown 2025 - reference images

Visual references for the Atomic Acres **Nuke Town Rebuild** arena (`nuketown2`),
gathered 2026-09-04 by the R4 reference lane on `dave-gaming-pc`.

- **Findings:** `FINDINGS.md` - answers the four decisive owner questions with
  per-image evidence lines and a hand-drawn overhead with a stated frame.
- **Index:** `manifest.json` - one record per file: id, path, game version, source page,
  image URL, first-partyness grade, what it shows, whether it was used as evidence,
  pixels, bytes, format, licence note.
- **Images:** `img/` - 20 files, 34.2 MB total.

## Licence and scope

**Reference only, not shipped.** These are third-party screenshots, in-game assets and
promotional renders owned by Treyarch / Activision. They are here so a human and an agent
can *look at the real map* while rebuilding an original arena. Nothing in `img/` is
copied, traced, sampled or converted into project geometry, textures or materials, and
nothing in `img/` is served by the game or included in any build. The rebuild reproduces
*layout facts and architectural features*, described in this repo's own words - the same
discipline `docs/research/2026-09-04/R4-bo2-nuketown-accuracy.md` states for prose.

## Version tags - read this before citing anything

The target is **Black Ops 2's `Nuketown 2025`**, tag `BO2-2025`. Other Nuketowns are
different maps and are **secondary evidence only**, usable solely for features a
BO2-2025 image already shows:

| Tag | Meaning | Files |
|---|---|---|
| `BO2-2025` | **THE TARGET** - Black Ops II, Nuketown 2025 | NT01-NT09 |
| `BO7-2025` | Black Ops 7 re-release of Nuketown 2025 | NT10-NT17 |
| `BO1` | The original Nuketown - a *different map* (desert tract township) | NT18 |
| `BO6` | Black Ops 6 Nuketown - different map | NT19 |
| `CW-84` | Black Ops Cold War, Nuketown 84 - different map | NT20 |

`BO1`'s yellow / green / pink / pale-blue tract houses and yellow school bus are **not**
Nuketown 2025 dressing. `NT18` is kept precisely as the negative control that shows this.

## How these were fetched

Direct image URLs were resolved through the Call of Duty Fandom MediaWiki API
(`action=query&prop=imageinfo`) against the `Nuketown 2025` article and related articles,
then downloaded with `curl`. Fandom's CDN content-negotiates to **WebP** by default, so
`&format=original` is appended to every URL at fetch time to get the true PNG/JPEG;
`manifest.json` records the canonical URL without that suffix.

`nuketown84-minimap-bocw.png` (NT20) was **resized locally** from 3840x2160 to 1920x1080
to keep the folder inside the 40 MB budget. It is the only file that is not byte-identical
to its source, and `manifest.json` says so.

## Strongest three images

1. **`img/nt2025-street-boii.jpg`** (BO2-2025) - the owner's own viewpoint: standing in a
   back yard looking at your own house. Settles the garage side and shows the rear deck
   and its exterior stair. Small, but decisive.
2. **`img/nt2025-aerial-boii.jpg`** (BO2-2025) - near-vertical aerial of the whole site.
   Settles the lollipop cul-de-sac, the coach and truck placement, the third house beyond
   the head, both back yards, the second house's rear deck and stair, and the red-vs-blue
   front-lawn appliance banks.
3. **`img/nt2025-minimap-bo7.png`** (BO7-2025, secondary) - 4096x4096, the clearest
   footprints anywhere in the set. Confirms the two houses are a 180-degree rotational
   pair, not a mirror pair. Used only where the BO2 aerial agrees.
