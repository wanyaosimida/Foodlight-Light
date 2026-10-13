@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONDONTWRITEBYTECODE=1
if not exist "%~dp0runtime\node\node.exe" (
  echo 请先按“Windows下载与部署说明.md”下载 Node.js 并解压到 runtime\node\。
  pause
  exit /b 1
)
"%~dp0runtime\node\node.exe" "%~dp0local-app\local-server\portable.mjs" verify
pause
