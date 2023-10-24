To run this code at the command-line (generally the only way that works) try

```pwsh
$env:NODE_ENV='development'; $env:DEBUG='wa_reminders:*' ; node .\dist\index-fp.js
```

Swap 'development' for 'production' as necessary assuming you have the .env configured with a valid MB API key

.env should look something like

```dotenv
API_KEY = "948e8fa98d9e49ee9f4ee3f6e1ec9276"
SITE_ID =	"-99"
MB_USERNAME =	"Siteowner"
MB_PASSWORD = 	"apitest1234"
DEBUG = "wa_reminders:*"
```
