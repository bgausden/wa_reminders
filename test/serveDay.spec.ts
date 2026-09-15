import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import {
  renderAdHocBanner,
  renderDayError,
  renderDayForm,
  renderDayLinks,
  renderDayPage,
  renderEmptyDayPage,
} from '../src/report/serveDay.js'
import { scheduledTargetDay } from '../src/targetDay.js'
import { renderReport } from '../src/effect/render.js'
import type { ReminderClient, ReminderRun } from '../src/effect/run.js'
import type { ReminderOutput } from '../src/effect/pipeline.js'
import type { StoredReport } from '../src/report/store.js'

// Fixed instants, all pinned — no wall clock, no host timezone.
const GENERATED_AT = new Date(2026, 8, 13, 9, 0, 0)
// 12:00 UTC Sep 13 is 20:00 the same day in Hong Kong, whatever the host
// timezone, so the scheduled day is deterministically Sep 14.
const NOW = new Date(Date.UTC(2026, 8, 13, 12, 0, 0))
const FRESH_NOW = new Date(2026, 8, 13, 9, 30, 0)
const STALE_NOW = new Date(2026, 8, 14, 11, 30, 0)
const DAY = { label: '2026-09-14' }
const AD_HOC_DAY = { label: '2026-09-20' }

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

// The real renderer, so the page is asserted against real cards.
const stored = async (generatedAt: Date, label = DAY.label): Promise<StoredReport> => {
  const rendered = await Effect.runPromise(
    renderReport(
      {
        outputs: [output({ Id: 1, ClientId: 'c1' })],
        clients: [client({ Id: 'c1' })],
      } satisfies ReminderRun,
      TEMPLATE,
      { invokedAt: GENERATED_AT, targetDay: { offset: 1, midnight: new Date(2026, 8, 14) } }
    )
  )
  return { html: rendered.html, report: rendered.report, targetDayLabel: label, generatedAt }
}

const targetDay = (label: string) => ({
  offset: 99,
  midnight: new Date(2026, 8, 20),
  elevenFiftyNine: new Date(2026, 8, 20, 23, 59, 59),
  label,
})

describe('renderDayForm', () => {
  it('is a GET form with a day field and one-click chips', () => {
    const form = renderDayForm(null)
    expect(form).toContain('<form')
    expect(form).toContain('method="get"')
    expect(form).toContain('name="day"')
    expect(form).toContain('>Generate<')
    for (const chip of ['/?day=today', '/?day=tomorrow', '/?day=2', '/?day=3']) {
      expect(form).toContain(`href="${chip}"`)
    }
    expect(form).toContain('href="/"')
  })

  it('echoes the typed spec back, escaped', () => {
    expect(renderDayForm('+2')).toContain('value="+2"')
    const hostile = renderDayForm('"><script>alert(1)</script>')
    expect(hostile).not.toContain('<script>')
    expect(hostile).toContain('&quot;&gt;&lt;script&gt;')
  })
})

describe('renderDayPage', () => {
  it('serves a cached day with cards, furniture, form and links, no ad-hoc banner on the scheduled day', async () => {
    const label = scheduledTargetDay(NOW).label
    expect(label).toBe('2026-09-14')
    const page = renderDayPage({
      stored: await stored(GENERATED_AT),
      targetDay: { offset: 1, midnight: new Date(2026, 8, 14), elevenFiftyNine: new Date(2026, 8, 14, 23, 59, 59), label },
      now: FRESH_NOW,
      spec: 'tomorrow',
    })
    expect(page).toContain('Generated Sunday September 13th 2026 at 9am')
    expect(page).toContain('Reminders for Monday September 14th 2026')
    expect(page).toContain('https://wa.me/85291234567?text=')
    expect(page).toContain('name="day"')
    expect(page).toContain(`/?day=${label}&amp;refresh=1`)
    expect(page).toContain(`/?day=${label}&amp;download=1`)
    expect(page).not.toContain('not the scheduled morning list')
    expect(page).not.toContain('out of date')
  })

  it('banners an ad-hoc day as not the scheduled list', async () => {
    const page = renderDayPage({
      stored: await stored(FRESH_NOW, AD_HOC_DAY.label),
      targetDay: targetDay(AD_HOC_DAY.label),
      now: NOW,
      spec: '+7',
    })
    expect(page).toContain('not the scheduled morning list')
    expect(page).toContain('Sunday September 20th 2026')
    expect(page).toContain('https://wa.me/85291234567?text=')
  })

  it('shows the stale banner for an old cache entry', async () => {
    const page = renderDayPage({
      stored: await stored(GENERATED_AT),
      targetDay: targetDay(AD_HOC_DAY.label),
      now: STALE_NOW,
      spec: '2026-09-20',
    })
    expect(page).toContain('out of date')
    expect(page).toContain('https://wa.me/85291234567?text=')
  })

  it('renders the empty page with the form when nothing is cached', () => {
    const page = renderDayPage({ stored: null, targetDay: targetDay(AD_HOC_DAY.label), now: NOW, spec: '+7' })
    expect(page).toContain('No list for Sunday September 20th 2026 yet')
    expect(page).toContain('name="day"')
    expect(page).toContain('Press Generate')
  })
})

describe('renderAdHocBanner', () => {
  it('names the day in words', () => {
    expect(renderAdHocBanner('2026-09-20')).toContain('Sunday September 20th 2026')
  })
})

describe('renderDayLinks', () => {
  it('links regenerate, download and back with the resolved label', () => {
    const links = renderDayLinks('2026-09-20')
    expect(links).toContain('/?day=2026-09-20&amp;refresh=1')
    expect(links).toContain('/?day=2026-09-20&amp;download=1')
    expect(links).toContain('href="/"')
  })
})

describe('renderEmptyDayPage', () => {
  it('is a complete document with the form', () => {
    const page = renderEmptyDayPage(targetDay(AD_HOC_DAY.label), null)
    expect(page.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(page).toContain('name="day"')
  })
})

describe('renderDayError', () => {
  it('shows the reason escaped, with the form', () => {
    const page = renderDayError('+2', 'GET staff/staff failed: <boom> & "bust"')
    expect(page).toContain('Could not generate reminders')
    expect(page).toContain('name="day"')
    expect(page).toContain('GET staff/staff failed: &lt;boom&gt; &amp; &quot;bust&quot;')
    expect(page).not.toContain('<boom>')
  })
})
