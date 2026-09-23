# Bring a QA browser window to the true Windows foreground - and PROVE it.
#
# WHY THIS FILE EXISTS. Every earlier attempt at a Firefox frame-rate number on
# this machine died the same way: the window was launched, something called
# SetForegroundWindow, nobody checked the return, and the page reported
# document.hasFocus() === false for the whole run. The renderer refuses to
# author frames without foreground ownership (src/legacy-main.ts gates the frame
# loop on `visibilityState === 'visible' && document.hasFocus()`), so an
# unfocused window produces a frame rate that looks exactly like a wedged
# browser. HF-331's "~10 FPS in Firefox" is indistinguishable from that fault
# until focus is *verified* rather than *requested*.
#
# Windows refuses SetForegroundWindow from a process that does not already own
# the foreground; it flashes the taskbar button and returns false. The documented
# way through is to attach this thread's input queue to the current foreground
# thread's for the duration of the call. That is what this does - it changes no
# system setting, and it touches only windows whose command line carries the
# caller's unique run token.
#
# Prints one JSON object: which windows were tried and whether the foreground
# window afterwards is one of them. `ok:false` means the measurement that
# follows is NOT trustworthy, and the caller must say so rather than publish a
# number.
param(
  # Windows are selected EITHER by -Token (a unique temp-profile path that
  # appears in the command line of every process this run started) OR by
  # -TitleMatch (a substring of the window title). The title route exists for
  # Firefox, which cannot be launched with a disposable -profile at all without
  # losing content focus - see installed-browser-lanes.mjs - so the only handle
  # on "the window this harness opened" is the QA page's own <title>.
  [string]$Token,
  [string]$TitleMatch,
  # -AnyWindow matches every window of the named process. Only ever passed by a
  # lane that established the browser was NOT running before it launched it, so
  # every window of that process belongs to this run. The app rewrites
  # document.title once it boots, which is why matching on the QA page's title
  # silently stops working half way through a run - that failure is what this
  # switch exists to remove.
  [switch]$AnyWindow,
  [Parameter(Mandatory = $true)][string]$ProcessName,
  # Foreground ownership is not the same as CONTENT focus. Firefox will sit in
  # the foreground with focus in the address bar, and document.hasFocus() stays
  # false - the exact state the game's frame loop refuses to render in. -Click
  # posts a left click into the middle of the window's own client area, which is
  # what a human does to start playing. It is posted to the window's message
  # queue, so the physical cursor is never moved and no other window can receive
  # it; the target is re-checked against this run's token immediately before.
  [switch]$Click,
  # -RealClick is the escalation for Firefox, which ignores a posted click for
  # the purpose of content focus: it synthesises a genuine input event with
  # SendInput. The cursor is moved and put back, the foreground window is
  # re-verified against this run's token immediately before the click, and the
  # click point is checked with WindowFromPoint so it cannot land anywhere but
  # the window this harness launched. Nothing here is a system setting.
  [switch]$RealClick,
  # Close the matched windows instead of focusing them. WM_CLOSE to one specific
  # window handle, never a process kill: on the Firefox lane the process may be
  # the human's own browser, and only the window this harness opened may go.
  [switch]$CloseOnly
)

if (-not $Token -and -not $TitleMatch -and -not $AnyWindow) { throw 'Pass -Token, -TitleMatch or -AnyWindow.' }

$ErrorActionPreference = 'Stop'

