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

const TEMPLATE = 'Hi <%= clientDisplayName %>, reminder for <%= StartDateTime %>.'

const sendable = (id: number, client: string): ReminderOutput => ({
  Id: id,
  StaffId: 's1 (Ann)',
  ClientId: client,
  Status: 'Booked',
  SessionTypeId: 2,
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
      renderReminder(TEMPLATE, { clientDisplayName: 'Ann', StartDateTime: '2021-01-01T09:00:00' })
    )
    expect(message).toBe('Hi Ann, reminder for 2021-01-01T09:00:00.')
  })

  it('maps template errors to DryRunError', async () => {
    const err = await Effect.runPromise(
      renderReminder('Hi <%= unclosed', { clientDisplayName: 'Ann', StartDateTime: 'x' }).pipe(
        Effect.flip
      )
    )
    expect(err).toBeInstanceOf(DryRunError)
  })

  it('builds a report with rendered and suppressed sections', async () => {
    const report = await Effect.runPromise(
      buildDryRunReport([sendable(1, 'c1'), suppressed(2, 'c9')], [clientApi], TEMPLATE)
    )
    expect(report).toContain('1 to send, 1 suppressed')
    expect(report).toContain('Hi Ann Bee, reminder for 2021-01-01T09:00:00.')
    expect(report).toContain('suppressed appointment 2 (client c9): Status')
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
      renderReminder(template, { clientDisplayName: "Maria O'Bryne", StartDateTime: '2021-01-01T10:30:00' })
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
      expect(result.report).toContain('Hi Ann Bee, reminder for 2021-01-01T09:00:00.')
      expect(result.outputs).toHaveLength(1)
      expect(result.file.startsWith(dir)).toBe(true)
      expect(readFileSync(result.file, 'utf8')).toBe(result.report)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 15000)
})
