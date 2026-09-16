[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory = $true)]
    [string]$FunctionAppName,

    [string]$Location = 'southeastasia',
    [string]$VnetName = 'wa-reminders-vnet',
    [string]$SubnetName = 'func-egress',
    [string]$PublicIpName = 'wa-reminders-egress-ip',
    [string]$NatGatewayName = 'wa-reminders-natgw'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-NativeSuccess([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed with exit code $LASTEXITCODE." }
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI is required but not found on PATH: https://aka.ms/azure-cli'
}

# Create only what is absent: these resources carry the app's stable public IP,
# so replacing them on a routine run would break the Mindbody allowlist.
az network vnet show --resource-group $ResourceGroup --name $VnetName --only-show-errors 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    az network vnet create --resource-group $ResourceGroup --name $VnetName `
        --location $Location --address-prefixes '10.10.0.0/16' `
        --subnet-name $SubnetName --subnet-prefixes '10.10.1.0/24' `
        --only-show-errors | Out-Null
    Assert-NativeSuccess 'create virtual network and integration subnet'
}

az network public-ip show --resource-group $ResourceGroup --name $PublicIpName --only-show-errors 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    az network public-ip create --resource-group $ResourceGroup --name $PublicIpName `
        --location $Location --sku Standard --allocation-method Static `
        --version IPv4 --only-show-errors | Out-Null
    Assert-NativeSuccess 'create static public IP'
}

az network nat gateway show --resource-group $ResourceGroup --name $NatGatewayName --only-show-errors 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    az network nat gateway create --resource-group $ResourceGroup --name $NatGatewayName `
        --location $Location --public-ip-addresses $PublicIpName `
        --idle-timeout 10 --only-show-errors | Out-Null
    Assert-NativeSuccess 'create NAT gateway'
}

az network vnet subnet update --resource-group $ResourceGroup --vnet-name $VnetName `
    --name $SubnetName --nat-gateway $NatGatewayName --only-show-errors | Out-Null
Assert-NativeSuccess 'attach NAT gateway to subnet'

az functionapp vnet-integration add --resource-group $ResourceGroup --name $FunctionAppName `
    --vnet $VnetName --subnet $SubnetName --only-show-errors | Out-Null
Assert-NativeSuccess 'integrate function app with subnet'

$subscription = az account show --query id --output tsv
Assert-NativeSuccess 'read Azure subscription'
$configUrl = "/subscriptions/$subscription/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites/$FunctionAppName/config/web?api-version=2024-04-01"
az rest --method patch --headers 'Content-Type=application/json' --url $configUrl `
    --body '{"properties":{"vnetRouteAllEnabled":true}}' --only-show-errors | Out-Null
Assert-NativeSuccess 'enable VNet route-all'

$ip = az network public-ip show --resource-group $ResourceGroup --name $PublicIpName `
    --query ipAddress --output tsv --only-show-errors
Assert-NativeSuccess 'read static public IP'
Write-Output "Static egress IP: $ip (allowlist this /32 in Mindbody)"
