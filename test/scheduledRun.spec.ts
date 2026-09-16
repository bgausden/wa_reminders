import type { AxiosInstance } from 'axios'
import { describe, expect, it } from 'vitest'
import { Effect, Either, Layer, Logger, LogLevel } from 'effect'
import { AppConfigTest } from '../src/effect/AppConfig.js'
import { makeMbHttpTest, MbHttp } from '../src/effect/MbHttp.js'
import { CurrentUserTest } from '../src/effect/CurrentUser.js'
import { MindbodyError } from '../src/effect/mbErrors.js'
import { describeFailure, runScheduledReportEffect, unwrapFailure } from '../src/effect/scheduledRun.js'
import { makeReportStoreTest, ReportStore } from '../src/report/store.js'

const TEMPLATE =
  'Hi <%= clientDisplayName %>, reminder for your <%= AppointmentTime %> appointment <%= AppointmentDay %>.'

// 23:00 UTC Sep 13 is 07:00 in Hong Kong on Sep 14 — the PRD's risk case:
// a host reading its own UTC clock would say Sep 13, but the run must
// target Sep 15, tomorrow in Hong Kong.
const UTC_NIGHT = new Date(Date.UTC(2026, 8, 13, 23, 0, 0))

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
          StartDateTime: '2026-09-15T10:00:00',
          EndDateTime: '2026-09-15T11:00:00',
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

const handler = (requestPath: string) => {
  if (requestPath.includes('scheduleitems')) return scheduleApi
  if (requestPath.includes('clients')) {
    return {
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
  }
  if (requestPath.includes('staff')) {
    return {
      StaffMembers: [
        { Id: '1', DisplayName: 'Tamara', FirstName: 'Tamara', LastName: 'Wong', EmpID: 'e1', EmploymentEnd: null },
      ],
    }
  }
  return {}
}

const live = Layer.mergeAll(AppConfigTest, makeMbHttpTest(handler), CurrentUserTest)
const failingHttp = Layer.succeed(
  MbHttp,
  MbHttp.of({
    get: () => Effect.fail(new MindbodyError({ op: 'GET staff/staff', cause: 'connection refused' })),
    post: () => Effect.fail(new MindbodyError({ op: 'POST usertoken/issue', cause: 'connection refused' })),
    raw: {} as AxiosInstance,
  })
)
const failing = Layer.mergeAll(AppConfigTest, failingHttp, CurrentUserTest)
const quiet = Logger.withMinimumLogLevel(LogLevel.Fatal)

describe('runScheduledReportEffect', () => {
  it('stores this morning’s list plus a successful run status', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const stored = yield* runScheduledReportEffect({ now: UTC_NIGHT, template: TEMPLATE })
        const store = yield* ReportStore
        return {
          stored,
          scheduled: yield* store.readScheduled(),
          status: yield* store.readRunStatus(),
        }
      }).pipe(Effect.provide(Layer.mergeAll(live, makeReportStoreTest())), quiet)
    )
    // 23:00 UTC Sep 13 is already Sep 14 in Hong Kong, so it targets Sep 15 —
    // the host's UTC date never leaks into the stored label.
    expect(result.stored.targetDayLabel).toBe('2026-09-15')
    expect(result.stored.generatedAt).toEqual(UTC_NIGHT)
    expect(result.stored.html).toContain('https://wa.me/85291234567?text=')
    expect(result.scheduled).toEqual(result.stored)
    expect(result.status).toEqual({
      generatedAt: UTC_NIGHT,
      targetDayLabel: '2026-09-15',
      success: true,
      error: null,
    })
  })

  it('records a failed run without touching the previous list', async () => {
    const seeded = {
      html: '<html><body>yesterday’s list</body></html>',
      report: 'yesterday’s list',
      targetDayLabel: '2026-09-14',
      generatedAt: new Date(Date.UTC(2026, 8, 12, 1, 0, 0)),
    }
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* ReportStore
        yield* store.writeScheduled(seeded)
        const outcome = yield* Effect.either(runScheduledReportEffect({ now: UTC_NIGHT, template: TEMPLATE }))
        if (!Either.isLeft(outcome)) throw new Error('expected the run to fail')
        return {
          cause: outcome.left,
          scheduled: yield* store.readScheduled(),
          status: yield* store.readRunStatus(),
        }
      }).pipe(Effect.provide(Layer.mergeAll(failing, makeReportStoreTest())), quiet)
    )
    expect(result.cause).toBeInstanceOf(MindbodyError)
    // The previous list is left in place; only the status turns red.
    expect(result.scheduled).toEqual(seeded)
    expect(result.status?.success).toBe(false)
    expect(result.status?.targetDayLabel).toBe('2026-09-15')
    expect(result.status?.error).toContain('GET staff/staff')
  })
})

describe('describeFailure', () => {
  it('names the failed Mindbody operation', () => {
    expect(describeFailure(new MindbodyError({ op: 'GET staff/staff', cause: 'boom' }))).toContain(
      'GET staff/staff'
    )
  })

  it('falls back to the message for anything else', () => {
    expect(describeFailure(new Error('bad template'))).toBe('bad template')
    expect(describeFailure('plain string')).toBe('plain string')
  })

  it('surfaces the Mindbody verdict, status and blocked IP', () => {
    const axiosLike = {
      isAxiosError: true,
      message: 'Request failed with status code 403',
      config: { headers: { 'Api-Key': 'live-key-value' }, data: '{"Password":"owner-password"}' },
      response: {
        status: 403,
        data: { Error: { Message: 'Unsupported IP Address 20.44.209.42.', Code: 'DeniedAccess' } },
      },
    }
    const text = describeFailure(new MindbodyError({ op: 'POST /usertoken/issue', cause: axiosLike }))
    expect(text).toContain('POST /usertoken/issue')
    expect(text).toContain('403')
    expect(text).toContain('Unsupported IP Address 20.44.209.42.')
    expect(text).toContain('DeniedAccess')
    expect(text).not.toContain('live-key-value')
    expect(text).not.toContain('owner-password')
  })

  it('falls back to the axios message when the body carries no verdict', () => {
    const axiosLike = {
      isAxiosError: true,
      message: 'Request failed with status code 403',
      response: { status: 403, data: '' },
    }
    const text = describeFailure(new MindbodyError({ op: 'POST /usertoken/issue', cause: axiosLike }))
    expect(text).toContain('POST /usertoken/issue')
    expect(text).toContain('Request failed with status code 403')
  })
})

describe('unwrapFailure', () => {
  it('recovers the typed failure from a runPromise rejection', async () => {
    const typed = new MindbodyError({ op: 'POST /usertoken/issue', cause: 'boom' })
    const rejection = await Effect.runPromise(Effect.fail(typed)).then(
      () => 'resolved unexpectedly',
      (cause: unknown) => cause
    )
    // Without unwrapping, the adapter only ever sees Effect's default.
    expect(String(describeFailure(rejection))).toBe('An error has occurred')
    expect(unwrapFailure(rejection)).toBe(typed)
    expect(describeFailure(unwrapFailure(rejection))).toContain('POST /usertoken/issue')
  })

  it('passes anything else through untouched', () => {
    const err = new Error('plain')
    expect(unwrapFailure(err)).toBe(err)
    expect(unwrapFailure('plain string')).toBe('plain string')
  })
})
