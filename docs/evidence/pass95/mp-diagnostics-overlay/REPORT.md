# PASS 95 — netcode diagnostics overlay and WAN evidence recorder

**Lane:** `contrib/dave-gaming-pc/claude/mp-diagnostics-overlay`
**Base:** `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `465ae6b7`
**Machine / harness:** dave-gaming-pc / Claude Code (Opus)
**Impact class:** `runtime`
**Owner priority answered:** *"WAN sessions with friends as evidence, a netcode diagnostics overlay"* (owner feedback 2026-09-02).

Every claim carries a claim-state: **VERIFIED** (a quoted gate ran), **DESIGNED** (correct by construction and unit-tested, but needs a capture or a WAN run to be evidence), or **OPEN**.

---

## The problem this lane exists to solve

Every multiplayer gate in this repository runs two Chromium contexts on one machine over loopback. Loopback has no jitter worth measuring, no asymmetric uplink, no NAT, and no friend on a train. The owner's actual quality bar is "does it feel right when I play with friends", and until now one of those sessions produced nothing a gate could read — only a sentence in chat.

`src/last-multiplayer-diagnostic.ts` records one scalar per field *after* the match. It cannot answer the question that matters: *was it laggy for everyone or just Sam, and was it latency or divergence?* This lane is the live, per-peer half of that answer, plus the route that turns a friend's session into a gate result.

---

## What landed

### 1. Diagnostics model — `src/netcode-diagnostics.ts`

Pure model: no DOM, no three.js, no knowledge of rendering. That is what makes the arithmetic testable without a browser.

- `NumericRing` — fixed-capacity ring over one `Float64Array`. Non-finite samples are **rejected and counted** rather than admitted: one NaN reaching the buffer would make the whole overlay read `NaN` forever.
- `RequestOutcomeRing` — last 5 reload/pickup outcomes in preallocated slots, mutated in place so the message handler never constructs an object.
- Metrics match what the runtime **already adapts on** rather than a parallel invention: RFC 3550 interarrival jitter (`J += (|D| - J)/16`) as in `src/network-fairness.ts`, and an rtt EMA at the same alpha = 0.25.
- `desyncMeter` is the **maximum** of four normalised pressures (position, loss, jitter, ack age), not their average. A session perfect on three axes and broken on the fourth is broken; an average hides it behind the three good ones.
- `measuredRateHz` derives the rate from **arrival timestamps**, not the negotiated rate — the point is to show when the wire delivers fewer snapshots than the sender believes it is sending.

**Allocation contract:** every `record*` entry point is allocation-free. Strings are built only by `renderDiagnosticsLines` at a throttled cadence. **VERIFIED** — `src/netcode-diagnostics.test.ts` pins ring identity across thousands of pushes.

### 2. Overlay — `src/netcode-diagnostics-overlay.ts`

Plain DOM text in a fixed-position `<pre>`. Three properties, each asserted:

- **No render pass.** It never touches a canvas and never asks three.js for anything. AGENTS.md forbids reading the presented game canvas during native WebGPU gameplay; the cheapest way to be certain a diagnostics overlay never does that is for it not to know a canvas exists.
- **Repaints only when the text changes.** `update()` early-outs on the model revision, then a 250 ms interval, then a line-by-line comparison. A 300 Hz caller and a 4 Hz caller do identical DOM work.
- **Never steals input.** `pointer-events: none`, no focusable children, `aria-hidden` so a screen reader does not read a wall of numbers over a match.

Columns: peer, role, rtt, jitter, loss %, in Hz, out Hz, last-ack age, disagreement (m), desync meter, last five request outcomes as `R+ R- P+`.

### 3. Evidence recorder — `src/netcode-evidence-recorder.ts`

Opt-in, bounded **three ways at once** (120 s window, entry cap, and a byte cap enforced on the *actual* serialisation rather than an estimate).

What it refuses to record is the important part. A trace entry is `{t, dir, kind, peer, seq, bytes}` — a chat message contributes its **size** and the word `chat`, and not one character of its text. `sanitiseTraceKind` is an **allowlist, not a denylist**, the only shape that stays safe when a message type is added later: an unknown kind records as `other` rather than leaking a new field name. **VERIFIED** — a test feeds it a message carrying a player name and asserts the name is absent from the serialised bundle.

A truncated bundle records what the caps discarded, so it can never read as complete.

### 4. Runtime wiring — `src/netcode-diagnostics-runtime.ts`

The only module that knows what a `GameMessage` is. Nine call sites:

- **`src/network.ts` (3):** one line after the existing `transmit` in `broadcast`, in the client branch of `send`, and in `sendToPlayer`.
- **`src/legacy-main.ts` (6):** inbound observation as the first statement of `onNetworkMessage`; host-side rtt from the guest's reported round trip; client-side rtt from the accepted clock observation; the per-frame tick; position disagreement; and an F3 / Ctrl+F3 keydown listener guarded on chat.

Two decisions worth stating:

- **Position disagreement is measured *before* the mesh is moved.** After `remote.target` is applied the disagreement is zero by construction and unmeasurable. It is `remote.root.position.distanceTo(remote.target)` — literal metres between the pose being drawn and the pose authority just admitted.
- **The performance story is one boolean.** The model tier (rings, rtt, loss, rate, ack) always runs and allocates nothing — a netgraph that only starts measuring when you open it shows a blank graph exactly when you needed the last 30 seconds. The trace tier needs a byte count and therefore one `JSON.stringify` per message; `messageBytes` returns 0 **without serialising** when the recorder is idle, so a player who never records never pays it.

### 5. Analyser — `scripts/qa/mp-evidence-analyse.mjs`

`npm run qa:mp-evidence -- <dir-or-file>`. This is what makes a friend's session *evidence* rather than a file.

Bundles are **untrusted input** — they arrive through a chat window. Each is schema-validated before any field is read, nothing in one is executed or interpolated into a command, and every derived number is **recomputed** rather than taken from what the sender wrote.

- **DIVERGENCE TABLE** — one row per (observer, peer), every threshold it broke named in the last column. Thresholds are values the runtime already reacts at.
- **HOST/GUEST ASYMMETRY** — the section loopback can never produce. For one room it compares what the host measured for a guest against what that guest measured for the host. The host is authority by construction, so its rows are the control and the guest's larger number is the guest's own extrapolation error.

Exit codes: `0` clean, `1` unreadable/invalid bundle, `2` a threshold finding — which is what lets a friend's session fail a gate.

### 6. Friend-facing guide — `HOW-TO-COLLECT.md`

Two keys, four steps, a plain-language column glossary, and an explicit list of what the file does and does not contain — including "open it in any text editor and check", because someone should be able to read exactly what they are sending before they send it.

---

## Gates

Run in `C:/Users/david/projects/aa-wf-diag`.

**VERIFIED — `npx tsc --noEmit`:** clean, no output.

**VERIFIED — lane tests plus the named ratchet:**

```
$ npx vitest run src/netcode-diagnostics.test.ts src/netcode-diagnostics-overlay.test.ts \
    src/netcode-diagnostics-runtime.test.ts src/netcode-evidence-recorder.test.ts \
    src/legacy-main-size-ratchet.test.ts
 Test Files  5 passed (5)
      Tests  62 passed (62)
