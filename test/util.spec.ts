import { describe, expect, it } from 'vitest'
import { makeMBDateTimeString } from '../src/makeMBDateTimeString.js'
import { tomorrowMidnight } from '../src/util.js'

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