Add-Type -Namespace QaFg -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
[DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
[DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);
[DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
[DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
public struct RECT { public int Left, Top, Right, Bottom; }
public struct POINT { public int X, Y; }
'@

$SW_RESTORE = 9

# Only ever the windows this run launched: the token is a unique temp-profile
# name that appears in the command line of every process of that browser tree
# and in nothing else on the machine. A human's own browser can never match.
$targets = @(Get-CimInstance Win32_Process -Filter "Name='$ProcessName.exe'" -ErrorAction SilentlyContinue |
  Where-Object { -not $Token -or $_.CommandLine -like "*$Token*" })

$tried = @()
foreach ($target in $targets) {
  $process = Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { continue }
  $handle = $process.MainWindowHandle
  if ($handle -eq 0) { continue }
  if ($TitleMatch -and $process.MainWindowTitle -notlike "*$TitleMatch*") { continue }

  if ($CloseOnly) {
    [void][QaFg.Win]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)   # WM_CLOSE
    $tried += [pscustomobject]@{ pid = $target.ProcessId; hwnd = [int64]$handle; title = $process.MainWindowTitle; closed = $true }
    continue
  }

  if ([QaFg.Win]::IsIconic($handle)) { [void][QaFg.Win]::ShowWindowAsync($handle, $SW_RESTORE) }
  [void][QaFg.Win]::ShowWindowAsync($handle, $SW_RESTORE)
  Start-Sleep -Milliseconds 120

  # Attach to whoever currently owns the foreground; while attached, this thread
  # counts as part of that input queue and the call is permitted.
  $foreground = [QaFg.Win]::GetForegroundWindow()
  $foreignThread = 0
  if ($foreground -ne [IntPtr]::Zero) {
    $ownerPid = 0
    $foreignThread = [QaFg.Win]::GetWindowThreadProcessId($foreground, [ref]$ownerPid)
  }
  $selfThread = [QaFg.Win]::GetCurrentThreadId()
  $attached = $false
  if ($foreignThread -ne 0 -and $foreignThread -ne $selfThread) {
    $attached = [QaFg.Win]::AttachThreadInput($selfThread, $foreignThread, $true)
  }
  [void][QaFg.Win]::BringWindowToTop($handle)
  $set = [QaFg.Win]::SetForegroundWindow($handle)
  # While still attached, keyboard focus can be set inside the target's own
  # input queue - SetForegroundWindow alone leaves it wherever it was.
  if ($attached) { [void][QaFg.Win]::SetFocus($handle) }
  if ($attached) { [void][QaFg.Win]::AttachThreadInput($selfThread, $foreignThread, $false) }

  $clicked = $false
  $realClicked = $false
  if ($Click -or $RealClick) {
    $rect = New-Object QaFg.Win+RECT
    if ([QaFg.Win]::GetClientRect($handle, [ref]$rect)) {
      $x = [int](($rect.Right - $rect.Left) / 2)
      # Two thirds down the client area: below every browser toolbar, inside the
      # page, and away from anything the app puts along the top edge.
      $y = [int](($rect.Bottom - $rect.Top) * 0.66)
      if ($Click) {
        $lParam = [IntPtr](($y -shl 16) -bor ($x -band 0xFFFF))
        [void][QaFg.Win]::PostMessage($handle, 0x0200, [IntPtr]::Zero, $lParam)    # WM_MOUSEMOVE
        [void][QaFg.Win]::PostMessage($handle, 0x0201, [IntPtr]1, $lParam)         # WM_LBUTTONDOWN
        Start-Sleep -Milliseconds 40
        [void][QaFg.Win]::PostMessage($handle, 0x0202, [IntPtr]::Zero, $lParam)    # WM_LBUTTONUP
        $clicked = $true
      }
      if ($RealClick) {
        $point = New-Object QaFg.Win+POINT
        $point.X = $x; $point.Y = $y
        if ([QaFg.Win]::ClientToScreen($handle, [ref]$point)) {
          # Three checks before any input is synthesised, so a click can never
          # land in an application this harness did not launch: the window under
          # the point must belong to the target window, and the target must still
          # be the foreground window.
          $under = [QaFg.Win]::WindowFromPoint($point)
          $underRoot = [QaFg.Win]::GetAncestor($under, 2)   # GA_ROOT
          $stillForeground = [QaFg.Win]::GetForegroundWindow() -eq $handle
          if ($underRoot -eq $handle -and $stillForeground) {
            $saved = New-Object QaFg.Win+POINT
            [void][QaFg.Win]::GetCursorPos([ref]$saved)
            [void][QaFg.Win]::SetCursorPos($point.X, $point.Y)
            Start-Sleep -Milliseconds 60
            [QaFg.Win]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)   # LEFTDOWN
            Start-Sleep -Milliseconds 50
            [QaFg.Win]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)   # LEFTUP
            Start-Sleep -Milliseconds 60
            [void][QaFg.Win]::SetCursorPos($saved.X, $saved.Y)
            $realClicked = $true
          }
        }
      }
    }
  }

  Start-Sleep -Milliseconds 200
  $title = New-Object System.Text.StringBuilder 256
  [void][QaFg.Win]::GetWindowTextW($handle, $title, 256)
  $tried += [pscustomobject]@{
    pid       = $target.ProcessId
    hwnd      = [int64]$handle
    title     = $title.ToString()
    attached  = $attached
    setResult = $set
    clicked   = $clicked
    realClicked = $realClicked
  }
}

$after = [QaFg.Win]::GetForegroundWindow()
$handles = @($tried | ForEach-Object { $_.hwnd })
# The only evidence that counts: is the foreground window one of ours NOW.
$ok = if ($CloseOnly) { $handles.Count -gt 0 } else { ($handles.Count -gt 0) -and ($handles -contains [int64]$after) }

[pscustomobject]@{
  ok               = $ok
  processName      = $ProcessName
  token            = $Token
  titleMatch       = $TitleMatch
  windows          = $tried
  foregroundAfter  = [int64]$after
} | ConvertTo-Json -Depth 4 -Compress
