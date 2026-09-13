const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const HK_TIME_ZONE = 'Asia/Hong_Kong'
const DAY_MS = 24 * 60 * 60 * 1000

// en-CA yields YYYY-MM-DD, convenient for calendar-day math.
const hkDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: HK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function dayNumber(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) / DAY_MS
}

function hkDayNumber(now: Date): number {
  const parts = hkDateParts.formatToParts(now)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  return dayNumber(Number(get('year')), Number(get('month')), Number(get('day')))
}

/**
 * Split form of {@link formatAppointmentTime} for templates that place the
 * time and day in different positions, e.g.
 * `your 11:30AM appointment tomorrow (Monday)`.
 *
 * Fail-safe: unparseable input returns `{ time: input, day: '' }`.
 */
export function formatAppointmentParts(
  mbDateTime: string,
  now: Date = new Date()
): { time: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(mbDateTime)
  if (!match) return { time: mbDateTime, day: '' }

  const [, ys, ms, ds, hs, mins] = match
  const y = Number(ys)
  const m = Number(ms)
  const d = Number(ds)
  const h = Number(hs)
  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    m < 1 ||
    m > 12 ||
    !Number.isInteger(d) ||
    d < 1 ||
    d > 31 ||
    !Number.isInteger(h) ||
    h > 23 ||
    mins === undefined ||
    Number(mins) > 59
  ) {
    return { time: mbDateTime, day: '' }
  }

  const hour12 = h % 12 || 12
  const ampm = h < 12 ? 'AM' : 'PM'
  const time = mins === '00' ? `${hour12}${ampm}` : `${hour12}:${mins}${ampm}`

  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ''
  const diff = dayNumber(y, m, d) - hkDayNumber(now)

  if (diff === 0) return { time, day: `today (${weekday})` }
  if (diff === 1) return { time, day: `tomorrow (${weekday})` }
  return { time, day: `${weekday} (${d} ${MONTHS_SHORT[m - 1]})` }
}

/**
 * Format a Mindbody `YYYY-MM-DDTHH:MM[:SS]` wall-time (Hong Kong local,
 * no timezone suffix) into natural language for reminders.
 *
 * - same HK calendar day as `now` -> `4PM today (Sunday)`
 * - next HK calendar day          -> `4PM tomorrow (Monday)`
 * - anything else (e.g. holiday cover for the day after) -> `4PM Tuesday (15 Sep)`
 *
 * Fail-safe: unparseable input is returned unchanged so reminders still send.
 */
export function formatAppointmentTime(mbDateTime: string, now: Date = new Date()): string {
  const { time, day } = formatAppointmentParts(mbDateTime, now)
  return day === '' ? time : `${time} ${day}`
}
