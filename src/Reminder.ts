import { Appointment } from "./Appointment.js"
import { ClientId } from "./Client.js"

type Reminder = Appointment & {
    staffDisplayName: string
    clientDisplayName: string
    suppressReason: Array<string>
  }
  
const reminderClientIds = (reminders: Reminder[]): ClientId[] => {
  const clientIds = reminders.map((reminder: Reminder) => reminder.ClientId);
  return [...new Set(clientIds)];
}

export { Reminder, reminderClientIds }