/**
 * Web chrome: the page furniture wrapped around a rendered report.
 *
 * The report is a complete prototype-board HTML document — the same bytes
 * the CLI writes to `dry-runs/` — so the furniture upgrades it in place
 * rather than rebuilding it: the board header (brand, spelled-out day,
 * generated-at meta, progress rail, search + filter chips) is replaced with
 * fresh values from storage, the shared stylesheet and per-day script are
 * ensured, and the banners (stale, last run failed) plus any extra blocks
 * (ad-hoc banner, day picker form, regenerate/download links) are placed
 * directly under the board.
 *
 * Every interpolated string is escaped with the same `escapeHtml` the report
 * body was built with, so the wrapped page cannot disagree with it.
 */
import { escapeHtml } from '../effect/whatsapp.js'
import { formatLongDate, formatLongDateTime } from '../targetDay.js'
import { dayLabelDate, STALE_AFTER_HOURS, type RunStatus } from './cacheKey.js'
import {
  buildBoard,
  REPORT_STYLE,
  reportScript,
  sentKeyForDay,
} from './board.js'

export interface ChromeOptions {
  /** When the report was generated, from the stored report. */
  generatedAt: Date
  /** Resolved `YYYY-MM-DD` the report covers; spelled out in the furniture. */
  targetDayLabel: string
  /**
   * Show the stale banner. The caller decides with `isStale(report.generatedAt, now)`;
   * this module has no clock and no opinion about what "now" is.
   */
  stale?: boolean
  /**
   * The last scheduled run, when there is one. A failed one raises the red
   * banner and shows its error text under it.
   */
  runStatus?: RunStatus | null
  /**
   * Extra furniture blocks, rendered in order after the banners.
   *
   * The day picker, the quick day chips and the regenerate link are HTML
   * the caller builds, so the blocks are inserted verbatim and the caller
   * is responsible for its own escaping.
   */
  extra?: ReadonlyArray<string>
}

/** `Generated Sunday September 13th 2026 at 9:00am`. */
const generatedAtLine = (generatedAt: Date): string =>
  `Generated ${escapeHtml(formatLongDateTime(generatedAt))}`

/** `Reminders for Monday September 14th 2026`. */
const targetDayLine = (targetDayLabel: string): string =>
  `Reminders for ${escapeHtml(formatLongDate(dayLabelDate(targetDayLabel)))}`

const staleBanner = (): string =>
  `<p class="banner" role="alert">This list is out of date — it was generated more than ${STALE_AFTER_HOURS} hours ago, so the morning run may have been missed.</p>`

const failedRunBanner = (error: string | null): string => {
  const detail =
    error !== null && error.trim() !== ''
      ? `<span class="detail">${escapeHtml(error)}</span>`
      : ''
  return (
    `<p class="banner" role="alert">The last scheduled run failed — this list may not be up to date.${detail}</p>`
  )
}

const BOARD_OPEN = /<header class="board">[\s\S]*?<\/header>/
const BODY_OPEN = /<body[^>]*>/i
const HTML_OPEN = /<html[^>]*>/i
const HEAD_CLOSE = /<\/head>/i
const SCRIPT_CLOSE = /<\/body>/i

const countCards = (html: string): number => {
  const matches = html.match(/<section class="card"/g)
  return matches === null ? 0 : matches.length
}

/**
 * Ensure the shared prototype stylesheet is in the document head. Legacy
 * minimal styles are replaced so the wrapped page always matches the board.
 */
const withStyle = (html: string): string => {
  const tag = `<style>${REPORT_STYLE}</style>`
  if (!HEAD_CLOSE.test(html)) return html
  // Function replacer, not a string: the document is untrusted and a `$&`
  // in it would otherwise be treated as a replacement pattern.
  return html.replace(HEAD_CLOSE, (match) => `${tag}\n${match}`)
}

const stripLegacyStyle = (html: string): string =>
  html.replace(
    /<style>body\{font-family:system-ui,sans-serif;max-width:60rem[^<]*<\/style>\n?/,
    ''
  )

/** Ensure the per-day behaviour script is present just before `</body>`. */
const withScript = (html: string, targetDayLabel: string): string => {
  if (html.includes('id="railFill"') && html.includes('reminders-sent-')) return html
  const tag = reportScript(sentKeyForDay(targetDayLabel))
  if (SCRIPT_CLOSE.test(html)) return html.replace(SCRIPT_CLOSE, (match) => `${tag}\n${match}`)
  return `${html}\n${tag}`
}

/** Build the fresh board header plus banners plus extra blocks. */
const buildChrome = (options: ChromeOptions, total: number): string => {
  const board = buildBoard({
    title: 'Reminder list',
    dayLine: targetDayLine(options.targetDayLabel),
    metaLine: `${generatedAtLine(options.generatedAt)} · Scheduled morning list · ${total} to send`,
    total,
  })
  const blocks: Array<string> = []
  if (options.stale === true) blocks.push(staleBanner())
  const status = options.runStatus
  if (status !== undefined && status !== null && !status.success) {
    blocks.push(failedRunBanner(status.error))
  }
  for (const block of options.extra ?? []) blocks.push(block)
  return `${board}\n${blocks.join('\n')}`
}

/**
 * Wrap a rendered report in the page furniture.
 *
 * Throws {@link InvalidDayLabelError} for a `targetDayLabel` that is not a
 * resolved `YYYY-MM-DD`, since the whole point of the day line is to spell out
 * a day that was resolved before it reached storage. Day-label validation
 * runs first so a bad label fails even for fragment input.
 */
export const wrapReport = (html: string, options: ChromeOptions): string => {
  // Validate the label before touching the markup.
  dayLabelDate(options.targetDayLabel)
  const total = countCards(html)
  const chrome = buildChrome(options, total)
  const hasHead = HEAD_CLOSE.test(html)
  const styleTag = `<style>${REPORT_STYLE}</style>`
  let out = stripLegacyStyle(html)
  out = withStyle(out)
  out = withScript(out, options.targetDayLabel)
  // No head to carry the stylesheet: it travels with the furniture.
  const chromeWithStyle = hasHead ? chrome : `${styleTag}\n${chrome}`
  if (BOARD_OPEN.test(out)) return out.replace(BOARD_OPEN, () => chromeWithStyle)
  for (const anchor of [BODY_OPEN, HTML_OPEN]) {
    if (anchor.test(out)) {
      return out.replace(anchor, (match) => `${match}\n${chromeWithStyle}`)
    }
  }
  // Not a document at all (a fragment): the furniture goes in front of it.
  return `${chromeWithStyle}\n${out}`
}
