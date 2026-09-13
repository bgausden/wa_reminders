import { makeMBDateTimeString } from './makeMBDateTimeString.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A calendar day `offset` days from `now`, with the Mindbody datetime strings
 * for its start and end.
 *
 * @param offset number of days from today
 * @param now the instant to count from (defaults to now)
 */

export class DayWithOffset {
  public offset: number
  public midnight: Date
  public midnightDateString: string | null
  public elevenFiftyNine: Date
  public elevenFiftyNineDateString: string | null
  constructor(offset: number, now: Date = new Date()) {
    const offsetDate = new Date(now.getTime() + offset * DAY_MS)
    this.offset = offset
    this.midnight = new Date(offsetDate.setHours(0, 0, 0, 0))
    this.midnightDateString = makeMBDateTimeString(this.midnight)[0] || null
    this.elevenFiftyNine = new Date(offsetDate.setHours(23, 59, 59, 999))
    this.elevenFiftyNineDateString = makeMBDateTimeString(this.elevenFiftyNine)[0] || null
  }
}

/**
 * Per-invocation day factory: the day is worked out from the `now` passed in
 * (or the clock at call time), never from a value captured when the module was
 * first loaded. A hosted process stays warm across midnight, so a day computed
 * at module load would silently go stale — always call this (or pass `now`)
 * rather than reusing a `DayWithOffset` across invocations.
 */
export function dayWithOffset(offset: number, now: Date = new Date()): DayWithOffset {
  return new DayWithOffset(offset, now)
}

// Legacy: computed once at module load, so these go stale in a long-lived
// process. Kept so existing callers keep working; new code should call
// `dayWithOffset(offset, now)` per invocation instead.
const tomorrow = dayWithOffset(1)
const tomorrowMidnight = tomorrow.midnight
const tomorrowElevenFiftyNine = tomorrow.elevenFiftyNine

const hauJat = dayWithOffset(2)

export { tomorrowMidnight, tomorrowElevenFiftyNine, tomorrow, hauJat }
