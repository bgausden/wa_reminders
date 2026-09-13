import { Effect, Schema } from 'effect'
import { tomorrow } from '../util.js'
import { makeMBDateTimeString } from '../makeMBDateTimeString.js'
import { defaultLocationIds } from '../constants.js'
import {
  CLIENTS_ENDPOINT,
  SCHEDULE_ITEMS_ENDPOINT,
  SESSION_TYPES_ENDPOINT,
  STAFF_ENDPOINT,
} from '../mb_endpoints.js'
import {
  GetClientsResponseSchema,
  ScheduleItemsResponseSchema,
  SessionTypeSchema,
  SessionTypesResponseSchema,
  StaffResponseSchema,
  StaffScheduleItemsSchema,
  decodeOrMindbody,
} from './MbSchemas.js'
import { MbHttp } from './MbHttp.js'
import { CurrentUser } from './CurrentUser.js'

export interface ReminderOutput {
  Id: number
  StaffId: string
  /** Clean staff display name, e.g. `Tamara`. Falls back to StaffId. */
  StaffName: string
  ClientId: string
  Status: string
  SessionTypeId: number
  /** Mindbody program (service group), e.g. 8 = Hair Reduction (laser). */
  ProgramId?: number
  /** True when the booking is in the Services group Laser. */
  IsLaser?: boolean
  /** True when the booking is a laser consultation — vetoes the shave line. */
  IsLaserConsultation?: boolean
  /** Resolved service name, e.g. `Signature Facial`. */
  ServiceName: string
  StartDateTime: string
  EndDateTime: string
  suppressReason: Array<string>
}

export interface StaffBlock {
  staffName: string
  services: Array<string>
  startDateTime: string
}

export interface ClientPlan {
  clientId: string
  /** Consecutive same-staff appointments collapsed. First block holds the start time. */
  blocks: Array<StaffBlock>
  firstStartDateTime: string
  appointmentIds: Array<number>
  /** True when any appointment in the plan is in the Services group Laser. */
  hasLaser: boolean
}

export type SessionTypeNames = ReadonlyMap<number, string> | Record<number, string>

/** Grouping info for laser detection, from GET site/sessiontypes. */
export type SessionTypeInfo = {
  Name?: string | null
  ProgramId?: number
  Category?: string | null
  Subcategory?: string | null
}
export type SessionTypeInfoMap = ReadonlyMap<number, SessionTypeInfo> | Record<number, SessionTypeInfo>

/** ProgramId for Hair Reduction — the Mindbody program holding Laser/IPL services. */
export const LASER_PROGRAM_ID = 8
/** Session-type subcategory for laser services (`Hair removal|Laser`). */
export const LASER_SUBCATEGORY = 'Laser'
/** ProgramId for Consultations — consultation bookings never need the shave line. */
export const CONSULTATION_PROGRAM_ID = 13

// Lesson 5: keep this pure (no Effect, no I/O) so it is trivially testable.
// Same logic as src/index.ts, extracted verbatim. Takes the decoded
// (readonly) schema shape — mutable legacy fixtures still assign to it.
type ScheduleStaff = Schema.Schema.Type<typeof StaffScheduleItemsSchema>
export type { ScheduleStaff }
type ScheduleAppointment = ScheduleStaff['Appointments'][number]

const lookupSessionTypeInfo = (
  id: number,
  info?: SessionTypeInfoMap
): SessionTypeInfo | undefined => {
  if (!info) return undefined
  if (info instanceof Map) return info.get(id)
  return (info as Record<number, SessionTypeInfo>)[id]
}

const lookupSessionTypeName = (
  id: number,
  names?: SessionTypeNames
): string | undefined => {
  if (!names) return undefined
  if (names instanceof Map) return names.get(id)
  return (names as Record<number, string>)[id]
}

/**
 * True when a booking is a consultation (e.g. `Consultation - Laser and
 * Laser Hair Removal`). Name-based (`/consult/i`) so `Training` entries
 * that share ProgramId 13 are not misclassified; ProgramId 13 is only a
 * fallback when the name is unresolvable. Consultations never need the
 * shave reminder.
 */
