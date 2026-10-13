# Dot-source from PowerShell: . .\local-server\ai-env.ps1
# These settings affect this process only; no machine/user environment is changed.
$modelRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\local-models'))
$modelConfig = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ai-config.json') -Raw | ConvertFrom-Json
foreach ($setting in $modelConfig.PSObject.Properties) {
  [Environment]::SetEnvironmentVariable($setting.Name, [string]$setting.Value, 'Process')
}
$env:OLLAMA_MODELS = Join-Path $modelRoot 'models'
