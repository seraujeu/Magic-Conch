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

set "MAGIC_CONCH_PORT=4173"
if not defined MAGIC_CONCH_PORT if defined PORT set "MAGIC_CONCH_PORT=%PORT%"

for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command ^
  "$requested = $env:MAGIC_CONCH_PORT; $candidate = 0; if ($requested) { if (-not [int]::TryParse($requested, [ref]$candidate) -or $candidate -lt 1 -or $candidate -gt 65535) { Write-Error 'The port must be a number from 1 to 65535.'; exit 1 } } else { $candidate = 3000 }; for ($port = $candidate; $port -le 65535; $port++) { $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port); $listener.ExclusiveAddressUse = $true; try { $listener.Start(); $listener.Stop(); Write-Output $port; exit 0 } catch { $listener.Stop() } }; Write-Error 'No available local port was found.'; exit 1"`) do set "MAGIC_CONCH_RESOLVED_PORT=%%P"

if not defined MAGIC_CONCH_RESOLVED_PORT (
  echo.
  echo Magic Conch could not select a local port.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting Magic Conch...
echo Opening http://localhost:%MAGIC_CONCH_RESOLVED_PORT%/
echo Keep this window open while using the program.
echo Press Ctrl+C in this window to stop it.
echo.

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command ^
  "$address = 'http://localhost:%MAGIC_CONCH_RESOLVED_PORT%'; for ($attempt = 0; $attempt -lt 60; $attempt++) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri $address -TimeoutSec 1; if ($response.StatusCode -ge 200) { Start-Process $address; break } } catch {}; Start-Sleep -Seconds 1 }"

call npm.cmd run dev -- --port %MAGIC_CONCH_RESOLVED_PORT% --strictPort

if errorlevel 1 (
  echo.
  echo Magic Conch stopped because the server could not start.
  echo Try running this launcher again or specify a different port.
  echo.
  pause
)

endlocal
