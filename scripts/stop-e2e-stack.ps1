param(
  [Parameter(Mandatory = $true)]
  [string]$StackFile
)

$ErrorActionPreference = "Stop"
$stack = Get-Content -LiteralPath $StackFile -Raw | ConvertFrom-Json
foreach ($processId in @($stack.api_pid, $stack.frontend_pid)) {
  if ($processId) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}
Remove-Item -LiteralPath $stack.session_file -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $StackFile -Force -ErrorAction SilentlyContinue
Write-Output "stopped"
