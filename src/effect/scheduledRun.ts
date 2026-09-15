/**
 * The scheduled run: what the 9am timer executes.
 *
 * Resolves the target day per invocation (`scheduledTargetDay(now)` — never
 * at module load, so a warm process cannot serve yesterday's day), generates
 * the report in memory through the same run+render path as the CLI, and
 * stores the report plus its run-status record.
 *
 * A failed run still writes its status (success `false` with the error text)
 * and leaves the previous report in place — the page then shows the failed
 * banner over yesterday's list rather than silently serving it. The original
 * failure is re-raised so the timer invocation itself still reads as failed
 * in the platform logs.
 *
 * Run duration is logged on every timer run (`durationMs`), so the first
 * real runs can be checked against the function timeout; if the client
 * lookups ever push it out, batching them is the obvious lever.
 */
import { Effect } from 'effect'
import { scheduledTargetDay } from '../targetDay.js'
import { runStatusFailed, runStatusOk } from '../report/cacheKey.js'
import { ReportStore, ReportStoreError, type StoredReport } from '../report/store.js'
import { describeStoredReport } from '../report/serveScheduled.js'
import { generateReportEffect } from './generate.js'
import { DryRunError, MindbodyError, summarizeCause } from './mbErrors.js'
import { MbHttp } from './MbHttp.js'
import { CurrentUser } from './CurrentUser.js'
import { loadTemplate } from './render.js'

export interface ScheduledRunOptions {
  /** The timer tick instant. Defaults to now — tests pin it. */
  now?: Date
  /**
   * Template source. When omitted it is read from the shipped copy beside
   * the compiled output (the same file the CLI uses), so the hosted app
   * renders exactly what local dry-runs render.
   */
  template?: string
}

/** Short, log- and page-safe text for a generation failure. */
export const describeFailure = (cause: unknown): string => {
  if (cause instanceof MindbodyError) {
    const summary = summarizeCause(cause.cause)
    const detail = typeof summary === 'string' ? summary : JSON.stringify(summary)
    return `${cause.op} failed: ${detail ?? String(cause.cause)}`
  }
  if (cause instanceof DryRunError) {
    return `${cause.op} failed: ${String(cause.cause)}`
  }
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Generate the scheduled report and store it with its status. Needs
 * `MbHttp | CurrentUser` for the run and `ReportStore` for the writes;
 * the timer adapter provides the live layers, tests provide doubles.
 */
export const runScheduledReportEffect = (
  opts?: ScheduledRunOptions
): Effect.Effect<StoredReport, DryRunError | MindbodyError | ReportStoreError, MbHttp | CurrentUser | ReportStore> =>
  Effect.gen(function* () {
    const now = opts?.now ?? new Date()
    // Per invocation, not per module: this is the fix for the warm-process
    // stale-"tomorrow" the PRD calls out.
    const targetDay = scheduledTargetDay(now)
    const startedAt = Date.now()
    const template = opts?.template ?? (yield* loadTemplate())
    const store = yield* ReportStore

    const generated = yield* generateReportEffect({ targetDay, invokedAt: now, template }).pipe(
      Effect.catchAll((cause) =>
        Effect.gen(function* () {
          const error = describeFailure(cause)
          const durationMs = Date.now() - startedAt
          yield* store.writeRunStatus(runStatusFailed(now, targetDay, error))
          yield* Effect.logError('scheduled run failed', {
            targetDay: targetDay.label,
            durationMs,
            error,
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
    yield* store.writeScheduled(stored)
    yield* store.writeRunStatus(runStatusOk(now, targetDay))
    const durationMs = Date.now() - startedAt
    yield* Effect.logInfo('scheduled run complete', {
      targetDay: describeStoredReport(stored),
      outputs: generated.outputs.length,
      clients: generated.clients.length,
      durationMs,
    })
    return stored
  }).pipe(Effect.withLogSpan('scheduled.run'))
