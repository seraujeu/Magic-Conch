param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDirectory
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-NodeArchitecture {
  $architecture = if ($env:PROCESSOR_ARCHITEW6432) {
    $env:PROCESSOR_ARCHITEW6432
  } else {
    $env:PROCESSOR_ARCHITECTURE
  }

  switch ($architecture.ToUpperInvariant()) {
    'AMD64' { return 'x64' }
    'ARM64' { return 'arm64' }
    'X86' { return 'x86' }
    default { throw "Unsupported Windows architecture: $architecture" }
  }
}

$installPath = [IO.Path]::GetFullPath($InstallDirectory)
$runtimeRoot = Split-Path -Parent $installPath
$runtimeRoot = [IO.Path]::GetFullPath($runtimeRoot)

if ([IO.Path]::GetPathRoot($installPath) -eq $installPath -or
    $installPath -eq $runtimeRoot) {
  throw "Refusing unsafe Node.js install path: $installPath"
}

$architecture = Get-NodeArchitecture
Write-Host 'Finding the latest supported Node.js 22 release...'
$releases = Invoke-RestMethod -UseBasicParsing 'https://nodejs.org/dist/index.json'
$release = $releases |
  Where-Object {
    $_.version -match '^v22\.(\d+)\.(\d+)$' -and [int]$Matches[1] -ge 13 -and
    $_.files -contains "win-$architecture-zip"
  } |
  Select-Object -First 1

if (-not $release) {
  throw "Node.js did not report a compatible Windows $architecture release."
}

$version = $release.version
$archiveName = "node-$version-win-$architecture.zip"
$baseUrl = "https://nodejs.org/dist/$version"
$workPath = Join-Path $runtimeRoot ('.install-' + [Guid]::NewGuid().ToString('N'))
$archivePath = Join-Path $workPath $archiveName
$extractPath = Join-Path $workPath 'extracted'
$stagedPath = Join-Path $runtimeRoot ('node-new-' + [Guid]::NewGuid().ToString('N'))

try {
  New-Item -ItemType Directory -Force -Path $workPath, $extractPath | Out-Null
  Write-Host "Downloading Node.js $version for Windows $architecture..."
  Invoke-WebRequest -UseBasicParsing "$baseUrl/$archiveName" -OutFile $archivePath

  $checksums = Invoke-RestMethod -UseBasicParsing "$baseUrl/SHASUMS256.txt"
  $checksumLine = $checksums -split "`n" |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -match ('^[0-9a-fA-F]{64}\s+' + [regex]::Escape($archiveName) + '$') } |
    Select-Object -First 1
  if (-not $checksumLine) {
    throw "The official checksum for $archiveName was not found."
  }

  $expectedHash = ($checksumLine -split '\s+')[0].ToUpperInvariant()
  $actualHash = (Get-FileHash -Algorithm SHA256 $archivePath).Hash
  if ($actualHash -ne $expectedHash) {
    throw 'The Node.js download failed its SHA-256 integrity check.'
  }

  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath
  $extractedRoot = Join-Path $extractPath "node-$version-win-$architecture"
  if (-not (Test-Path -LiteralPath (Join-Path $extractedRoot 'node.exe'))) {
    throw 'The downloaded Node.js archive had an unexpected layout.'
  }

  Move-Item -LiteralPath $extractedRoot -Destination $stagedPath
  if (Test-Path -LiteralPath $installPath) {
    Remove-Item -LiteralPath $installPath -Recurse -Force
  }
  Move-Item -LiteralPath $stagedPath -Destination $installPath
  Write-Host "Node.js $version installed in $installPath"
} finally {
  if (Test-Path -LiteralPath $stagedPath) {
    Remove-Item -LiteralPath $stagedPath -Recurse -Force
  }
  if (Test-Path -LiteralPath $workPath) {
    Remove-Item -LiteralPath $workPath -Recurse -Force
  }
}
