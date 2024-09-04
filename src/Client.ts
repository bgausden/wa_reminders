import debug from 'debug'
import { PaginationResponse } from './PaginationResponse.js'
import { IUser, User } from './User.js'
import { defaultHTTPClient } from './httpClient.js'
import { defaultLocationIds } from './constants.js'
import { CLIENTS_ENDPOINT } from './mb_endpoints.js'
import { isAxiosError } from './util.js'

const debugNamespace = 'wa_reminders:Client'
const log = debug(debugNamespace)
log.log = console.log.bind(console)

type ClientId = string

type ClientWithSuspensionInfo = {
  Id: ClientId
  FirstName: string
  LastName: string
  Email: string
  MobilePhone: string
  HomePhone: string
  SendScheduleTexts: boolean
  SuspensionInfo: object
}

type GetClientResponse = {
  Clients: ClientWithSuspensionInfo[]
  PaginationResponse: PaginationResponse
}

type ClientRequestParams = 'clientIds' | 'locationIds' | 'limit' | 'offset'

async function getClients(
  user: IUser,
  clientIds: ClientId[],
  offset = 0,
  limit = 100
): Promise<ClientWithSuspensionInfo[]> {
  const debugNamespace = 'wa_reminders:Client:getClients()'
  const log = debug(debugNamespace)
  log({ getClients: { clientIds } })

  if (!user.token) {
    return Promise.reject('User token is undefined')
  }
  try {
    const params: Record<ClientRequestParams, any> = {
      clientIds: clientIds,
      locationIds: defaultLocationIds,
      limit: limit,
      offset: offset,
    }
    const response = await defaultHTTPClient.get<GetClientResponse>(
      CLIENTS_ENDPOINT,
      {
        headers: {
          authorization: user.token,
        },
        params: params,
      }
    )
    log(response.config.params)
    return response.data.Clients // has shape GetClientResponse
  } catch (error) {
    isAxiosError(error)
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      log(`Request failed with status: ${error.response.status}`)
      log(error.response.data)
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
  return Promise.reject('getClients() failed')
}

export { ClientId, ClientWithSuspensionInfo, GetClientResponse, getClients }
