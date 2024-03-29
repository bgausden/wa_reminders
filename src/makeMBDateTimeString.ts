import fws from 'fixed-width-string'
import debug from 'debug'

const namespace = 'wa_reminders:makeMBDateTimeString'
const log = debug(namespace)
log.log = console.log.bind(console)

function makeMBDateTimeString(arg: Date | Array<Date>): Array<string> {
  log(`makeMBDateTimeString() arg: ${arg}`)
  if (!Array.isArray(arg)) {
    arg = [arg]
  }
  return arg.reduce((acc: Array<string>, cur) => {
    const dateString =
      `${cur.getFullYear()}-` +
      `${fws((cur.getMonth() + 1).toString(), 2, {
        padding: '0',
        align: 'right',
      })}-` +
      `${fws(cur.getDate().toString(), 2, {
        padding: '0',
        align: 'right',
      })}T` +
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

export { makeMBDateTimeString }
