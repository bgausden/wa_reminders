/**
 * Cache keys, staleness and the run-status record for the hosted reminder
 * report.
 *
 * Pure, and it owns no clock: every function that needs "now" takes it as an
 * argument, so a timer tick at 9am Hong Kong time and an HTTP request at 23:00
 * UTC are both just instants the caller hands in.
 *
 * The one rule that matters here: a storage key is derived from a *resolved*
 * {@link TargetDay} label (`YYYY-MM-DD`), never from a string somebody typed.
 * That is why the day parameters are {@link DayRef} — an object carrying a
 * `label` — rather than `string`: a raw spec like `tomorrow`, `+1` or
 * `../../scheduled` cannot be passed by accident, because it has no `label`
 * property to read.
 *
 * The blob implementation of the store (follow-up) uses these same keys, so
 * the naming here is the naming in the container.
 */
import { Data } from 'effect'
import type { TargetDay } from '../targetDay.js'
import { scheduledTargetDay } from '../targetDay.js'

/**
 * The only part of a target day the storage layer is allowed to see.
 *
 * Deliberately an object and not a string — see the module note. A full
 * `TargetDay` satisfies it, so callers pass the day they resolved.
 */
export interface DayRef {
  /** Resolved `YYYY-MM-DD` of the target calendar day. */
  label: string
}

/** Key of the report the 9am timer writes and the plain bookmark serves. Overwritten in place. */
export const SCHEDULED_REPORT_KEY = 'scheduled.json'

/** Key of the last scheduled run's status record. */
export const RUN_STATUS_KEY = 'run-status.json'

/**
 * Prefix of an ad-hoc day's key (`day-2026-09-14.json`).
 *
 * It exists so the ad-hoc reports can be told apart from the scheduled one by
 * prefix alone: the container's lifecycle rule expires `day-*` after about a
 * week, leaving `scheduled.json` and `run-status.json` alone.
 */
export const DAY_REPORT_KEY_PREFIX = 'day-'

const DAY_LABEL = /^\d{4}-\d{2}-\d{2}$/

/** Is this the shape of a resolved target-day label? */
export const isDayLabel = (label: string): boolean => DAY_LABEL.test(label)

/**
 * A storage key derived from something other than a resolved target day.
 *
 * Reachable only by handing in a hand-built {@link DayRef}: labels produced by
 * `resolveTargetDay`/`scheduledTargetDay` always match.
 */
export class InvalidDayLabelError extends Data.TaggedError('InvalidDayLabelError')<{
  op: string
  label: string
}> {}

const requireDayLabel = (op: string, label: string): string => {
  if (!isDayLabel(label)) {
    throw new InvalidDayLabelError({ op, label })
  }
  return label
}

/** Key an ad-hoc report is cached under, e.g. `day-2026-09-14.json`. */
export const dayReportKey = (day: DayRef): string =>
  `${DAY_REPORT_KEY_PREFIX}${requireDayLabel('report.day-report-key', day.label)}.json`

/**
 * The calendar day a label stands for, at local midnight.
 *
 * Built with the local-time constructor from the parsed parts rather than
 * `new Date('2026-09-14')`, which is UTC midnight and would read as the
 * previous day on any host behind UTC. `formatLongDate` uses the local
 * getters, so this is the form it wants.
 */
export const dayLabelDate = (label: string): Date => {
  requireDayLabel('report.day-label-date', label)
  const [year, month, day] = label.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

/**
 * A report older than this is stale: the morning run was missed, and the page
 * says so rather than quietly serving yesterday's list.
 *
 * 26 hours rather than 24 so a timer that fires a little late, or a run that
 * takes a few minutes, does not trip the banner on a normal morning.
 */
export const STALE_AFTER_HOURS = 26

/** {@link STALE_AFTER_HOURS} in milliseconds. */
export const STALE_AFTER_MS = STALE_AFTER_HOURS * 60 * 60 * 1000

/** How old a report is, in milliseconds. Negative when it was generated in the future. */
export const reportAgeMs = (generatedAt: Date, now: Date): number =>
  now.getTime() - generatedAt.getTime()

/**
 * Would this report raise the stale banner if it were served now?
 *
 * Strictly older than {@link STALE_AFTER_MS}: a report exactly 26 hours old is
 * still fresh, one millisecond more is stale. A report dated in the future
 * (clock skew between the timer and the request) is never stale.
 */
export const isStale = (generatedAt: Date, now: Date): boolean =>
  reportAgeMs(generatedAt, now) > STALE_AFTER_MS

/** Whether a day is the one the scheduled run reports on, or a day somebody picked. */
export type DayKind = 'scheduled' | 'ad-hoc'

/**
 * Is this the scheduled day, or an ad-hoc one?
 *
 * The scheduled day is *tomorrow in Hong Kong time* — the day
 * `scheduledTargetDay` resolves to, whatever timezone the host runs in.
 *
 * This classifies a **requested day**, not what happens to be in storage: it
 * answers "is this the day the plain bookmark is about?". A page that serves
 * the stored scheduled report compares that report's own `targetDayLabel`
 * instead (issue #12's ad-hoc banner).
 */
export const classifyDay = (day: DayRef, now: Date): DayKind =>
  day.label === scheduledTargetDay(now).label ? 'scheduled' : 'ad-hoc'

/**
 * What the timer records beside the report, so the page can say whether the
 * last run worked.
 *
 * Written after every scheduled run, success or failure — a run that never
 * happened leaves the previous status in place, which is exactly what the
 * stale banner is for.
 *
 * `generatedAt` is a `Date` in the domain: the in-memory store keeps it as
 * one, and the blob adapter is responsible for `toISOString()` on the way in
 * and `new Date(...)` on the way out.
 */
export interface RunStatus {
  /** When the run finished (or gave up). */
  generatedAt: Date
  /** Resolved `YYYY-MM-DD` the run targeted. */
  targetDayLabel: string
  success: boolean
  /** Error text when the run failed, `null` when it succeeded. */
  error: string | null
}

/** Status for a run that produced a report. */
export const runStatusOk = (generatedAt: Date, targetDay: DayRef): RunStatus => ({
  generatedAt,
  targetDayLabel: targetDay.label,
  success: true,
  error: null,
})

/** Status for a run that failed — `error` is what the page shows under the banner. */
export const runStatusFailed = (
  generatedAt: Date,
  targetDay: DayRef,
  error: string
): RunStatus => ({
  generatedAt,
  targetDayLabel: targetDay.label,
  success: false,
  error,
})
