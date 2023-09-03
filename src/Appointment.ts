import envVars from './envvars.js'
import { defaultHTTPClient } from './httpClient.js'
import { SCHEDULE_ITEMS_ENDPOINT } from './mb_endpoints.js'
import debug from 'debug'
import { render } from 'prettyjson'
import { makeMBDateTimeString } from './util.js'

interface PaginationResponse {
  RequestedLimit: number
  RequestedOffset: number
  PageSize: number
  TotalResults: number
}

const status = [
  ,
  'None',
  'Requested',
  'Booked',
  'Completed',
  'Confirmed',
  'Arrived',
  'NoShow',
  'Cancelled',
  'LateCancelled',
] as const

type Status = (typeof status)[number]

interface Appointment {
  Duration: number
  Id: number
  Status: Status
  StartDateTime: string
  EndDateTime: string
  Notes: string
  StaffRequested: boolean
  ProgramId: number
  SessionTypeId: number
  StaffId: number
  ClientId: number
  Resources: any[]
  AddOns: any[]
}

interface Staff {
  FirstName: string
  LastName: string
  DisplayName: string
  Id: number
  Name: string
  Appointments: Appointment[]
}

interface ScheduleItemResponse {
  PaginationResponse: PaginationResponse
  StaffMembers: Staff[]
}

const debugNamespace: string = 'wa_reminders:Appointment'
const log = debug(debugNamespace)

async function getScheduleItems(
  startDateTime: Date,
  endDateTime: Date,
  offset: number = 0
) {
  log(
    `getScheduleItems() startDateTime: ${startDateTime} endDateTime: ${endDateTime} offset: ${offset}`
  )
  const response = await defaultHTTPClient.get(SCHEDULE_ITEMS_ENDPOINT, {
    params: {
      StartDateTime: makeMBDateTimeString(startDateTime),
      EndDateTime: makeMBDateTimeString(endDateTime),
      LocationIds: [],
      StaffIds: [],
      IgnorePrepFinishTimes: false,
      Limit: Infinity,
      Offset: offset,
    },
  })
  if (!response) {
    throw new Error(
      `Call to ${SCHEDULE_ITEMS_ENDPOINT} failed with no response`
    )
  }
  if (response.status !== 200) {
    throw new Error(
      `Call to ${SCHEDULE_ITEMS_ENDPOINT} failed with response ${render(
        response
      )}`
    )
  }
  return response.data
}

export { getScheduleItems }
