import { describe, expect, it } from 'vitest'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import type { AxiosInstance } from 'axios'
import {
  buildReminderOutputs,
  getScheduleEff,
  getStaffEff,
  mainEffectLayered,
} from '../src/effect/pipeline.js'
import { MindbodyError, MissingTokenError } from '../src/effect/mbErrors.js'
import { AppConfigTest } from '../src/effect/AppConfig.js'
import { MbHttp, makeMbHttpTest } from '../src/effect/MbHttp.js'
import { CurrentUser, CurrentUserTest, requireToken } from '../src/effect/CurrentUser.js'
import type { StaffScheduleItems } from '../src/Appointment.js'

const staffFixture = (id: number, display: string): StaffScheduleItems => ({
  FirstName: 'A',
  LastName: 'B',
  DisplayName: display,
  Id: id,
  Name: display,
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
    {
      Duration: 60,
      Id: 2,
      Status: 'Cancelled',
      StartDateTime: '2021-01-01T11:00:00',
      EndDateTime: '2021-01-01T12:00:00',
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
})

describe('effect pipeline', () => {
  it('builds and suppresses reminders without I/O', () => {
    const outputs = buildReminderOutputs([staffFixture(1, 'Ann')])
    expect(outputs).toHaveLength(2)
    // sorted by start, second shares ClientId with previous -> suppressed
    expect(outputs[0]?.suppressReason).toEqual([])
    expect(outputs[1]?.suppressReason).toContain('Status')
    expect(outputs[1]?.suppressReason).toContain('ClientId')
  })

  it('fails typed when token is missing via layers (no HTTP)', async () => {
    const EmptyUser = Layer.succeed(
      CurrentUser,
      CurrentUser.of({ userName: 'u', password: 'p', siteId: 1, token: '' })
    )
    const err = await Effect.runPromise(
      requireToken.pipe(
        Effect.provide(EmptyUser),
        Effect.flip,
        Logger.withMinimumLogLevel(LogLevel.Fatal)
      )
    )
    expect(err).toBeInstanceOf(MissingTokenError)
  })

  it('maps MbHttp failures to MindbodyError via layers', async () => {
    const failingHttp = Layer.succeed(
      MbHttp,
      MbHttp.of({
        get: () => Effect.fail(new MindbodyError({ op: 'GET staff/staff', cause: 'boom' })),
        post: () => Effect.fail(new MindbodyError({ op: 'POST x', cause: 'boom' })),
        raw: {} as AxiosInstance,
      })
    )
    const err = await Effect.runPromise(
      getStaffEff().pipe(
        Effect.provide(Layer.mergeAll(AppConfigTest, failingHttp, CurrentUserTest)),
        Effect.flip,
        Logger.withMinimumLogLevel(LogLevel.Fatal)
      )
    )
    expect(err).toBeInstanceOf(MindbodyError)
    expect((err as MindbodyError).op).toBe('GET staff/staff')
  })
})

describe('effect layers', () => {
  it('layered schedule sends auth header from context, not globals', async () => {
    const seen: Array<{ path: string; headers?: Record<string, string> }> = []
    const httpTest = Layer.succeed(
      MbHttp,
      MbHttp.of({
        get: <T>(path: string, opts?: { headers?: Record<string, string> }) => {
          seen.push({ path, headers: opts?.headers })
          return Effect.succeed({ data: { StaffMembers: [] } as T })
        },
        post: <T>() => Effect.succeed({ data: {} as T }),
        raw: {} as AxiosInstance,
      })
    )
    const prog = getScheduleEff(new Date(2021, 0, 1), new Date(2021, 0, 2), ['s1']).pipe(
      Effect.provide(Layer.mergeAll(AppConfigTest, httpTest, CurrentUserTest)),
      Logger.withMinimumLogLevel(LogLevel.Fatal)
    )
    await Effect.runPromise(prog)
    expect(seen[0]?.headers).toMatchObject({ authorization: 'token' })
  })

  it('layered pipeline runs on test doubles with no network', async () => {
    const bookedOnly = {
      ...staffFixture(1, 'Ann'),
      Appointments: [staffFixture(1, 'Ann').Appointments[0]!],
    }
    const staffApi = {
      Id: 's1',
      DisplayName: 'Ann',
      FirstName: 'A',
      LastName: 'B',
      EmpID: 'e1',
      EmploymentEnd: '2021-01-01T00:00:00',
    }
    const clientApi = {
      Id: 'c1',
      FirstName: 'Ann',
      LastName: 'B',
      Email: 'a@b.c',
      MobilePhone: '1',
      HomePhone: '2',
      SendScheduleTexts: true,
      SuspensionInfo: {},
    }
    const handler = (path: string) => {
      if (path.includes('scheduleitems')) return { StaffMembers: [bookedOnly] }
      if (path.includes('clients')) return { Clients: [clientApi] }
      if (path.includes('staff')) return { StaffMembers: [staffApi] }
      return {}
    }
    const prog = mainEffectLayered.pipe(
      Effect.provide(Layer.mergeAll(AppConfigTest, makeMbHttpTest(handler), CurrentUserTest)),
      // Keep the `reminder summary` log in pipeline.ts; suppress it here so
      // `npm test` output stays clean. Production edge (src/index-effect.ts)
      // keeps Logger.pretty at Info.
      Logger.withMinimumLogLevel(LogLevel.Fatal)
    )
    const result = await Effect.runPromise(prog)
    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0]?.suppressReason).toEqual([])
    expect(result.clients).toHaveLength(1)
  })
})

describe('effect schemas', () => {
  it('rejects malformed schedule payloads as MindbodyError', async () => {
    const { decodeOrMindbody } = await import('../src/effect/MbSchemas.js')
    const { ScheduleItemsResponseSchema } = await import('../src/effect/MbSchemas.js')
    const err = await Effect.runPromise(
      decodeOrMindbody(ScheduleItemsResponseSchema, { StaffMembers: [{ bogus: 1 }] }, 'GET x').pipe(
        Effect.flip
      )
    )
    expect(err).toBeInstanceOf(MindbodyError)
  })

  it('rejects token payloads without AccessToken', async () => {
    const { decodeOrMindbody, TokenResponseSchema } = await import('../src/effect/MbSchemas.js')
    const err = await Effect.runPromise(
      decodeOrMindbody(TokenResponseSchema, { nope: 1 }, 'POST usertoken/issue').pipe(Effect.flip)
    )
    expect(err).toBeInstanceOf(MindbodyError)
  })
})
