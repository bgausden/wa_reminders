import { describe, expect, it } from 'vitest'
import { formatAppointmentParts, formatAppointmentTime } from '../src/formatAppointmentTime.js'

// 2026-09-13 is a Sunday (HK). Handy fixed "now" for deterministic tests.
// Noon HK avoids any midnight-boundary flakiness regardless of server TZ.
const SUN_NOON_HK = new Date('2026-09-13T12:00:00+08:00')

describe('formatAppointmentTime', () => {
  it('formats tomorrow on the hour with weekday', () => {
    expect(formatAppointmentTime('2026-09-14T16:00:00', SUN_NOON_HK)).toBe('4PM tomorrow (Monday)')
  })

  it('keeps minutes when non-zero', () => {
    expect(formatAppointmentTime('2026-09-14T16:30:00', SUN_NOON_HK)).toBe(
      '4:30PM tomorrow (Monday)'
    )
  })

  it('formats same-day appointments as today', () => {
    expect(formatAppointmentTime('2026-09-13T09:00:00', SUN_NOON_HK)).toBe('9AM today (Sunday)')
  })

  it('formats the holiday-cover case (day after tomorrow) with date fallback', () => {
    expect(formatAppointmentTime('2026-09-15T16:00:00', SUN_NOON_HK)).toBe('4PM Tuesday (15 Sep)')
  })

  it('handles noon and midnight', () => {
    expect(formatAppointmentTime('2026-09-14T12:00:00', SUN_NOON_HK)).toBe('12PM tomorrow (Monday)')
    expect(formatAppointmentTime('2026-09-14T00:00:00', SUN_NOON_HK)).toBe('12AM tomorrow (Monday)')
  })

  it('passes unparseable input through so reminders still send', () => {
    expect(formatAppointmentTime('not-a-date', SUN_NOON_HK)).toBe('not-a-date')
    expect(formatAppointmentTime('', SUN_NOON_HK)).toBe('')
  })

  it('splits time and day for the "your TIME appointment DAY" template', () => {
    expect(formatAppointmentParts('2026-09-14T11:30:00', SUN_NOON_HK)).toEqual({
      time: '11:30AM',
      day: 'tomorrow (Monday)',
    })
    expect(formatAppointmentParts('2026-09-15T16:00:00', SUN_NOON_HK)).toEqual({
      time: '4PM',
      day: 'Tuesday (15 Sep)',
    })
  })
})
