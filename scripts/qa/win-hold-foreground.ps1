# Keep THIS RUN'S browser window in the Windows foreground for the length of a
# measurement, and report every time it had to take it back.
#
# WHY. The renderer refuses to author a frame unless the document owns the
# foreground, so a window stolen mid-run stops presenting BY DESIGN. Measured
# 2026-08-31 on this machine: a lane lost the foreground one second into
# sampling and reported 4.6 presented fps with a 1.9-second "stall" that was
# entirely the harness's own fault. Without this, a long run on a shared
# machine is a coin flip, and the coin lands on "the renderer collapsed".
#
# It re-asserts at most once per -IntervalMs and never touches a window this run
# did not launch: selection is the same -Token / -AnyWindow discipline as
# win-foreground.ps1. It writes one JSON line per reassertion to stdout so the
# harness can publish how contested the run was rather than quietly averaging
# over it.
param(
  [string]$Token,
  [switch]$AnyWindow,
  [Parameter(Mandatory = $true)][string]$ProcessName,
  [Parameter(Mandatory = $true)][int]$DurationMs,
  [int]$IntervalMs = 4000
)

if (-not $Token -and -not $AnyWindow) { throw 'Pass -Token or -AnyWindow.' }

$ErrorActionPreference = 'Continue'

Add-Type -Namespace QaHold -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
[DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@

$SW_RESTORE = 9
$deadline = (Get-Date).AddMilliseconds($DurationMs)
$reasserted = 0

function Get-TargetHandles {
  $targets = @(Get-CimInstance Win32_Process -Filter "Name='$ProcessName.exe'" -ErrorAction SilentlyContinue |
    Where-Object { -not $Token -or $_.CommandLine -like "*$Token*" })
  $handles = @()
  foreach ($target in $targets) {
    $process = Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue
    if ($process -and $process.MainWindowHandle -ne 0) { $handles += $process.MainWindowHandle }
  }
  return $handles
}

while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds $IntervalMs
  $handles = Get-TargetHandles
  if ($handles.Count -eq 0) { continue }
  $foreground = [QaHold.Win]::GetForegroundWindow()
  if ($handles -contains $foreground) { continue }

  $handle = $handles[0]
  if ([QaHold.Win]::IsIconic($handle)) { [void][QaHold.Win]::ShowWindowAsync($handle, $SW_RESTORE) }
  $ownerPid = 0
  $foreignThread = if ($foreground -ne [IntPtr]::Zero) { [QaHold.Win]::GetWindowThreadProcessId($foreground, [ref]$ownerPid) } else { 0 }
  $selfThread = [QaHold.Win]::GetCurrentThreadId()
  $attached = $false
  if ($foreignThread -ne 0 -and $foreignThread -ne $selfThread) {
    $attached = [QaHold.Win]::AttachThreadInput($selfThread, $foreignThread, $true)
  }
  [void][QaHold.Win]::BringWindowToTop($handle)
  $set = [QaHold.Win]::SetForegroundWindow($handle)
  if ($attached) {
    [void][QaHold.Win]::SetFocus($handle)
    [void][QaHold.Win]::AttachThreadInput($selfThread, $foreignThread, $false)
  }
  $reasserted += 1
  $stolenBy = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
  [pscustomobject]@{ at = (Get-Date).ToString('o'); reasserted = $reasserted; ok = $set; stolenBy = $stolenBy } | ConvertTo-Json -Compress
}
