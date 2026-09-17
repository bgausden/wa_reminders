import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { renderScheduledPage } from '../src/report/serveScheduled.js'
import { runStatusFailed, runStatusOk } from '../src/report/cacheKey.js'
import { renderReport } from '../src/effect/render.js'
import type { ReminderClient, ReminderRun } from '../src/effect/run.js'
import type { ReminderOutput } from '../src/effect/pipeline.js'
import type { StoredReport } from '../src/report/store.js'

// The timer ran at 9am; the request comes later the same morning.
const GENERATED_AT = new Date(2026, 8, 13, 9, 0, 0)
const FRESH_NOW = new Date(2026, 8, 13, 9, 30, 0)
// More than the 26h stale allowance after generation.
const STALE_NOW = new Date(2026, 8, 14, 11, 30, 0)
const DAY = { label: '2026-09-14' }

const TEMPLATE =
  'Hi <%= clientDisplayName %>, reminder for your <%= AppointmentTime %> appointment <%= AppointmentDay %>.'

const output = (
  over: Partial<ReminderOutput> & Pick<ReminderOutput, 'Id' | 'ClientId'>
): ReminderOutput => ({
  StaffId: '1 (Tamara)',
  StaffName: 'Tamara',
  Status: 'Booked',
  SessionTypeId: 1,
  ServiceName: 'Signature Facial',
  StartDateTime: '2026-09-14T10:00:00',
  EndDateTime: '2026-09-14T11:00:00',
  suppressReason: [],
  ...over,
})

const client = (over: Partial<ReminderClient> & Pick<ReminderClient, 'Id'>): ReminderClient => ({
  FirstName: 'Ann',
  LastName: 'Bee',
  Email: null,
  MobilePhone: '91234567',
  HomePhone: null,
  SendScheduleTexts: true,
  SuspensionInfo: {},
  ...over,
})

// The real renderer, so the page is asserted against the real cards: wa.me
// links, phone headers, the missing-number flag and the suppressed list.
const stored = async (generatedAt: Date): Promise<StoredReport> => {
  const rendered = await Effect.runPromise(
    renderReport(
      {
        outputs: [
          output({ Id: 1, ClientId: 'c1' }),
          output({ Id: 2, ClientId: 'c2' }),
          output({ Id: 3, ClientId: 'c3', Status: 'Cancelled', suppressReason: ['Status'] }),
        ],
        clients: [
          client({ Id: 'c1', MobilePhone: '91234567', HomePhone: '23456789' }),
          client({ Id: 'c2', FirstName: 'Bo', MobilePhone: null, HomePhone: null }),
        ],
      } satisfies ReminderRun,
      TEMPLATE,
      { invokedAt: GENERATED_AT, targetDay: { offset: 1, midnight: new Date(2026, 8, 14) } }
    )
  )
  return {
    html: rendered.html,
    report: rendered.report,
    targetDayLabel: DAY.label,
    generatedAt,
  }
}

describe('renderScheduledPage', () => {
  it('serves this morning’s list with its furniture and no banner when fresh', async () => {
    const page = renderScheduledPage(
      await stored(GENERATED_AT),
      runStatusOk(GENERATED_AT, DAY),
      FRESH_NOW
    )
    expect(page).toContain('Generated Sunday September 13th 2026 at 9am')
    expect(page).toContain('Reminders for Monday September 14th 2026')
    expect(page).not.toContain('class="banner"')
    // One card per client: rendered message, wa.me link, phone numbers.
    expect(page).toContain('https://wa.me/85291234567?text=')
    expect(page).toContain('mobile +85291234567, home +85223456789')
    // Missing numbers are flagged, suppressed appointments listed separately.
    expect(page).toContain('No mobile number — manual lookup needed')
    expect(page).toContain('suppressed appointment 3')
  })

  it('shows the red stale banner when the morning run was missed', async () => {
    const page = renderScheduledPage(
      await stored(GENERATED_AT),
      runStatusOk(GENERATED_AT, DAY),
      STALE_NOW
    )
    expect(page).toContain('class="banner"')
    expect(page).toContain('out of date')
    // The list itself is still there, under the warning.
    expect(page).toContain('https://wa.me/85291234567?text=')
  })

  it('shows the failed-run banner with the error text', async () => {
    const page = renderScheduledPage(
      await stored(GENERATED_AT),
      runStatusFailed(GENERATED_AT, DAY, 'GET staff/staff failed'),
      FRESH_NOW
    )
    expect(page).toContain('class="banner"')
    expect(page).toContain('The last scheduled run failed')
    expect(page).toContain('GET staff/staff failed')
  })

  it('says plainly when the timer has never stored a report', async () => {
    const page = renderScheduledPage(null, null, FRESH_NOW)
    expect(page).toContain('No reminder list yet')
    expect(page).toContain('9am Hong Kong time')
    expect(page).not.toContain('class="banner"')
  })

  it('puts the failed banner on the empty page when the first run failed', async () => {
    const page = renderScheduledPage(
      null,
      runStatusFailed(GENERATED_AT, DAY, 'Mindbody 503'),
      FRESH_NOW
    )
    expect(page).toContain('No reminder list yet')
    expect(page).toContain('class="banner"')
    expect(page).toContain('The last scheduled run failed')
    expect(page).toContain('Mindbody 503')
  })
})
