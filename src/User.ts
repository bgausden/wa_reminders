import envvars from './envvars.js'
import axios, { AxiosError } from 'axios'
import { MB_BASE_URL } from './constants.js'
import { STAFF_ENDPOINT, USER_TOKEN_ENDPOINT } from './mb_endpoints.js'
import { render } from 'prettyjson'
import debug from 'debug'
import { isAxiosError, isString } from './util.js'
import chalk from 'chalk'
import { defaultHTTPClient, initHttpClient } from './httpClient.js'
import { PaginationResponse } from './PaginationResponse.js'

const debugNamespace: string = 'wa_reminders:User'
const log = debug(debugNamespace)
log.log = console.log.bind(console)

interface IUser {
  userName: string
  password: string
  siteId: number
  token?: string
}

class User implements IUser {
  _userName: string
  _password: string
  _siteId: number
  _token?: string

  constructor(
    userName: string,
    password: string,
    siteId: number,
    token?: string
  ) {
    this._userName = userName
    this._password = password
    this._siteId = siteId
    this._token = token
  }

  get userName(): string {
    return this._userName
  }

  get password(): string {
    return this._password
  }

  get siteId(): number {
    return this._siteId
  }

  get token(): string | undefined {
    return this._token
  }

  set token(token: string) {
    this._token = token
  }

  static _defaultUser: IUser

  static get defaultUser(): IUser {
    if (!this._defaultUser) {
      log('User.defaultUser not initialized')
      //throw new Error('User.defaultUser not initialized')
    }
    return this._defaultUser
  }

  public static async init(): Promise<void> {
    if (this._defaultUser) {
      return
    }
    this._defaultUser = {
      userName: envvars.MB_USERNAME,
      password: envvars.MB_PASSWORD,
      siteId: envvars.SITE_ID,
      token: undefined,
    }
    this._defaultUser.token = await getUserToken(this._defaultUser)
  }
}

/**
 *
 * @param user
 * @returns Promise<string>
 *
 * @summary Request a user token from Mindbody
 */

async function getUserToken(user: IUser): Promise<string> {
  try {
    log(`Requesting token for user ${user.userName}`)
    const response = await axios.post(
      `${MB_BASE_URL}${USER_TOKEN_ENDPOINT}`,
      {
        Username: user.userName,
        Password: user.password,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': envvars.API_KEY,
          SiteId: [user.siteId.toString()],
        },
      }
    )
    if (!('AccessToken' in response.data)) {
      throw new AxiosError('AccessToken not in response.data')
    }
    const token = response.data.AccessToken
    isString(token)
    log(`Token for user ${user.userName} is ${token}`)
    return token
  } catch (error) {
    log(`getUserToken() failed for user ${user.userName}`)
    isAxiosError(error)

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      log(
        chalk.red(
          `Request for user token failed with status: ${chalk.redBright(
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
    //log(error.config)
  }
  return Promise.reject('getUserToken() failed')
}

interface Staff {
  Id: string
  DisplayName: string
  FirstName: string
  LastName: string
  EmpID: string
  EmploymentEnd: string // DateTime
}

interface StaffResponse {
  paginationResponse: PaginationResponse
  StaffMembers: Array<Staff>
}

async function getStaff(staffIds?: Array<Staff>): Promise<StaffResponse> {
  try {
    if (!defaultHTTPClient) {
      initHttpClient(User.defaultUser)
    }
    const response = await defaultHTTPClient.get(
      `${MB_BASE_URL}${STAFF_ENDPOINT}`,
      {
        params: {
          staffIds: staffIds,
        },
      }
    )
    //log(response.data)
    return response.data // as StaffResponse
  } catch (error) {
    isAxiosError(error)

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      log(
        chalk.red(
          `Request for staff failed with status: ${chalk.redBright(
            error.response.status
          )}`
        )
      )
      log(error.response.data)
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      log(error.request)
    } else {
      // Something happened in setting up the request that triggered an Error
      log(error.message)
    }
    //log(error.config)
  }
  return Promise.reject('getStaff() failed')
}

export { IUser, User, StaffResponse, Staff, getStaff }

await User.init()

// Debugging
//log((await getStaff()).StaffMembers.filter((staff) => staff.LastName === 'Gausden'))
