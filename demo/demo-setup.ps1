<#
.SYNOPSIS
  Prepares a safe, repeatable demo of the OctoCAT agent plugins (Windows / PowerShell 7+).
.DESCRIPTION
  Verifies prerequisites, creates an isolated git worktree of OctoCAT Supply on a throwaway branch
  (your checkout is never touched), commits a demo glossary there, and installs the plugins into Copilot CLI.
.PARAMETER Target
  Existing OctoCAT Supply clone. Defaults to ..\octocat-supply-sep28 (cloned if missing).
.PARAMETER Local
  Install plugins from this working copy instead of GitHub.
#>
param(
  [string]$Target = (Join-Path $PSScriptRoot '..\..\octocat-supply-sep28'),
  [switch]$Local
)
$ErrorActionPreference = 'Stop'
$Here = Resolve-Path (Join-Path $PSScriptRoot '..')
$Source = if ($Local) { "$Here" } else { 'sekar3s/octocat-agent-plugins-demo' }
$Branch = 'demo/agent-plugins'

Write-Host '▶ Checking prerequisites'
foreach ($bin in 'git', 'node', 'copilot') {
  if (-not (Get-Command $bin -ErrorAction SilentlyContinue)) { throw "$bin not found" }
  Write-Host "  ✓ $bin $((& $bin --version | Select-Object -First 1))"
}
if ([int](node -p "process.versions.node.split('.')[0]") -lt 18) { throw 'Node.js 18+ required' }

Write-Host '▶ Preparing OctoCAT Supply demo worktree'
if (-not (Test-Path (Join-Path $Target '.git'))) {
  git clone --quiet https://github.com/sekar3s/octocat-supply-sep28.git $Target
}
$Target = (Resolve-Path $Target).Path
$Worktree = Join-Path (Split-Path $Target -Parent) 'octocat-supply-plugin-demo'
if (Test-Path $Worktree) {
  Write-Host "  ✓ worktree already exists: $Worktree"
} else {
  git -C $Target worktree add --quiet -B $Branch $Worktree HEAD
  Write-Host "  ✓ created $Worktree on branch $Branch"
}

$glossaryDir = Join-Path $Worktree '.github\onboarding'
New-Item -ItemType Directory -Force -Path $glossaryDir | Out-Null
Copy-Item (Join-Path $Here 'demo\octocat-glossary.json') (Join-Path $glossaryDir 'glossary.json') -Force
if (git -C $Worktree status --porcelain -- .github/onboarding) {
  git -C $Worktree add .github/onboarding/glossary.json
  git -C $Worktree commit --quiet -m 'docs: add onboarding glossary for agent plugin demo'
  if ($LASTEXITCODE -ne 0) {
    git -C $Worktree -c user.name='OctoCAT Demo' -c user.email='demo@example.com' commit --quiet -m 'docs: add onboarding glossary for agent plugin demo'
  }
}
Write-Host "  ✓ team glossary committed on $Branch"

Write-Host "▶ Installing plugins (source: $Source)"
& (Join-Path $Here 'scripts\install-all.ps1') -Source $Source | Out-Null
copilot plugin list

Write-Host @"

✅ Demo ready.

  Demo workspace : $Worktree
  CLI            : cd "$Worktree"; copilot
  VS Code        : code "$Worktree"
  Copilot app    : open the app → add project → $Worktree

  Follow demo/DEMO-SCRIPT.md. When finished run: demo\demo-cleanup.ps1 -Target "$Target"
"@
