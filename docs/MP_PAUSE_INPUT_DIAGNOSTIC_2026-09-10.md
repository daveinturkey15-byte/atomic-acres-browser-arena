# State-aware headless pause diagnostic

VERIFIED source and v2.1 failure: Escape is not an unconditional pause operation. A paused options page resumes; a hidden active match opens directly only without pointer lock; pointer-loss handling intentionally suppresses pause on focus changes/overlays.62d attempt1 captured no exact pre-Escape UI state, so its cause remains OPEN rather than guessed.

VERIFIED QA-only repair records pre/post surface/reason/pointer phase, focus, pointer-lock presence, selected tab, active element ID (never text/value), chat/tactical visibility and alive/HP. Already-paused state uses the visible button without Escape. Unfocused headless page is focused through Playwright; actual pointer lock is released through the native browser API and observed. Escape is sent once only if the resulting state is hidden/alive/unlocked with no overlay. Every failure retains its metadata; no key retry, timeout extension, DOM unhide or direct returnToMainMenu/debug-pause transaction.

VERIFIED `--menu-diagnostic` on the v2.1 driver boots the same three-peer match, verifies live hashes/backend, and checks this pause path immediately before any staircase/fire/90second soak. It writes a separate `menu-lifecycle-diagnostic-v1` artifact with runtimeSHA and driverSHA, not a full-soak PASS. It uses the same bounded owned-process cleanup.57 browser-free cases PASS, including paused-options/no-Escape, separate focus/lock/overlay decisions and failure metadata/single-press behavior.

OPEN short live diagnostic and subsequent full-soak rejoin. Product files, numeric gates and prior evidence unchanged. Keyboard UX is never claimed from a direct game transaction.
