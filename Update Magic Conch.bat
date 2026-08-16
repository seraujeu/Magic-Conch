@echo off
setlocal
title Update Magic Conch
cd /d "%~dp0"

set "MAGIC_CONCH_REPOSITORY=https://github.com/seraujeu/Magic-Conch.git"
set "MAGIC_CONCH_BRANCH=main"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Magic Conch requires Node.js 22.13 or newer.
  pause
  exit /b 1
)

node "%~dp0scripts\update-from-github.mjs" %*
if errorlevel 1 pause
endlocal
