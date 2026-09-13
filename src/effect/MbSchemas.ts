import { Effect, Schema } from 'effect'
import { MindbodyError } from './mbErrors.js'

// Lesson 13: validate at the boundary. Every `return response.data`
// cast in User.ts / Appointment.ts / Client.ts becomes a decode.
// Structs strip unknown keys (e.g. PaginationResponse) by default —
// we only model what the pipeline consumes.

export const StaffSchema = Schema.Struct({
  Id: Schema.String,
  DisplayName: Schema.String,
  FirstName: Schema.String,
  LastName: Schema.String,
  EmpID: Schema.String,
  EmploymentEnd: Schema.String,
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
  Notes: Schema.String,
  StaffRequested: Schema.Boolean,
  ProgramId: Schema.Number,
  SessionTypeId: Schema.Number,
  StaffId: Schema.String,
  ClientId: Schema.String,
  Resources: Schema.Array(Schema.Unknown),
  AddOns: Schema.Array(Schema.Unknown),
})

export const StaffScheduleItemsSchema = Schema.Struct({
  FirstName: Schema.String,
  LastName: Schema.String,
  DisplayName: Schema.String,
  Id: Schema.Number,
  Name: Schema.String,
  Appointments: Schema.Array(AppointmentSchema),
})

export const ScheduleItemsResponseSchema = Schema.Struct({
  StaffMembers: Schema.Array(StaffScheduleItemsSchema),
})

export const ClientSchema = Schema.Struct({
  Id: Schema.String,
  FirstName: Schema.String,
  LastName: Schema.String,
  Email: Schema.String,
  MobilePhone: Schema.String,
  HomePhone: Schema.String,
  SendScheduleTexts: Schema.Boolean,
  SuspensionInfo: Schema.Unknown,
})

export const GetClientsResponseSchema = Schema.Struct({
  Clients: Schema.Array(ClientSchema),
})

export const TokenResponseSchema = Schema.Struct({
  AccessToken: Schema.String,
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
