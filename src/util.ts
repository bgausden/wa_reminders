import debug from 'debug'
import axios, { AxiosError } from 'axios'
import { makeMBDateTimeString } from './makeMBDateTimeString.js'


const debugNamespace: string = 'wa_reminders:util'
export const log = debug(debugNamespace)
log.log = console.log.bind(console)

/**
 * 
 * @param offset number of days from today
 * @returns object
 */

class DayWithOffset {
  public offset: number
  public midnight: Date
  public midnightDateString: string | null
  public elevenFiftyNine: Date
  public elevenFiftyNineDateString: string | null
  constructor(offset: number) {
    const offsetDate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
    this.offset = offset
    this.midnight = new Date(offsetDate.setHours(0, 0, 0, 0))
    this.midnightDateString = makeMBDateTimeString(this.midnight)[0] || null
    this.elevenFiftyNine = new Date(offsetDate.setHours(23, 59, 59, 999))
    this.elevenFiftyNineDateString = makeMBDateTimeString(this.elevenFiftyNine)[0] || null
  }
}

const tomorrow = new DayWithOffset(1)
const tomorrowMidnight = tomorrow.midnight
const tomorrowElevenFiftyNine = tomorrow.elevenFiftyNine

const hauJat = new DayWithOffset(2)


function isAxiosError(error: any): asserts error is AxiosError {
  if (!axios.isAxiosError(error)) {
    log(error)
    throw new TypeError('error is not an AxiosError')
  }
}

function isString(arg: unknown): asserts arg is string {
  if (typeof arg !== 'string') {
    throw new TypeError('arg is not a string')
  }
}


export { tomorrowMidnight, tomorrowElevenFiftyNine, tomorrow, hauJat, isAxiosError, isString }
