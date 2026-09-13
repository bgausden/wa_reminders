To run this code at the command-line (generally the only way that works) try

```pwsh
$env:NODE_ENV='development'; $env:DEBUG='wa_reminders:*' ; node .\dist\index-fp.js
```

Swap 'development' for 'production' as necessary assuming you have the .env configured with a valid MB API key

## Target day

By default reminders are sent for tomorrow. Override with `--date` (aliases
`--day`, `--target-day`, `--target-date`):

```pwsh
# offset from today: +1, plus two, 3, today, tomorrow, friday
$env:NODE_ENV='development'; node .\dist\index-fp.js --dry-run --date "+2"
# explicit calendar date (also 2026/9/20, 20 Sep 2026, Sep 20)
$env:NODE_ENV='development'; node .\dist\index-fp.js --dry-run --date 2026-09-20
```

Via npm scripts the `--` separator is required, otherwise npm swallows
the flag and the app silently falls back to tomorrow:

```pwsh
npm run dry-run -- --day "day after tomorrow"
npm run dry-run:prod -- --date 2026-09-20
```

.env should look something like

```dotenv
API_KEY = "948e8fa98d9e49ee9f4ee3f6e1ec9276"
SITE_ID =	"-99"
MB_USERNAME =	"Siteowner"
MB_PASSWORD = 	"apitest1234"
DEBUG = "wa_reminders:*"
```
