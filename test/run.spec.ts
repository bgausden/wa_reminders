import { describe, expect, it } from 'vitest'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import type { AxiosInstance } from 'axios'
import { runRemindersFor } from '../src/effect/run.js'
import { AppConfigTest } from '../src/effect/AppConfig.js'
import { MbHttp, makeMbHttpTest } from '../src/effect/MbHttp.js'
import { CurrentUserTest } from '../src/effect/CurrentUser.js'

// Fixed target day: Monday 2026-09-14 (HK/local calendar).
const TARGET_DAY = {
  offset: 1,
  midnight: new Date(2026, 8, 14, 0, 0, 0, 0),
  elevenFiftyNine: new Date(2026, 8, 14, 23, 59, 59, 999),
  label: '2026-09-14',
}

const OTHER_DAY = {
  offset: 3,
  midnight: new Date(2026, 8, 16, 0, 0, 0, 0),
  elevenFiftyNine: new Date(2026, 8, 16, 23, 59, 59, 999),
  label: '2026-09-16',
}

const staffApi = {
  Id: '1',
  DisplayName: 'Tamara',
  FirstName: 'Tamara',
  LastName: 'Wong',
  EmpID: 'e1',
  EmploymentEnd: null,
}

const appointment = (over: Record<string, unknown>) => ({
  Duration: 60,
  Status: 'Booked',
  StartDateTime: '2026-09-14T10:00:00',
  EndDateTime: '2026-09-14T11:00:00',
  Notes: null,
  StaffRequested: false,
  ProgramId: 1,
  SessionTypeId: 1,
  StaffId: 1,
  ClientId: 'c1',
  Resources: null,
  AddOns: null,
  ...over,
})

const scheduleApi = {
  StaffMembers: [
    {
      FirstName: 'Tamara',
      LastName: 'Wong',
      DisplayName: 'Tamara',
      Id: 1,
      Name: null,
      Appointments: [
        appointment({ Id: 101, SessionTypeId: 10, ClientId: 'c1', StartDateTime: '2026-09-14T10:00:00', EndDateTime: '2026-09-14T11:00:00' }),
        appointment({ Id: 102, SessionTypeId: 20, ClientId: 'c2', StartDateTime: '2026-09-14T11:00:00', EndDateTime: '2026-09-14T12:00:00' }),
        appointment({ Id: 103, SessionTypeId: 30, ClientId: 'c3', Status: 'Cancelled', StartDateTime: '2026-09-14T12:00:00', EndDateTime: '2026-09-14T13:00:00' }),
      ],
    },
  ],
}

const sessionTypesApi = {
  SessionTypes: [
    { Id: 10, Name: 'Laser - Full Legs', ProgramId: 8, Category: 'Hair removal', Subcategory: 'Laser' },
    { Id: 20, Name: 'Signature Facial', ProgramId: 2, Category: 'Facials', Subcategory: null },
    { Id: 30, Name: 'Spray Tan Full Body', ProgramId: 5, Category: 'Tanning', Subcategory: null },
  ],
  PaginationResponse: { TotalResults: 3 },
}

const clientsApi = {
  Clients: [
    { Id: 'c1', FirstName: 'Ann', LastName: 'Bee', Email: null, MobilePhone: '91234567', HomePhone: null, SendScheduleTexts: true, SuspensionInfo: {} },
    { Id: 'c2', FirstName: 'Bo', LastName: 'None', Email: null, MobilePhone: null, HomePhone: null, SendScheduleTexts: false, SuspensionInfo: {} },
  ],
}

const handler = (requestPath: string) => {
  if (requestPath.includes('scheduleitems')) return scheduleApi
  if (requestPath.includes('sessiontypes')) return sessionTypesApi
  if (requestPath.includes('clients')) return clientsApi
  if (requestPath.includes('staff')) return { StaffMembers: [staffApi] }
  return {}
}

const runOnDoubles = (day: typeof TARGET_DAY) =>
  runRemindersFor(day).pipe(
    Effect.provide(Layer.mergeAll(AppConfigTest, makeMbHttpTest(handler), CurrentUserTest)),
    // `reminder summary` is logged by the run; keep `npm test` output clean.
    Logger.withMinimumLogLevel(LogLevel.Fatal)
  )

describe('mindbody run', () => {
  it('returns appointment outputs and client records for the target day', async () => {
    const run = await Effect.runPromise(runOnDoubles(TARGET_DAY))
    expect(run.outputs).toHaveLength(3)
    expect(run.outputs.map((o) => o.Id)).toEqual([101, 102, 103])
    // Cancelled appointments stay in the outputs, flagged for suppression.
    expect(run.outputs.filter((o) => o.suppressReason.length === 0)).toHaveLength(2)
    expect(run.outputs[2]?.suppressReason).toEqual(['Status'])
    // Only the sendable clients are looked up: c3's appointment is
    // cancelled, so it is never fetched. (The double answers every
    // client request with the same list, hence the distinct check.)
    expect(new Set(run.clients.map((c) => c.Id))).toEqual(new Set(['c1', 'c2']))
  })

  it('resolves service names and laser/tanning flags from the session-type catalogue', async () => {
    const run = await Effect.runPromise(runOnDoubles(TARGET_DAY))
    const byId = new Map(run.outputs.map((o) => [o.Id, o]))
    expect(byId.get(101)?.ServiceName).toBe('Laser - Full Legs')
    expect(byId.get(101)?.IsLaser).toBe(true)
    expect(byId.get(102)?.ServiceName).toBe('Signature Facial')
    expect(byId.get(102)?.IsLaser).toBe(false)
    expect(byId.get(103)?.IsTanning).toBe(true)
  })

  it('asks Mindbody for the window of the day it was given', async () => {
    type Window = { startDate?: string; endDate?: string }
    const seen: Array<{ path: string; params?: Window }> = []
    const recordingHttp = Layer.succeed(
      MbHttp,
      MbHttp.of({
        get: <T>(path: string, opts?: { params?: unknown }) => {
          seen.push({ path, params: opts?.params as Window | undefined })
          return Effect.succeed({ data: handler(path) as T })
        },
        post: <T>(path: string) => Effect.succeed({ data: handler(path) as T }),
        raw: {} as AxiosInstance,
      })
    )
    const runFor = (day: typeof TARGET_DAY) =>
      runRemindersFor(day).pipe(
        Effect.provide(Layer.mergeAll(AppConfigTest, recordingHttp, CurrentUserTest)),
        Logger.withMinimumLogLevel(LogLevel.Fatal)
      )
    await Effect.runPromise(runFor(TARGET_DAY))
    await Effect.runPromise(runFor(OTHER_DAY))

    const windows = seen
      .filter((call) => call.path.includes('scheduleitems'))
      .map((call) => [call.params?.startDate, call.params?.endDate])
    expect(windows).toEqual([
      ['2026-09-14T00:00:00', '2026-09-14T23:59:59'],
      ['2026-09-16T00:00:00', '2026-09-16T23:59:59'],
    ])
  })
})
