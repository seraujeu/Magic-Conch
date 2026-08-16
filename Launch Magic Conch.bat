@echo off
setlocal
title Magic Conch
cd /d "%~dp0"

if exist "%~dp0.runtime\node\node.exe" set "PATH=%~dp0.runtime\node;%PATH%"

where node.exe >nul 2>nul
if errorlevel 1 goto node_required

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 goto node_required

node "%~dp0scripts\launch.mjs" %*
set "LAUNCH_EXIT=%errorlevel%"
if not "%LAUNCH_EXIT%"=="0" (
  pause
  exit /b %LAUNCH_EXIT%
)
endlocal
exit /b 0

:node_required
echo Magic Conch requires Node.js 22.13 or newer.
echo Run install.bat first.
pause
exit /b 1
