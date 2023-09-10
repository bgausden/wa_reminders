import { defaultHTTPClient } from './httpClient.js'
import { SCHEDULE_ITEMS_ENDPOINT } from './mb_endpoints.js'
import debug from 'debug'
import { isAxiosError } from './util.js'
import { makeMBDateTimeString } from './makeMBDateTimeString.js'
import { PaginationResponse } from './PaginationResponse.js'
import { defaultLocationIds } from './constants.js'
import { IUser } from './User.js'

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
  user: IUser,
  startDateTime: Date,
  endDateTime: Date,
  staffIDs: Array<number>,
  offset: number = 0,
  limit: number = 100
): Promise<ScheduleItemResponse> {
  log(
    `getScheduleItems() startDateTime: ${startDateTime} endDateTime: ${endDateTime} offset: ${offset}`
  )

  if (!user.token) {
    return Promise.reject('User token is undefined')
  }
  try {
    const response = await defaultHTTPClient.get(SCHEDULE_ITEMS_ENDPOINT, {
      params: {
        StartDateTime: makeMBDateTimeString(startDateTime)[0],
        EndDateTime: makeMBDateTimeString(endDateTime)[0],
        LocationIds: defaultLocationIds,
        StaffIds: staffIDs,
        IgnorePrepFinishTimes: false,
        Limit: limit,
        Offset: offset,
      },
      headers: {
        authorization: user.token,
      },
    })
    //log(response.config.headers)
    log(response.config.params)
    return response.data // has shape ScheduleItemResponse
  } catch (error) {
    isAxiosError(error)

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      log(`Request failed with status: ${error.response.status}`)
      log(error.response.data)
      //log(error.response.headers)
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      log(error.request)
    } else {
      // Something happened in setting up the request that triggered an Error
      log('Error', error.message)
    }
    log(error.config)
  }
  return Promise.reject('getScheduleItems() failed')
}

export { getScheduleItems }
