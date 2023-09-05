import debug from 'debug'
import axios, { AxiosError } from 'axios'

const debugNamespace: string = 'wa_reminders:util'
export const log = debug(debugNamespace)

function tomorrowMidnight(): Date {
  let tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow
}

function tomorrowElevenFiftyNine(): Date {
  let date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setHours(23, 59, 59, 999)
  return date
}

function isAxiosError(error: any): asserts error is AxiosError {
  if (!axios.isAxiosError(error)) {
    throw new TypeError('error is not an AxiosError')
  }
}

export {
  tomorrowMidnight,
  tomorrowElevenFiftyNine,
  isAxiosError,
}
