/**
 * The scheduled page: what the plain bookmark serves.
 *
 * Pure — it takes the stored report and the last run status as values, so it
 * is unit-testable with plain objects and makes no Mindbody calls by
 * construction. The HTTP adapter (`src/azureReport.ts`) only reads these two
 * values from the store and hands them in.
 *
 * A stored report is wrapped in the page furniture (`src/report/chrome.ts`):
 * the generated-at time and the spelled-out target day come from the stored
 * report itself, and the stale banner is decided here with `isStale` against
 * the request time. Before the first successful timer run there is nothing to
 * wrap, so a short standalone page says so instead.
 */
import { escapeHtml } from '../effect/whatsapp.js'
import { formatLongDate } from '../targetDay.js'
import { dayLabelDate, isStale, type RunStatus } from './cacheKey.js'
import { wrapReport } from './chrome.js'
import type { StoredReport } from './store.js'

/** Page shown before the first successful timer run stored anything. */
export const renderEmptyScheduledPage = (
  runStatus: RunStatus | null,
  extra: ReadonlyArray<string> = []
): string => {
  const failed =
    runStatus !== null && !runStatus.success
      ? `<p class="chrome-banner" role="alert">The last scheduled run failed — no list is available yet.` +
        (runStatus.error !== null && runStatus.error.trim() !== ''
          ? `\n<span class="chrome-error">${escapeHtml(runStatus.error)}</span>`
          : '') +
        `</p>`
      : ''
  return (
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<title>No reminder list yet</title>\n` +
    `<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}` +
    `.chrome-banner{background:#c00;color:#fff;border-radius:6px;padding:.6rem .8rem;margin:.6rem 0;font-weight:600}` +
    `.chrome-form{margin:.75rem 0}.chrome-form input,.chrome-form button{font-size:1rem;padding:.25rem .5rem}` +
    `.chrome-quick{margin-left:.5rem;color:#555;font-size:.9rem}` +
    `.chrome-error{display:block;margin-top:.25rem;font-weight:400;font-size:.85rem}</style>\n` +
    `</head>\n<body>\n<h1>No reminder list yet</h1>\n` +
    `<p>The morning run has not stored one. It runs at 9am Hong Kong time.</p>\n${failed}` +
    `${extra.join('\n')}\n</body>\n</html>\n`
  )
}

/**
 * Render the bookmark page: the stored report plus its furniture, or the
 * empty page when the timer has never stored a report. `now` is the request
 * time — the caller passes the clock at call time, this module owns none.
 */
export const renderScheduledPage = (
  stored: StoredReport | null,
  runStatus: RunStatus | null,
  now: Date,
  extra: ReadonlyArray<string> = []
): string => {
  if (stored === null) return renderEmptyScheduledPage(runStatus, extra)
  return wrapReport(stored.html, {
    generatedAt: stored.generatedAt,
    targetDayLabel: stored.targetDayLabel,
    stale: isStale(stored.generatedAt, now),
    runStatus,
    extra,
  })
}

/** One-line summary of the day a stored report covers, for logs only. */
export const describeStoredReport = (stored: StoredReport): string =>
  `${stored.targetDayLabel} (${formatLongDate(dayLabelDate(stored.targetDayLabel))})`
