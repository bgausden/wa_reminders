import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { wrapReport, type ChromeOptions } from '../src/report/chrome.js'
import { InvalidDayLabelError, runStatusFailed, runStatusOk } from '../src/report/cacheKey.js'
import { renderReport } from '../src/effect/render.js'
import type { ReminderClient, ReminderRun } from '../src/effect/run.js'
import type { ReminderOutput } from '../src/effect/pipeline.js'

// Fixed instants: the page says "Generated ..." and the tests read it back
// literally, so nothing depends on the clock or the host timezone.
const GENERATED_AT = new Date(2026, 8, 13, 9, 0, 0)

// A stand-in for a rendered report: a complete HTML document, the shape
// `renderReport` produces and the CLI writes to `dry-runs/`.
const DOCUMENT =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<title>DRY RUN — 1 to send</title>\n<style>body{font-family:system-ui,sans-serif}</style>\n</head>\n' +
  '<body>\n<h1>DRY RUN — 1 to send (1 appointments), 0 suppressed</h1>\n' +
  '<section class="card">\n<h2>to client c1</h2>\n</section>\n</body>\n</html>\n'

const only = (over: Partial<ChromeOptions> = {}): ChromeOptions => ({
  generatedAt: GENERATED_AT,
  targetDayLabel: '2026-09-14',
  ...over,
})

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

const client = (): ReminderClient => ({
  Id: 'c1',
  FirstName: 'Ann',
  LastName: 'Bee',
  Email: null,
  MobilePhone: '91234567',
  HomePhone: null,
  SendScheduleTexts: true,
  SuspensionInfo: {},
})

/** The real renderer's output, so the seam is tested against the real thing. */
const renderedReport = (): Promise<string> =>
  Effect.runPromise(
    renderReport(
      { outputs: [output({ Id: 1, ClientId: 'c1' })], clients: [client()] } satisfies ReminderRun,
      TEMPLATE,
      { invokedAt: GENERATED_AT, targetDay: { offset: 1, midnight: new Date(2026, 8, 14) } }
    )
  ).then((rendered) => rendered.html)