```

**VERIFIED — network suites the wiring touches:**

```
$ npx vitest run src/network-sync.test.ts src/network-fairness.test.ts \
    src/network-lifecycle.test.ts src/network-chaos.test.ts \
    src/network-connection-attempt.test.ts src/network-lobby-closed.test.ts \
    src/legacy-main-size-ratchet.test.ts
 Test Files  7 passed (7)
      Tests  86 passed (86)
```

**VERIFIED — analyser contract:**

```
$ npm run qa:mp-evidence:contract
tests 11 | pass 11 | fail 0
```

**VERIFIED — size ratchet not raised.** `LINE_CEILING` unchanged at 37,396. `src/legacy-main.ts` 37,231 -> 37,262 lines (+31), leaving 134 of headroom.

**VERIFIED — production build:** `npx vite build` -> `built in 9.75s`.

**VERIFIED — the app boots and F3 works in the shipped bundle.** Unit tests never boot the DOM, so this is a headless installed-Chrome check against `vite preview` on port 4207:

```
$ node scripts/qa/netcode-overlay-boot-check.mjs
{
  "overlayCountBeforeF3": 0,
  "afterFirstF3": {
    "present": true,
    "hidden": false,
    "text": "NETCODE  role=offline  room=----  peers=0 / peer role rtt jit loss in out ack dis desync req / no peers - solo or lobby"
  },
  "hiddenAfterSecondF3": true,
  "errors": []
}
OK netcode overlay boot check
```

The element does not exist before the key, F3 creates it visible with the right text, a second F3 hides it, Ctrl+F3 arms the recorder without throwing, and there were zero page or console errors.

**VERIFIED — analyser end-to-end on the shipped fixtures:**

```
$ npm run qa:mp-evidence -- docs/evidence/pass95/mp-diagnostics-overlay/fixture
observer       role   peer              rtt    jit  loss%  inHz    p95m    maxm  desync  findings
guest-bbb      guest  host-aaa         39.0    4.6   0.00    39   0.110   0.210   0.362  ok
guest-ccc      guest  host-aaa        148.0   34.0   8.10    22   2.610   5.400   1.000  position,jitter,loss,desync
host-aaa       host   guest-bbb        38.0    4.2   0.00    40   0.092   0.180   0.333  ok
host-aaa       host   guest-ccc       141.0   31.5   6.20    22   0.740   1.910   1.000  jitter,loss,desync

