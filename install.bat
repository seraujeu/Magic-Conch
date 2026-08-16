@echo off
setlocal
title Install Magic Conch
cd /d "%~dp0"

set "BUNDLED_NODE=%~dp0.runtime\node"
if exist "%BUNDLED_NODE%\node.exe" set "PATH=%BUNDLED_NODE%;%PATH%"

where node.exe >nul 2>nul
if errorlevel 1 goto install_node

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 goto install_node

goto node_ready

:install_node
echo Node.js 22.13 or newer was not found.
echo Installing a private Node.js runtime for Magic Conch...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-node-windows.ps1" -InstallDirectory "%BUNDLED_NODE%"
if errorlevel 1 (
  echo.
  echo Node.js installation failed. Check your internet connection and try again.
  exit /b 1
)
set "PATH=%BUNDLED_NODE%;%PATH%"

:node_ready

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm included, then run this installer again.
  exit /b 1
)

echo Installing Magic Conch dependencies...
call npm.cmd ci
if not "%errorlevel%"=="0" (
  echo Installation failed.
  exit /b 1
)

echo.
echo Magic Conch is installed.
echo Launch it with "Launch Magic Conch.bat" or run: npm run launch
endlocal
