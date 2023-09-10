import debug from 'debug'
import envVars from './envvars.js'

const debugNamespace: string = 'wa_reminders:constants'
const log = debug(debugNamespace)

const MB_API_VERSION = 'v6'
log(`MB_API_VERSION: ${MB_API_VERSION}`)

const MB_BASE_URL = `https://api.mindbodyonline.com/public/${MB_API_VERSION}`
log(`MB_BASE_URL: ${MB_BASE_URL}`)

let defaultStartDateTime = new Date(Date.now())
defaultStartDateTime.setHours(0, 0, 0, 0)
log(`defaultStartDateTime: ${defaultStartDateTime}`)

let defaultEndDateTime = new Date(Date.now())
defaultEndDateTime.setHours(23, 59, 59, 999)
log(`defaultEndDateTime: ${defaultEndDateTime}`)

let tomorrowStartDateTime = new Date(Date.now() + 24 * 60 * 60 * 1000)
tomorrowStartDateTime.setHours(0, 0, 0, 0)
log(`tomorrowStartDateTime: ${tomorrowStartDateTime}`)

let tomorrowEndDateTime = new Date(Date.now() + 24 * 60 * 60 * 1000)
tomorrowEndDateTime.setHours(23, 59, 59, 999)
log(`tomorrowEndDateTime: ${tomorrowEndDateTime}`)

const defaultLocationIds = [0, 1] // physical and online store maybe?

export {
  MB_API_VERSION,
  MB_BASE_URL,
  tomorrowStartDateTime,
  tomorrowEndDateTime,
  defaultLocationIds,
}
