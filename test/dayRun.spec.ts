import type { AxiosInstance } from 'axios'
import { describe, expect, it } from 'vitest'
import { Effect, Either, Layer, Logger, LogLevel } from 'effect'
import { AppConfigTest } from '../src/effect/AppConfig.js'
import { makeMbHttpTest, MbHttp } from '../src/effect/MbHttp.js'
import { CurrentUserTest } from '../src/effect/CurrentUser.js'
import { MindbodyError } from '../src/effect/mbErrors.js'
import { runDayReportEffect } from '../src/effect/dayRun.js'
import { makeReportStoreTest, ReportStore } from '../src/report/store.js'
import type { TargetDay } from '../src/targetDay.js'

const TEMPLATE =
  'Hi <%= clientDisplayName %>, reminder for your <%= AppointmentTime %> appointment <%= AppointmentDay %>.'

const NOW = new Date(2026, 8, 13, 20, 56, 0)
const DAY: TargetDay = {
  offset: 1,
  midnight: new Date(2026, 8, 14, 0, 0, 0, 0),
  elevenFiftyNine: new Date(2026, 8, 14, 23, 59, 59, 999),
  label: '2026-09-14',
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

const staffApi = {
  StaffMembers: [
    { Id: '1', DisplayName: 'Tamara', FirstName: 'Tamara', LastName: 'Wong', EmpID: 'e1', EmploymentEnd: null },
  ],
}

const baseHandler = (requestPath: string) => {
  if (requestPath.includes('scheduleitems')) return scheduleApi
  if (requestPath.includes('clients')) return clientsApi
  if (requestPath.includes('staff')) return staffApi
  return {}
}

// Counts Mindbody calls, so cache hits are proven by silence.
const countingLayers = (counter: { calls: number }) =>
  Layer.mergeAll(
    AppConfigTest,
    makeMbHttpTest((path: string) => {
      counter.calls += 1
      return baseHandler(path)
    }),
    CurrentUserTest
  )

const failingHttp = Layer.succeed(
  MbHttp,
  MbHttp.of({
    get: () => Effect.fail(new MindbodyError({ op: 'GET staff/staff', cause: 'connection refused' })),
    post: () => Effect.fail(new MindbodyError({ op: 'POST usertoken/issue', cause: 'connection refused' })),
    raw: {} as AxiosInstance,
  })
)
const quiet = Logger.withMinimumLogLevel(LogLevel.Fatal)

describe('runDayReportEffect', () => {
  it('generates on a miss, caches under the day key, and never touches the scheduled slot', async () => {
    const counter = { calls: 0 }
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* ReportStore
        const first = yield* runDayReportEffect(DAY, { now: NOW, template: TEMPLATE })
        const callsAfterFirst = counter.calls
        const second = yield* runDayReportEffect(DAY, { now: NOW, template: TEMPLATE })
        return {
          first,
          second,
          callsAfterFirst,
          callsAfterSecond: counter.calls,
          day: yield* store.readDay(DAY),
          scheduled: yield* store.readScheduled(),
        }
      }).pipe(Effect.provide(Layer.mergeAll(countingLayers(counter), makeReportStoreTest())), quiet)
    )
    expect(result.first.targetDayLabel).toBe('2026-09-14')
    expect(result.first.generatedAt).toEqual(NOW)
    expect(result.first.html).toContain('https://wa.me/85291234567?text=')
    expect(result.callsAfterFirst).toBeGreaterThan(0)
    // Cache hit: the same report, no new Mindbody calls.
    expect(result.second).toEqual(result.first)
    expect(result.callsAfterSecond).toBe(result.callsAfterFirst)
    expect(result.day).toEqual(result.first)
    expect(result.scheduled).toBeNull()
  })

  it('regenerates on refresh', async () => {
    const counter = { calls: 0 }
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* runDayReportEffect(DAY, { now: NOW, template: TEMPLATE })
        const callsAfterFirst = counter.calls
        const later = new Date(2026, 8, 13, 21, 5, 0)
        const second = yield* runDayReportEffect(DAY, { now: later, refresh: true, template: TEMPLATE })
        return { first, second, callsAfterFirst, callsAfterSecond: counter.calls }
      }).pipe(Effect.provide(Layer.mergeAll(countingLayers(counter), makeReportStoreTest())), quiet)
    )
    expect(result.callsAfterSecond).toBeGreaterThan(result.callsAfterFirst)
    expect(result.second.generatedAt).toEqual(new Date(2026, 8, 13, 21, 5, 0))
    expect(result.second.html).toContain('https://wa.me/85291234567?text=')
  })

  it('fails without writing anything when Mindbody is down', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* ReportStore
        const outcome = yield* Effect.either(runDayReportEffect(DAY, { now: NOW, template: TEMPLATE }))
        if (!Either.isLeft(outcome)) throw new Error('expected the run to fail')
        return {
          cause: outcome.left,
          day: yield* store.readDay(DAY),
          scheduled: yield* store.readScheduled(),
          status: yield* store.readRunStatus(),
        }
      }).pipe(
        Effect.provide(Layer.mergeAll(Layer.mergeAll(AppConfigTest, failingHttp, CurrentUserTest), makeReportStoreTest())),
        quiet
      )
    )
    expect(result.cause).toBeInstanceOf(MindbodyError)
    expect(result.day).toBeNull()
    expect(result.scheduled).toBeNull()
    // No status record either — that belongs to the timer.
    expect(result.status).toBeNull()
  })
})