export function isConsultationBooking(
  appointment: Pick<ScheduleAppointment, 'SessionTypeId' | 'ProgramId'> & {
    ServiceName?: string | null
    SessionType?: { Name?: string | null } | null
  },
  info?: SessionTypeInfoMap,
  resolvedName?: string
): boolean {
  const detail = lookupSessionTypeInfo(appointment.SessionTypeId, info)
  const name =
    resolvedName ??
    (typeof appointment.ServiceName === 'string' && appointment.ServiceName.trim().length > 0
      ? appointment.ServiceName
      : appointment.SessionType?.Name ?? detail?.Name ?? '')
  if (/consult/i.test(name.trim())) return true
  if (name.trim().length === 0) {
    if (appointment.ProgramId === CONSULTATION_PROGRAM_ID) return true
    if (detail?.ProgramId === CONSULTATION_PROGRAM_ID) return true
  }
  return false
}

/**
 * True for a laser consultation (e.g. Id 295
 * `Consultation - Laser and Laser Hair Removal`). A laser consultation on
 * a client's day vetoes the shave line for that client.
 */
export function isLaserConsultationBooking(
  appointment: Pick<ScheduleAppointment, 'SessionTypeId' | 'ProgramId'> & {
    ServiceName?: string | null
    SessionType?: { Name?: string | null } | null
  },
  info?: SessionTypeInfoMap,
  resolvedName?: string
): boolean {
  const detail = lookupSessionTypeInfo(appointment.SessionTypeId, info)
  const name =
    resolvedName ??
    (typeof appointment.ServiceName === 'string' && appointment.ServiceName.trim().length > 0
      ? appointment.ServiceName
      : appointment.SessionType?.Name ?? detail?.Name ?? '')
  return isConsultationBooking(appointment, info, name) && /laser/i.test(name.trim())
}

/**
 * True when a booking is in the Services group Laser.
 * Primary signal: session-type Subcategory == `Laser` (live catalogue:
 * `Hair removal|Laser`). Secondary: ProgramId == 8 (Hair Reduction, the
 * program holding all 41 Laser/IPL session types). Fallback: service
 * name starts with `Laser`/`IPL` — covers the 9 Laser services with a
 * null Category/Subcategory in Mindbody (e.g. `Laser - Bikini Line`).
 * Name check is prefix-only so `Consultation - Laser` does not match.
 * Consultations always return false — use isLaserConsultationBooking
 * for the veto case.
 */
export function isLaserBooking(
  appointment: Pick<ScheduleAppointment, 'SessionTypeId' | 'ProgramId'> & {
    ServiceName?: string | null
    SessionType?: { Name?: string | null } | null
  },
  info?: SessionTypeInfoMap,
  resolvedName?: string
): boolean {
  const detail = lookupSessionTypeInfo(appointment.SessionTypeId, info)
  const name =
    resolvedName ??
    (typeof appointment.ServiceName === 'string' && appointment.ServiceName.trim().length > 0
      ? appointment.ServiceName
      : appointment.SessionType?.Name ?? detail?.Name ?? '')
  // Consultations (incl. `Consultation - Laser`) never count as laser treatment.
  if (isConsultationBooking(appointment, info, name)) return false
  const sub = detail?.Subcategory?.trim().toLowerCase()
  if (sub === LASER_SUBCATEGORY.toLowerCase()) return true
  if (detail?.ProgramId === LASER_PROGRAM_ID) return true
  if (appointment.ProgramId === LASER_PROGRAM_ID) return true
  return /^(laser|ipl)\b/i.test(name.trim())
}

