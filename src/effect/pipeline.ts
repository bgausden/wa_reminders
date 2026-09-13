import { Effect, Schema } from 'effect'
import { tomorrow } from '../util.js'
import { makeMBDateTimeString } from '../makeMBDateTimeString.js'
import { defaultLocationIds } from '../constants.js'
import {
  CLIENTS_ENDPOINT,
  SCHEDULE_ITEMS_ENDPOINT,
  STAFF_ENDPOINT,
} from '../mb_endpoints.js'
import {
  GetClientsResponseSchema,
  ScheduleItemsResponseSchema,
  StaffResponseSchema,
  StaffScheduleItemsSchema,
  decodeOrMindbody,
} from './MbSchemas.js'
import { MbHttp } from './MbHttp.js'
import { CurrentUser } from './CurrentUser.js'

export interface ReminderOutput {
  Id: number
  StaffId: string
  ClientId: string
  Status: string
  SessionTypeId: number
  StartDateTime: string
  EndDateTime: string
  suppressReason: Array<string>
}

// Lesson 5: keep this pure (no Effect, no I/O) so it is trivially testable.
// Same logic as src/index.ts, extracted verbatim. Takes the decoded
// (readonly) schema shape — mutable legacy fixtures still assign to it.
type ScheduleStaff = Schema.Schema.Type<typeof StaffScheduleItemsSchema>
export type { ScheduleStaff }
export function buildReminderOutputs(staffMembers: ReadonlyArray<ScheduleStaff>): ReminderOutput[] {
  const outputs: ReminderOutput[] = []
  staffMembers
    .filter((staff) => staff.Appointments.length > 0)
    .forEach((staff) => {
      ;[...staff.Appointments].sort((a, b) => {
        if (a.StartDateTime < b.StartDateTime) return -1
        if (a.StartDateTime > b.StartDateTime) return 1
        return 0
      }).forEach((appointment, index, appointments) => {
        const output: ReminderOutput = {
          Id: appointment.Id,
          StaffId: `${appointment.StaffId} (${staff.DisplayName ?? ''})`,
          ClientId: appointment.ClientId,
          Status: appointment.Status,
          SessionTypeId: appointment.SessionTypeId,
          StartDateTime: appointment.StartDateTime,
          EndDateTime: appointment.EndDateTime,
          suppressReason: new Array<string>(),
        }
        if (appointment.Status !== 'Booked') {
          output.suppressReason.push('Status')
        }
        if (appointment.ClientId == appointments[index - 1]?.ClientId) {
          output.suppressReason.push('ClientId')
        }
        outputs.push(output)
      })
    })
  return outputs
}

// Lesson 11: layered API. Same domain calls, but Http + User come from
// the Effect context — no globals, no circular import, trivially mocked.
export const getStaffEff = (staffIds?: Array<string>) =>
  Effect.gen(function* () {
    const http = yield* MbHttp
    const res = yield* http.get<unknown>(STAFF_ENDPOINT, {
      params: { staffIds },
    })
    // Lesson 13: was `return response.data as StaffResponse`.
    return yield* decodeOrMindbody(StaffResponseSchema, res.data, 'GET staff/staff')
  })

export const getScheduleEff = (
  start: Date,
  end: Date,
  staffIds: Array<string>,
  offset = 0,
  limit = 100
) =>
  Effect.gen(function* () {
    const http = yield* MbHttp
    const user = yield* CurrentUser
    const res = yield* http.get<unknown>(SCHEDULE_ITEMS_ENDPOINT, {
      params: {
        startDate: makeMBDateTimeString(start)[0],
        endDate: makeMBDateTimeString(end)[0],
        locationIds: defaultLocationIds,
        staffIds,
        ignorePrepFinishTimes: false,
        limit,
        offset,
      },
      headers: { authorization: user.token },
    })
    // Lesson 13: was `return response.data // has shape ScheduleItemResponse`.
    return yield* decodeOrMindbody(
      ScheduleItemsResponseSchema,
      res.data,
      'GET appointment/scheduleitems'
    )
  })

export const getClientsEff = (clientIds: string[]) =>
  Effect.gen(function* () {
    const http = yield* MbHttp
    const user = yield* CurrentUser
    const res = yield* http.get<unknown>(
      CLIENTS_ENDPOINT,
      {
        params: { clientIds, locationIds: defaultLocationIds, limit: 100, offset: 0 },
        headers: { authorization: user.token },
      }
    )
    // Lesson 13: was `return response.data.Clients`.
    const decoded = yield* decodeOrMindbody(
      GetClientsResponseSchema,
      res.data,
      'GET client/clients'
    )
    return decoded.Clients
  })

type LayeredClient = Schema.Schema.Type<typeof GetClientsResponseSchema>['Clients'][number]

// Lesson 12: mainEffectLayered declares its needs in the type:
// Effect<..., MindbodyError, MbHttp | CurrentUser>.
// Provide layers once at the edge (src/index.ts); unit tests provide
// test doubles instead.
export const mainEffectLayered = Effect.gen(function* () {
  const dateStart = tomorrow.midnight
  const dateEnd = tomorrow.elevenFiftyNine

  const staff = yield* getStaffEff().pipe(
    Effect.withLogSpan('pipeline.getStaff'),
    Effect.annotateLogs({ op: 'getStaff' })
  )
  const staffIds = staff.StaffMembers.map((s) => s.Id)

  const schedule = yield* getScheduleEff(dateStart, dateEnd, staffIds, 0, 100).pipe(
    Effect.withLogSpan('pipeline.getSchedule'),
    Effect.annotateLogs({ op: 'getSchedule' })
  )
  const outputs = buildReminderOutputs(schedule.StaffMembers)

  const unsuppressed = [
    ...new Set(
      outputs.filter((o) => o.suppressReason.length === 0).map((o) => o.ClientId)
    ),
  ]
  const clientsById =
    unsuppressed.length === 0
      ? ([] as LayeredClient[][])
      : yield* Effect.forEach(
          unsuppressed,
          (id) =>
            getClientsEff([id]).pipe(
              Effect.withLogSpan('pipeline.getClients'),
              Effect.annotateLogs({ op: 'getClients' })
            ),
          { concurrency: 5 }
        )

  const clients = clientsById.flat()
  yield* Effect.logInfo('reminder summary', {
    outputs: outputs.length,
    clients: clients.length,
  })

  return { outputs, clients }
})