describe('wrapReport', () => {
  it('puts the furniture at the top of the page and leaves the report alone', async () => {
    const report = await renderedReport()
    const wrapped = wrapReport(report, only())
    expect(wrapped.startsWith('<!DOCTYPE html>')).toBe(true)
    // The furniture goes first, the report body follows untouched.
    expect(wrapped.indexOf('class="chrome"')).toBeLessThan(wrapped.indexOf('<h1>'))
    // Everything from the report's heading on is byte for byte the dry-run
    // file, cards and wa.me links included.
    expect(wrapped).toContain(report.slice(report.indexOf('<h1>')))
    expect(wrapped).toContain('https://wa.me/85291234567?text=')
    expect(wrapped.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('says when the list was generated and spells out the day it is for', () => {
    const wrapped = wrapReport(DOCUMENT, only())
    expect(wrapped).toContain('Generated Sunday September 13th 2026 at 9am')
    expect(wrapped).toContain('Reminders for Monday September 14th 2026')
    expect(wrapped.indexOf('Generated ')).toBeLessThan(wrapped.indexOf('Reminders for '))
  })

  it('adds its stylesheet to the head of the document', () => {
    const wrapped = wrapReport(DOCUMENT, only())
    expect(wrapped).toContain('.chrome-banner')
    expect(wrapped.indexOf('.chrome-banner')).toBeLessThan(wrapped.indexOf('</head>'))
    // The report's own head is still there.
    expect(wrapped).toContain('<title>DRY RUN — 1 to send</title>')
    expect(wrapped).toContain('body{font-family:system-ui,sans-serif}')
  })

  it('shows no banner on a fresh report from a run that worked', () => {
    const wrapped = wrapReport(DOCUMENT, only({ runStatus: runStatusOk(GENERATED_AT, { label: '2026-09-14' }) }))
    expect(wrapped).toContain('Generated Sunday September 13th 2026 at 9am')
    expect(wrapped).not.toContain('class="chrome-banner"')
    expect(wrapped).not.toContain('out of date')
    expect(wrapped).not.toContain('failed')
  })

  it('shows the stale banner only when the report is stale', () => {
    const stale = wrapReport(DOCUMENT, only({ stale: true }))
    expect(stale).toContain('class="chrome-banner"')
    expect(stale).toContain('out of date')
    expect(stale).toContain('more than 26 hours ago')

    for (const options of [only(), only({ stale: false })]) {
      const fresh = wrapReport(DOCUMENT, options)
      expect(fresh, JSON.stringify(options)).not.toContain('class="chrome-banner"')
      expect(fresh, JSON.stringify(options)).not.toContain('out of date')
    }
  })

  it('shows the last-run-failed banner with the error text, escaped', () => {
    const failed = wrapReport(
      DOCUMENT,
      only({ runStatus: runStatusFailed(GENERATED_AT, { label: '2026-09-14' }, 'Mindbody 503') })
    )
    expect(failed).toContain('class="chrome-banner"')
    expect(failed).toContain('The last scheduled run failed')
    expect(failed).toContain('Mindbody 503')

    const hostile = wrapReport(
      DOCUMENT,
      only({
        runStatus: runStatusFailed(
          GENERATED_AT,
          { label: '2026-09-14' },
          '<script>alert("x")</script>'
        ),
      })
    )
    expect(hostile).not.toContain('<script>alert')
    expect(hostile).toContain('&lt;script&gt;')
  })

  it('shows no failed-run banner when the run succeeded or has never run', () => {
    const cases = [
      only(),
      only({ runStatus: null }),
      only({ runStatus: runStatusOk(GENERATED_AT, { label: '2026-09-14' }) }),
    ]
    for (const options of cases) {
      const wrapped = wrapReport(DOCUMENT, options)
      expect(wrapped, JSON.stringify(options)).not.toContain('failed')
      expect(wrapped, JSON.stringify(options)).not.toContain('class="chrome-banner"')
    }
  })

  it('shows both banners together, stale one first', () => {
    const wrapped = wrapReport(
      DOCUMENT,
      only({
        stale: true,
        runStatus: runStatusFailed(GENERATED_AT, { label: '2026-09-14' }, 'Mindbody 503'),
      })
    )
    expect(wrapped.match(/class="chrome-banner"/g)).toHaveLength(2)
    expect(wrapped.indexOf('out of date')).toBeLessThan(wrapped.indexOf('last scheduled run failed'))
  })

  it('renders extra blocks after the banners, in order', () => {
    // The seam for issue #12: the day picker, the quick day chips, the
    // regenerate link and the ad-hoc banner arrive here, in this order, and
    // nothing else in this module changes.
    const wrapped = wrapReport(
      DOCUMENT,
      only({
        stale: true,
        extra: [
          '<p class="chrome-banner">Ad-hoc day — this is not the scheduled list.</p>',
          '<nav class="chrome-nav"><input type="date" name="day"></nav>',
        ],
      })
    )
    expect(wrapped).toContain('<input type="date" name="day">')
    expect(wrapped.indexOf('out of date')).toBeLessThan(wrapped.indexOf('not the scheduled list'))
    expect(wrapped.indexOf('not the scheduled list')).toBeLessThan(wrapped.indexOf('<nav'))
    expect(wrapped.indexOf('<nav')).toBeLessThan(wrapped.indexOf('<h1>'))
  })

  it('does not treat text from the report as a replacement pattern', () => {
    // `$&` in a failed run's error text must come out as itself.
    const wrapped = wrapReport(
      DOCUMENT,
      only({ runStatus: runStatusFailed(GENERATED_AT, { label: '2026-09-14' }, 'cost $& cents') })
    )
    expect(wrapped).toContain('cost $&amp; cents')
    expect(wrapped).toContain('<body>')
  })

  it('still furnishes a fragment that is not a whole document', () => {
    const fragment = '<section class="card"><h2>to client c1</h2></section>'
    const wrapped = wrapReport(fragment, only({ stale: true }))
    expect(wrapped).toContain('Reminders for Monday September 14th 2026')
    expect(wrapped).toContain('out of date')
    expect(wrapped).toContain('.chrome-banner')
    expect(wrapped).toContain(fragment)
  })

  it('refuses to spell out a day that was never resolved', () => {
    expect(() => wrapReport(DOCUMENT, only({ targetDayLabel: 'tomorrow' }))).toThrowError(
      InvalidDayLabelError
    )
  })
})
