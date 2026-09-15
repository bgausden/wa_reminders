/**
 * The ad-hoc day run: what the HTTP handler executes when the request names
 * a day (`/?day=…`).
 *
 * Mirrors `runScheduledReportEffect`, but resolves nothing and writes
 * nothing scheduled: the caller hands in the already-resolved `TargetDay`,
 * and the report is cached under that day's key (`day-<label>.json`) so the
 * first view waits once and every later view is instant. A forced refresh
 * (`refresh: true`) skips the cache read and regenerates.
 *
 * A failed run writes nothing — no status record (that belongs to the
 * timer), no half report. The failure is re-raised so the adapter can show
 * it; the previous cache entry, if any, stays in place.
 */
import { Effect } from 'effect'
import type { TargetDay } from '../targetDay.js'
import { ReportStore, ReportStoreError, type StoredReport } from '../report/store.js'
import { describeFailure } from './scheduledRun.js'
import { generateReportEffect } from './generate.js'
import { DryRunError, MindbodyError } from './mbErrors.js'
import { MbHttp } from './MbHttp.js'
import { CurrentUser } from './CurrentUser.js'
import { loadTemplate } from './render.js'

export interface DayRunOptions {
  /** The request instant. Defaults to now — tests pin it. */
  now?: Date
  /** Skip the cache read and regenerate even when this day is stored. */
  refresh?: boolean
  /**
   * Template source. When omitted it is read from the shipped copy beside
   * the compiled output (the same file the CLI uses), so the hosted app
   * renders exactly what local dry-runs render.
   */
  template?: string
}

/**
 * Generate the report for a resolved day, from cache when possible.
 * Needs `MbHttp | CurrentUser` for a live run and `ReportStore` for the
 * cache; the HTTP adapter provides the live layers, tests provide doubles.
 */
export const runDayReportEffect = (
  targetDay: TargetDay,
  opts?: DayRunOptions
): Effect.Effect<StoredReport, DryRunError | MindbodyError | ReportStoreError, MbHttp | CurrentUser | ReportStore> =>
  Effect.gen(function* () {
    const now = opts?.now ?? new Date()
    const store = yield* ReportStore

    if (opts?.refresh !== true) {
      const cached = yield* store.readDay(targetDay)
      if (cached !== null) {
        yield* Effect.logInfo('day report cache hit', { targetDay: targetDay.label })
        return cached
      }
    }

    const startedAt = Date.now()
    const template = opts?.template ?? (yield* loadTemplate())
    const generated = yield* generateReportEffect({ targetDay, invokedAt: now, template }).pipe(
      Effect.catchAll((cause) =>
        Effect.gen(function* () {
          yield* Effect.logError('day report run failed', {
            targetDay: targetDay.label,
            durationMs: Date.now() - startedAt,
            error: describeFailure(cause),
          })
          return yield* Effect.fail(cause)
        })
      )
    )

    const stored: StoredReport = {
      html: generated.html,
      report: generated.report,
      targetDayLabel: targetDay.label,
      generatedAt: now,
    }
    yield* store.writeDay(targetDay, stored)
    yield* Effect.logInfo('day report generated', {
      targetDay: targetDay.label,
      outputs: generated.outputs.length,
      clients: generated.clients.length,
      durationMs: Date.now() - startedAt,
    })
    return stored
  }).pipe(Effect.withLogSpan('day.run'))
