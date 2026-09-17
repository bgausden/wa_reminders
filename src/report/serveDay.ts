/**
 * The ad-hoc day page: a stored report for a chosen day, wrapped with the
 * day picker that produced it.
 *
 * Pure, like `serveScheduled.ts`: the HTTP adapter (`src/azureReport.ts`)
 * resolves the spec, reads or generates the report through
 * `runDayReportEffect`, and hands the values in. Nothing here calls
 * Mindbody or storage, so every state is unit-testable with plain objects:
 * a cached day, a day with nothing stored yet, and a spec (or failure) the
 * user needs told about in plain language.
 *
 * The picker form uses GET so a chosen day is a plain bookmarkable URL
 * (`/?day=2026-09-14`), shareable between the team. The `extra` seam of
 * `wrapReport` carries the furniture; this module owns the escaping of
 * everything it builds (the report body arrives already escaped).
 */
import { escapeHtml } from '../effect/whatsapp.js'
import { formatLongDate, type TargetDay } from '../targetDay.js'
import {
  classifyDay,
  dayLabelDate,
  isStale,
  type DayKind,
  type RunStatus,
} from './cacheKey.js'
import { REPORT_STYLE } from './board.js'
import { wrapReport } from './chrome.js'
import type { StoredReport } from './store.js'

/** The day picker: a text spec plus one-click chips. GET, so days stay linkable. */
export const renderDayForm = (spec: string | null): string => {
  const value = spec ?? ''
  return (
    `<form class="chrome-form" method="get" action="/">` +
    `<label>Day <input type="text" name="day" value="${escapeHtml(value)}" ` +
    `placeholder="tomorrow, +2, 2026-09-20" size="26"></label> ` +
    `<button type="submit">Generate</button>` +
    `<span class="chrome-quick"> quick: <a href="/">Scheduled</a>` +
    ` <a href="/?day=today">Today</a>` +
    ` <a href="/?day=tomorrow">Tomorrow</a>` +
    ` <a href="/?day=2">+2</a>` +
    ` <a href="/?day=3">+3</a></span>` +
    `</form>`
  )
}

/** Regenerate / download / back links for the day being shown. Labels are resolved `YYYY-MM-DD`, safe in URLs. */
export const renderDayLinks = (label: string): string =>
  `<p class="chrome-links"><a href="/?day=${escapeHtml(label)}&amp;refresh=1">Regenerate</a>` +
  ` · <a href="/?day=${escapeHtml(label)}&amp;download=1">Download HTML</a>` +
  ` · <a href="/">Scheduled list</a></p>`

/** The ad-hoc banner: this is a picked day, not the morning list. Never rely on colour alone — it says so. */
export const renderAdHocBanner = (label: string): string =>
  `<p class="note" role="note">Ad-hoc view for ${escapeHtml(formatLongDate(dayLabelDate(label)))} — not the scheduled morning list.</p>`

export interface DayPageOptions {
  /** The cached report, or null when this day has never been generated. */
  stored: StoredReport | null
  /** The resolved day the page is about. */
  targetDay: TargetDay
  /** Request time — staleness and scheduled/ad-hoc are measured against it. */
  now: Date
  /** The raw spec the user typed, echoed back into the form. */
  spec: string | null
  /** The last scheduled run, when there is one (failed runs raise the banner). */
  runStatus?: RunStatus | null
}

/** Classify the request the way the page shows it: the scheduled day, or a picked one. */
export const dayKindFor = (targetDay: TargetDay, now: Date): DayKind =>
  classifyDay({ label: targetDay.label }, now)

/** Empty day: nothing cached and nothing just generated — the form is the way forward. */
export const renderEmptyDayPage = (targetDay: TargetDay, spec: string | null): string => {
  const day = formatLongDate(dayLabelDate(targetDay.label))
  return (
    `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>No list for ${escapeHtml(day)} yet</title>\n` +
    `<style>${REPORT_STYLE}</style>\n` +
    `</head>\n<body>\n<h1>No list for ${escapeHtml(day)} yet</h1>\n` +
    `${renderDayForm(spec)}\n` +
    `<p>Nothing has been generated for this day. Press Generate to run it now.</p>\n` +
    `</body>\n</html>\n`
  )
}

/**
 * The day page: the stored report wrapped in furniture (generated-at, day,
 * banners, picker form, links), or the empty page when there is nothing to
 * wrap. Throws `InvalidDayLabelError` for a `targetDayLabel` that is not a
 * resolved `YYYY-MM-DD`, via `wrapReport`.
 */
export const renderDayPage = (opts: DayPageOptions): string => {
  if (opts.stored === null) return renderEmptyDayPage(opts.targetDay, opts.spec)
  const extra: Array<string> = []
  if (dayKindFor(opts.targetDay, opts.now) === 'ad-hoc') {
    extra.push(renderAdHocBanner(opts.targetDay.label))
  }
  extra.push(renderDayForm(opts.spec))
  extra.push(renderDayLinks(opts.targetDay.label))
  return wrapReport(opts.stored.html, {
    generatedAt: opts.stored.generatedAt,
    targetDayLabel: opts.targetDay.label,
    stale: isStale(opts.stored.generatedAt, opts.now),
    runStatus: opts.runStatus ?? null,
    extra,
  })
}

/** What the user sees when their spec (or the generation) fails: the form, plus the reason in plain language. */
export const renderDayError = (spec: string | null, message: string): string =>
  `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  `<title>Could not generate reminders</title>\n` +
  `<style>${REPORT_STYLE}</style>\n` +
  `</head>\n<body>\n<h1>Could not generate reminders</h1>\n` +
  `${renderDayForm(spec)}\n` +
  `<p class="banner" role="alert">${escapeHtml(message)}</p>\n` +
  `</body>\n</html>\n`
