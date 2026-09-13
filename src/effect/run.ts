import { Effect, Schema } from 'effect'
import type { TargetDay } from '../targetDay.js'
import { GetClientsResponseSchema } from './MbSchemas.js'
import { MindbodyError } from './mbErrors.js'
import { MbHttp } from './MbHttp.js'
import { CurrentUser } from './CurrentUser.js'
import { mainEffectLayeredFor, type ReminderOutput } from './pipeline.js'

/** One client record as returned by `GET client/clients`. */
export type ReminderClient = Schema.Schema.Type<typeof GetClientsResponseSchema>['Clients'][number]

/** The calendar window a run fetches (midnight .. 23:59:59.999). */
export type RunTargetDay = Pick<TargetDay, 'midnight' | 'elevenFiftyNine'>

/**
 * Everything the report needs, straight from Mindbody: one output per
 * appointment plus the client records for the sendable ones.
 *
 * This is the boundary between "talking to Mindbody" and "rendering a
 * report" — nothing here has been rendered, and nothing here has been
 * written to disk.
 */
export interface ReminderRun {
  outputs: ReadonlyArray<ReminderOutput>
  clients: ReadonlyArray<ReminderClient>
}

/**
 * Mindbody run: fetch staff, schedule, session types and clients for
 * `day` and return the reminder domain data. No rendering, no file
 * access — the hosted entry point and the CLI share this one path.
 *
 * Needs are declared in the type (`MbHttp | CurrentUser`) so tests can
 * drive it with the existing test layers. Always call this with the day
 * you mean: the day is an argument, never module state.
 */
export const runRemindersFor = (
  day: RunTargetDay
): Effect.Effect<ReminderRun, MindbodyError, MbHttp | CurrentUser> => mainEffectLayeredFor(day)
