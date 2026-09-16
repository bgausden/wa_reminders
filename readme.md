## wa_reminders

Automated WhatsApp reminders for MBO (Glow Hong Kong). Fetches tomorrow's
(or a chosen day's) appointments from Mindbody, renders one message per
client from `src/template.ejs`, and writes a dry-run report. Nothing is
sent — the team sends via `wa.me` click-to-chat links in the HTML report.

## Prereqs

- Node.js 24
- pnpm (repo is pnpm-managed — use `pnpm install`, not `npm install`)
- Azure Functions Core Tools v4 + Azure CLI (only for the Azure smoke deploy)

## Setup

```pwsh
pnpm install --frozen-lockfile
pnpm run build   # tsc + copy src/template.ejs -> dist/template.ejs
pnpm test        # vitest run (21 files, 188 tests)
```

## Environment

`src/effect/AppConfig.ts` loads `.env.development` by default,
`.env.production` when `NODE_ENV=production` or `--env=production` is passed:

```dotenv
API_KEY="..."
SITE_ID="-99"
MB_USERNAME="..."
MB_PASSWORD="..."
MB_BASE_URL="https://api.mindbodyonline.com/public/v6"  # optional, this is the default
```

`.env.development` points at the Mindbody sandbox; `.env.production`
points at the live site.

## CLI

Source entry is `src/index.ts`, compiled entry is `dist/index.js`:

```pwsh
# dry run for tomorrow (default): console + dry-runs/dry-run-<stamp>.txt
pnpm run dry-run
$env:NODE_ENV='development'; node .\dist\index.js --dry-run

# include the HTML report with WhatsApp click-to-chat links
node .\dist\index.js --dry-run --html
```

The text report never contains `wa.me` links; only the HTML report does
(`src/effect/whatsapp.ts`: mobile preferred, home fallback, HK numbers get
`852` prefix; header shows `mobile +..., home +...` so the number used is
visible).

## Target day

Default is tomorrow. Override with `--date` (aliases `--day`,
`--target-day`, `--target-date`, short `-d`):

```pwsh
node .\dist\index.js --dry-run --date "+2"
node .\dist\index.js --dry-run --date 2026-09-20
pnpm run dry-run -- --day "day after tomorrow"
pnpm run dry-run:prod -- --date 2026-09-20
```

Accepted specs (`src/targetDay.ts`): offsets (`+1`, `plus two`, `3`,
`in 3 days`), keywords (`today`, `tomorrow`, `day after tomorrow`,
weekday names), calendar dates (`2026-09-20`, `2026/9/20`), fuzzy
(`14 Sep 2026`, `Sep 14`). The `--` separator is required via npm scripts,
otherwise npm swallows the flag and the run silently falls back to tomorrow.
Unknown positional args abort with a usage hint.

Days resolve per invocation (`resolveTargetDay`, `scheduledTargetDay`),
never at module load — a warm hosted process must not serve yesterday's day.
`scheduledTargetDay()` means "tomorrow in Hong Kong" regardless of host
timezone. `src/util.ts` still exports the legacy module-load `tomorrow`
singleton for existing callers; new code passes a day per invocation.

## How it fits together

- `src/effect/pipeline.ts` — Mindbody fetch (staff, schedule, session types,
  clients at concurrency 5) plus pure helpers: laser/tanning detection,
  suppression (`Status !== Booked`), client plans.
- `src/effect/run.ts` — `runRemindersFor(day)`: pipeline for a day, no
  rendering, no disk. Shared by CLI and hosted paths.
- `src/effect/render.ts` — pure rendering: text report + HTML report from
  domain data and `src/template.ejs`. Template ships with the build
  (`scripts/copy-template.mjs`, resolved from the compiled module, not cwd).
- `src/effect/generate.ts` — `generateReportEffect()`: run then render,
  in memory. `src/effect/dryRun.ts` adds the `dry-runs/` file writes.
- `src/targetDay.ts` — day parsing, HK helpers (`HK_TIME_ZONE`,
  `scheduledTargetDay`), long-date formatting.
- `src/effect/whatsapp.ts` — phone normalize/display, `wa.me` links.
- `src/report/cacheKey.ts` — storage keys from resolved `YYYY-MM-DD` labels
  only (`scheduled.json`, `run-status.json`, `day-<label>.json`), 26h stale
  rule, scheduled/ad-hoc classification, run-status record.
- `src/report/store.ts` — `ReportStore` Effect service; in-memory
  implementation for tests plus the blob one below.
- `src/report/blobStore.ts` — thin blob `ReportStore` over the private
  `reports` container (keys from `cacheKey.ts`, `AzureWebJobsStorage`
  connection read per operation, missing reads `null`). No domain logic;
  not unit-tested (wiring only).
- `src/report/serveScheduled.ts` — pure bookmark page: stored report
  wrapped in chrome (stale via `isStale`), standalone page before the
  first run.
- `src/effect/scheduledRun.ts` — `runScheduledReportEffect()`: resolve
  the HK day per invocation, generate, store report + run status
  (failed runs keep the old list), log `durationMs`. Also owns the
  failure vocabulary: `describeFailure()` (prefers Mindbody's own
  `Error.Message`, e.g. the blocked IP on DeniedAccess) and
  `unwrapFailure()` (recovers the typed failure from `runPromise`'s
  FiberFailure, whose default message would otherwise hide it).
- `src/effect/mbErrors.ts` — `MindbodyError` plus `summarizeCause()`:
  message + status + response body only, never request config (headers
  carry the Api-Key, bodies can carry the owner password).
- `src/report/chrome.ts` — page furniture spliced into the report HTML
  (generated-at line, spelled-out day, stale/failed banners).
- `src/web/auth.ts` — shared-password signed session core (30-day cookie,
  no session store); cookie parsing/responses belong to the future adapter.
- `src/azureFunctionApp.ts` + `src/azureReport.ts` + `src/azureTimer.ts` —
  the Azure wiring: a `reportHttp` catch-all behind the shared-password
  gate (`src/web/gate.ts` pure decision, `src/azureGate.ts` thin adapter,
  `REPORT_PASSWORD` app setting) serving the stored scheduled report with
  no Mindbody calls on page load, plus a `morningTimer` (`0 0 9 * * *`,
  9am in `TZ=Asia/Hong_Kong`) running the pipeline into the private
  `reports` container. (`src/azureSmoke.ts` is superseded but kept for its
  spec.)

See `docs/prd-hosted-reminders.md` for the hosted-report plan and
`README.deploy-local.md` for the workstation Azure deploy path.

## Timezone

Every date is a Hong Kong date. Local runs use the machine zone; the Azure
app sets `TZ=Asia/Hong_Kong` (see `scripts/deploy-local.ps1`).
