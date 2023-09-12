import { isAxiosError } from './util.js'
import { defaultHTTPClient } from './httpClient.js'
import debug from 'debug'
import chalk from 'chalk'

const debugNamespace = 'wa_reminders:mbCall'
let log = debug(debugNamespace)
log.log = console.log.bind(console)

const mbCallMethod = ['get', 'post'] as const

type mbCallMethod = (typeof mbCallMethod)[number]

async function mbCall(
  method: mbCallMethod,
  path: string,
  params: {},
  headers: {}
) {
  try {
    const response = await defaultHTTPClient[method](path, {
      params: { ...params },
      headers: { ...headers },
    })
    //log(response.config.headers)
    log(response.config.params)
    return response.data // has shape ScheduleItemResponse
  } catch (error) {
    isAxiosError(error)

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      log(
        chalk.red`Request failed with status: {redBright ${error.response.status}}`
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
  return Promise.reject(`${method.toUpperCase()} to ${path} failed`)
}

export { mbCall, mbCallMethod }
