@echo off
setlocal
title Install Magic Conch
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Magic Conch requires Node.js 22.13 or newer.
  echo Download it from https://nodejs.org/ and run this installer again.
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)"
if errorlevel 1 (
  echo Magic Conch requires Node.js 22.13 or newer. Found:
  node --version
  echo Download a supported version from https://nodejs.org/ and run this installer again.
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm included, then run this installer again.
  exit /b 1
)

echo Installing Magic Conch dependencies...
call npm.cmd ci
if errorlevel 1 (
  echo Installation failed.
  exit /b 1
)

echo.
echo Magic Conch is installed.
echo Launch it with "Launch Magic Conch.bat" or run: npm run launch
endlocal
