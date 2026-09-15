# Local Azure deployment

This project supports a local workstation deployment path for the Azure
Function smoke test without using GitHub Actions.

Current scope: the deployed app is still the `smokeHttp` page only
(`src/azureFunctionApp.ts` + `src/azureSmoke.ts`) — no Mindbody calls, no
client data — now behind the shared-password gate (#10). The remaining
hosted-report modules (`src/report/*`, `src/effect/generate.ts`) exist and
are unit-tested (`pnpm test`), but the blob store and timer/serve adapters
(#11, #12) are not built yet, so nothing beyond the gated smoke page
reaches Azure.

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
pnpm run deploy:azure:local -- -ResourceGroup wa-reminders-rg -FunctionAppName <unique-function-app-name>
```

Or pass a subscription explicitly:

```powershell
pnpm run deploy:azure:local -- -ResourceGroup wa-reminders-rg -FunctionAppName <unique-function-app-name> -SubscriptionId <subscription-id>
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

This started as the minimal deployment spike: no Mindbody calls, no client
data, just a live Azure Function proving the platform path and Hong
Kong time resolution, now with the shared-password gate (#10) in front.
That is still what is deployed — see `readme.md` for
the current repo state and `docs/prd-hosted-reminders.md` for what comes next.

## Report password

The gate reads the shared password from the `REPORT_PASSWORD` app setting
and fails closed (login page + 500, nothing served) when it is blank.
Deploy with it (prefer `$env:` so it stays out of shell history):

```powershell
$env:REPORT_PASSWORD='one-good-password'
pnpm run deploy:azure:local -- -ResourceGroup wa-reminders-rg -FunctionAppName <app> -ReportPassword $env:REPORT_PASSWORD
```

Omit `-ReportPassword` to leave the existing setting untouched.

## Morning test (#10 live check)

1. Open the Function App hostname — expect the sign-in form, not content.
2. Wrong password — expect the form again with "Wrong password, try again."
3. Correct password — expect a redirect to `/` showing the smoke page
   (HK time + target day). The `wa_session` cookie is HttpOnly, Secure,
   SameSite=Lax, ~30 days.
4. Revisit with the cookie — the page serves directly, no Mindbody calls.
5. Expired/tampered cookie (edit it in devtools) — back to the plain
   sign-in form, no error text.

Local `func start` note: Core Tools 4.0.5801 on this workstation rejects
Node 24, so local serving isn't possible here — test against Azure, whose
Flex app runs Node 24 (see #6). When local serving works again, the gate
reads the same setting from `local.settings.json` (gitignored, never
deployed):

```json
{ "Values": { "REPORT_PASSWORD": "local-only-dev-password" } }
```
