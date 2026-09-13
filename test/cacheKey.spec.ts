import { describe, expect, it } from 'vitest'
import {
  classifyDay,
  DAY_REPORT_KEY_PREFIX,
  dayLabelDate,
  dayReportKey,
  InvalidDayLabelError,
  isDayLabel,
  isStale,
  type RunStatus,
  RUN_STATUS_KEY,
  runStatusFailed,
  runStatusOk,
  SCHEDULED_REPORT_KEY,
  STALE_AFTER_HOURS,
  STALE_AFTER_MS,
} from '../src/report/cacheKey.js'
import { resolveTargetDay, scheduledTargetDay } from '../src/targetDay.js'

// Every instant is explicit: nothing here reads the machine clock or cares
// what timezone the host is in.
const SUNDAY_9AM = new Date(2026, 8, 13, 9, 0, 0)
const HOUR = 60 * 60 * 1000

const captured = (thunk: () => unknown): unknown => {
  try {
    thunk()
    return undefined
  } catch (error) {
    return error
  }
}

describe('day report keys', () => {
  it('derives the key from the resolved label, not from what was asked for', () => {
    const day = resolveTargetDay('2026-09-14', SUNDAY_9AM)
    expect(day.label).toBe('2026-09-14')
    expect(dayReportKey(day)).toBe('day-2026-09-14.json')
  })

  it('keys two routes to the same day identically', () => {
    const fromDate = resolveTargetDay('2026-09-14', SUNDAY_9AM)
    const fromOffset = resolveTargetDay('+1', SUNDAY_9AM)
    const fromWords = resolveTargetDay('tomorrow', SUNDAY_9AM)
    expect(dayReportKey(fromOffset)).toBe(dayReportKey(fromDate))
    expect(dayReportKey(fromWords)).toBe(dayReportKey(fromDate))
  })

  it('ignores everything on the day except its label', () => {
    // Same calendar day carrying a different offset: one key, because the
    // label is the whole identity of the slot.
    const sameDayDifferentOffset = { label: '2026-09-14', offset: 3, midnight: new Date(2026, 8, 14) }
    expect(dayReportKey(sameDayDifferentOffset)).toBe(dayReportKey({ label: '2026-09-14' }))
  })

  it('refuses a label that is not a resolved YYYY-MM-DD', () => {
    for (const label of [
      'tomorrow',
      '+1',
      '',
      '2026-9-14',
      '26-09-14',
      '2026-09-14T00:00:00Z',
      '../scheduled',
      'day-2026-09-14.json',
      '2026-09-14 ',
    ]) {
      const error = captured(() => dayReportKey({ label }))
      expect(error, `label: ${label}`).toBeInstanceOf(InvalidDayLabelError)
      expect(error, `label: ${label}`).toMatchObject({ _tag: 'InvalidDayLabelError', label })
    }
  })

  it('keeps the scheduled and status keys out of the ad-hoc namespace', () => {
    expect(SCHEDULED_REPORT_KEY).toBe('scheduled.json')
    expect(RUN_STATUS_KEY).toBe('run-status.json')
    expect(DAY_REPORT_KEY_PREFIX).toBe('day-')
    // Ad-hoc reports are expired by a lifecycle rule on the prefix, so the
    // other two must not start with it.
    expect(SCHEDULED_REPORT_KEY.startsWith(DAY_REPORT_KEY_PREFIX)).toBe(false)
    expect(RUN_STATUS_KEY.startsWith(DAY_REPORT_KEY_PREFIX)).toBe(false)
    expect(dayReportKey({ label: '2026-09-14' })).not.toBe(SCHEDULED_REPORT_KEY)
    expect(dayReportKey({ label: '2026-09-14' })).not.toBe(RUN_STATUS_KEY)
  })
})

describe('isDayLabel / dayLabelDate', () => {
  it('accepts resolved labels only', () => {
    expect(isDayLabel('2026-09-14')).toBe(true)
    expect(isDayLabel('2026-01-01')).toBe(true)
    expect(isDayLabel('2026-9-14')).toBe(false)
    expect(isDayLabel('tomorrow')).toBe(false)
    expect(isDayLabel('')).toBe(false)
  })

  it('reads a label back as local midnight of that calendar day', () => {
    const date = dayLabelDate('2026-09-14')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(14)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
    // Local midnight, not UTC midnight: `new Date('2026-09-14')` is the
    // previous day on any host behind UTC.
    expect(date.getTime()).not.toBe(Date.parse('2026-09-14T00:00:00Z'))
  })

  it('rejects an unparsed label', () => {
    expect(captured(() => dayLabelDate('14 Sep 2026'))).toBeInstanceOf(InvalidDayLabelError)
  })
})

