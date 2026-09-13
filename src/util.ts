import { makeMBDateTimeString } from './makeMBDateTimeString.js'

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


export { tomorrowMidnight, tomorrowElevenFiftyNine, tomorrow, hauJat }
