param(
  [string]$RunId = (Get-Date -Format "yyyyMMdd-HHmmss")
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root "runtime\e2e-$RunId"
$SessionFile = Join-Path $Root "runtime\e2e-session-$RunId.json"
$StackFile = Join-Path $Root "runtime\e2e-stack-$RunId.json"
$Node = "C:\Users\명성현\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

$randomBytes = New-Object byte[] 48
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $random.GetBytes($randomBytes)
  $jwtSecret = [Convert]::ToBase64String($randomBytes)
  $random.GetBytes($randomBytes)
  $keySecret = [Convert]::ToBase64String($randomBytes)
  $random.GetBytes($randomBytes)
  $adminToken = [Convert]::ToBase64String($randomBytes)
} finally {
  $random.Dispose()
}

$env:BREMEN_ENV = "staging"
$env:BREMEN_AUTH_JWT_ONLY = "true"
$env:BREMEN_JWT_SECRET = $jwtSecret
$env:BREMEN_JWT_ISSUER = "bremen-e2e"
$env:BREMEN_JWT_AUDIENCE = "bremen-e2e-client"
$env:BREMEN_KEY_ENCRYPTION_SECRET = $keySecret
$env:BREMEN_ADMIN_TOKEN = $adminToken
$env:BREMEN_RUNTIME_DIR = $Runtime
$env:BREMEN_CORS_ORIGINS = "http://127.0.0.1:3103,http://localhost:3103"
$env:NEXT_PUBLIC_BREMEN_API_BASE_URL = "http://127.0.0.1:8100"
$env:NEXT_PUBLIC_BREMEN_WS_BASE_URL = "ws://127.0.0.1:8100"
$env:NEXT_PUBLIC_BREMEN_DEMO_MODE = "false"
$env:NEXT_PUBLIC_BREMEN_AUTH_MODE = "jwt_only"
$env:NEXT_PUBLIC_BREMEN_E2E_MODE = "true"
$env:BREMEN_NEXT_DIST_DIR = ".next-e2e-$RunId"

$apiOut = Join-Path $Runtime "api.out.log"
$apiErr = Join-Path $Runtime "api.err.log"
$frontendOut = Join-Path $Runtime "frontend.out.log"
$frontendErr = Join-Path $Runtime "frontend.err.log"

$api = $null
$frontend = $null
try {
  $api = Start-Process -FilePath "python" `
    -ArgumentList @("-m", "uvicorn", "api.server:app", "--host", "127.0.0.1", "--port", "8100") `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr

  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 400
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:8100/api/health" -TimeoutSec 2
    } catch {
      $health = $null
    }
  } until ($health -or (Get-Date) -gt $deadline)

  if (-not $health) {
    throw "E2E API failed to start. See $apiErr"
  }
  if ($health.status -ne "healthy" -or $health.auth_mode -ne "jwt_only") {
    throw "E2E API security health check failed"
  }

  python (Join-Path $PSScriptRoot "bootstrap-e2e-sessions.py") `
    --api-base-url "http://127.0.0.1:8100" --run-id $RunId --output $SessionFile | Out-Null

  $frontend = Start-Process -FilePath $Node `
    -ArgumentList @(".\node_modules\next\dist\bin\next", "dev", "-H", "127.0.0.1", "-p", "3103") `
    -WorkingDirectory (Join-Path $Root "frontend") -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr

  $deadline = (Get-Date).AddSeconds(60)
  $frontendReady = $false
  do {
    Start-Sleep -Milliseconds 500
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:3103/" -TimeoutSec 3 -UseBasicParsing
      $frontendReady = $response.StatusCode -eq 200
    } catch {
      $frontendReady = $false
    }
  } until ($frontendReady -or (Get-Date) -gt $deadline)

  if (-not $frontendReady) {
    throw "E2E frontend failed to start. See $frontendErr"
  }

  $stack = @{
    run_id = $RunId
    api_pid = $api.Id
    frontend_pid = $frontend.Id
    runtime_dir = $Runtime
    session_file = $SessionFile
    frontend_url = "http://127.0.0.1:3103"
    api_url = "http://127.0.0.1:8100"
  }
  $stack | ConvertTo-Json | Set-Content -LiteralPath $StackFile -Encoding UTF8
  Write-Output ($stack | ConvertTo-Json -Compress)
} catch {
  if ($frontend) {
    Stop-Process -Id $frontend.Id -Force -ErrorAction SilentlyContinue
  }
  if ($api) {
    Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $SessionFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $StackFile -Force -ErrorAction SilentlyContinue
  throw
}
