@echo off
setlocal
title Update Magic Conch
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Magic Conch requires Node.js 22.13 or newer.
  pause
  exit /b 1
)

node "%~dp0scripts\update-from-github.mjs" %*
if errorlevel 1 pause
endlocal
