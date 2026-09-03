# OPEN — a collapsed Advanced Graphics still lays out 2,815 px over the Options panel

**Found by:** Lane AE of the PASS 85 lane sweep (emulated mobile pass), worked
in the PASS 87 window, 2026-09-03. Evidence lives under
`docs/evidence/pass85/lane-ae/`.
**Status:** OPEN. Diagnosed and reproduced; **not fixed here** — the file is
outside this lane's ownership (Lane AE owns the touch overlay, HUD responsive
CSS, and its own QA script). The exact patch is below for whoever owns
`src/ui/advanced-graphics.css`.
**Not mobile-only.** Reproduced at desktop 1280x720 as well; it was simply
*found* on the tablet profile, where enough of the panel is on screen at once
for the collision to become a hit-test failure.

## Symptom, as the sweep reports it

`npm run qa:mobile:emulated`, device `tablet-portrait` (820x1180 dpr2), both
arenas, deterministic across runs:

```
settings-controls-not-tappable:
  graphics-render-scale < section#audio-settings.settings-section
  graphics-adaptive     < input#audio-master-gain
```

Two Graphics controls hit-test to Audio elements. A finger aiming at RENDER
SCALE lands on the audio section.

## Measured cause

`#advanced-graphics` is a `<details>` and it is CLOSED, exactly as AGENTS.md
requires ("Advanced Graphics starts collapsed"). Its own border box is only the
summary. Its content is laid out anyway:

| element | `open` | box (viewport px) |
|---|---|---|
| `#graphics-settings` | — | tablet 41,671 738x283 · desktop 296,418 908x205 |
| `#advanced-graphics` | **false** | tablet 58,874 704x62 · desktop 315,555 871x50 |
| `.advanced-graphics-catalog` | — | tablet 59,935 **702x2819** · desktop 316,604 **869x2815** |
| `#audio-settings` | — | tablet 41,969 738x546 · desktop 296,639 908x261 |

Computed style on the catalog while the `<details>` is closed:
`display: grid`, `content-visibility: visible`, `visibility: visible`, and its
parent is the `<details>` itself.

So a collapsed disclosure lays out ~2,815 px of controls starting at its own
bottom edge, straight through Audio, Accessibility, Key Bindings, Gamepad,
Refresh and Privacy. The reason nobody has *seen* it is paint order: those
sections are later static siblings, so their opaque backgrounds cover the spill.
Hit testing does not care about that — `elementFromPoint` returns the topmost
element, which is why the collision surfaces as untappable Graphics controls
rather than as a visibly broken panel.

The one-line reason: `src/ui/advanced-graphics.css:1` sets `display: grid` on a
direct child of the `<details>`, and an author `display` declaration outranks
the user-agent rule that hides a closed disclosure's contents.

## Second-order costs

- The Options panel's scroll height carries ~2,800 px of content that is not
  supposed to exist, on every device and every profile. "The options list is
  very long" is partly this.
- Every control inside the collapsed catalog is a live, focusable, hit-testable
  phantom sitting under the visible sections.

## The patch

```diff
--- a/src/ui/advanced-graphics.css
+++ b/src/ui/advanced-graphics.css
@@
-#advanced-graphics .advanced-graphics-catalog {
+/* Only when the disclosure is OPEN. An author `display` declaration on a direct
+   child of a closed <details> outranks the user-agent rule that hides the
+   contents, so the collapsed catalog was laying out ~2,815 px over every
+   section below it (measured, Lane AE, PASS 85 sweep / PASS 87 window). */
+#advanced-graphics[open] .advanced-graphics-catalog {
   display: grid;
   gap: 12px;
   padding: 12px;
 }
+
+#advanced-graphics:not([open]) .advanced-graphics-catalog { display: none; }
```

## Before the patch lands, check these

The catalog being laid out while collapsed may be load-bearing for a gate that
measures its controls without opening it:

1. `src/ui/surface-registry.test.ts` and the orphan-option gate — anything that
   enumerates advanced graphics controls or their geometry.
2. `tests/e2e/pass64-hud-menu.spec.ts` — the HUD/menu visual and layout spec.
3. Any check that reads a slider's value or bounding box without first opening
   the disclosure.

If one of those does depend on it, open the disclosure in the test rather than
keeping the spill — a hidden control that still occupies layout is the defect,
not the test's convenience.

## Falsifier

With the patch applied, on tablet-portrait 820x1180:
`#advanced-graphics` closed ⇒ `.advanced-graphics-catalog` has a zero box;
`#audio-settings.y` moves up by ~2,815 px; and
`npm run qa:mobile:emulated -- --devices tablet-portrait` reports no
`settings-controls-not-tappable` row.
