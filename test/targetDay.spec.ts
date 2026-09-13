import { describe, expect, it, vi } from 'vitest'
import {
  getTargetDayArg,
  parseTargetDay,
  resolveTargetDay,
  scheduledTargetDay,
} from '../src/targetDay.js'

// Fixed "now": Sunday 2026-09-13 15:00 local.
const NOW = new Date(2026, 8, 13, 15, 0, 0)

const label = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

describe('parseTargetDay', () => {
  it('defaults to tomorrow (offset 1) when no arg given', () => {
    for (const raw of [undefined, null, '', '   ']) {
      const day = parseTargetDay(raw, NOW)
      expect(day.offset).toBe(1)
      expect(day.label).toBe('2026-09-14')
      expect(day.midnight.getHours()).toBe(0)
      expect(day.elevenFiftyNine.getHours()).toBe(23)
    }
  })

  it('parses numeric and plus offsets', () => {
    expect(parseTargetDay('+1', NOW).offset).toBe(1)
    expect(parseTargetDay('+ 3', NOW).offset).toBe(3)
    expect(parseTargetDay('+3', NOW).label).toBe('2026-09-16')
    expect(parseTargetDay('2', NOW).offset).toBe(2)
    expect(parseTargetDay('2 days', NOW).offset).toBe(2)
    expect(parseTargetDay('in 3 days', NOW).offset).toBe(3)
    expect(parseTargetDay('0', NOW).offset).toBe(0)
  })

  it('parses "plus <n>" with digits and words', () => {
    expect(parseTargetDay('plus 1', NOW).offset).toBe(1)
    expect(parseTargetDay('plus one', NOW).offset).toBe(1)
    expect(parseTargetDay('plus two', NOW).offset).toBe(2)
    expect(parseTargetDay('Plus Three', NOW).label).toBe('2026-09-16')
    expect(parseTargetDay('three', NOW).offset).toBe(3)
  })

  it('parses keywords and weekday names', () => {
    expect(parseTargetDay('today', NOW).offset).toBe(0)
    expect(parseTargetDay('tomorrow', NOW).offset).toBe(1)
    expect(parseTargetDay('day after tomorrow', NOW).offset).toBe(2)
    // NOW is a Sunday: Monday is +1, Saturday is +6, Sunday is today.
    expect(parseTargetDay('monday', NOW).offset).toBe(1)
    expect(parseTargetDay('fri', NOW).offset).toBe(5)
    expect(parseTargetDay('sunday', NOW).offset).toBe(0)
  })

  it('parses YYYY-MM-DD calendar dates', () => {
    const day = parseTargetDay('2026-09-20', NOW)
    expect(day.label).toBe('2026-09-20')
    expect(day.offset).toBe(7)
    expect(parseTargetDay('2026/9/5', NOW).label).toBe('2026-09-05')
  })

  it('fuzzy-parses month-name dates', () => {
    expect(parseTargetDay('20 Sep 2026', NOW).label).toBe('2026-09-20')
    expect(parseTargetDay('Sep 20 2026', NOW).label).toBe('2026-09-20')
    expect(parseTargetDay('Sep 20', NOW).label).toBe('2026-09-20')
    expect(parseTargetDay('20 Sep', NOW).label).toBe('2026-09-20')
  })

  it('midnight boundary spans the full local day', () => {
    const day = parseTargetDay('2026-09-20', NOW)
    expect(day.midnight.getHours()).toBe(0)
    expect(day.midnight.getMinutes()).toBe(0)
    expect(day.elevenFiftyNine.getHours()).toBe(23)
    expect(day.elevenFiftyNine.getMinutes()).toBe(59)
    expect(label(day.midnight)).toBe('2026-09-20')
  })

  it('rejects garbage with a usage hint', () => {
    expect(() => parseTargetDay('not a day!!', NOW)).toThrow(/Invalid day/)
    expect(() => parseTargetDay('not a day!!', NOW)).toThrow(/Use an offset/)
    expect(() => parseTargetDay('2026-13-45', NOW)).toThrow(/not a real calendar date/)
  })
})

