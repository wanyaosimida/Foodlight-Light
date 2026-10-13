param()
$ErrorActionPreference = 'Stop'
$mediaProjectDir = Split-Path -Parent $PSScriptRoot
$mediaVenvDir = Join-Path $mediaProjectDir 'local-models\media-venv'
$mediaPython = Join-Path $mediaVenvDir 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $mediaPython)) {
    & py -3.11 -m venv $mediaVenvDir
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the Python 3.11 media environment.' }
}
& node (Join-Path $PSScriptRoot 'download-image-runtime.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Image download did not complete. Partial downloads are retained for resuming.' }
$imageRuntimeDir = Join-Path $mediaProjectDir 'local-models\image-runtime'
$imageExecutable = Join-Path $imageRuntimeDir 'bin\sd-cli.exe'
if (-not (Test-Path -LiteralPath $imageExecutable)) {
    Expand-Archive -LiteralPath (Join-Path $imageRuntimeDir 'runtime-vulkan.zip') -DestinationPath (Join-Path $imageRuntimeDir 'bin')
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'licenses\LICENSE.sd-turbo.md') -Destination (Join-Path $imageRuntimeDir 'LICENSE.sd-turbo.md')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'licenses\NOTICE.sd-turbo.txt') -Destination (Join-Path $imageRuntimeDir 'NOTICE.txt')
Write-Output 'Portable image runtime installed. Restart the local app to enable image generation.'
