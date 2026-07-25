#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
runner_linux='/mnt/c/Users/HB/AppData/Local/Temp/jigglyclaw-atomic-player-runner'
runner_windows='C:\Users\HB\AppData\Local\Temp\jigglyclaw-atomic-player-runner'
url='https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/experimental-netcode-pass/?release=latest&multiplayerQa=1'
duration="${ATOMIC_PLAYER_DURATION:-330}"
capture_mode="${ATOMIC_PLAYER_CAPTURE_MODE:-screencast}"
run_type="${ATOMIC_PLAYER_RUN_TYPE:-full-benchmark}"
run_name="game-$(date -u +%Y%m%dT%H%M%SZ)-pass63-v2"
output_relative="artifacts\\${run_name}"
output_linux="${runner_linux}/artifacts/${run_name}"
harness_sha="$(git -C "$repository_root" rev-parse HEAD)"
launch_script="$(wslpath -w /root/.hermes/scripts/launch_atomic_player_chrome.ps1)"
run_script="$(wslpath -w /root/.hermes/scripts/run_atomic_player_game.ps1)"
stop_script="$(wslpath -w /root/.hermes/scripts/stop_atomic_player_chrome.ps1)"

mkdir -p "$runner_linux/scripts/agent-player" "$runner_linux/artifacts"
cp "$repository_root/scripts/agent-player/atomic-player-driver.mjs" "$runner_linux/scripts/agent-player/atomic-player-driver.mjs"
cp "$repository_root/scripts/agent-player/vision.mjs" "$runner_linux/scripts/agent-player/vision.mjs"

cleanup() {
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$stop_script" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$launch_script"

set +e
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$run_script" \
  -Runner "$runner_windows" \
  -Url "$url" \
  -Output "$output_relative" \
  -HarnessSha "$harness_sha" \
  -Duration "$duration" \
  -CaptureMode "$capture_mode"
driver_status=$?
set -e
cleanup

if [[ ! -f "$output_linux/report.json" ]]; then
  mkdir -p "$output_linux"
  python3 - "$output_linux/report.json" "$url" "$harness_sha" "$driver_status" <<'PY'
import datetime, json, sys
path, url, sha, status = sys.argv[1:]
now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
report = {
  'schemaVersion': 2,
  'kind': 'atomic-player-benchmark',
  'startedAt': now,
  'endedAt': now,
  'source': {'url': url, 'pass': 'PASS 63', 'harnessGitSha': sha, 'channel': 'latest'},
  'session': {'mode': 'solo', 'callsign': 'Jigglyclaw', 'pointerLock': False, 'cdpAttached': True},
  'fairness': {'policyVersion': 'atomic-player-policy-v2', 'forbiddenInputsUsed': []},
  'performance': {'observedRenderProfile': None, 'visionFrames': 0, 'visionStream': {'failedFrames': 1}},
  'input': {'releasedAtEnd': False, 'holdWatchdogExceeded': False},
  'outcome': {'gameStarted': False, 'matchEndedObserved': False, 'downloadedSummary': None, 'downloadedTechnical': None},
  'browser': {'pageErrors': [f'driver exited before report: {status}'], 'warningOrErrorCount': 1},
  'artifacts': [],
}
with open(path, 'w', encoding='utf-8') as handle:
  json.dump(report, handle, indent=2)
  handle.write('\n')
PY
fi

archive_output="$(mktemp)"
node "$repository_root/scripts/agent-player/archive-game.mjs" \
  --source "$output_linux" \
  --archive-root "$repository_root/artifacts/agent-player/archive" \
  --run-type "$run_type" > "$archive_output"
python3 - "$archive_output" "$driver_status" <<'PY'
import json, sys
result = json.load(open(sys.argv[1], encoding='utf-8'))
print(json.dumps({
  'driverExitCode': int(sys.argv[2]),
  'gameId': result['game']['id'],
  'completed': result['game']['completed'],
  'archiveDirectory': result['directory'],
  'comparisonVsBaseline': result['game']['comparisonVsBaseline'],
  'comparisonVsPrevious': result['game']['comparisonVsPrevious'],
  'hardRegression': result['game']['hardRegression'],
}, indent=2))
PY
rm -f "$archive_output"
exit "$driver_status"
