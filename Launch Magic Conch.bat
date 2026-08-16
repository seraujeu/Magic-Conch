@echo off
setlocal
title Magic Conch
cd /d "%~dp0"

if exist "%~dp0.runtime\node\node.exe" set "PATH=%~dp0.runtime\node;%PATH%"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo Magic Conch requires Node.js 22.13 or newer.
  echo Run install.bat first.
  pause
  exit /b 1
)

node "%~dp0scripts\launch.mjs" %*
if errorlevel 1 pause
endlocal
