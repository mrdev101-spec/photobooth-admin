# Starts the local development MariaDB (data in .local/mariadb, created once by the setup in README).
# Runs in the foreground; stop with Ctrl+C.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ini = Join-Path $root '.local\mariadb\my.ini'
if (-not (Test-Path $ini)) { throw "No local database at $ini. See README > Local database." }
if (Get-Process mariadbd -ErrorAction SilentlyContinue) {
  Write-Host 'MariaDB is already running (127.0.0.1:3306). Nothing to do.'
  exit 0
}
$bin = Get-ChildItem 'C:\Program Files' -Directory -Filter 'MariaDB*' | Sort-Object Name -Descending | Select-Object -First 1
if (-not $bin) { throw 'MariaDB is not installed (winget install MariaDB.Server).' }
& (Join-Path $bin.FullName 'bin\mariadbd.exe') "--defaults-file=$ini" '--bind-address=127.0.0.1' '--console'
