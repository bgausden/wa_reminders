import envvars from './envvars.js'
import { MB_BASE_URL } from './constants.js'
import { SITES_ENDPOINT } from './mb_endpoints.js'
import debug from 'debug'
import { isAxiosError } from './util.js'
import chalk from 'chalk'
import { User, defaultUser } from './User.js'
import { defaultHTTPClient } from './httpClient.js'
import { PaginationResponse } from './PaginationResponse.js'
import { render } from 'prettyjson'

const debugNamespace: string = 'wa_reminders:Site'
const log = debug(debugNamespace)

type Site = {id: number, name: string}

interface SitesResponse {
    PaginationResponse: PaginationResponse
    Sites: Site[]
}

/**
 *
 * @param user
 * @returns Promise<string>
 *
 * @summary Request a user token from Mindbody
 */

async function getSites(user: User): Promise<SitesResponse> {
  try {
    const response = await defaultHTTPClient.get(
      `${MB_BASE_URL}${SITES_ENDPOINT}`
    )
    log(response.data)
    return response.data // as SitesResponse
  } catch (error) {
    isAxiosError(error)

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      log(
        chalk.red(
          `Request for accessible sites failed with status: ${chalk.redBright(
            error.response.status
          )}`
        )
      )
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
  return Promise.reject('getSites() failed')
}

export { getSites }

//log(await getSites(defaultUser))