// The resolver every entry point shares: the CLI passes its --date/--day value,
// the day picker will pass whatever the user typed, the timer passes nothing.
describe('resolveTargetDay', () => {
  it('accepts every documented form', () => {
    // NOW is Sunday 2026-09-13 15:00 local.
    const forms: Array<[string | undefined, string]> = [
      [undefined, '2026-09-14'],
      ['', '2026-09-14'],
      ['+1', '2026-09-14'],
      ['+ 3', '2026-09-16'],
      ['2', '2026-09-15'],
      ['2 days', '2026-09-15'],
      ['in 3 days', '2026-09-16'],
      ['plus two', '2026-09-15'],
      ['three', '2026-09-16'],
      ['today', '2026-09-13'],
      ['tonight', '2026-09-13'],
      ['tomorrow', '2026-09-14'],
      ['tmr', '2026-09-14'],
      ['day after tomorrow', '2026-09-15'],
      ['monday', '2026-09-14'],
      ['fri', '2026-09-18'],
      ['2026-09-20', '2026-09-20'],
      ['2026/9/5', '2026-09-05'],
      ['2026.9.5', '2026-09-05'],
      ['14 Sep 2026', '2026-09-14'],
      ['Sep 20', '2026-09-20'],
    ]
    for (const [spec, expected] of forms) {
      expect(resolveTargetDay(spec, NOW).label, `spec: ${String(spec)}`).toBe(expected)
    }
  })

  it('is the same resolver as parseTargetDay', () => {
    expect(resolveTargetDay('plus two', NOW)).toEqual(parseTargetDay('plus two', NOW))
    expect(() => resolveTargetDay('not a day!!', NOW)).toThrow(/Invalid day/)
  })

  it('fails with a message that reads outside the CLI too', () => {
    let message = ''
    try {
      resolveTargetDay('not a day!!', NOW)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toMatch(/not a day!!/)
    expect(message).toMatch(/Use an offset/)
    // No argv jargon: the web day picker shows this text in a browser.
    expect(message).not.toMatch(/--date|--day|argv/)
  })

  it('resolves against the clock at call time, not at module load', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 8, 13, 23, 59, 59))
      const { resolveTargetDay: resolve } = await import('../src/targetDay.js')
      expect(resolve().label).toBe('2026-09-14')

      // Same process, one second later: midnight has passed.
      vi.setSystemTime(new Date(2026, 8, 14, 0, 0, 0))
      expect(resolve().label).toBe('2026-09-15')
      expect(resolve('today').label).toBe('2026-09-14')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('scheduledTargetDay', () => {
  // Independent oracle: tomorrow's Hong Kong calendar date, from Intl alone.
  const hkTomorrowLabel = (now: Date): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const value = (type: string): number => Number(parts.find((p) => p.type === type)?.value)
    const next = new Date(Date.UTC(value('year'), value('month') - 1, value('day') + 1))
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${next.getUTCFullYear()}-${p(next.getUTCMonth() + 1)}-${p(next.getUTCDate())}`
  }

  it('is the next Hong Kong day, given UTC instants', () => {
    // 15:00Z is 23:00 the same day in HK (+8) -> scheduled day is tomorrow.
    expect(scheduledTargetDay(new Date('2026-09-13T15:00:00Z')).label).toBe('2026-09-14')
    // 23:00Z is already 07:00 the next day in HK -> scheduled day is the day after.
    expect(scheduledTargetDay(new Date('2026-09-13T23:00:00Z')).label).toBe('2026-09-15')
  })

  it('agrees with an independent Hong Kong computation, across year boundaries', () => {
    const instants = [
      '2026-01-01T00:30:00Z',
      '2026-06-30T16:00:00Z',
      '2026-09-13T23:00:00Z',
      '2026-12-31T23:59:00Z',
    ]
    for (const iso of instants) {
      const now = new Date(iso)
      const day = scheduledTargetDay(now)
      expect(day.label, iso).toBe(hkTomorrowLabel(now))
      expect(day.offset, iso).toBe(1)
      // The Dates read back the Hong Kong wall clock on whatever host this runs on.
      expect(label(day.midnight), iso).toBe(day.label)
      expect(label(day.elevenFiftyNine), iso).toBe(day.label)
    }
  })

  it('spans the whole scheduled day', () => {
    const day = scheduledTargetDay(new Date('2026-09-13T23:00:00Z'))
    expect(day.midnight.getHours()).toBe(0)
    expect(day.midnight.getMinutes()).toBe(0)
    expect(day.elevenFiftyNine.getHours()).toBe(23)
    expect(day.elevenFiftyNine.getMinutes()).toBe(59)
  })

  // Host timezone is forced, not assumed: Node re-reads process.env.TZ, so the
  // assertion holds on a UTC server as well as a Hong Kong workstation.
  it('is unaffected by the host timezone', () => {
    const original = process.env.TZ
    try {
      for (const tz of ['UTC', 'America/New_York', 'Pacific/Kiritimati']) {
        process.env.TZ = tz
        expect(scheduledTargetDay(new Date('2026-09-13T23:00:00Z')).label, tz).toBe('2026-09-15')
        expect(scheduledTargetDay(new Date('2026-09-13T15:00:00Z')).label, tz).toBe('2026-09-14')
      }
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
})

describe('getTargetDayArg', () => {
  it('reads --date/--day flags in both = and space forms', () => {
    expect(getTargetDayArg(['node', 'x', '--date=2026-09-20'])).toBe('2026-09-20')
    expect(getTargetDayArg(['node', 'x', '--date', '+3'])).toBe('+3')
    expect(getTargetDayArg(['node', 'x', '--day', 'plus two'])).toBe('plus two')
    expect(getTargetDayArg(['node', 'x', '--target-day=tomorrow'])).toBe('tomorrow')
    expect(getTargetDayArg(['node', 'x', '--dry-run'])).toBeUndefined()
  })

  it('accepts single-dash aliases', () => {
    expect(getTargetDayArg(['node', 'x', '-day', 'day after tomorrow'])).toBe(
      'day after tomorrow'
    )
    expect(getTargetDayArg(['node', 'x', '-d=+2'])).toBe('+2')
  })

  it('joins unquoted multi-word values', () => {
    expect(getTargetDayArg(['node', 'x', '--day', 'day', 'after', 'tomorrow'])).toBe(
      'day after tomorrow'
    )
    // Stops at the next flag so --dry-run is not swallowed.
    expect(getTargetDayArg(['node', 'x', '--day', 'plus', 'two', '--dry-run'])).toBe('plus two')
  })

  it('throws on a flag with no value instead of silently defaulting', () => {
    expect(() => getTargetDayArg(['node', 'x', '--day'])).toThrow(/Missing value/)
    expect(() => getTargetDayArg(['node', 'x', '--day', '--dry-run'])).toThrow(/Missing value/)
  })
})

describe('findUnexpectedArgs', () => {
  it('accepts clean invocations', async () => {
    const { findUnexpectedArgs } = await import('../src/targetDay.js')
    expect(findUnexpectedArgs(['node', 'x', '--dry-run'])).toEqual([])
    expect(findUnexpectedArgs(['node', 'x', '--dry-run', '--env=production'])).toEqual([])
    expect(findUnexpectedArgs(['node', 'x', '--dry-run', '--day', 'day', 'after', 'tomorrow'])).toEqual(
      []
    )
    expect(findUnexpectedArgs(['node', 'x', '--dry-run', '--date=2026-09-20'])).toEqual([])
  })

  it('flags stray positionals from a missing npm -- separator', async () => {
    const { findUnexpectedArgs } = await import('../src/targetDay.js')
    // What the app actually received in the bug report: npm ate `--day`.
    expect(
      findUnexpectedArgs(['node', 'x', '--dry-run', '--env=production', 'day', 'after', 'tomorrow'])
    ).toEqual(['day', 'after', 'tomorrow'])
  })

  it('flags unknown flags', async () => {
    const { findUnexpectedArgs } = await import('../src/targetDay.js')
    expect(findUnexpectedArgs(['node', 'x', '--bogus'])).toEqual(['--bogus'])
  })
})

describe('formatLongDate', () => {
  it('formats weekday, month, ordinal and year', async () => {
    const { formatLongDate, formatLongDateTime } = await import('../src/targetDay.js')
    // 2026-09-15 is a Tuesday, 2026-09-13 a Sunday.
    expect(formatLongDate(new Date(2026, 8, 15, 12))).toBe('Tuesday September 15th 2026')
    expect(formatLongDateTime(new Date(2026, 8, 13, 20, 56))).toBe(
      'Sunday September 13th 2026 at 8:56pm'
    )
    expect(formatLongDateTime(new Date(2026, 8, 13, 9, 0))).toContain('at 9am')
  })

  it('uses 1st/2nd/3rd and 11th/12th/13th ordinals', async () => {
    const { formatLongDate } = await import('../src/targetDay.js')
    expect(formatLongDate(new Date(2026, 8, 1, 12))).toContain('1st')
    expect(formatLongDate(new Date(2026, 8, 2, 12))).toContain('2nd')
    expect(formatLongDate(new Date(2026, 8, 3, 12))).toContain('3rd')
    expect(formatLongDate(new Date(2026, 8, 11, 12))).toContain('11th')
    expect(formatLongDate(new Date(2026, 8, 12, 12))).toContain('12th')
    expect(formatLongDate(new Date(2026, 8, 21, 12))).toContain('21st')
    expect(formatLongDate(new Date(2026, 8, 22, 12))).toContain('22nd')
  })
})
