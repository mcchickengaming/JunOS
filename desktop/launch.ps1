[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$JunHome,
    [Parameter(Mandatory = $true)] [string]$Url
)

# Opens Jun's desktop app (desktop\main.js). start.ps1 calls this
# at the end of a start, and for `.\start.ps1 desktop`.
#
# The app runs on Electron, a browser engine packaged as a normal
# Windows program. It is NOT in git: the first run downloads one
# pinned version from Electron's own GitHub releases into
# runtime\electron, checks its SHA-256, and keeps it. Bumping the
# version means updating both lines below from that release's
# SHASUMS256.txt (the electron-vX-win32-x64.zip line).

$ErrorActionPreference = 'Stop'
$ElectronVersion = '45.2.3'
$ElectronSha256  = '489cd061908e697394b004298bf5ffd345c935d10e8ca197ba819f019ab2dec0'

$root = Join-Path $JunHome 'runtime\electron'
$dir  = Join-Path $root "v$ElectronVersion"
$exe  = Join-Path $dir 'electron.exe'

if (-not (Test-Path -LiteralPath $exe)) {
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    $name = "electron-v$ElectronVersion-win32-x64.zip"
    $zip  = Join-Path $root $name
    $src  = "https://github.com/electron/electron/releases/download/v$ElectronVersion/$name"
    Write-Host "    downloading her desktop app (Electron $ElectronVersion, about 115 MB, only this once)"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    # the progress bar makes Invoke-WebRequest crawl on PowerShell 5.1
    $oldProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri $src -OutFile $zip -UseBasicParsing
    } finally {
        $ProgressPreference = $oldProgress
    }
    $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $ElectronSha256) {
        Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
        throw "the Electron download did not match its checksum (got $hash), so it was deleted"
    }
    # unpack next to the final folder and rename at the end, so a
    # half-finished unzip never looks like a usable install
    $tmp = "$dir.partial"
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
    Move-Item -LiteralPath $tmp -Destination $dir
    Remove-Item -LiteralPath $zip -Force
    # an older pinned version, from before an update
    Get-ChildItem -LiteralPath $root -Directory |
        Where-Object { $_.Name -ne "v$ElectronVersion" } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

$app = Join-Path $JunHome 'desktop'
# if she's already open this just brings her forward (single instance)
Start-Process -FilePath $exe -WorkingDirectory $JunHome -ArgumentList @(
    "`"$app`"",
    "--jun-url=$Url",
    "--jun-home=`"$JunHome`""
)
