param([string]$Profile = 'desktop', [switch]$WithProtocolChecks)
$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
if (!(Test-Path -LiteralPath $launcher)) {
    $launcher = (Get-Command dsh -ErrorAction Stop).Source
}
if ($WithProtocolChecks) { & (Join-Path $PSScriptRoot 'setup-python.ps1') }
& $launcher plugin --profile $Profile add ('link:' + $pluginRoot.Replace('\', '/'))
if ($LASTEXITCODE -ne 0) { throw 'DSH 插件安装失败。' }
Write-Host '插件已安装。在 DSH 插件面板刷新，左侧打开“模型指纹”。'
