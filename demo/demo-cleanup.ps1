<#
.SYNOPSIS
  Reverts everything demo-setup.ps1 did.
.PARAMETER Target
  OctoCAT Supply clone used by the demo. Defaults to ..\octocat-supply-sep28.
.PARAMETER KeepPlugins
  Leave the plugins and marketplace installed.
#>
param(
  [string]$Target = (Join-Path $PSScriptRoot '..\..\octocat-supply-sep28'),
  [switch]$KeepPlugins
)
$Here = Resolve-Path (Join-Path $PSScriptRoot '..')
$Branch = 'demo/agent-plugins'

if (Test-Path $Target) {
  $Target = (Resolve-Path $Target).Path
  $Worktree = Join-Path (Split-Path $Target -Parent) 'octocat-supply-plugin-demo'
  if (Test-Path $Worktree) {
    Write-Host "▶ Removing demo worktree $Worktree"
    git -C $Target worktree remove --force $Worktree
  }
  git -C $Target worktree prune
  git -C $Target show-ref --verify --quiet "refs/heads/$Branch"
  if ($LASTEXITCODE -eq 0) {
    Write-Host "▶ Deleting branch $Branch"
    git -C $Target branch -D $Branch | Out-Null
  }
  foreach ($tag in (git -C $Target tag --list 'v*-demo')) {
    Write-Host "▶ Deleting demo tag $tag"
    git -C $Target tag -d $tag | Out-Null
  }
}

if (-not $KeepPlugins) {
  Write-Host '▶ Uninstalling plugins'
  & (Join-Path $Here 'scripts\uninstall-all.ps1') -RemoveMarketplace | Out-Null
  copilot plugin list
}
Write-Host '✅ Cleanup complete.'
