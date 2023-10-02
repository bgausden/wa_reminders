import { defaultHTTPClient } from './httpClient.js'
import { SCHEDULE_ITEMS_ENDPOINT } from './mb_endpoints.js'
import debug from 'debug'
import { isAxiosError } from './util.js'
import { makeMBDateTimeString } from './makeMBDateTimeString.js'
import { PaginationResponse } from './PaginationResponse.js'
import { defaultLocationIds } from './constants.js'
import { IUser } from './User.js'

const status = [
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
  StaffId: string
  ClientId: number
  Resources: any[]
  AddOns: any[]
}

interface StaffScheduleItems {
  FirstName: string
  LastName: string
  DisplayName: string
  Id: number
  Name: string
  Appointments: Appointment[]
}

const paginationRequestParams = ['limit', 'offset'] as const

type TPaginationRequestParams = (typeof paginationRequestParams)[number]

const scheduleItemRequestParams = [
  'startDate',
  'endDate',
  'locationIds',
  'staffIds',
  'ignorePrepFinishTimes',
  ...paginationRequestParams,
] as const

type ScheduleItemRequestParams = (typeof scheduleItemRequestParams)[number]

interface ScheduleItemResponse {
  PaginationResponse: PaginationResponse
  StaffMembers: StaffScheduleItems[]
}

const debugNamespace = 'wa_reminders:Appointment'
const log = debug(debugNamespace)
log.log = console.log.bind(console)

async function getScheduleItems(
  user: IUser,
  startDateTime: Date,
  endDateTime: Date,
  staffIDs: Array<string>,
  offset: number = 0,
  limit: number = 100
): Promise<ScheduleItemResponse> {
  log({
    getScheduleItems: {
      startDateTime,
      endDateTime,
      staffIDs,
      offset,
      limit,
    },
  })

  if (!user.token) {
    return Promise.reject('User token is undefined')
  }
  try {
    const params: Record<ScheduleItemRequestParams, any> = {
      startDate: makeMBDateTimeString(startDateTime)[0],
      endDate: makeMBDateTimeString(endDateTime)[0],
      locationIds: defaultLocationIds,
      staffIds: staffIDs,
      ignorePrepFinishTimes: false,
      limit: limit,
      offset: offset,
    }
    const response = await defaultHTTPClient.get(SCHEDULE_ITEMS_ENDPOINT, {
      params: params,
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

export {
  getScheduleItems,
  ScheduleItemRequestParams,
  TPaginationRequestParams,
  Appointment,
  Status,
  StaffScheduleItems,
}
