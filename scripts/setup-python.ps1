param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $pluginRoot '.venv'
& $Python -m venv $environmentPath
if ($LASTEXITCODE -ne 0) { throw 'Python 环境创建失败，需要 Python 3.10 或更新版本。' }
$environmentPython = Join-Path $environmentPath 'Scripts\python.exe'
& $environmentPython -m pip install --disable-pip-version-check -r (Join-Path $pluginRoot 'python\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Python 依赖安装失败。行为指纹功能仍可独立使用。' }
Write-Host 'Model Check Core 依赖安装完成。'
