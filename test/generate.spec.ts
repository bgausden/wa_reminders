import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import { generateReportEffect } from '../src/effect/generate.js'
import { dryRunEffect, writeDryRunReport } from '../src/effect/dryRun.js'
import { AppConfigTest } from '../src/effect/AppConfig.js'
import { makeMbHttpTest } from '../src/effect/MbHttp.js'
import { CurrentUserTest } from '../src/effect/CurrentUser.js'

const TEMPLATE =
  'Hi <%= clientDisplayName %>, reminder for your <%= AppointmentTime %> appointment <%= AppointmentDay %>.'

const TARGET_DAY = {
  offset: 1,
  midnight: new Date(2026, 8, 14, 0, 0, 0, 0),
  elevenFiftyNine: new Date(2026, 8, 14, 23, 59, 59, 999),
  label: '2026-09-14',
}

const staffApi = {
  Id: '1',
  DisplayName: 'Tamara',
  FirstName: 'Tamara',
  LastName: 'Wong',
  EmpID: 'e1',
  EmploymentEnd: null,
}

const scheduleApi = {
  StaffMembers: [
    {
      FirstName: 'Tamara',
      LastName: 'Wong',
      DisplayName: 'Tamara',
      Id: 1,
      Name: null,
      Appointments: [
        {
          Duration: 60,
          Id: 101,
          Status: 'Booked',
          StartDateTime: '2026-09-14T10:00:00',
          EndDateTime: '2026-09-14T11:00:00',
          Notes: null,
          StaffRequested: false,
          ProgramId: 2,
          SessionTypeId: 20,
          StaffId: 1,
          ClientId: 'c1',
          Resources: null,
          AddOns: null,
        },
      ],
    },
  ],
}

const clientsApi = {
  Clients: [
    {
      Id: 'c1',
      FirstName: 'Ann',
      LastName: 'Bee',
      Email: null,
      MobilePhone: '91234567',
      HomePhone: null,
      SendScheduleTexts: true,
      SuspensionInfo: {},
    },
  ],
}

const handler = (requestPath: string) => {
  if (requestPath.includes('scheduleitems')) return scheduleApi
  if (requestPath.includes('clients')) return clientsApi
  if (requestPath.includes('staff')) return { StaffMembers: [staffApi] }
  return {}
}

// No Azure, no network: config, HTTP and user are the existing test layers.
const testLayers = Layer.mergeAll(AppConfigTest, makeMbHttpTest(handler), CurrentUserTest)
const quiet = Logger.withMinimumLogLevel(LogLevel.Fatal)

describe('report generation', () => {
  it('returns the report in memory without touching the filesystem', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'generate-'))
    const cwd = process.cwd()
    // Run from an empty directory: anything the generator writes would
    // show up here (the CLI's `dry-runs` folder is relative to cwd).
    process.chdir(dir)
    try {
      const generated = await Effect.runPromise(
        generateReportEffect({
          targetDay: TARGET_DAY,
          invokedAt: new Date(2026, 8, 13, 20, 56),
          template: TEMPLATE,
        }).pipe(Effect.provide(testLayers), quiet)
      )
      expect(generated.report).toContain('Hi Ann, reminder for your 10AM appointment tomorrow (Monday).')
      expect(generated.html).toContain('https://wa.me/85291234567?text=')
      expect(generated.outputs).toHaveLength(1)
      expect(generated.clients.map((c) => c.Id)).toEqual(['c1'])
      expect(generated.invokedAt).toEqual(new Date(2026, 8, 13, 20, 56))
      expect(readdirSync(dir)).toEqual([])
    } finally {
      process.chdir(cwd)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('generation plus a write is the CLI dry-run path', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'generate-cli-'))
    try {
      const generated = await Effect.runPromise(
        generateReportEffect({
          targetDay: TARGET_DAY,
          invokedAt: new Date(2026, 8, 13, 20, 56),
          template: TEMPLATE,
        }).pipe(Effect.provide(testLayers), quiet)
      )
      const file = await Effect.runPromise(
        writeDryRunReport(generated.report, { outDir: dir, now: new Date(2026, 8, 13, 20, 56) })
      )
      expect(file).toBe(path.join(dir, 'dry-run-20260913-205600.txt'))
      expect(readFileSync(file, 'utf8')).toBe(generated.report)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the CLI dry-run writes both the text and the HTML report', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'generate-html-'))
    const templateFile = path.join(dir, 'template.ejs')
    await import('node:fs/promises').then((fs) => fs.writeFile(templateFile, TEMPLATE, 'utf8'))
    try {
      const result = await Effect.runPromise(
        dryRunEffect(templateFile, {
          outDir: dir,
          targetDay: TARGET_DAY,
          invokedAt: new Date(2026, 8, 13, 20, 56),
          now: new Date(2026, 8, 13, 20, 56),
          html: true,
        }).pipe(Effect.provide(testLayers), quiet)
      )
      expect(readFileSync(result.file, 'utf8')).toBe(result.report)
      expect(readFileSync(result.htmlFile, 'utf8')).toBe(result.html)
      expect(result.html).toContain('https://wa.me/85291234567?text=')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
