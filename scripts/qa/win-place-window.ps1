# Move the windows this run launched onto a chosen screen rectangle.
#
# Chromium takes --window-position on the command line; Firefox has no such
# switch, so the only way to honour the owner's "QA browsers stay off my screen"
# rule for the Gecko lane is to move the window after it opens.
#
# Selection is the same discipline as win-foreground.ps1: EITHER a -Token that
# appears in the command line of every process this run started, or -AnyWindow
# for a lane that already established the browser was not running beforehand.
# Nothing here can move a window belonging to a browser the harness did not
# open, and nothing here changes a system setting.
param(
  [string]$Token,
  [switch]$AnyWindow,
  [Parameter(Mandatory = $true)][string]$ProcessName,
  [Parameter(Mandatory = $true)][int]$X,
  [Parameter(Mandatory = $true)][int]$Y,
  [int]$Width = 1600,
  [int]$Height = 900
)

if (-not $Token -and -not $AnyWindow) { throw 'Pass -Token or -AnyWindow.' }

$ErrorActionPreference = 'Stop'

# EnumWindows, not Process.MainWindowHandle.
#
# Measured 2026-08-31: Firefox opened with -private-window owns TWO top-level
# windows, and MainWindowHandle is the other one. The lane resized a window the
# page was not in, reported ok, and the measurement ran in an 814x577 viewport
# against Chrome's 1906x986 - a fifth of the pixels, which made Gecko look twice
# as fast as Chromium for reasons that had nothing to do with Gecko. Enumerating
# every visible top-level window of the target process removes that whole class
# of wrong answer.
Add-Type -Namespace QaPlace -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr param);
public delegate bool EnumProc(IntPtr hWnd, IntPtr param);
public struct RECT { public int Left, Top, Right, Bottom; }
'@

$SW_RESTORE = 9
$moved = @()

$targets = @(Get-CimInstance Win32_Process -Filter "Name='$ProcessName.exe'" -ErrorAction SilentlyContinue |
  Where-Object { -not $Token -or $_.CommandLine -like "*$Token*" })

$wanted = @{}
foreach ($target in $targets) { $wanted[[uint32]$target.ProcessId] = $true }

$handles = New-Object System.Collections.ArrayList
$callback = [QaPlace.Win+EnumProc]{
  param($hWnd, $param)
  if ([QaPlace.Win]::IsWindowVisible($hWnd)) {
    $owner = 0
    [void][QaPlace.Win]::GetWindowThreadProcessId($hWnd, [ref]$owner)
    if ($wanted.ContainsKey([uint32]$owner)) {
      $rect = New-Object QaPlace.Win+RECT
      [void][QaPlace.Win]::GetWindowRect($hWnd, [ref]$rect)
      # Skip the invisible 0x0 helper windows every browser keeps around.
      if (($rect.Right - $rect.Left) -gt 200 -and ($rect.Bottom - $rect.Top) -gt 200) {
        [void]$handles.Add($hWnd)
      }
    }
  }
  return $true
}
[void][QaPlace.Win]::EnumWindows($callback, [IntPtr]::Zero)

foreach ($handle in $handles) {
  if ([QaPlace.Win]::IsIconic($handle)) { [void][QaPlace.Win]::ShowWindowAsync($handle, $SW_RESTORE) }
  $ok = [QaPlace.Win]::MoveWindow($handle, $X, $Y, $Width, $Height, $true)
  Start-Sleep -Milliseconds 150
  $rect = New-Object QaPlace.Win+RECT
  [void][QaPlace.Win]::GetWindowRect($handle, [ref]$rect)
  $title = New-Object System.Text.StringBuilder 256
  [void][QaPlace.Win]::GetWindowTextW($handle, $title, 256)
  $moved += [pscustomobject]@{
    title = $title.ToString()
    hwnd  = [int64]$handle
    moved = $ok
    left  = $rect.Left
    top   = $rect.Top
    right = $rect.Right
    bottom = $rect.Bottom
  }
}

[pscustomobject]@{
  ok      = (@($moved | Where-Object { $_.moved }).Count -gt 0)
  windows = $moved
} | ConvertTo-Json -Depth 4 -Compress
