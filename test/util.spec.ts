import { describe, expect, it, vi } from 'vitest'
import { makeMBDateTimeString } from '../src/makeMBDateTimeString.js'
import { dayWithOffset, tomorrowMidnight } from '../src/util.js'

const label = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

describe('dayWithOffset', () => {
  it('builds the day from the instant passed in', () => {
    const now = new Date(2026, 8, 13, 15, 0, 0)
    const tomorrow = dayWithOffset(1, now)
    expect(tomorrow.offset).toBe(1)
    expect(label(tomorrow.midnight)).toBe('2026-09-14')
    expect(label(tomorrow.elevenFiftyNine)).toBe('2026-09-14')
    expect(tomorrow.midnightDateString).toBe('2026-09-14T00:00:00')
    expect(tomorrow.elevenFiftyNineDateString).toBe('2026-09-14T23:59:59')
    expect(dayWithOffset(0, now).midnightDateString).toBe('2026-09-13T00:00:00')
  })

  it('is computed per invocation, not at module load', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 8, 13, 23, 59, 59))
      // Fresh module: the legacy `tomorrow` below is evaluated now, at import.
      vi.resetModules()
      const util = await import('../src/util.js')

      const beforeMidnight = util.dayWithOffset(1)
      expect(label(beforeMidnight.midnight)).toBe('2026-09-14')

      // The clock crosses midnight; nothing about the process has restarted.
      vi.setSystemTime(new Date(2026, 8, 14, 0, 0, 1))
      const afterMidnight = util.dayWithOffset(1)
      expect(label(afterMidnight.midnight)).toBe('2026-09-15')
      expect(afterMidnight.midnightDateString).toBe('2026-09-15T00:00:00')

      // Same midnight-crossing, seen the legacy way: the module-load value
      // stayed on the old day. That is the bug the factory removes.
      expect(label(util.tomorrow.midnight)).toBe('2026-09-14')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('test wa_reminders:util', () => {
  it('should round-trip midnight at second precision', () => {
    const date = new Date(tomorrowMidnight)
    date.setMilliseconds(0)
    const result = makeMBDateTimeString(date)

    expect(result).toHaveLength(1)
    expect(result[0]).toBeTypeOf('string')

    const newDate = new Date(result[0]!)
    expect(newDate).toBeInstanceOf(Date)
    expect(newDate.getTime()).toBe(date.getTime())
  })

  it('should format without milliseconds by design', () => {
    const date = new Date(2021, 0, 1, 12, 34, 56, 789)
    const [formatted] = makeMBDateTimeString(date)

    expect(formatted).toBe('2021-01-01T12:34:56')
  })

  it('should accept an array of dates', () => {
    const dates = [new Date(2021, 0, 1, 0, 0, 0), new Date(2021, 0, 2, 0, 0, 0)]
    const result = makeMBDateTimeString(dates)

    expect(result).toEqual(['2021-01-01T00:00:00', '2021-01-02T00:00:00'])
  })
})
