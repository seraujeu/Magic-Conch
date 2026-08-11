@echo off
setlocal
title Magic Conch

cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo.
  echo Magic Conch requires Node.js 22.13 or newer.
  echo Download it from https://nodejs.org/ and then run this file again.
  echo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo.
  echo npm was not found. Reinstall Node.js and then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vinext.cmd" (
  echo Installing Magic Conch for first use...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Installation failed. Review the messages above and try again.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starting Magic Conch...
echo Keep this window open while using the program.
echo Press Ctrl+C in this window to stop it.
echo.

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command ^
  "$address = 'http://localhost:3000'; for ($attempt = 0; $attempt -lt 60; $attempt++) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri $address -TimeoutSec 1; if ($response.StatusCode -ge 200) { Start-Process $address; break } } catch {}; Start-Sleep -Seconds 1 }"

call npm.cmd run dev -- --port 3000

if errorlevel 1 (
  echo.
  echo Magic Conch stopped because the server could not start.
  echo If port 3000 is already in use, close the other program and try again.
  echo.
  pause
)

endlocal
