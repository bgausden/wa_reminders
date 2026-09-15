# Local Azure deployment for issue #6

This project supports a local workstation deployment path for the Azure Function smoke test without using GitHub Actions.

## Prereqs

- Azure CLI installed and logged in
- Azure Functions Core Tools v4 installed
- Node.js 24

Recommended for Windows users running Azure CLI:

- 64-bit Python (removes the cryptography 32-bit performance warning)

## One-time Azure setup

Create a resource group and function app if you do not already have them:

```powershell
az group create --name wa-reminders-rg --location "southeastasia"
az storage account create --name <unique-storage-account-name> --resource-group wa-reminders-rg --location "southeastasia" --sku Standard_LRS
az functionapp create --resource-group wa-reminders-rg --name <unique-function-app-name> --storage-account <unique-storage-account-name> --flexconsumption-location "southeastasia" --runtime node --runtime-version 24
```

## Deploy from your workstation

```powershell
npm run deploy:azure:local -- -ResourceGroup wa-reminders-rg -FunctionAppName <unique-function-app-name>
```

Or pass a subscription explicitly:

```powershell
npm run deploy:azure:local -- -ResourceGroup wa-reminders-rg -FunctionAppName <unique-function-app-name> -SubscriptionId <subscription-id>
```

## Runtime settings that matter

The deployment script sets:

- `FUNCTIONS_EXTENSION_VERSION=~4`
- `NODE_ENV=production`
- `TZ=Asia/Hong_Kong`

Flex notes: `WEBSITE_RUN_FROM_PACKAGE` is rejected by the deployment
validator on Flex (Run-From-Package is inherent there), so it is neither
set nor present.

If a deploy fails with `InvalidAppSettingsException ... RUN_FROM_PACKAGE
... not supported with this SKU` even though the setting is absent from
the app, wait five minutes and retry unchanged — the validator has been
observed rejecting against stale state (2026-09-15: three consecutive
rejections, then success with no changes after a wait).

Deliberately NOT set: `FUNCTIONS_WORKER_RUNTIME` (the platform rejects it
on Flex Consumption apps) and `WEBSITE_NODE_DEFAULT_VERSION` (Windows-only,
meaningless on Linux). On Flex the worker runtime comes from
`functionAppConfig.runtime` (`{ "name": "node", "version": "24" }`) on the
site object instead — inspect with:

```powershell
az rest --method get --url "/subscriptions/<sub>/resourceGroups/wa-reminders-rg/providers/Microsoft.Web/sites/<app>?api-version=2024-04-01" --query "properties.functionAppConfig.runtime"
```

## Smoke-test URL

After deployment, open the Function App hostname and confirm the page shows:

- current Hong Kong time
- target day label
- the expected timezone behavior

## Notes

This is intentionally the minimal issue #6 deployment spike: no Mindbody calls, no client data, no auth, just a live Azure Function proving the platform path and Hong Kong time resolution.
