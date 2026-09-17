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

// A legacy stored report: the minimal shape the old renderer produced.
// wrapReport must upgrade it in place (board, board stylesheet, script).
const LEGACY_DOCUMENT =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<title>DRY RUN — 1 to send</title>\n</head>\n' +
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
  it('refreshes the board in place and leaves the cards alone', async () => {
    const report = await renderedReport()
    const wrapped = wrapReport(report, only())
    expect(wrapped.startsWith('<!DOCTYPE html>')).toBe(true)
    // One board only: the stored board is replaced, not doubled.
    expect(wrapped.match(/<header class="board">/g)).toHaveLength(1)
    // Fresh furniture values from storage, not the stored render.
    expect(wrapped).toContain('Generated Sunday September 13th 2026 at 9am')
    expect(wrapped).toContain('Reminders for Monday September 14th 2026')
    // Cards and wa.me links untouched.
    expect(wrapped).toContain('https://wa.me/85291234567?text=')
    expect(wrapped).toContain('Ann — Signature Facial')
    expect(wrapped.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('upgrades a legacy stored report: board, stylesheet and per-day script', () => {
    const wrapped = wrapReport(LEGACY_DOCUMENT, only())
    expect(wrapped).toContain('<header class="board">')
    expect(wrapped.indexOf('<header class="board">')).toBeLessThan(wrapped.indexOf('<h1>'))
    expect(wrapped).toContain('Generated Sunday September 13th 2026 at 9am')
    expect(wrapped).toContain('Reminders for Monday September 14th 2026')
    // Legacy heading and card survive the upgrade.
    expect(wrapped).toContain('<title>DRY RUN — 1 to send</title>')
    expect(wrapped).toContain('<h2>to client c1</h2>')
    // Shared board stylesheet lands in the head; behaviour script is per-day.
    expect(wrapped).toContain('.board{position:sticky')
    expect(wrapped.indexOf('.board{position:sticky')).toBeLessThan(wrapped.indexOf('</head>'))
    expect(wrapped).toContain('reminders-sent-2026-09-14')
  })

  it('shows no banner on a fresh report from a run that worked', () => {
    const wrapped = wrapReport(
      LEGACY_DOCUMENT,
      only({ runStatus: runStatusOk(GENERATED_AT, { label: '2026-09-14' }) })
    )
    expect(wrapped).toContain('Generated Sunday September 13th 2026 at 9am')
    expect(wrapped).not.toContain('class="banner"')
    expect(wrapped).not.toContain('out of date')
    expect(wrapped).not.toContain('last scheduled run failed')
  })

  it('shows the stale banner only when the report is stale', () => {
    const stale = wrapReport(LEGACY_DOCUMENT, only({ stale: true }))
    expect(stale).toContain('class="banner"')
    expect(stale).toContain('out of date')
    expect(stale).toContain('more than 26 hours ago')

    for (const options of [only(), only({ stale: false })]) {
      const fresh = wrapReport(LEGACY_DOCUMENT, options)
      expect(fresh, JSON.stringify(options)).not.toContain('class="banner"')
      expect(fresh, JSON.stringify(options)).not.toContain('out of date')
    }
  })

  it('shows the last-run-failed banner with the error text, escaped', () => {
    const failed = wrapReport(
      LEGACY_DOCUMENT,
      only({ runStatus: runStatusFailed(GENERATED_AT, { label: '2026-09-14' }, 'Mindbody 503') })
    )
    expect(failed).toContain('class="banner"')
    expect(failed).toContain('The last scheduled run failed')
    expect(failed).toContain('Mindbody 503')

    const hostile = wrapReport(
      LEGACY_DOCUMENT,
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
      const wrapped = wrapReport(LEGACY_DOCUMENT, options)
      expect(wrapped, JSON.stringify(options)).not.toContain('last scheduled run failed')
      expect(wrapped, JSON.stringify(options)).not.toContain('class="banner"')
    }
  })

  it('shows both banners together, stale one first', () => {
    const wrapped = wrapReport(
      LEGACY_DOCUMENT,
      only({
        stale: true,
        runStatus: runStatusFailed(GENERATED_AT, { label: '2026-09-14' }, 'Mindbody 503'),
      })
    )
    expect(wrapped.match(/class="banner"/g)).toHaveLength(2)
    expect(wrapped.indexOf('out of date')).toBeLessThan(wrapped.indexOf('last scheduled run failed'))
  })

  it('renders extra blocks after the banners, in order', () => {
    // The day picker, the quick day links, the regenerate link and the
    // ad-hoc banner arrive here, in this order, and nothing else in this
    // module changes.
    const wrapped = wrapReport(
      LEGACY_DOCUMENT,
      only({
        stale: true,
        extra: [
          '<p class="note">Ad-hoc day — this is not the scheduled list.</p>',
          '<nav class="chrome-nav"><input type="date" name="day"></nav>',
        ],
      })
    )
    expect(wrapped).toContain('<input type="date" name="day">')
    expect(wrapped.indexOf('out of date')).toBeLessThan(wrapped.indexOf('not the scheduled list'))
    expect(wrapped.indexOf('not the scheduled list')).toBeLessThan(wrapped.indexOf('<nav'))
    expect(wrapped.indexOf('<nav')).toBeLessThan(wrapped.indexOf('<h1>DRY RUN'))
  })

  it('does not treat text from the report as a replacement pattern', () => {
    // `$&` in a failed run's error text must come out as itself.
    const wrapped = wrapReport(
      LEGACY_DOCUMENT,
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
    expect(wrapped).toContain('.board{position:sticky')
    expect(wrapped).toContain(fragment)
  })

  it('refuses to spell out a day that was never resolved', () => {
    expect(() => wrapReport(LEGACY_DOCUMENT, only({ targetDayLabel: 'tomorrow' }))).toThrowError(
      InvalidDayLabelError
    )
  })
})
