import axios from 'axios'
import { MB_BASE_URL } from './constants.js'
import { IUser, User } from './User.js'
import envVars from './envvars.js'
import debug from 'debug'
import http from 'node:http'
import https from 'node:https'

const logNamespace = 'wa_reminders:httpClient'
const log = debug(logNamespace)

const httpAgent = new http.Agent({ keepAlive: true })
const httpsAgent = new https.Agent({ keepAlive: true })
const agentSelector = function (_parsedURL: any) {
  if (_parsedURL.protocol == 'http:') {
    return httpAgent
  } else {
    return httpsAgent
  }
}

function initHttpClient(user: IUser) {
  const httpClient = axios.create({
    baseURL: MB_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'API-Key': envVars.API_KEY,
      SiteId: user?.siteId ? user.siteId : envVars.SITE_ID,
      Authorization: user?.token,
    },
    maxBodyLength: Infinity,
    httpsAgent: new https.Agent({ keepAlive: true }), // work-around for a node bug that triggers ECONNRESET
  })
  return httpClient
}

const defaultHTTPClient = initHttpClient(User.defaultUser)

export { defaultHTTPClient, initHttpClient }
