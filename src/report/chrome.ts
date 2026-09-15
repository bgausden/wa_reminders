/**
 * Web chrome: the page furniture wrapped around a rendered report.
 *
 * Pure string work on purpose. The report is already a complete HTML document
 * — the same bytes the CLI writes to `dry-runs/` — so the furniture is spliced
 * into the markup rather than the report being rebuilt: the locally generated
 * dry-run file stays exactly as it is today.
 *
 * What goes in, in order: the generated-at line, the target day spelled out,
 * the banners (stale, last run failed), then any extra blocks. Issue #12
 * renders the day picker, the quick day chips, the regenerate link and the
 * ad-hoc banner into {@link ChromeOptions.extra} and adds the ad-hoc banner
 * alongside the two here.
 *
 * Every interpolated string is escaped with the same `escapeHtml` the report
 * body was built with, so the wrapped page cannot disagree with it.
 */
import { escapeHtml } from '../effect/whatsapp.js'
import { formatLongDate, formatLongDateTime } from '../targetDay.js'
import { dayLabelDate, STALE_AFTER_HOURS, type RunStatus } from './cacheKey.js'

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
   * The seam for issue #12: the day picker, the quick day chips and the
   * regenerate link are HTML the caller builds (this module owns nothing about
   * them yet), so the blocks are inserted verbatim and the caller is
   * responsible for its own escaping.
   */
  extra?: ReadonlyArray<string>
}

const CHROME_STYLE =
  '.chrome{border-bottom:1px solid #ddd;margin:0 0 1rem;padding:0 0 .75rem}' +
  '.chrome-meta{margin:.15rem 0;color:#555;font-size:.9rem}' +
  '.chrome-day{margin:.15rem 0 0;font-size:1.05rem;font-weight:600}' +
  '.chrome-banner{background:#c00;color:#fff;border-radius:6px;padding:.6rem .8rem;margin:.6rem 0;font-weight:600}' +
  '.chrome-note{background:#eef4ff;border:1px solid #99c;color:#234;border-radius:6px;padding:.6rem .8rem;margin:.6rem 0}' +
  '.chrome-form{margin:.75rem 0}.chrome-form input,.chrome-form button{font-size:1rem;padding:.25rem .5rem}' +
  '.chrome-quick{margin-left:.5rem;color:#555;font-size:.9rem}' +
  '.chrome-links{margin:.5rem 0;font-size:.9rem}' +
  '.chrome-error{display:block;margin-top:.25rem;font-weight:400;font-size:.85rem}'

const BODY_OPEN = /<body[^>]*>/i
const HTML_OPEN = /<html[^>]*>/i
const HEAD_CLOSE = /<\/head>/i

/** `Generated Sunday September 13th 2026 at 9:00am`. */
const generatedAtLine = (generatedAt: Date): string =>
  `<p class="chrome-meta">Generated ${escapeHtml(formatLongDateTime(generatedAt))}</p>`

/** `Reminders for Monday September 14th 2026`. */
const targetDayLine = (targetDayLabel: string): string =>
  `<p class="chrome-day">Reminders for ${escapeHtml(formatLongDate(dayLabelDate(targetDayLabel)))}</p>`

const staleBanner = (): string =>
  `<p class="chrome-banner" role="alert">This list is out of date — it was generated more than ${STALE_AFTER_HOURS} hours ago, so the morning run may have been missed.</p>`

const failedRunBanner = (error: string | null): string => {
  const detail =
    error !== null && error.trim() !== ''
      ? `\n<span class="chrome-error">${escapeHtml(error)}</span>`
      : ''
  return (
    `<p class="chrome-banner" role="alert">The last scheduled run failed — this list may not be up to date.${detail}</p>`
  )
}

const buildChrome = (options: ChromeOptions): string => {
  const blocks: Array<string> = [generatedAtLine(options.generatedAt), targetDayLine(options.targetDayLabel)]
  if (options.stale === true) blocks.push(staleBanner())
  const status = options.runStatus
  if (status !== undefined && status !== null && !status.success) {
    blocks.push(failedRunBanner(status.error))
  }
  for (const block of options.extra ?? []) blocks.push(block)
  return `<header class="chrome">\n${blocks.join('\n')}\n</header>`
}

/**
 * Put the stylesheet in the document's head, or return it to be carried with
 * the furniture when there is no head to put it in.
 */
const withStyle = (html: string): { html: string; style: string } => {
  if (!HEAD_CLOSE.test(html)) return { html, style: `<style>${CHROME_STYLE}</style>\n` }
  return {
    // Function replacer, not a string: the document is untrusted and a `$&`
    // in it would otherwise be treated as a replacement pattern.
    html: html.replace(HEAD_CLOSE, (match) => `<style>${CHROME_STYLE}</style>\n${match}`),
    style: '',
  }
}

/** Splice the furniture in just after `<body>`, so it is the first thing on the page. */
const withChrome = (html: string, chrome: string): string => {
  for (const anchor of [BODY_OPEN, HTML_OPEN]) {
    if (anchor.test(html)) {
      return html.replace(anchor, (match) => `${match}\n${chrome}`)
    }
  }
  // Not a document at all (a fragment): the furniture goes in front of it.
  return `${chrome}\n${html}`
}

/**
 * Wrap a rendered report in the page furniture.
 *
 * Throws {@link InvalidDayLabelError} for a `targetDayLabel` that is not a
 * resolved `YYYY-MM-DD`, since the whole point of the day line is to spell out
 * a day that was resolved before it reached storage.
 */
export const wrapReport = (html: string, options: ChromeOptions): string => {
  const { html: styled, style } = withStyle(html)
  return withChrome(styled, `${style}${buildChrome(options)}`)
}
