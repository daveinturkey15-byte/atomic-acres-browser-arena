@echo off
REM ---------------------------------------------------------------------------
REM Atomic Acres - launch WITHOUT vsync (owner 2026-08-30: "my pc never uses
REM vsync by choice").
REM
REM WHY THIS FILE EXISTS: a web page cannot switch vsync off from JavaScript -
REM there is no API for it. requestAnimationFrame is driven by Chrome's
REM compositor, which paces to the display refresh. The ONLY way to exceed it
REM is a Chrome launch flag, so the game ships uncapped (every graphics preset
REM sets frameRateLimit: 0) and this launcher removes the browser's ceiling.
REM
REM CRITICAL: Chrome only applies these flags to a NEW browser process. If your
REM normal Chrome is already running, a plain launch just opens a tab in the
REM existing process and every flag below is silently ignored. That is why this
REM uses its own --user-data-dir: it always starts a genuinely separate Chrome
REM so the flags actually take effect, and it never touches your main profile,
REM tabs, extensions or logins.
REM ---------------------------------------------------------------------------

setlocal

set "GAME_URL=https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass81/"
if not "%~1"=="" set "GAME_URL=%~1"

set "PROFILE_DIR=%LOCALAPPDATA%\AtomicAcresNoVsyncProfile"

set "CHROME="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
) do if exist %%P set "CHROME=%%~P"

if not defined CHROME (
  echo Could not find chrome.exe in the usual locations.
  echo Edit this file and set CHROME to your Chrome path.
  pause
  exit /b 1
)

echo Launching Atomic Acres with vsync disabled...
echo   Chrome : %CHROME%
echo   URL    : %GAME_URL%
echo   Profile: %PROFILE_DIR%  (separate instance - your normal Chrome is untouched)
echo.

start "" "%CHROME%" ^
  --user-data-dir="%PROFILE_DIR%" ^
  --disable-gpu-vsync ^
  --disable-frame-rate-limit ^
  --use-angle=d3d11 ^
  --ignore-gpu-blocklist ^
  --enable-gpu-rasterization ^
  --enable-zero-copy ^
  --disable-background-timer-throttling ^
  --disable-backgrounding-occluded-windows ^
  --disable-renderer-backgrounding ^
  --disable-features=CalculateNativeWinOcclusion ^
  --autoplay-policy=no-user-gesture-required ^
  --start-maximized ^
  "%GAME_URL%"

endlocal