export function resolveServiceName(
  appointment: ScheduleAppointment,
  sessionTypeNames?: SessionTypeNames
): string {
  const flat = (appointment as { ServiceName?: string | null }).ServiceName
  if (typeof flat === 'string' && flat.trim().length > 0) return flat.trim()
  const nested = (appointment as { SessionType?: { Name?: string | null } | null })
    .SessionType
  if (typeof nested?.Name === 'string' && nested.Name.trim().length > 0) {
    return nested.Name.trim()
  }
  const mapped = lookupSessionTypeName(appointment.SessionTypeId, sessionTypeNames)
  if (typeof mapped === 'string' && mapped.trim().length > 0) return mapped.trim()
  return `Session ${appointment.SessionTypeId}`
}

export function staffDisplayName(
  staff: Pick<ScheduleStaff, 'DisplayName' | 'FirstName' | 'LastName'>,
  fallbackId: string
): string {
  const display = (staff.DisplayName ?? '').trim()
  if (display.length > 0) return display
  const full = `${staff.FirstName ?? ''} ${staff.LastName ?? ''}`.trim()
  return full.length > 0 ? full : fallbackId
}

/** First token of a display name: `Tamara Smith` -> `Tamara`. */
export function firstName(name: string | null | undefined): string {
  if (typeof name !== 'string') return ''
  const first = name.trim().split(/\s+/)[0]
  return first && first.length > 0 ? first : name
}