describe('isStale', () => {
  it('names the threshold: 26 hours', () => {
    expect(STALE_AFTER_HOURS).toBe(26)
    expect(STALE_AFTER_MS).toBe(26 * 60 * 60 * 1000)
  })

  it('is fresh for a report generated this morning', () => {
    const generatedAt = new Date(2026, 8, 13, 9, 0, 0)
    expect(isStale(generatedAt, generatedAt)).toBe(false)
    expect(isStale(generatedAt, new Date(generatedAt.getTime() + HOUR))).toBe(false)
  })

  it('turns stale the moment it is older than the threshold', () => {
    const generatedAt = new Date(2026, 8, 13, 9, 0, 0)
    const exactlyStale = new Date(generatedAt.getTime() + STALE_AFTER_MS)
    expect(isStale(generatedAt, exactlyStale)).toBe(false)
    expect(isStale(generatedAt, new Date(exactlyStale.getTime() + 1))).toBe(true)
    // A late run, or one that took a few minutes, is still a normal morning.
    expect(isStale(generatedAt, new Date(generatedAt.getTime() + 25 * HOUR))).toBe(false)
  })

  it('is stale after a missed run, and never for a report dated in the future', () => {
    const generatedAt = new Date(2026, 8, 13, 9, 0, 0)
    expect(isStale(generatedAt, new Date(2026, 8, 16, 9, 0, 0))).toBe(true)
    expect(isStale(new Date(2026, 8, 14, 9, 0, 0), generatedAt)).toBe(false)
  })
})

describe('classifyDay', () => {
  it('calls the scheduled day scheduled', () => {
    const day = scheduledTargetDay(SUNDAY_9AM)
    expect(day.label).toBe('2026-09-14')
    expect(classifyDay(day, SUNDAY_9AM)).toBe('scheduled')
    // The same day reached by asking for it by name.
    expect(classifyDay({ label: '2026-09-14' }, SUNDAY_9AM)).toBe('scheduled')
  })

  it('calls any other day ad-hoc', () => {
    expect(classifyDay({ label: '2026-09-13' }, SUNDAY_9AM)).toBe('ad-hoc')
    expect(classifyDay({ label: '2026-09-15' }, SUNDAY_9AM)).toBe('ad-hoc')
    expect(classifyDay(resolveTargetDay('+2', SUNDAY_9AM), SUNDAY_9AM)).toBe('ad-hoc')
    expect(classifyDay(resolveTargetDay('today', SUNDAY_9AM), SUNDAY_9AM)).toBe('ad-hoc')
  })

  it('follows Hong Kong time, not the host clock', () => {
    // A UTC server: 23:00 on the 13th is already 07:00 on the 14th in Hong
    // Kong, so the scheduled run targets the 15th, not the 14th.
    const lateUtc = new Date('2026-09-13T23:00:00Z')
    expect(classifyDay({ label: '2026-09-15' }, lateUtc)).toBe('scheduled')
    expect(classifyDay({ label: '2026-09-14' }, lateUtc)).toBe('ad-hoc')

    const eveningUtc = new Date('2026-09-13T15:00:00Z') // 23:00 HK, still the 13th
    expect(classifyDay({ label: '2026-09-14' }, eveningUtc)).toBe('scheduled')
    expect(classifyDay({ label: '2026-09-15' }, eveningUtc)).toBe('ad-hoc')
  })
})

describe('run status', () => {
  it('records a successful run', () => {
    const status = runStatusOk(SUNDAY_9AM, { label: '2026-09-14' })
    expect(status).toEqual({
      generatedAt: SUNDAY_9AM,
      targetDayLabel: '2026-09-14',
      success: true,
      error: null,
    })
  })

  it('records a failed run with the error text the page will show', () => {
    const status = runStatusFailed(SUNDAY_9AM, { label: '2026-09-14' }, 'Mindbody 503')
    expect(status.success).toBe(false)
    expect(status.error).toBe('Mindbody 503')
    expect(status.generatedAt).toEqual(SUNDAY_9AM)
    expect(status.targetDayLabel).toBe('2026-09-14')
  })

  it('holds what the banners need: generated-at, target day, success, error text', () => {
    const status: RunStatus = runStatusOk(SUNDAY_9AM, { label: '2026-09-14' })
    expect(Object.keys(status).sort()).toEqual([
      'error',
      'generatedAt',
      'success',
      'targetDayLabel',
    ])
  })
})
