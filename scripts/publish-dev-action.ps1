param(
  [string]$Workflow = "docker-image.yml",
  [string]$WorkflowRef = "main",
  [string]$Ref = "main",
  [switch]$Verify,
  [switch]$RequireClean,
  [switch]$SkipRemoteHeadCheck
)

$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Get-GitOutput {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = git @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }

  return ($output | Select-Object -First 1).Trim()
}

function Assert-CleanWorktree {
  $status = git status --porcelain
  if ($LASTEXITCODE -ne 0) {
    throw "git status --porcelain failed with exit code $LASTEXITCODE."
  }

  if (($status | Where-Object { $_ }).Count -gt 0) {
    throw "Working tree is not clean. Commit or stash local changes before publishing."
  }
}

function Resolve-GhCommand {
  $command = Get-Command gh -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $knownPaths = @(
    "C:\Program Files\GitHub CLI\gh.exe",
    "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe",
    "$env:USERPROFILE\scoop\shims\gh.exe"
  )

  foreach ($path in $knownPaths) {
    if (Test-Path -LiteralPath $path) {
      return $path
    }
  }

  throw "GitHub CLI was not found. Install gh or add it to PATH before publishing dev images."
}

if ($RequireClean) {
  Assert-CleanWorktree
}

if ($Verify) {
  Invoke-CheckedCommand pnpm.cmd run verify
}

if (($Ref -eq "main") -and (-not $SkipRemoteHeadCheck)) {
  $head = Get-GitOutput @("rev-parse", "HEAD")
  $originMain = Get-GitOutput @("rev-parse", "origin/main")

  if ($head -ne $originMain) {
    throw "Local HEAD does not match origin/main. Push main before publishing dev images, or pass -SkipRemoteHeadCheck."
  }
}

$gh = Resolve-GhCommand
Invoke-CheckedCommand $gh auth status

Write-Host "Triggering GitHub Actions dev image publish:" -ForegroundColor Cyan
Write-Host "  workflow: $Workflow"
Write-Host "  workflow ref: $WorkflowRef"
Write-Host "  build ref: $Ref"
Write-Host "  channel: dev"

Invoke-CheckedCommand $gh workflow run $Workflow --ref $WorkflowRef -f "ref=$Ref" -f "channel=dev" -f "publish=true"

Write-Host "Triggered dev image publish. Check runs with:" -ForegroundColor Green
Write-Host "  gh run list --workflow $Workflow --limit 5"
