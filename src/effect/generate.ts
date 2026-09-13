import { Effect } from 'effect'
import type { TargetDay } from '../targetDay.js'
import { tomorrow } from '../util.js'
import { DryRunError, MindbodyError } from './mbErrors.js'
import { MbHttp } from './MbHttp.js'
import { CurrentUser } from './CurrentUser.js'
import { loadTemplate, renderReport, TEMPLATE_PATH, type RenderedReport } from './render.js'
import { runRemindersFor, type ReminderRun } from './run.js'

/** The day a report is generated for, with the offset used in the banner. */
export type ReportTargetDay = Pick<TargetDay, 'midnight' | 'elevenFiftyNine' | 'offset'>

export interface GenerateOptions {
  /** Day to generate for. Defaults to tomorrow. */
  targetDay?: ReportTargetDay
  /** When the report was asked for. Defaults to now. */
  invokedAt?: Date
  /**
   * Template source. When omitted it is read from `templateFile`
   * (default `src/template.ejs`), so callers that already hold the
   * template — the hosted app, tests — generate with no file access.
   */
  template?: string
  templateFile?: string
}

/** A report held in memory: what was rendered, plus the data behind it. */
export interface GeneratedReport extends ReminderRun, RenderedReport {
  invokedAt: Date
  targetDay: ReportTargetDay
}

/**
 * Report generation: run the Mindbody pipeline for a day, then render
 * what came back. Thin composition of *run* then *render* — the result
 * is returned in memory, and nothing is written anywhere.
 *
 * Needs `MbHttp | CurrentUser` for the run; provide layers once at the
 * edge (src/index.ts for the CLI, test layers in specs).
 */
export const generateReportEffect = (
  opts?: GenerateOptions
): Effect.Effect<GeneratedReport, DryRunError | MindbodyError, MbHttp | CurrentUser> =>
  Effect.gen(function* () {
    const invokedAt = opts?.invokedAt ?? new Date()
    // Default day is the historical `tomorrow` singleton, so the CLI is
    // unchanged. Hosted runs should pass the day resolved per
    // invocation (`scheduledTargetDay()`) instead — a day computed at
    // module load goes stale in a warm process.
    const targetDay = opts?.targetDay ?? tomorrow
    const template =
      opts?.template ?? (yield* loadTemplate(opts?.templateFile ?? TEMPLATE_PATH))
    const run: ReminderRun = yield* runRemindersFor(targetDay)
    const rendered = yield* renderReport(run, template, { invokedAt, targetDay })
    const generated: GeneratedReport = { ...run, ...rendered, invokedAt, targetDay }
    return generated
  })
