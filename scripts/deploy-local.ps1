[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory = $true)]
    [string]$FunctionAppName,

    [string]$SubscriptionId,

    # Shared report password for the hosted page gate (#10). Passed as an
    # argument (not committed anywhere) and applied as the REPORT_PASSWORD
    # app setting. Omit to leave the existing setting untouched. Prefer
    # reading it from a vault/env var at call time rather than typing it
    # into shell history, e.g. -ReportPassword $env:REPORT_PASSWORD.
    [string]$ReportPassword,

    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Push-Location $repoRoot
try {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw 'Azure CLI is required but not found on PATH. Install it first: https://aka.ms/azure-cli'
    }

    if (-not (Get-Command func -ErrorAction SilentlyContinue)) {
        throw 'Azure Functions Core Tools are required but not found on PATH. Install them with: npm install -g azure-functions-core-tools@4 --unsafe-perm true'
    }

    if ($SubscriptionId) {
        if ($PSCmdlet.ShouldProcess("subscription $SubscriptionId", 'Set Azure subscription context')) {
            az account set --subscription $SubscriptionId | Out-Null
        }
    }

    if (-not $SkipBuild) {
        if ($PSCmdlet.ShouldProcess('project build', 'Run pnpm install and TypeScript build')) {
            # pnpm, not npm: this repo is pnpm-managed (pnpm-lock.yaml) and
            # node_modules is a pnpm symlink farm. `npm install` has no
            # lockfile here, resolves fresh, and overlays an npm-style tree
            # onto the pnpm one — do not use it.
            pnpm install --frozen-lockfile
            pnpm run build
        }
    }

    # NOTE (Flex Consumption): FUNCTIONS_WORKER_RUNTIME must NOT be set
    # here — the platform rejects it on Flex apps ("invalid ... for Flex
    # Consumption sites") and the script would abort. The worker runtime
    # comes from functionAppConfig.runtime (node + version) on the site
    # object instead; see README.deploy-local.md.
    $settings = @(
        'FUNCTIONS_EXTENSION_VERSION=~4',
        'NODE_ENV=production',
        'TZ=Asia/Hong_Kong'
    )
    if ($ReportPassword -ne '') {
        $settings += "REPORT_PASSWORD=$ReportPassword"
    }

    if ($PSCmdlet.ShouldProcess("Function App $FunctionAppName", 'Apply Azure function settings')) {
        az functionapp config appsettings set `
            --resource-group $ResourceGroup `
            --name $FunctionAppName `
            --settings $settings | Out-Null
    }

    if ($PSCmdlet.ShouldProcess("storage container 'reports'", 'Create private blob container for the scheduled list')) {
        # The timer and the HTTP handler share the platform's own
        # AzureWebJobsStorage connection (see src/report/blobStore.ts), so no
        # new secret is provisioned — only the container. `az storage
        # container create` leaves public access off, keeping the container
        # private; the report is only ever read through the gated function.
        # The value is captured, never printed.
        $storageConnection = az functionapp config appsettings list `
            --resource-group $ResourceGroup `
            --name $FunctionAppName `
            --query "[?name=='AzureWebJobsStorage'].value | [0]" `
            --output tsv
        if ([string]::IsNullOrWhiteSpace($storageConnection)) {
            throw 'AzureWebJobsStorage app setting is empty — the function app has no storage to hold the reports container.'
        }
        az storage container create --name 'reports' --connection-string $storageConnection | Out-Null
    }

    if ($PSCmdlet.ShouldProcess("Function App $FunctionAppName", 'Publish local build to Azure Functions')) {
        # Staged zip deploy. The repo's node_modules is a pnpm symlink farm
        # and the func zipper does not preserve it: the deployed worker died
        # with "Cannot find module 'cookie'" (App Insights, 2026-09-15).
        # So the publish runs from a stage dir with a REAL npm-installed,
        # prod-only node_modules instead of the repo tree.
        # Do NOT pass `--build remote`: Oryx remote build failed on this
        # Flex Consumption app (see deployment 82e801ea, status 3), while
        # plain zip deploys succeeded. `--no-build` ships the stage as-is.
        $stage = Join-Path $repoRoot '.azure-stage'
        if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
        New-Item $stage -ItemType Directory | Out-Null
        Copy-Item (Join-Path $repoRoot 'package.json') $stage
        Copy-Item (Join-Path $repoRoot 'host.json') $stage
        Copy-Item (Join-Path $repoRoot '.funcignore') $stage
        # local.settings.json is funcignored (never shipped) but must exist
        # for the publish-time worker-runtime guard to resolve to node.
        Copy-Item (Join-Path $repoRoot 'local.settings.json') $stage
        Copy-Item (Join-Path $repoRoot 'dist') (Join-Path $stage 'dist') -Recurse
        Push-Location $stage
        try {
            npm install --omit=dev --no-audit --no-fund
            npm ls --omit=dev --depth=0
            func azure functionapp publish $FunctionAppName --no-build
        }
        finally {
            Pop-Location
        }
    }
}
finally {
    Pop-Location
}
