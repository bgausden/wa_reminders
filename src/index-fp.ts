import * as A from 'fp-ts/lib/Array.js'
import * as IO from 'fp-ts/lib/IO.js'
import * as O from 'fp-ts/lib/Option.js'
import * as ORD from 'fp-ts/lib/Ord.js'
import { Refinement } from 'fp-ts/lib/Refinement.js'
import * as S from 'fp-ts/lib/String.js'
import * as Sep from 'fp-ts/lib/Separated.js'
import * as FUNC from 'fp-ts/lib/function.js'
import { Eq } from 'fp-ts/Eq'
import { render } from 'prettyjson'

const { contramap } = ORD
const { pipe } = FUNC

import { localTemplate } from './ReminderTemplate.js'

import debug from 'debug'
import {
  Appointment,
  StaffScheduleItems,
  getScheduleItems,
} from './Appointment.js'
import { IUser, User, getStaff } from './User.js'
import { eqNumber, eqString, tomorrow } from './util.js'
import {
  ClientId,
  ClientWithSuspensionInfo,
  getClients,
  GetClientResponse,
} from './Client.js'
import { Reminder, reminderClientIds } from './Reminder.js'
import { DEFAULT_CLIENT_DISPLAY_NAME } from './constants.js'
import { complexLog, fpLog } from './Logging.js'

const debugNamespace = 'wa_reminders:main'
const log = debug(debugNamespace)
log.log = console.log.bind(console)

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

  const generateReminders: Reminder[] = pipe(
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
    A.sortBy([byStartDateTime])
  )

  const suppressIfSubsequentAppt: (fa: Reminder[]) => Reminder[] =
    A.reduceWithIndex(
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

  /* 
  // this version yields [[reminders], [reminders]] instead of Separated<Reminder[], Reminder[]>
    const splitOutSuppressed = (reminders: Reminder[]): [Reminder[], Reminder[]] =>
    pipe(
      reminders,
      A.partition((reminder) => reminder.suppressReason.length === 0),
      (s) => [s.left, s.right]
  ) */

  const addSuppressBadStatus: (fa: Reminder[]) => Reminder[] = A.reduce(
    [] as Reminder[],
    (rs: Reminder[], r: Reminder) =>
      pipe(
        r,
        O.of,
        O.filter((reminder) => reminder.Status !== 'Booked'),
        O.fold(
          () => rs.concat(r), // Status is 'booked' so can simply add the reminder to the list
          () =>
            // Status is not 'booked', so we need to add the suppressReason to the reminder before adding it to the list
            {
              switch (r.Status) {
                case 'Cancelled':
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'cancelled'],
                  })
                case 'NoShow':
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'noShow'],
                  })
                case 'Requested':
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'rescheduled'],
                  })
                case 'Completed':
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'checkedOut'],
                  })
                case 'Confirmed':
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'confirmed'],
                  })
                case 'Arrived':
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'arrived'],
                  })
                case 'LateCancelled':
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'lateCancelled'],
                  })
                case 'None':
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'noneStatus'],
                  })
                default:
                  return rs.concat({
                    ...r,
                    suppressReason: [...r.suppressReason, 'unrecognisedStatus'],
                  })
              }
            }
        )
      )
  )

  const splitOutSuppressedReminders = (
    reminders: Reminder[]
  ): Sep.Separated<Reminder[], Reminder[]> =>
    pipe(
      reminders,
      A.partition((reminder) => reminder.suppressReason.length === 0)
    )

  const processSuppressedReminders = (
    rs: Sep.Separated<Reminder[], Reminder[]>
  ): IO.IO<void> => {
    return fpLog({ suppressedReminders: rs.left })
  }

  const reminders = pipe(
    generateReminders,
    suppressIfSubsequentAppt,
    addSuppressBadStatus,
    splitOutSuppressedReminders
  )

  const getReminderClients = async (
    user: IUser = User.defaultUser,
    reminders: Reminder[]
  ) => getClients(user, reminderClientIds(reminders))

  const reminderClients = await getReminderClients(
    User.defaultUser,
    reminders.right
  )

  const addClientDisplayName = (
    reminders: Reminder[],
    reminderClients: ClientWithSuspensionInfo[]
  ): Reminder[] => {
    const reminderClientsMap = new Map<string, ClientWithSuspensionInfo>()
    reminderClients.forEach((client) => {
      reminderClientsMap.set(client.Id, client)
    })
    return pipe(
      reminders,
      A.map((reminder) => ({
        ...reminder,
        clientDisplayName:
          reminderClientsMap.get(reminder.ClientId)?.FirstName ||
          DEFAULT_CLIENT_DISPLAY_NAME,
      }))
    )
  }

  const remindersWithClientDisplayName = addClientDisplayName(
    reminders.right,
    reminderClients
  )

  // log the reminders
  //pipe(reminders.right, IO.of, IO.chain(fpLog))()
  //const remindersToLog = render(reminders.right)
  log({ reminders: reminders.right })
  // process the suppressed reminders (just log them for now)
  pipe(reminders, IO.of, IO.chain(processSuppressedReminders))()
  //log the reminder clients
  log({ reminderClients: reminderClients })
  //log the reminders with client display names
  log({ remindersWithClientDisplayName: remindersWithClientDisplayName })
  // log the template
  log({ template: localTemplate })
  log('rome has fallen')

  // loop through reminders ✅
  // if reminder is suppressed, skip (suppressed means previous appointment was for the same person and time of current appt is different (this allows for children having the same start time when booked under their parents name)) ✅
  // if not suppressed get the client details (firstname, lastname) and add to reminder ✅
  // merge the reminder details into the reminder template
  // send the reminder
  // log the reminder (full text) w/ send status
  // push th scheduleItem into a DB along with current date/time (will use this later to send reminders for recently changed appts)
  // push the scheduleItem into a google sheet (can we publish a view of the DB for a specific date instead?)
  // store the google sheet in gdrive
  // send a link to the sheet to reception@glowspa.hk
}

await main()

/* function isArrayofObjects(param: unknown): boolean {
  if (Array.isArray(param)) {
    return param.every((item) => typeof item === 'object' && item !== null);
  }
  return false;
}
 */

// want to create a wrapper for the log function that handles logging arrays of objects.
// don't know if param is an array. Trick: Array.head returns null if the param is not an array
/* const isArrayofObjects = (param: unknown): boolean =>
  pipe(
    O.fromNullable(param),
    O.chain(A.head),
    O.map(A.every((item) => typeof item === 'object' && item !== null)),
    O.getOrElse(() => false)
  ) */

const charlie = [{ fred: 1 }, { ernie: 2 }]
//const charlie:unknown = "flex"

//complexLog(charlie,log)
log(charlie)
//const delta = pipe(charlie,O.fromNullable,O.chain(A.head),O.map(()=>charlie),log) // doesn't work if charlie is not an array!
/* const epsilon = pipe(
  charlie,
  O.fromNullable,
  O.chain(O.fromPredicate(Array.isArray)),
  O.getOrElse(() => ["None"]),
  log
) */

/* const isObjectsArray = (param: unknown) => pipe(
  charlie,
  O.fromNullable,
  O.chain(O.fromPredicate(Array.isArray)),
  O.isSome
) */

//O.chain(A.every((e)=>typeof e === object)),log)
