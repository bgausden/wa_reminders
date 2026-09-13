const DAY_MS = 24 * 60 * 60 * 1000

export interface TargetDay {
  /** Days from today (HK/local calendar): 0 = today, 1 = tomorrow. */
  offset: number
  midnight: Date
  elevenFiftyNine: Date
  /** `YYYY-MM-DD` of the target local calendar day. */
  label: string
}

const startOfDay = (d: Date): Date => {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

const endOfDay = (d: Date): Date => {
  const c = new Date(d)
  c.setHours(23, 59, 59, 999)
  return c
}

const toLabel = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const fromMidnight = (midnight: Date, todayMidnight: Date): TargetDay => ({
  offset: Math.round((midnight.getTime() - todayMidnight.getTime()) / DAY_MS),
  midnight,
  elevenFiftyNine: endOfDay(midnight),
  label: toLabel(midnight),
})

const fromOffset = (offset: number, now: Date): TargetDay =>
  fromMidnight(startOfDay(new Date(now.getTime() + offset * DAY_MS)), startOfDay(now))

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30 }

// Compact word-number parser: "one".."thirty one". Returns undefined if not words.
const wordToNumber = (s: string): number | undefined => {
  const parts = s.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 3) return undefined
  if (parts.length === 1) {
    const v = ONES[parts[0]!] ?? TENS[parts[0]!]
    return v
  }
  if (parts.length === 2 && TENS[parts[0]!] !== undefined && ONES[parts[1]!] !== undefined) {
    return (TENS[parts[0]!] as number) + (ONES[parts[1]!] as number)
  }
  return undefined
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}

// Fuzzy date-string parsing (<50 lines): month-name forms + Date.parse fallback.
const fuzzyDate = (raw: string, now: Date): Date | undefined => {
  const s = raw.trim().replace(/,/g, '')
  let m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/.exec(s.toLowerCase())
  if (m) {
    const mo = MONTHS[m[2]!]
    if (mo) return new Date(Number(m[3]), mo - 1, Number(m[1]))
  }
  m = /^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/.exec(s.toLowerCase())
  if (m) {
    const mo = MONTHS[m[1]!]
    if (mo) return new Date(Number(m[3] ?? now.getFullYear()), mo - 1, Number(m[2]))
  }
  m = /^(\d{1,2})\s+([a-z]+)$/.exec(s.toLowerCase())
  if (m) {
    const mo = MONTHS[m[2]!]
    if (mo) return new Date(now.getFullYear(), mo - 1, Number(m[1]))
  }
  const t = Date.parse(s)
  if (!Number.isNaN(t)) return new Date(t)
  return undefined
}

/**
 * Parse the `--date`/`--day` value into a target calendar day.
 *
 * Accepted forms (case-insensitive, surrounding whitespace ignored):
 * - offset: `+1`, `+ 3`, `plus one`, `plus 2`, `2`, `2 days`, `in 3 days`
 * - keywords: `today`, `tomorrow`, `day after tomorrow`, weekday name (`fri`, `friday`)
 * - calendar date: `YYYY-MM-DD` (also `YYYY/M/D`, `YYYY.M.D`), e.g. `2026-09-14`
 * - fuzzy: `14 Sep 2026`, `Sep 14 2026`, `Sep 14`, `14 Sep`
 *
 * No argument (or empty) defaults to tomorrow (offset 1).
 * Throws Error with usage hint on invalid input.
 */
