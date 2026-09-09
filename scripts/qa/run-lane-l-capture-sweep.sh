#!/usr/bin/env bash
# Lane L — one arena per browser, with a hard external timeout and retries.
#
# WHY NOT ONE PROCESS FOR THE SWEEP. A single long WebGPU session at the MAX
# preset wedges this machine's GPU partway through often enough that a
# six-arena run returned nothing more than once: the page stops answering CDP
# entirely, so the harness's own per-arena timeout never fires and the whole
# hour is lost. One browser per arena bounds the blast radius to one arena, and
# `timeout` outside node is the only deadline a wedged GPU process cannot
# outlast. The capture harness merges each invocation into the shared report.
#
# Usage: LANE_L_PRESET=max bash scripts/qa/run-lane-l-capture-sweep.sh <label> <url> [arenas...]
set -u

LABEL="${1:?label}"
URL="${2:?url}"
shift 2
ARENAS=("$@")
if [ ${#ARENAS[@]} -eq 0 ]; then
  ARENAS=(farcrysis high-seas atomic-acres skyline-terminal rustworks-1v1 gun-range)
fi

OUT="artifacts/lane-l/${LABEL}"
PRESET="${LANE_L_PRESET:-max}"
ATTEMPTS=3
PER_ARENA_TIMEOUT=330
# Chrome needs a moment after a forced kill before a fresh launch survives:
# launching within a second or two of Stop-Process reproducibly dies at
# newPage with "Target page, context or browser has been closed".
SETTLE_SECONDS=20


# Fail fast on a dead preview server. A stopped `vite preview` looks exactly
# like a broken renderer from inside the harness — three attempts per arena, all
# reporting a boot failure — and that misdiagnosis cost real time once already.
if ! curl -s -o /dev/null --max-time 10 "$URL/"; then
  echo "[sweep] ABORT: no preview server answering at ${URL}"
  exit 2
fi
sleep "$SETTLE_SECONDS"

for arena in "${ARENAS[@]}"; do
  for attempt in $(seq 1 "$ATTEMPTS"); do
    echo "[sweep] ${LABEL} ${arena} attempt ${attempt}"
    # `timeout` does NOT reliably kill a node process blocked on a wedged
    # Chrome/GPU on this machine — one was observed still running 16 minutes
    # into a 330 s timeout. Background the run and kill it by PID, which does.
    node scripts/qa/capture-lane-l-art-direction.mjs \
      --url "$URL" --label "$LABEL" --out "$OUT" --arenas "$arena" \
      --preset "$PRESET" --width 1280 --height 720 --boot 120000 --per-arena 120000 \
      >> "/tmp/lanel-sweep-${LABEL}.log" 2>&1 &
    node_pid=$!
    ( sleep "$PER_ARENA_TIMEOUT"; kill -9 "$node_pid" 2>/dev/null ) &
    watchdog_pid=$!
    wait "$node_pid"
    status=$?
    kill "$watchdog_pid" 2>/dev/null
    wait "$watchdog_pid" 2>/dev/null
    if [ "$status" -eq 0 ] && ls "${OUT}/${arena}--"*.png >/dev/null 2>&1; then
      echo "[sweep] ${LABEL} ${arena} OK"
      break
    fi
    echo "[sweep] ${LABEL} ${arena} attempt ${attempt} failed (status ${status})"
    # Only a FAILED attempt leaves a browser behind; clear it, then let the
    # adapter settle before the next launch.
    powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { \$_.CommandLine -match 'playwright|--enable-unsafe-webgpu' } | ForEach-Object { try { Stop-Process -Id \$_.ProcessId -Force -ErrorAction Stop } catch {} }" >/dev/null 2>&1
    sleep "$SETTLE_SECONDS"
  done
done

echo "[sweep] ${LABEL} done"
ls "${OUT}" | tr '\n' ' '
echo
