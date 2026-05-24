param(
  [string]$ImageName = "ghcr.io/pairmeng/image-2-studio",
  [string]$Tag = "",
  [string]$Platform = "linux/amd64",
  [string]$NpmRegistry = "https://registry.npmjs.org/",
  [string]$PnpmVersion = "11.1.2",
  [string]$CacheRef = "",
  [switch]$NoCache,
  [switch]$NoLatest,
  [switch]$Dev,
  [switch]$Verify,
  [switch]$RequireClean
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

function Get-GitShortSha {
  $shortSha = Get-GitOutput @("rev-parse", "--short", "HEAD")
  if (-not $shortSha) {
    throw "Could not resolve the current Git commit."
  }

  return $shortSha
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

if ($Dev -and $Tag) {
  throw "-Dev cannot be combined with -Tag. Dev publishing uses dev-latest and dev-<short-sha>."
}

if ((-not $Dev) -and (-not $Tag)) {
  throw "Release publishing requires -Tag vX.Y.Z. Use -Dev for development publishing."
}

if ($Dev) {
  $RequireClean = $true
}

if ($RequireClean) {
  Assert-CleanWorktree
}

if ($Verify) {
  Invoke-CheckedCommand pnpm.cmd run verify
}

if (-not $CacheRef) {
  $CacheRef = "${ImageName}:buildcache"
}

$publishedTags = @()
if ($Dev) {
  $shortSha = Get-GitShortSha
  $publishedTags = @("dev-latest", "dev-$shortSha")
  $NoLatest = $true
} else {
  $publishedTags = @($Tag)
  if (-not $NoLatest) {
    $publishedTags += "latest"
  }
}

$tags = @()
foreach ($publishedTag in $publishedTags) {
  $tags += @("-t", "${ImageName}:${publishedTag}")
}

$cacheArgs = @()
if (-not $NoCache) {
  $cacheArgs = @(
    "--cache-from", "type=registry,ref=$CacheRef",
    "--cache-to", "type=registry,ref=$CacheRef,mode=max"
  )
}

Write-Host "Publishing Docker image:" -ForegroundColor Cyan
Write-Host "  image:    $ImageName"
Write-Host "  tags:     $($publishedTags -join ', ')"
Write-Host "  platform: $Platform"
Write-Host "  registry: $NpmRegistry"
if (-not $NoCache) {
  Write-Host "  cache:    $CacheRef"
}
if ($Dev) {
  Write-Host "  mode:     dev"
}

Invoke-CheckedCommand docker buildx version

$dockerArgs = @(
  "buildx",
  "build",
  "--platform", $Platform,
  "--build-arg", "NPM_REGISTRY=$NpmRegistry",
  "--build-arg", "PNPM_VERSION=$PnpmVersion"
)
$dockerArgs += $tags
$dockerArgs += $cacheArgs
$dockerArgs += @("--push", ".")

Invoke-CheckedCommand docker @dockerArgs

foreach ($publishedTag in $publishedTags) {
  Write-Host "Published ${ImageName}:${publishedTag}" -ForegroundColor Green
}