export function parseTargetDay(raw: string | undefined | null, now: Date = new Date()): TargetDay {
  const todayMidnight = startOfDay(now)
  if (raw === undefined || raw === null || raw.trim() === '') {
    return fromOffset(1, now)
  }
  const input = raw.trim()
  const lower = input.toLowerCase().replace(/\s+/g, ' ')

  if (lower === 'today' || lower === 'tonight') return fromOffset(0, now)
  if (lower === 'tomorrow' || lower === 'tmr' || lower === 'tmrw') return fromOffset(1, now)
  if (lower === 'day after tomorrow') return fromOffset(2, now)

  if (WEEKDAYS[lower] !== undefined) {
    const diff = ((WEEKDAYS[lower] as number) - now.getDay() + 7) % 7
    return fromOffset(diff, now)
  }

  // Offset: strip "in", leading "+"/"plus", trailing "day(s)"/"ahead"/"from now".
  const core = lower
    .replace(/^in\s+/, '')
    .replace(/\s*(days?|ahead|from\s+now).*$/, '')
    .replace(/^(?:\+|plus)\s*/, '')
    .trim()
  // Numeric offset ("3", "+3", "plus 3" already stripped to "3").
  if (/^\d{1,3}$/.test(core)) return fromOffset(Number(core), now)
  // Bare "+N" with inner space ("+ 3") missed above when "+" not at core start.
  const plusNum = /^\+?\s*(\d{1,3})$/.exec(input.trim())
  if (plusNum) return fromOffset(Number(plusNum[1]), now)
  const wordNum = wordToNumber(core)
  if (wordNum !== undefined) return fromOffset(wordNum, now)

  // Strict calendar date: YYYY-MM-DD (also / or . separators, 1-2 digit M/D).
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(input.trim())
  if (iso) {
    const y = Number(iso[1])
    const mo = Number(iso[2])
    const d = Number(iso[3])
    const dt = new Date(y, mo - 1, d)
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
      return fromMidnight(startOfDay(dt), todayMidnight)
    }
    throw new Error(
      `Invalid --date "${raw}": "${input}" is not a real calendar date. ` +
        `Use an offset (e.g. "+1", "plus two", "3") or a date (e.g. "2026-09-14").`
    )
  }

  const fuzzy = fuzzyDate(input, now)
  if (fuzzy && !Number.isNaN(fuzzy.getTime())) {
    return fromMidnight(startOfDay(fuzzy), todayMidnight)
  }

  throw new Error(
    `Invalid --date "${raw}": could not parse "${input}". ` +
      `Use an offset (e.g. "+1", "plus two", "3", "today", "tomorrow") or a date (e.g. "2026-09-14", "14 Sep 2026").`
  )
}

const DATE_FLAGS = new Set([
  '--date',
  '--day',
  '--target-day',
  '--target-date',
  '-d',
  '-day',
  '-date',
  '-target-day',
  '-target-date',
])

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ordinal = (n: number): string => {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** `Tuesday September 15th 2026`. */
export function formatLongDate(d: Date): string {
  return `${WEEKDAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]} ${ordinal(d.getDate())} ${d.getFullYear()}`
}

/** `Sunday September 13th 2026 at 8:56pm`. */
export function formatLongDateTime(d: Date): string {
  const h = d.getHours()
  const hour12 = h % 12 || 12
  const ampm = h < 12 ? 'am' : 'pm'
  const mins = String(d.getMinutes()).padStart(2, '0')
  const time = mins === '00' ? `${hour12}${ampm}` : `${hour12}:${mins}${ampm}`
  return `${formatLongDate(d)} at ${time}`
}

/**
 * Extract the `--date <spec>` / `--date=<spec>` value from argv.
 * Returns undefined when no date flag is present.
 * Joins consecutive non-flag tokens so `--day day after tomorrow`
 * works with or without quotes. Throws when the flag is present
 * but has no value, rather than silently defaulting to tomorrow.
 */
export function getTargetDayArg(argv: ReadonlyArray<string> = process.argv): string | undefined {
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    const eq = a.indexOf('=')
    if (eq > 0 && DATE_FLAGS.has(a.slice(0, eq))) return a.slice(eq + 1)
    if (DATE_FLAGS.has(a)) {
      const rest = args.slice(i + 1)
      const valueParts: Array<string> = []
      for (const token of rest) {
        if (token.startsWith('-') && token.length > 1) break
        valueParts.push(token)
      }
      if (valueParts.length === 0) {
        throw new Error(
          `Missing value for "${a}": use an offset (e.g. "+1", "plus two", "3") or a date (e.g. "2026-09-14").`
        )
      }
      return valueParts.join(' ')
    }
  }
  return undefined
}

const BOOLEAN_FLAGS = new Set(['--dry-run', '--env=production'])

/**
 * Tokens in argv (after node + script) that are not a recognized flag or a
 * consumed flag value. There is currently no valid use for positional args,
 * so any that show up are almost certainly a mangled invocation — e.g. npm
 * eating `--day` when the `--` separator is missing:
 * `npm run dry-run -- --day "day after tomorrow"`.
 */
export function findUnexpectedArgs(argv: ReadonlyArray<string> = process.argv): Array<string> {
  const args = argv.slice(2)
  const unexpected: Array<string> = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    const eq = a.indexOf('=')
    if (eq > 0 && DATE_FLAGS.has(a.slice(0, eq))) continue
    if (DATE_FLAGS.has(a)) {
      // Space form: skip the flag plus its consumed value tokens.
      i++
      while (i < args.length && !(args[i]!.startsWith('-') && args[i]!.length > 1)) i++
      i--
      continue
    }
    if (a === '--env') {
      i++ // consume the env value (`--env production`)
      continue
    }
    if (BOOLEAN_FLAGS.has(a) || a.startsWith('--env=')) continue
    unexpected.push(a)
  }
  return unexpected
}
