import { render } from 'prettyjson'
import { getScheduleItems } from './Appointment.js'
import debug from 'debug'
import { tomorrowElevenFiftyNine, tomorrowMidnight } from './util.js'
import { User, getStaff, StaffResponse, Staff } from './User.js'

const debugNamespace: string = 'wa_reminders:main'
const log = debug(debugNamespace)

async function main() {
  await User.init()

  const staff = await getStaff()
  const allStaffIds = staff.StaffMembers.map((s) => s.Id)
  const staffMap = new Map(staff.StaffMembers.map((s) => [s.Id, s]))

  const scheduleItems = await getScheduleItems(
    User.defaultUser,
    tomorrowMidnight(),
    tomorrowElevenFiftyNine(),
    allStaffIds, // Must provide a staff ID or no schedules are returned
    0,
    undefined
  )
  //log(`Schedule Items: ${render(scheduleItems)}`)

  scheduleItems.StaffMembers.filter(
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
    })
  })

  //log((await getStaff()).StaffMembers.filter((staff) => staff.LastName === 'Gausden'))
}

main()
