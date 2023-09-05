import envvars from './envvars.js'
import axios from 'axios'
import { MB_BASE_URL } from './constants.js'
import { USER_TOKEN_ENDPOINT } from './mb_endpoints.js'
import { render } from 'prettyjson'
import debug from 'debug'
import { isAxiosError } from './util.js'
import chalk from 'chalk'

const debugNamespace: string = 'wa_reminders:User'
const log = debug(debugNamespace)

export interface User {
  userName: string
  password: string
  siteId: number
  token?: string
}

export class UserBuilder {
  private user: User

  constructor() {
    this.user = {
      userName: '',
      password: '',
      siteId: -99,
      token: '',
    }
  }

  withUserName(userName: string): UserBuilder {
    this.user.userName = userName
    return this
  }

  withPassword(password: string): UserBuilder {
    this.user.password = password
    return this
  }

  withSiteId(siteId: number): UserBuilder {
    this.user.siteId = siteId
    return this
  }

  withToken(token: string): UserBuilder {
    this.user.token = token
    return this
  }

  build(): User {
    return this.user
  }
}

async function createDefaultUser(): Promise<User> {
  const user = new UserBuilder()
    .withUserName(envvars.MB_USERNAME)
    .withPassword(envvars.MB_PASSWORD)
    .withSiteId(envvars.STUDIO_ID)
    .build()

  return { ...user, token: await getUserToken(user) }
}

const defaultUser = await createDefaultUser()
log({ defaultUser: defaultUser })

/**
 *
 * @param user
 * @returns Promise<string>
 *
 * @summary Request a user token from Mindbody
 */

async function getUserToken(user: User) {
  try {
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
    return response.data.AccessToken
  } catch (error) {
    isAxiosError(error)

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      log(chalk.red(`Request for user token failed with status: ${chalk.redBright(error.response.status)}`))
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
}

export { defaultUser }
