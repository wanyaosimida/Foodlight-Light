# Starts the project-owned portable Ollama service without system startup changes.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ai-env.ps1')
$modelExecutable = Join-Path $modelRoot 'ollama\ollama.exe'
if (-not (Test-Path -LiteralPath $modelExecutable)) {
  throw "Portable Ollama is missing: $modelExecutable. See local-server/AI-CONFIG.md."
}
try {
  $version = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 3
  Write-Output "Ollama is already running at 127.0.0.1:11434 (version $($version.version))."
  return
} catch { }
$logDirectory = Join-Path $modelRoot 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$modelProcess = Start-Process -FilePath $modelExecutable -ArgumentList 'serve' -WorkingDirectory (Split-Path $modelExecutable) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'ollama.stdout.log') -RedirectStandardError (Join-Path $logDirectory 'ollama.stderr.log')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 500
  if ($modelProcess.HasExited) { throw "Ollama stopped. Check $logDirectory\ollama.stderr.log" }
  try {
    $version = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 2
    Write-Output "Ollama $($version.version) started at 127.0.0.1:11434, PID $($modelProcess.Id)."
    return
  } catch { }
}
throw "Ollama did not become ready. Check $logDirectory\ollama.stderr.log"
