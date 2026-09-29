<#
.SYNOPSIS
  Installs all OctoCAT agent plugins into GitHub Copilot CLI (also used by VS Code and the Copilot app).
.PARAMETER Source
  Marketplace source. Defaults to sekar3s/octocat-agent-plugins-demo. Use a local path for development.
#>
param([string]$Source)
$ErrorActionPreference = 'Stop'

$Marketplace = 'octocat-agent-plugins'
$Plugins = @('ship-ready', 'secure-code', 'onboarding-buddy')

if (-not (Get-Command copilot -ErrorAction SilentlyContinue)) { throw 'GitHub Copilot CLI not found. See https://docs.github.com/copilot/how-tos/copilot-cli' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 18+ is required (plugins run MCP servers and hooks with node).' }
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 18) { throw "Node.js 18+ required (found $(node --version))." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is required.' }

$explicit = [bool]$Source
if (-not $Source) { $Source = 'sekar3s/octocat-agent-plugins-demo' }
$registered = (copilot plugin marketplace list 2>$null | Out-String) -match $Marketplace
if ($registered -and -not $explicit) {
  Write-Host "• Marketplace $Marketplace already registered — refreshing"
  copilot plugin marketplace update $Marketplace
} else {
  if ($registered) {
    # An explicit source was requested: re-register so we never silently keep a different source.
    Write-Host "• Re-registering $Marketplace from $Source"
    copilot plugin marketplace remove $Marketplace --force | Out-Null
  }
  Write-Host "• Adding marketplace from $Source"
  copilot plugin marketplace add $Source
}

foreach ($p in $Plugins) {
  Write-Host "• Installing $p@$Marketplace"
  copilot plugin install "$p@$Marketplace"
  if ($LASTEXITCODE -ne 0) { throw "Failed to install $p" }
}

copilot plugin list
Write-Host "`n✓ Done. Start a session with 'copilot' and try /onboard-me, /security-scan, or /ship-check."
