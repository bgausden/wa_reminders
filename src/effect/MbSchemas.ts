import { Effect, Schema } from 'effect'
import { MindbodyError } from './mbErrors.js'

// Lesson 13: validate at the boundary. Every `return response.data`
// cast in User.ts / Appointment.ts / Client.ts becomes a decode.
// Structs strip unknown keys (e.g. PaginationResponse) by default —
// we only model what the pipeline consumes.

// IDs arrive as numbers from the API but the pipeline treats them as
// strings throughout. Coerce once at the boundary.
export const IdStringSchema = Schema.transform(
  Schema.Union(Schema.Number, Schema.String),
  Schema.String,
  {
    strict: true,
    decode: (id) => String(id),
    encode: (id) => id,
  }
)

const StaffIdSchema = IdStringSchema

export const StaffSchema = Schema.Struct({
  Id: StaffIdSchema,
  // The pipeline only reads Id; everything else is nullable in practice
  // (live probe: EmploymentEnd null in 58/58, EmpID null in 9/58).
  DisplayName: Schema.NullOr(Schema.String),
  FirstName: Schema.NullOr(Schema.String),
  LastName: Schema.NullOr(Schema.String),
  EmpID: Schema.NullOr(Schema.String),
  EmploymentEnd: Schema.NullOr(Schema.String),
})

export const StaffResponseSchema = Schema.Struct({
  StaffMembers: Schema.Array(StaffSchema),
})

const StatusSchema = Schema.Literal(
  'None',
  'Requested',
  'Booked',
  'Completed',
  'Confirmed',
  'Arrived',
  'NoShow',
  'Cancelled',
  'LateCancelled'
)

export const AppointmentSchema = Schema.Struct({
  Duration: Schema.Number,
  Id: Schema.Number,
  Status: StatusSchema,
  StartDateTime: Schema.String,
  EndDateTime: Schema.String,
  // Display-only / unread downstream: accept null, it happens.
  Notes: Schema.NullOr(Schema.String),
  StaffRequested: Schema.Boolean,
  ProgramId: Schema.Number,
  SessionTypeId: Schema.Number,
  StaffId: IdStringSchema,
  ClientId: Schema.String,
  Resources: Schema.NullOr(Schema.Array(Schema.Unknown)),
  // Live probe: null in 37/37 appointments. Nothing downstream reads it.
  AddOns: Schema.NullOr(Schema.Array(Schema.Unknown)),
  // Service names: scheduleitems payloads vary — accept an inline
  // SessionType object and/or a flat ServiceName when present.
  // Both optional so legacy fixtures without them still decode.
  ServiceName: Schema.optional(Schema.NullOr(Schema.String)),
  SessionType: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        Name: Schema.NullOr(Schema.String),
        Id: Schema.optional(Schema.Number),
      })
    )
  ),
})

export const StaffScheduleItemsSchema = Schema.Struct({
  // Names are display-only and observed null in the wild — never assume.
  FirstName: Schema.NullOr(Schema.String),
  LastName: Schema.NullOr(Schema.String),
  DisplayName: Schema.NullOr(Schema.String),
  Id: Schema.Number,
  // Live probe: null in 11/11 schedule members.
  Name: Schema.NullOr(Schema.String),
  Appointments: Schema.Array(AppointmentSchema),
})

export const ScheduleItemsResponseSchema = Schema.Struct({
  StaffMembers: Schema.Array(StaffScheduleItemsSchema),
})

export const ClientSchema = Schema.Struct({
  Id: Schema.String,
  // Names feed the greeting line; nulls happen — the reporter falls back.
  FirstName: Schema.NullOr(Schema.String),
  LastName: Schema.NullOr(Schema.String),
  // Live probe (5 clients): HomePhone null 5/5, Email null 1/5.
  Email: Schema.NullOr(Schema.String),
  MobilePhone: Schema.NullOr(Schema.String),
  HomePhone: Schema.NullOr(Schema.String),
  SendScheduleTexts: Schema.NullOr(Schema.Boolean),
  SuspensionInfo: Schema.Unknown,
})

export const GetClientsResponseSchema = Schema.Struct({
  Clients: Schema.Array(ClientSchema),
})

export const TokenResponseSchema = Schema.Struct({
  AccessToken: Schema.String,
})

// Session-type catalogue for resolving SessionTypeId -> service name.
// Fetched via GET site/sessiontypes; kept separate so a lookup
// failure never blocks reminders (we fall back to `Session <id>`).
export const SessionTypeSchema = Schema.Struct({
  Id: Schema.Number,
  Name: Schema.NullOr(Schema.String),
})

export const SessionTypesResponseSchema = Schema.Struct({
  SessionTypes: Schema.Array(SessionTypeSchema),
  // Needed to page through the full catalogue (prod has 373 types).
  PaginationResponse: Schema.optional(
    Schema.Struct({
      TotalResults: Schema.Number,
      RequestedLimit: Schema.optional(Schema.Number),
      RequestedOffset: Schema.optional(Schema.Number),
      PageSize: Schema.optional(Schema.Number),
    })
  ),
})

// One helper for every boundary: decode or fail typed.
export const decodeOrMindbody = <A, I>(
  schema: Schema.Schema<A, I>,
  data: unknown,
  op: string
): Effect.Effect<A, MindbodyError> =>
  Schema.decodeUnknown(schema)(data).pipe(
    Effect.mapError((cause) => new MindbodyError({ op, cause }))
  )