/** `['A']` -> `A`, `['A','B']` -> `A and B`, `['A','B','C']` -> `A, B and C`. */
export function formatServiceList(names: ReadonlyArray<string | null | undefined>): string {
  const clean = names
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter((n) => n.length > 0)
  if (clean.length <= 2) return clean.join(' and ')
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

export function buildReminderOutputs(
  staffMembers: ReadonlyArray<ScheduleStaff>,
  sessionTypeNames?: SessionTypeNames,
  sessionTypeInfo?: SessionTypeInfoMap
): ReminderOutput[] {
  const outputs: ReminderOutput[] = []
  staffMembers
    .filter((staff) => staff.Appointments.length > 0)
    .forEach((staff) => {
      ;[...staff.Appointments].sort((a, b) => {
        if (a.StartDateTime < b.StartDateTime) return -1
        if (a.StartDateTime > b.StartDateTime) return 1
        return 0
      }).forEach((appointment) => {
        const staffName = staffDisplayName(staff, String(appointment.StaffId))
        const serviceName = resolveServiceName(appointment, sessionTypeNames)
        const output: ReminderOutput = {
          Id: appointment.Id,
          StaffId: `${appointment.StaffId} (${staff.DisplayName ?? ''})`,
          StaffName: staffName,
          ClientId: appointment.ClientId,
          Status: appointment.Status,
          SessionTypeId: appointment.SessionTypeId,
          ProgramId: appointment.ProgramId,
          IsLaser: isLaserBooking(appointment, sessionTypeInfo, serviceName),
          IsLaserConsultation: isLaserConsultationBooking(
            appointment,
            sessionTypeInfo,
            serviceName
          ),
          ServiceName: serviceName,
          StartDateTime: appointment.StartDateTime,
          EndDateTime: appointment.EndDateTime,
          suppressReason: new Array<string>(),
        }
        if (appointment.Status !== 'Booked') {
          output.suppressReason.push('Status')
        }
        outputs.push(output)
      })
    })
  return outputs
}

/**
 * Group sendable per-appointment outputs into one plan per client.
 * Sorts each client's appointments by start, then collapses consecutive
 * same-staff appointments into blocks so the template can say
 * `your A and B with Tamara starting at 12PM` + follow-ups.
 */
export function buildClientPlans(outputs: ReadonlyArray<ReminderOutput>): ClientPlan[] {
  const byClient = new Map<string, ReminderOutput[]>()
  for (const o of outputs.filter((o) => o.suppressReason.length === 0)) {
    const list = byClient.get(o.ClientId) ?? []
    list.push(o)
    byClient.set(o.ClientId, list)
  }
  const plans: ClientPlan[] = []
  for (const [clientId, list] of byClient) {
    const sorted = [...list].sort((a, b) =>
      a.StartDateTime < b.StartDateTime ? -1 : a.StartDateTime > b.StartDateTime ? 1 : 0
    )
    const blocks: StaffBlock[] = []
    for (const appt of sorted) {
      // Tolerate legacy outputs without StaffName/ServiceName (old tests).
      const legacy = appt as Partial<ReminderOutput>
      const staffLabel =
        typeof legacy.StaffName === 'string' && legacy.StaffName.trim().length > 0
          ? legacy.StaffName
          : (legacy.StaffId ?? 'Staff')
      const serviceLabel =
        typeof legacy.ServiceName === 'string' && legacy.ServiceName.trim().length > 0
          ? legacy.ServiceName
          : `Session ${appt.SessionTypeId}`
      const last = blocks[blocks.length - 1]
      if (last && last.staffName === staffLabel) {
        last.services.push(serviceLabel)
      } else {
        blocks.push({
          staffName: staffLabel,
          services: [serviceLabel],
          startDateTime: appt.StartDateTime,
        })
      }
    }
    plans.push({
      clientId,
      blocks,
      firstStartDateTime: sorted[0]?.StartDateTime ?? '',
      appointmentIds: sorted.map((s) => s.Id),
      // Shave line only for laser treatment days. A laser consultation
      // on the same client's day vetoes it entirely.
      hasLaser:
        sorted.some((s) => s.IsLaser === true) &&
        !sorted.some((s) => s.IsLaserConsultation === true),
    })
  }
  return plans.sort((a, b) => (a.firstStartDateTime < b.firstStartDateTime ? -1 : 1))
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

export const getSessionTypesEff = Effect.gen(function* () {
  const http = yield* MbHttp
  // Site endpoint: Api-Key/SiteId come from base headers, no user token needed.
  // The catalogue is paginated (prod: 373 types), so walk all pages.
  // Best-effort: a failed page keeps what we have rather than failing reminders.
  const limit = 200
  let offset = 0
  const all: Array<Schema.Schema.Type<typeof SessionTypeSchema>> = []
  for (let page = 0; page < 10; page++) {
    const result = yield* http
      .get<unknown>(SESSION_TYPES_ENDPOINT, { params: { limit, offset } })
      .pipe(
        Effect.flatMap((res) =>
          decodeOrMindbody(SessionTypesResponseSchema, res.data, 'GET site/sessiontypes')
        ),
        Effect.catchAll(() => Effect.succeed(null))
      )
    if (result === null || result.SessionTypes.length === 0) break
    all.push(...result.SessionTypes)
    offset += result.SessionTypes.length
    const total = result.PaginationResponse?.TotalResults
    if (typeof total === 'number' && all.length >= total) break
    if (result.SessionTypes.length < limit) break
  }
  return { SessionTypes: all }
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
  // Session-type catalogue is best-effort: reminders still send with
  // `Session <id>` fallback if the lookup fails or the mock has no handler.
  const sessionTypes = yield* getSessionTypesEff.pipe(
    Effect.withLogSpan('pipeline.getSessionTypes'),
    Effect.annotateLogs({ op: 'getSessionTypes' }),
    Effect.catchAll(() =>
      Effect.succeed({
        SessionTypes: [] as Array<{
          Id: number
          Name: string | null
          ProgramId?: number
          Category?: string | null
          Subcategory?: string | null
        }>,
      })
    )
  )
  const sessionTypeNames = new Map<number, string>()
  const sessionTypeInfo = new Map<number, SessionTypeInfo>()
  for (const st of sessionTypes.SessionTypes) {
    if (typeof st.Name === 'string' && st.Name.trim().length > 0) {
      sessionTypeNames.set(st.Id, st.Name.trim())
    }
    sessionTypeInfo.set(st.Id, {
      Name: st.Name,
      ProgramId: st.ProgramId,
      Category: st.Category,
      Subcategory: st.Subcategory,
    })
  }
  const outputs = buildReminderOutputs(schedule.StaffMembers, sessionTypeNames, sessionTypeInfo)

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
