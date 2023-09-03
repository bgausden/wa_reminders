import { render } from 'prettyjson'
import { defaultUser } from './User.js'
import { getScheduleItems } from './Appointment.js'
import debug from 'debug'
import { tomorrowElevenFiftyNine, tomorrowMidnight } from './util.js'

const debugNamespace: string = 'wa_reminders:main'
const log = debug(debugNamespace)

async function main() {
  const scheduleItems = await getScheduleItems(
    tomorrowMidnight(),
    tomorrowElevenFiftyNine()
  )
  log(`Schedule Items: ${render(scheduleItems)}`)
}

main()
