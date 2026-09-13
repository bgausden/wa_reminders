import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import {
  buildDryRunReport,
  dryRunEffect,
  renderReminder,
  writeDryRunReport,
} from '../src/effect/dryRun.js'
import { DryRunError } from '../src/effect/mbErrors.js'
import { AppConfigTest } from '../src/effect/AppConfig.js'
import { makeMbHttpTest } from '../src/effect/MbHttp.js'
import { CurrentUserTest } from '../src/effect/CurrentUser.js'
import type { ReminderOutput } from '../src/effect/pipeline.js'

const TEMPLATE =
  'Hi <%= clientDisplayName %>, reminder for your <%= AppointmentTime %> appointment <%= AppointmentDay %>.'

const sendable = (id: number, client: string): ReminderOutput => ({
  Id: id,
  StaffId: 's1 (Ann)',
  StaffName: 'Ann',
  ClientId: client,
  Status: 'Booked',
  SessionTypeId: 2,
  ServiceName: 'Service 2',
  StartDateTime: '2021-01-01T09:00:00',
  EndDateTime: '2021-01-01T10:00:00',
  suppressReason: [],
})

const suppressed = (id: number, client: string): ReminderOutput => ({
  ...sendable(id, client),
  Status: 'Cancelled',
  suppressReason: ['Status'],
})

const clientApi = {
  Id: 'c1',
  FirstName: 'Ann',
  LastName: 'Bee',
  Email: 'a@b.c',
  MobilePhone: '1',
  HomePhone: '2',
  SendScheduleTexts: true,
  SuspensionInfo: {},
}

