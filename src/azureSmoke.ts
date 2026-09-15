import { parseTargetDay } from './targetDay.js'

const HONG_KONG_TZ = 'Asia/Hong_Kong'

export function resolveTargetDayForHongKong(now: Date = new Date()): { label: string; midnight: Date } {
  const hongKongNow = new Date(now.toLocaleString('en-US', { timeZone: HONG_KONG_TZ }))
  const target = parseTargetDay(undefined, hongKongNow)
  return {
    label: target.label,
    midnight: target.midnight,
  }
}

export function formatHongKongDateTime(value: Date): string {
  return new Intl.DateTimeFormat('en-HK', {
    timeZone: HONG_KONG_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value)
}

export function renderSmokePage(now: Date = new Date()): string {
  const hkNow = new Intl.DateTimeFormat('en-HK', {
    timeZone: HONG_KONG_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)

  const target = resolveTargetDayForHongKong(now)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Wa Reminders Smoke Test</title>
    <style>
      body { font-family: sans-serif; padding: 2rem; }
      .card { max-width: 620px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; }
      .label { font-weight: 700; color: #333; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Wa Reminders Azure Smoke Test</h1>
      <p><span class="label">Current Hong Kong time:</span> ${hkNow}</p>
      <p><span class="label">Target day:</span> ${target.label}</p>
      <p>This page proves the Azure Function host is running in the expected timezone and the target-day parser resolves correctly.</p>
    </div>
  </body>
</html>`
}

export function createAzureFunctionHandler() {
  return async () => {
    const now = new Date()
    return {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: renderSmokePage(now),
    }
  }
}
