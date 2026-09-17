import { beforeAll, describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { loadTemplate, renderReport } from '../src/effect/render.js'
import type { ReminderClient, ReminderRun } from '../src/effect/run.js'
import type { ReminderOutput } from '../src/effect/pipeline.js'

// The real template: the shave and spray-tan lines live in it, so the
// copy is checked rather than a stand-in.
let TEMPLATE = ''

const TARGET_DAY = {
  offset: 1,
  midnight: new Date(2026, 8, 14),
  elevenFiftyNine: new Date(2026, 8, 14, 23, 59, 59, 999),
  label: '2026-09-14',
}

const client = (over: Partial<ReminderClient> = {}): ReminderClient => ({
  Id: 'c1',
  FirstName: 'Ann',
  LastName: 'Bee',
  Email: null,
  MobilePhone: '91234567',
  HomePhone: null,
  SendScheduleTexts: true,
  SuspensionInfo: {},
  ...over,
})

const output = (over: Partial<ReminderOutput> & Pick<ReminderOutput, 'Id' | 'ClientId'>): ReminderOutput => ({
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

const runOf = (outputs: ReadonlyArray<ReminderOutput>, clients: ReadonlyArray<ReminderClient>): ReminderRun => ({
  outputs,
  clients,
})

const render = (run: ReminderRun, context?: { invokedAt?: Date; targetDay?: typeof TARGET_DAY }) =>
  Effect.runPromise(renderReport(run, TEMPLATE, context))

describe('report rendering', () => {
  beforeAll(async () => {
    TEMPLATE = await Effect.runPromise(loadTemplate('src/template.ejs'))
  })

  it('returns the text report and the HTML report in memory', async () => {
    const run = runOf([output({ Id: 1, ClientId: 'c1' })], [client()])
    const { report, html } = await render(run)
    expect(report).toContain('DRY RUN — 1 to send (1 appointments), 0 suppressed')
    expect(report).toContain('Hi Ann,')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('https://wa.me/85291234567?text=')
    // The text report never carries wa.me links.
    expect(report).not.toContain('wa.me')
  })

  it('flags clients with no usable phone number', async () => {
    const noPhone = client({ Id: 'c2', FirstName: 'Bo', MobilePhone: null, HomePhone: null })
    const run = runOf([output({ Id: 1, ClientId: 'c2' })], [noPhone])
    const { report, html } = await render(run)
    expect(html).toContain('No mobile number — manual lookup needed')
    expect(html).not.toContain('wa.me')
    expect(report).toContain('mobile -, home -')
  })

  it('lists suppressed appointments after the sendable ones', async () => {
    const cancelled = output({ Id: 2, ClientId: 'c9', Status: 'Cancelled', suppressReason: ['Status'] })
    const run = runOf([output({ Id: 1, ClientId: 'c1' }), cancelled], [client()])
    const { report, html } = await render(run)
    expect(report).toContain('1 to send (1 appointments), 1 suppressed')
    expect(report).toContain('--- suppressed appointment 2 (client c9): Status ---')
    expect(report.indexOf('suppressed appointment 2')).toBeGreaterThan(report.indexOf('Hi Ann,'))
    expect(html).toContain('Suppressed — 1')
    expect(html).toContain('suppressed appointment 2 (client c9): Status')
    // No card for the suppressed client.
    expect(html).not.toContain('to client c9')
  })

  it('adds the laser shave line only to clients with a laser booking', async () => {
    const laser = output({ Id: 1, ClientId: 'c1', ServiceName: 'Laser - Full Legs', IsLaser: true })
    const facial = output({ Id: 2, ClientId: 'c2', StartDateTime: '2026-09-14T11:00:00' })
    const run = runOf([laser, facial], [client(), client({ Id: 'c2', FirstName: 'Bo' })])
    const { report } = await render(run)
    expect(report).toContain('if your appointment is for laser treatment, please ensure you have shaved')
    // Bo's facial message is the one without it.
    const boMessage = report.slice(report.indexOf('Hi Bo,'))
    expect(boMessage).not.toContain('shaved')
  })

  it('adds the spray-tan prep line only to clients with a tanning booking', async () => {
    const tan = output({ Id: 1, ClientId: 'c1', ServiceName: 'Spray Tan Full Body', IsTanning: true })
    const facial = output({ Id: 2, ClientId: 'c2', StartDateTime: '2026-09-14T11:00:00' })
    const run = runOf([tan, facial], [client(), client({ Id: 'c2', FirstName: 'Bo' })])
    const { report } = await render(run)
    expect(report).toContain('For spray tan appointments, please remember')
    const boMessage = report.slice(report.indexOf('Hi Bo,'))
    expect(boMessage).not.toContain('spray tan')
  })

  it('prepends the invocation and target-day banner when given a context', async () => {
    const invokedAt = new Date(2026, 8, 13, 20, 56)
    const run = runOf([output({ Id: 1, ClientId: 'c1' })], [client()])
    const { report, html } = await render(run, { invokedAt, targetDay: TARGET_DAY })
    expect(report).toContain(
      'Invoked Sunday September 13th 2026 at 8:56pm for target day Monday September 14th 2026 (offset +1)'
    )
    expect(report.indexOf('Invoked Sunday')).toBeLessThan(report.indexOf('DRY RUN'))
    expect(html).toContain('Invoked Sunday September 13th 2026 at 8:56pm')
  })

  it('renders prototype cards: first names, time gutter, tags and actions', async () => {
    const laser = output({
      Id: 1,
      ClientId: 'c1',
      ServiceName: 'Laser - Full Legs',
      IsLaser: true,
      StartDateTime: '2026-09-14T11:15:00',
    })
    const plain = output({ Id: 2, ClientId: 'c2', StartDateTime: '2026-09-14T10:30:00' })
    const run = runOf(
      [laser, plain],
      [client(), client({ Id: 'c2', FirstName: 'Bo', MobilePhone: '92345678' })]
    )
    const { html } = await render(run, {
      invokedAt: new Date(2026, 8, 13, 20, 56),
      targetDay: TARGET_DAY,
    })
    // Brand board with spelled-out day, progress rail, search and filters.
    expect(html).toContain('<header class="board">')
    expect(html).toContain('Reminders for Monday September 14th 2026')
    expect(html).toContain('id="railFill"')
    expect(html).toContain('0 of 2 sent')
    expect(html).toContain('data-f="attn"')
    // First names label cards; time gutter splits the meridiem.
    expect(html).toContain('Ann — Laser - Full Legs')
    expect(html).toContain('<span style="font-weight:400">AM</span>')
    expect(html).toContain('<small>Tamara</small>')
    // Laser tag marks the card as needing attention; the plain card is not.
    expect(html).toContain('Laser — shave note')
    expect(html).toContain('data-attn="true"')
    expect(html).toContain('data-attn="false"')
    // Actions per card, script scoped to the target day.
    expect(html).toContain('Send via WhatsApp')
    expect(html).toContain('Copy message')
    expect(html).toContain('Mark sent')
    expect(html).toContain('reminders-sent-2026-09-14')
  })
})
