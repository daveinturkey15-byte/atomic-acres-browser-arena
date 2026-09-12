# How to collect netcode evidence from a WAN session

**Who this is for:** anyone playing Atomic Acres with Dave over the internet.
It takes about ten seconds during a match and produces one file.

**Why:** every automated multiplayer test runs two browser windows on one PC.
That link is perfect — no lag, no packet loss, no wifi. It cannot reproduce what
you actually experience. This turns your session into something the tests can
read.

---

## The two keys

| Key | What it does |
| --- | --- |
| **F3** | Show / hide the netcode overlay (a small panel, top right) |
| **Ctrl + F3** | First press: **start recording.** Second press: **save the file.** |

Recording is **off** until you press Ctrl+F3. Nothing is recorded, stored, or
sent before that.

---

## What to do

1. Play normally. When something feels wrong — rubber-banding, a shot that
   should have hit, a player teleporting — press **Ctrl + F3**.
2. Keep playing for **up to two minutes**. Try to make it happen again.
3. Press **Ctrl + F3** again. Your browser downloads a file called something
   like `aa-netcode-evidence-K7QP-guest-a1b2c3d4-1757…json`.
4. Send that file to Dave.

**The most useful thing you can do:** get *everyone* in the room to do this at
the same time, including whoever is hosting. The analysis compares the host's
view against each player's view, and it can only do that when it has both. One
file on its own is useful; the host's file plus one guest's file is much more
useful.

If you can, add one sentence: *"the rubber-banding was around 40 seconds in,
near the tower"*. The file has timestamps and that lets Dave find the moment.

---

## Reading the overlay (F3), if you're curious

```
NETCODE  role=guest  room=K7QP  peers=1
peer      role  rtt   jit  loss   in    out   ack    dis   desync  req
host-aaa  host   38    4   0.0    40    40      12   0.09   0.05   R+ P+ R+
```

| Column | Meaning | Rough "this is fine" |
| --- | --- | --- |
| `rtt` | round-trip time to that peer, ms | under ~80 |
| `jit` | jitter — how *inconsistent* the timing is, ms | under ~25 |
| `loss` | % of updates that never arrived | under 5% |
| `in` / `out` | updates per second received / sent | 20–40 |
| `ack` | ms since that peer last confirmed anything | under ~500 |
| `dis` | metres between where you're *drawing* someone and where the host says they are | under ~0.5 |
| `desync` | one 0–1 summary; the worst of the columns above | under 0.75 |
| `req` | your last 5 reload/pickup requests. `R+` reload accepted, `R-` rejected, `P+` pickup accepted, `P?` timed out |

**`jit` and `dis` are the two that explain "it felt wrong".** High `rtt` alone
usually just feels like delay. High `jit` or high `dis` is what makes players
slide around and shots miss.

---

## What is in the file (and what is not)

The file contains:

- your peer id and the room code
- the timing numbers above
- one line per network message: **when** it happened, **which direction**,
  **what kind** it was (e.g. `state`, `shot`, `reload`), **which peer**, and
  **how many bytes** it was

The file does **not** contain:

- the contents of any message — a chat message contributes its *size* and the
  word `chat`, and not one character of what you typed
- your name, your IP address, your location, your account, or anything about
  your computer
- anything at all from before you pressed Ctrl+F3

If you want to check any of that yourself, the file is plain JSON — open it in
any text editor. That is deliberate: you should be able to read exactly what you
are sending before you send it.

**Limits.** Recording covers the most recent 120 seconds and stops at 4 MB. If
either limit trims something, the file says so and the analysis prints
`TRUNCATED` rather than pretending it saw the whole session.

---

## For Dave: analysing what comes back

Drop the files in one directory and run:

```bash
npm run qa:mp-evidence -- path/to/bundles/
```

Exit codes: `0` nothing over threshold, `1` a file was unreadable or invalid,
`2` at least one peer row crossed a threshold — which is the one that makes a
friend's session usable as a gate result.

`--json` emits the same rows as JSON for scripting.

The two sections to read:

- **DIVERGENCE TABLE** — one row per (whoever recorded, peer they saw), with
  every threshold it broke named in the last column.
- **HOST/GUEST ASYMMETRY** — only appears when the host *and* at least one guest
  from the same room both sent a file. This is the section loopback can never
  produce: if the host measured 0.74 m of disagreement for a guest and that
  guest measured 2.61 m for itself, the difference is the guest's own
  extrapolation error, and that number is the finding.

Worked example against the shipped fixtures:

```bash
npm run qa:mp-evidence -- docs/evidence/pass95/mp-diagnostics-overlay/fixture
```

Every number the analyser reports is recomputed from the raw fields, never read
from the summary the sender wrote — a bundle from an older build, or one edited
by hand, cannot claim a health it does not have, and gets a `NOTE:` line saying
so.
