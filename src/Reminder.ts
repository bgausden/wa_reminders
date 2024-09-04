import * as A from "fp-ts/lib/Array.js"
import {pipe} from 'fp-ts/lib/function.js'
import { Appointment } from "./Appointment.js"
import { ClientId } from "./Client.js"
import { eqString } from "./util.js"

type Reminder = Appointment & {
    staffDisplayName: string
    clientDisplayName: string
    suppressReason: Array<string>
  }
  
const reminderClientIds = (reminders: Reminder[]): ClientId[] =>
pipe(
  reminders,
  A.map((reminder:Reminder) => reminder.ClientId),
  A.uniq(eqString),
)

export { Reminder, reminderClientIds }