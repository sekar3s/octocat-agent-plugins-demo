<#
.SYNOPSIS
  Removes all OctoCAT agent plugins from GitHub Copilot CLI.
.PARAMETER RemoveMarketplace
  Also unregister the octocat-agent-plugins marketplace.
#>
param([switch]$RemoveMarketplace)

$Marketplace = 'octocat-agent-plugins'
$Plugins = @('ship-ready', 'secure-code', 'onboarding-buddy')

if (-not (Get-Command copilot -ErrorAction SilentlyContinue)) { throw 'GitHub Copilot CLI not found.' }

$installed = (copilot plugin list --json 2>$null | Out-String | ConvertFrom-Json) | ForEach-Object { $_.name }
foreach ($p in $Plugins) {
  if ($installed -contains $p) {
    Write-Host "• Uninstalling $p"
    copilot plugin uninstall $p
  } else {
    Write-Host "• $p is not installed"
  }
}

if ($RemoveMarketplace) {
  Write-Host "• Removing marketplace $Marketplace"
  copilot plugin marketplace remove $Marketplace --force
}

copilot plugin list
Write-Host "`n✓ Done. See docs/uninstall.md to remove VS Code settings, caches, and audit logs."
