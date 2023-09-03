import fws from 'fixed-width-string'
import debug from 'debug'

const debugNamespace: string = 'wa_reminders:util'
const log = debug(debugNamespace)

function makeMBDateTimeString(arg: Date | Array<Date>): Array<string> {
  log(`makeMBDateTimeString() arg: ${arg}`)
  if (!Array.isArray(arg)) {
    arg = [arg]
  }
  let date: Date
  let dateString: string
  return arg.reduce((acc: Array<string>, cur) => {
    dateString =
      `${cur.getFullYear()}-` +
      `${fws((cur.getMonth() + 1).toString(), 2, {
        padding: '0',
        align: 'right',
      })}-` +
      `${fws(cur.getDate().toString(), 2, { padding: '0', align: 'right' })}T` +
      `${fws(cur.getHours().toString(), 2, {
        padding: '0',
        align: 'right',
      })}:` +
      `${fws(cur.getMinutes().toString(), 2, {
        padding: '0',
        align: 'right',
      })}:` +
      `${fws(cur.getSeconds().toString(), 2, {
        padding: '0',
        align: 'right',
      })}`
    acc.push(dateString)
    log(`makeMBDateTimeString() dateString: ${dateString}`)
    return acc
  }, [])
}

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

export { makeMBDateTimeString, tomorrowMidnight, tomorrowElevenFiftyNine }
