import * as A from 'fp-ts/lib/Array.js'
import * as IO from 'fp-ts/lib/IO.js'
import * as O from 'fp-ts/lib/Option.js'
import * as ORD from 'fp-ts/lib/Ord.js'
import { Refinement } from 'fp-ts/lib/Refinement.js'
import * as S from 'fp-ts/lib/String.js'
import * as FUNC from 'fp-ts/lib/function.js'
const { contramap } = ORD
const { pipe } = FUNC

import debug from 'debug'
import {
  Appointment,
  StaffScheduleItems,
  getScheduleItems,
} from './Appointment.js'
import { User, getStaff } from './User.js'
import { tomorrow } from './util.js'

type Reminder = Appointment & {
  staffDisplayName: string
  clientDisplayName: string
  suppressReason: Array<string>
}

const debugNamespace = 'wa_reminders:main'
const log = debug(debugNamespace)
log.log = console.log.bind(console)

const fpLog =
  (x: any): IO.IO<void> =>
  () =>
    log(x)

declare const isReminder: Refinement<unknown, Reminder>

async function main(): Promise<void> {
  const staff = await getStaff()
  const allStaffIds = staff.StaffMembers.map((s) => s.Id)
  const staffMap = new Map(staff.StaffMembers.map((s) => [s.Id, s]))

  const scheduleItemsResponse = await getScheduleItems(
    User.defaultUser,
    tomorrow.midnight,
    tomorrow.elevenFiftyNine,
    allStaffIds,
    0,
    undefined
  )

  const staffScheduleItems = scheduleItemsResponse.StaffMembers

  const byStartDateTime = pipe(
    S.Ord,
    contramap((r: Reminder) => r.StartDateTime)
  )

  const createReminders: Reminder[] = pipe(
    staffScheduleItems,
    A.filter(
      (staffScheduleItem: StaffScheduleItems) =>
        staffScheduleItem.Appointments.length > 0
    ),
    A.chain((staffScheduleItem) =>
      pipe(
        staffScheduleItem.Appointments,
        A.map((appointment) => ({
          ...appointment,
          staffDisplayName: staffScheduleItem.DisplayName,
          clientDisplayName: appointment.ClientId.toString(),
          suppressReason: new Array<string>(),
        }))
      )
    ),
    A.sortBy([byStartDateTime]),
    /* T.of,
    T.tapIO((reminders) => () => log(reminders)),
    T.map((reminders) => reminders.map((reminder) => ({ ...reminder}))) */
  )

  const addSuppressReason = A.reduceWithIndex(
    [] as Reminder[],
    (index, reminders, reminder: Reminder) =>
      pipe(
        O.fromNullable(reminders[index - 1]),
        O.filter(
          (previousAppointment) =>
            previousAppointment.ClientId === reminder.ClientId &&
            previousAppointment.StartDateTime !== reminder.StartDateTime
        ),
        O.fold(
          () => reminders.concat(reminder),
          () =>
            reminders.concat({
              ...reminder,
              suppressReason: [...reminder.suppressReason, 'subsequentAppt'],
            })
        )
      )
  )

  const reminders = pipe(createReminders, addSuppressReason)

  pipe(reminders, IO.of, IO.chain(fpLog))()
  log('rome has fallen')

  // loop through appointments
  // if appointment is suppressed, skip (suppressed means previous appointment was for the same person and time of current appt is different (this allows for children having the same start time when booked under their parents name))
  // if not suppressed get the client details (firstname, lastname) and add to appointment
  // merge the client details into the reminder template
  // send the reminder
  // log the reminder (full text)
  // push th scheduleItem into a DB along with current date/time (will use this later to send reminders for recently changed appts)
  // push the scheduleItem into a google sheet (can we publish a view of the DB for a specific date instead?)
  // store the google sheet in gdrive
  // send a link to the sheet to reception@glowspa.hk
}

await main()
