import debug from 'debug'
import axios, { AxiosError } from 'axios'
import { makeMBDateTimeString } from './makeMBDateTimeString.js'
import * as O from 'fp-ts/lib/Option.js'

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
  public midnightDateString: O.Option<string>
  public elevenFiftyNine: Date
  public elevenFiftyNineDateString: O.Option<string>
  constructor(offset: number) {
    const offsetDate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000)
    this.offset = offset
    this.midnight = new Date(offsetDate.setHours(0, 0, 0, 0))
    this.midnightDateString = O.fromNullable(makeMBDateTimeString(this.midnight)[0])
    this.elevenFiftyNine = new Date(offsetDate.setHours(23, 59, 59, 999))
    this.elevenFiftyNineDateString = O.fromNullable(makeMBDateTimeString(this.elevenFiftyNine)[0])
  }
}

const tomorrow = new DayWithOffset(1)
const tomorrowMidnight = tomorrow.midnight
const tomorrowElevenFiftyNine = tomorrow.elevenFiftyNine

const hauJat = new DayWithOffset(2)


function isAxiosError(error: any): asserts error is AxiosError {
  if (!axios.isAxiosError(error)) {
    throw new TypeError('error is not an AxiosError')
  }
}

function isString(arg: any): asserts arg is string {
  if (typeof arg !== 'string') {
    throw new TypeError('arg is not a string')
  }
}

export { tomorrowMidnight, tomorrowElevenFiftyNine, tomorrow, hauJat, isAxiosError, isString }