room FIXTURE1: host host-aaa <-> guest guest-ccc
  rtt  host sees 141.0 ms, guest sees 148.0 ms  (delta 7.0 ms)
  p95  host sees 0.740 m, guest sees 2.610 m  (divergence 1.870 m)

VERDICT: 2 of 4 peer row(s) over threshold        EXIT=2
```

That 1.870 m divergence row is the shape of finding this lane was built to produce and that no loopback test can generate.

---

## Found while building this, written down rather than smoothed over

**A design bug I introduced and then fixed.** The analyser originally compared its recomputation against the bundle's `desync` field and printed a "claimed vs recomputed" note. It fired on **every row, including healthy ones** — the two are different statistics: `desync` is the live meter at the instant the export key was pressed (last-sample disagreement plus ack age), while the analyser recomputes a session statistic from p95 with no ack term. A note that fires on every healthy bundle trains the reader to ignore all of them, which is worse than not having it. Fixed by adding `desyncSessionP95` to the bundle — the same statistic the analyser recomputes — so the note now means "different build, or edited by hand". Pinned by a test stating why the bundle carries two numbers.

**A wrong expectation in my own test, corrected rather than accommodated.** My first threshold test asserted five findings where the code produced four. The code was right: threshold comparisons are exclusive, and a row sitting *exactly* on a threshold is not a finding — the thresholds are the values the runtime already adapts at, so landing on one is the adaptation working. I fixed the expectation and added a dedicated boundary test, because an off-by-one here silently turns a gate into either a nag or a rubber stamp.

**Prior partial work was resumed, not destroyed.** The worktree already held seven untracked files from an interrupted earlier run of this same lane (reflog showed a bare `reset: moving to HEAD`). They typechecked and passed, so they were reviewed, fixed (four implicit-`any` errors in the overlay test's fake Document), and committed rather than discarded.

---

## Claim-states for everything not yet proven

| Claim | State | What would settle it |
| --- | --- | --- |
| The overlay renders legibly over the live HUD at 1280x720 and 2560x1440 in both graphics profiles | **DESIGNED** | A visual capture pass. The boot check proves it exists, is visible and carries the right text; it does not judge how it looks over a running match. AGENTS.md requires a HUD change to run the surface-registry and menu-preview gates and inspect the desktop/laptop/ultrawide/narrow/high-DPI artifacts — **not done in this lane**. |
| Per-peer numbers are correct against a real peer | **DESIGNED** | Unit tests cover the arithmetic against synthetic inputs; runtime tests cover field extraction against real protocol shapes. No two-context or WAN session was run. |
| The bundle round-trips from a real session through the analyser | **DESIGNED** | Proven end-to-end against fixtures. No bundle from a live room was produced. |
| The asymmetry table reveals a real WAN fault | **OPEN** | Needs exactly what the lane was built for: the owner and at least one friend recording the same room. `HOW-TO-COLLECT.md` is the artefact to hand them. |
| Recording overhead is acceptable at 40 Hz x 3 peers | **OPEN** | One `JSON.stringify` per message while recording. Reasoned about and gated behind an opt-in boolean; **not measured**. Worth a frame-pacing capture with recording on before this is offered to friends mid-firefight. |
| `src/ui/surface-registry.ts` should carry the overlay as a diagnostics surface | **OPEN** | AGENTS.md requires the typed surface inventory to retain diagnostics controls. The overlay is created outside the registry. A real gap; close it before publish. |
| Interaction with the `F` press-lifecycle and key-binding capture | **DESIGNED** | F3 is bound nowhere else (grepped `src/legacy-main.ts` and `src/key-bindings.ts`: no `F3`), the handler refuses repeats and modified presses other than Ctrl, and early-outs while chat is focused. Not exercised against the key-rebinding capture UI. |

## Not done, deliberately

- **No upload path.** `src/match-diagnostics-upload.ts` is consented aggregated telemetry; this bundle is a raw trace a friend chooses to send directly, and it must not acquire a network side effect by accident.
- **No publish, no `acceptance/pass-*.json` change, no PR merge** — a feature worktree edits and tests only.
- **Port 4207 was released.** The `vite preview` started for the boot check (pid 85360) was stopped at the end of this lane; nothing of mine is left listening.
