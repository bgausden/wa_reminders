import { render } from 'prettyjson'
import { getScheduleItems } from './Appointment.js'
import debug from 'debug'
import {
  tomorrowElevenFiftyNine,
  tomorrowMidnight,
  hauJat,
  tomorrow,
} from './util.js'
import { User, getStaff, StaffResponse, Staff } from './User.js'

const debugNamespace: string = 'wa_reminders:main'
const log = debug(debugNamespace)
log.log = console.log.bind(console)

async function main() {
  await User.init()

  const staff = await getStaff()
  const allStaffIds = staff.StaffMembers.map((s) => s.Id)
  const staffMap = new Map(staff.StaffMembers.map((s) => [s.Id, s]))

  const scheduleItemsReponse = await getScheduleItems(
    User.defaultUser,
    tomorrow.midnight,
    tomorrow.elevenFiftyNine,
    allStaffIds, // Must provide a staff ID or no schedules are returned
    0, // no offset. Start at the beginning
    undefined // no limit. Get all schedules
  )
  //log(`Schedule Items: ${render(scheduleItems)}`)

  const scheduleItems = new Array<object>()
  scheduleItemsReponse.StaffScheduleItems.filter(
    (staff) => staff.Appointments.length > 0
  ).forEach((staff) => {
    staff.Appointments.sort((a, b) => {
      if (a.StartDateTime < b.StartDateTime) {
        return -1
      }
      if (a.StartDateTime > b.StartDateTime) {
        return 1
      }
      return 0
    }).forEach((appointment, index, appointments) => {
      const output = {
        Id: appointment.Id,
        StaffId: `${appointment.StaffId} (${staff.DisplayName})`,
        ClientId: appointment.ClientId,
        Status: appointment.Status,
        SessionTypeId: appointment.SessionTypeId,
        StartDateTime: appointment.StartDateTime,
        EndDateTime: appointment.EndDateTime,
        suppressReason: new Array<string>(),
      }
      if (appointment.Status !== 'Booked') {
        output.suppressReason.push('Status')
      }
      if (appointment.ClientId == appointments[index - 1]?.ClientId) {
        output.suppressReason.push('ClientId')
      }
      log(output)
      scheduleItems.push(output)
    })
  })
  // loop through scheduleItems
  // if scheduleItem is suppressed, skip
  // if not suppressed get the client details (firstname, lastname) and add to scheduleItems
  // merge the client details into the reminder template
  // send the reminder
  // log the reminder (full text)
  // push th scheduleItem into a DB along with current date/time (will use this later to send reminders for recently changed appts)
  // push the scheduleItem into a google sheet (can we publish a view of the DB for a specific date instead?)
  // store the google sheet in gdrive
  // send a link to the sheet to reception@glowspa.hk

}

main()

// Debugging
//log((await getStaff()).StaffMembers.filter((staff) => staff.LastName === 'Gausden'))
