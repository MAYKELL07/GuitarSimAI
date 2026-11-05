param([string]$BuildDirectory = 'build/windows')
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$buildRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $BuildDirectory))
$executable = Join-Path $buildRoot 'Selah_artefacts/Release/Selah.exe'
$report = Join-Path $buildRoot 'engine-test-report.txt'
if (!(Test-Path -LiteralPath $executable)) { throw 'Build the Release C++ application first.' }
if (!(Test-Path -LiteralPath $report) -or !(Get-Content -LiteralPath $report -Raw).StartsWith('PASS:')) {
    throw 'Run ctest --preset windows successfully before packaging.'
}
$packageRoot = Join-Path $workspaceRoot 'release/Selah-cpp-windows-x64'
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
Copy-Item -LiteralPath $executable -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot 'native-cpp/LICENSE') -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot 'native-cpp/THIRD_PARTY.md') -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot 'README.md') -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $workspaceRoot 'docs/NATIVE_STATUS.md') -Destination $packageRoot
Copy-Item -LiteralPath $report -Destination $packageRoot
$juceNotice = Join-Path $workspaceRoot 'native-cpp/JUCE/LICENSE.md'
if (!(Test-Path -LiteralPath $juceNotice)) { $juceNotice = Join-Path $buildRoot '_deps/juce-src/LICENSE.md' }
Copy-Item -LiteralPath $juceNotice -Destination (Join-Path $packageRoot 'JUCE-LICENSE.md')
$juceRoot = Split-Path -Parent $juceNotice
Get-ChildItem -LiteralPath (Join-Path $juceRoot 'modules') -Recurse -File | Where-Object {
    $_.Name -match '^(LICEN[CS]E|COPYING)(\..*)?$' -or $_.Name -in @('Flac Licence.txt', 'README', 'README.md')
} | ForEach-Object {
    $relative = [IO.Path]::GetRelativePath($juceRoot, $_.FullName)
    $destination = Join-Path $packageRoot (Join-Path 'third-party-licenses' $relative)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination
}
$commit = git -C $workspaceRoot rev-parse HEAD
@{
    version = '3.0.0-preview.1'
    sourceCommit = "$commit"
    source = "https://github.com/MAYKELL07/GuitarSimAI/tree/$commit"
    builtAtUtc = [DateTime]::UtcNow.ToString('o')
    sha256 = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
    verification = 'Release MSVC build, CTest DSP and offline engine checks; see NATIVE_STATUS.md for hardware limits.'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $packageRoot 'build-info.json') -Encoding utf8
$archive = Join-Path $workspaceRoot 'release/Selah-cpp-windows-x64.zip'
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $archive -Force
Get-Item -LiteralPath $archive | Select-Object FullName, Length
Get-FileHash -LiteralPath $archive -Algorithm SHA256
