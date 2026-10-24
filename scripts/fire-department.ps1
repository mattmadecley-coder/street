<#
Fires a Street HQ department as its own standalone, hidden Claude Code
session running directly on this machine -- no cloud trigger, no device
bridge, full local access. Used by the GM (or Matthew directly) to get
something done right now instead of waiting for a scheduled/cloud run.

Usage:
  .\scripts\fire-department.ps1 -Department infrastructure -Task "Set up git worktrees per department"

The department session runs detached (hidden window) and reports through
the normal hq/<dept>/log.md and questions.md files, exactly like a
scheduled run would. Raw session output lands in hq/<dept>/live-runs/.
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Department,

    [Parameter(Mandatory=$true)]
    [string]$Task
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$MapFile = Join-Path $RepoRoot "scripts\departments.json"

if (-not (Test-Path $MapFile)) {
    Write-Error "departments.json not found at $MapFile"
    exit 1
}

$Map = Get-Content $MapFile -Raw | ConvertFrom-Json

if (-not ($Map.PSObject.Properties.Name -contains $Department)) {
    Write-Error "Unknown department '$Department'. Known: $($Map.PSObject.Properties.Name -join ', ')"
    exit 1
}

$AgentFile = $Map.$Department
$DeptDir = Join-Path $RepoRoot "hq\$Department"

if (-not (Test-Path $DeptDir)) {
    Write-Error "hq\$Department does not exist -- is '$Department' a real department folder?"
    exit 1
}

$Prompt = @"
You are the $Department department of Street HQ (streetdotcom.com), running
directly on Matthew's own PC via Claude Code -- not a cloud session, no
device bridge, full local access to this machine and the internet.

Steps:
1. Read hq/_shared/company.md and hq/_shared/decisions.md first -- decisions.md
   overrides anything conflicting in your charter.
2. Read .claude/agents/$AgentFile -- that is your full agent definition and
   job description. Follow it exactly.
3. Read hq/$Department/charter.md -- your full charter: mission, checks,
   and Tier 1/2/3 allowed-action boundaries.
4. Read hq/$Department/goals.md and hq/$Department/log.md for what's already
   in progress.
5. You were fired directly, right now, by Matthew via the GM, with this
   specific task: "$Task"
   Treat it as a Tier 1 action item for this run per the house rules in
   company.md's "Assigned by Matthew" convention -- unless it is clearly
   Tier 2/3 for your department (needs money, a real decision, or touches
   something outside hq/), in which case write it to questions.md under
   Open with your recommendation instead of attempting it.
6. Running locally with full access removes the TECHNICAL barriers only --
   it does not raise your own Tier boundaries. Still never deploy, spend,
   send, or change production without the approval your charter requires.
7. Append one line to hq/$Department/log.md noting this was a direct local
   fire from Matthew/GM and what you did. Update goals.md and questions.md
   as appropriate.
8. Never write a secret, API key, or credential value into any hq/ file.
"@

$RunsDir = Join-Path $DeptDir "live-runs"
if (-not (Test-Path $RunsDir)) {
    New-Item -ItemType Directory -Path $RunsDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $RunsDir "$Timestamp.log"
$ErrFile = Join-Path $RunsDir "$Timestamp.err.log"

Write-Host "Firing '$Department' locally."
Write-Host "Task: $Task"
Write-Host "Raw output -> $LogFile"
Write-Host "Normal report -> hq\$Department\log.md and hq\$Department\questions.md"

$ArgList = @("-p", $Prompt, "--dangerously-skip-permissions")

Start-Process -FilePath "claude" `
    -ArgumentList $ArgList `
    -WorkingDirectory $RepoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError $ErrFile

Write-Host ""
Write-Host "'$Department' is now running in the background. It will report"
Write-Host "through its own hq\$Department\log.md and questions.md as usual --"
Write-Host "no need to wait here for it."
