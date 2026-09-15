# Local Azure deployment

This project supports a local workstation deployment path for the Azure
Function app without using GitHub Actions.

Current scope (#11): the deployed app serves the stored scheduled reminder
list behind the shared-password gate (#10), and a timer regenerates that
list every morning at 9am Hong Kong time. The gated smoke page from the
early spike is superseded — `src/azureSmoke.ts` remains in the repo for its
spec, but nothing deployed serves it anymore.

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

The timer (`morningTimer`, `0 0 9 * * *` NCRONTAB) relies on that `TZ`:
Flex Consumption on Linux honors `TZ` for timer triggers, so 9:00 means
9am Hong Kong time. Confirm on the first real runs — the invocation
timestamp in the platform logs should read ~09:00 HKT.

The timer additionally needs these app settings, set once in the portal
(they are secrets, never committed, and the deploy script does not manage
them):

- `API_KEY`, `SITE_ID`, `MB_USERNAME`, `MB_PASSWORD` — Mindbody credentials
  (same names as the local `.env` files; `MB_BASE_URL` optional, defaults
  to the public API)
- `REPORT_PASSWORD` — the shared team password (or pass `-ReportPassword`
  to the deploy script, below)
- `AzureWebJobsStorage` — already present on the Function app; the timer
  and the report handler share it for the private `reports` container (the
  deploy script creates the container, public access off).

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

- the sign-in form when logged out (the private `reports` container is only
  ever read through this gated function, never by URL)
- this morning's list when logged in: one card per client with the rendered
  message and WhatsApp link, mobile/home numbers, missing numbers flagged,
  suppressed appointments listed separately
- the generated-at line and the spelled-out target day
- a red banner when the list is stale (>26h, morning run missed) or the
  last run failed

## Notes

This started as the minimal deployment spike: no Mindbody calls, no client
data, just a live Azure Function proving the platform path and Hong
Kong time resolution, then with the shared-password gate (#10) in front.
Since #11 the same path serves the real thing — the stored scheduled
report plus the 9am timer that regenerates it — see `readme.md` for
the current repo state and `docs/prd-hosted-reminders.md` for what comes next
(the day picker is #12).

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
3. Correct password — expect a redirect to `/` showing this morning's list
   (or "No reminder list yet" before the first timer run). The `wa_session`
   cookie is HttpOnly, Secure, SameSite=Lax, ~30 days.
4. Revisit with the cookie — the page serves directly from storage, no
   Mindbody calls.
5. Expired/tampered cookie (edit it in devtools) — back to the plain
   sign-in form, no error text.
6. Timer check (next morning): the invocation timestamp in the platform
   logs reads ~09:00 HKT, the log carries `scheduled run complete` with
   `durationMs`, and the bookmark shows the fresh list with no red banner.

Local `func start` note: Core Tools 4.14 (installed via
`winget install Microsoft.Azure.FunctionsCoreTools`, which bypasses the
broken npm postinstall download) serves on the system Node 24 with no
version juggling:

```powershell
$env:REPORT_PASSWORD='local-only-dev-password'
func start --port 7071
```

then `http://localhost:7071/` (the `reportHttp` catch-all; the old
`/api/smoke` route is gone since #11 replaced the smoke handler with the
report handler). Without Azurite running, expect the "unavailable" page —
the blob store needs a connection, and `AzureWebJobsStorage` in
local.settings.json points at the emulator by default. The gate was
verified live this way (anonymous form, wrong-password 401, grant +
cookie, authed page, tampered cookie). Fallback if Core Tools ever rejects the system Node
again: `fnm use 20` in the serving shell (`winget install Schniz.fnm`;
`fnm install 20` once) — the compiled output targets ES2022 and runs
unchanged under Node 20.