describe('dry-run', () => {
  it('renders a reminder from the template', async () => {
    const message = await Effect.runPromise(
      renderReminder(TEMPLATE, {
        clientDisplayName: 'Ann',
        AppointmentTime: '9AM',
        AppointmentDay: 'Friday (1 Jan)',
        StartDateTime: '9AM Friday (1 Jan)',
        firstServices: 'Service 2',
        firstStaffName: 'Ann',
        followUps: [],
      })
    )
    expect(message).toBe('Hi Ann, reminder for your 9AM appointment Friday (1 Jan).')
  })

  it('maps template errors to DryRunError', async () => {
    const err = await Effect.runPromise(
      renderReminder(
        'Hi <%= unclosed',
        {
          clientDisplayName: 'Ann',
          AppointmentTime: 'x',
          AppointmentDay: 'y',
          StartDateTime: 'x',
          firstServices: 'x',
          firstStaffName: 'y',
          followUps: [],
        }
      ).pipe(Effect.flip)
    )
    expect(err).toBeInstanceOf(DryRunError)
  })

  it('builds a report with rendered and suppressed sections', async () => {
    const report = await Effect.runPromise(
      buildDryRunReport([sendable(1, 'c1'), suppressed(2, 'c9')], [clientApi], TEMPLATE)
    )
    expect(report).toContain('1 to send (1 appointments), 1 suppressed')
    expect(report).toContain('Hi Ann, reminder for your 9AM appointment Friday (1 Jan).')
    expect(report).toContain('suppressed appointment 2 (client c9): Status')
  })

  it('prefers first name over surname', async () => {
    const report = await Effect.runPromise(
      buildDryRunReport([sendable(1, 'c1')], [clientApi], TEMPLATE)
    )
    expect(report).toContain('Hi Ann, reminder for your')
    expect(report).not.toContain('Hi Ann Bee,')
  })

  it('prepends an invocation/target banner when context is given', async () => {
    const { parseTargetDay } = await import('../src/targetDay.js')
    const now = new Date(2026, 8, 13, 20, 56)
    const targetDay = parseTargetDay('day after tomorrow', now)
    const report = await Effect.runPromise(
      buildDryRunReport([sendable(1, 'c1')], [clientApi], TEMPLATE, {
        invokedAt: now,
        targetDay,
      })
    )
    expect(report).toContain(
      'Invoked Sunday September 13th 2026 at 8:56pm for target day Tuesday September 15th 2026 (offset +2)'
    )
    // Banner comes before the summary line.
    expect(report.indexOf('Invoked Sunday')).toBeLessThan(report.indexOf('DRY RUN'))
  })

  it('falls back to surname when first name is missing', async () => {
    const cases = [
      { ...clientApi, FirstName: null },
      { ...clientApi, FirstName: '' },
      { ...clientApi, FirstName: '   ' },
    ]
    for (const client of cases) {
      const report = await Effect.runPromise(
        buildDryRunReport([sendable(1, 'c1')], [client], TEMPLATE)
      )
      expect(report).toContain('Hi Bee, reminder for your')
    }
  })

  it('groups multiple services for one client into a single message', async () => {
    const GROUPED_TEMPLATE =
      'Hi <%- clientDisplayName %>, reminder for your <%- firstServices %> with <%- firstStaffName %> starting at <%= AppointmentTime %> <%= AppointmentDay %>.<% followUps.forEach(function(f) { %> Following after your appointments with <%- f.prevStaffName %>, you have <%- f.services %> with <%- f.staffName %>.<% }); %>'
    const tamara = { ...sendable(1, 'c1'), StaffName: 'Tamara', ServiceName: 'Service One' }
    const tamara2 = {
      ...sendable(2, 'c1'),
      StaffName: 'Tamara',
      ServiceName: 'Service Two',
      StartDateTime: '2021-01-01T13:00:00',
      EndDateTime: '2021-01-01T14:00:00',
    }
    const hannah = {
      ...sendable(3, 'c1'),
      StaffName: 'Hannah',
      ServiceName: 'Service Three',
      StartDateTime: '2021-01-01T14:00:00',
      EndDateTime: '2021-01-01T15:00:00',
    }
    const report = await Effect.runPromise(
      buildDryRunReport([tamara, tamara2, hannah], [clientApi], GROUPED_TEMPLATE)
    )
    expect(report).toContain('1 to send (3 appointments)')
    expect(report).toContain('Service One and Service Two with Tamara')
    expect(report).toContain(
      'Following after your appointments with Tamara, you have Service Three with Hannah.'
    )
  })

  it('falls back to the default name for unknown clients', async () => {
    const report = await Effect.runPromise(buildDryRunReport([sendable(1, 'ghost')], [], TEMPLATE))
    expect(report).toContain('Hi Valued Glow client,')
  })

  it('writes the report to a timestamped file', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dry-run-'))
    try {
      const file = await Effect.runPromise(
        writeDryRunReport('hello', { outDir: dir, now: new Date(2021, 0, 2, 3, 4, 5) })
      )
      expect(file).toBe(path.join(dir, 'dry-run-20210102-030405.txt'))
      expect(readFileSync(file, 'utf8')).toBe('hello')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('renders the real template without HTML-escaping names (plain-text channel)', async () => {
    const { loadTemplate } = await import('../src/effect/dryRun.js')
    const template = await Effect.runPromise(loadTemplate('src/template.ejs'))
    const message = await Effect.runPromise(
      renderReminder(template, {
        clientDisplayName: "Maria O'Bryne",
        AppointmentTime: '10:30AM',
        AppointmentDay: 'Friday (1 Jan)',
        StartDateTime: '10:30AM Friday (1 Jan)',
        firstServices: 'Signature Facial',
        firstStaffName: 'Tamara',
        followUps: [],
      })
    )
    expect(message).toContain("Hi Maria O'Bryne,")
    expect(message).not.toContain('&#39;')
  })

  it('falls back to the default name for null client names', async () => {
    const nullNameClient = { ...clientApi, FirstName: null, LastName: null }
    const report = await Effect.runPromise(
      buildDryRunReport([sendable(1, 'c1')], [nullNameClient], TEMPLATE)
    )
    expect(report).toContain('Hi Valued Glow client,')
  })

  it('runs end to end on test doubles', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dry-run-'))
    const templateFile = path.join(dir, 'template.ejs')
    await import('node:fs/promises').then((fs) => fs.writeFile(templateFile, TEMPLATE, 'utf8'))
    const bookedOnly = {
      FirstName: 'A',
      LastName: 'B',
      DisplayName: 'Ann',
      Id: 1,
      Name: 'Ann',
      Appointments: [
        {
          Duration: 60,
          Id: 1,
          Status: 'Booked',
          StartDateTime: '2021-01-01T09:00:00',
          EndDateTime: '2021-01-01T10:00:00',
          Notes: '',
          StaffRequested: false,
          ProgramId: 1,
          SessionTypeId: 2,
          StaffId: 's1',
          ClientId: 'c1',
          Resources: [],
          AddOns: [],
        },
      ],
    }
    const staffApi = {
      Id: 's1',
      DisplayName: 'Ann',
      FirstName: 'A',
      LastName: 'B',
      EmpID: 'e1',
      EmploymentEnd: '2021-01-01T00:00:00',
    }
    const handler = (requestPath: string) => {
      if (requestPath.includes('scheduleitems')) return { StaffMembers: [bookedOnly] }
      if (requestPath.includes('clients')) return { Clients: [clientApi] }
      if (requestPath.includes('staff')) return { StaffMembers: [staffApi] }
      return {}
    }
    // End to end on doubles: template and output dir both live in tmp,
    // so nothing touches the repo. Asserts report content + file.
    const prog = dryRunEffect(templateFile, { outDir: dir }).pipe(
      Effect.provide(Layer.mergeAll(AppConfigTest, makeMbHttpTest(handler), CurrentUserTest)),
      Logger.withMinimumLogLevel(LogLevel.Fatal)
    )
    const result = await Effect.runPromise(prog)
    try {
      expect(result.report).toContain('Hi Ann, reminder for your 9AM appointment Friday (1 Jan).')
      expect(result.outputs).toHaveLength(1)
      expect(result.file.startsWith(dir)).toBe(true)
      expect(readFileSync(result.file, 'utf8')).toBe(result.report)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 15000)
})
