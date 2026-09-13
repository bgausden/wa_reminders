import { Effect, Layer, Logger, LogLevel } from 'effect'
import { mainEffectLayeredFor } from './effect/pipeline.js'
import { dryRunEffect } from './effect/dryRun.js'
import { AppConfigLive } from './effect/AppConfig.js'
import { MbHttpLive } from './effect/MbHttp.js'
import { CurrentUserLive } from './effect/CurrentUser.js'
import { DryRunError } from './effect/mbErrors.js'
import { MindbodyError, MissingTokenError, summarizeCause } from './effect/mbErrors.js'
import { findUnexpectedArgs, formatLongDate, formatLongDateTime, getTargetDayArg, parseTargetDay } from './targetDay.js'

// Effect edge: compose layers once here. Nothing inside the pipeline
// touches globals — AppConfig -> MbHttp -> CurrentUser.
const AppLayer = AppConfigLive
const HttpLayer = MbHttpLive.pipe(Layer.provide(AppLayer))
const UserLayer = CurrentUserLive.pipe(
  Layer.provide(Layer.mergeAll(AppLayer, HttpLayer))
)
const Live = Layer.mergeAll(AppLayer, HttpLayer, UserLayer)

const logFailure = (error: unknown) => {
  if (error instanceof MissingTokenError) {
    console.error(`[missing-token] ${error.op}: user token is undefined`)
  } else if (error instanceof MindbodyError) {
    console.error(`[mindbody] ${error.op} failed:`, summarizeCause(error.cause))
  } else if (error instanceof DryRunError) {
    console.error(`[dry-run] ${error.op} failed:`, error.cause)
  } else {
    console.error('[unknown]', error)
  }
}

// `--date <spec>` / `--day <spec>` / `--target-day <spec>` (also `--flag=spec`)
// selects which calendar day to send reminders for:
// an offset (`+1`, `plus two`, `3`, `today`, `tomorrow`) or a date
// (`2026-09-14`, `14 Sep 2026`). Defaults to tomorrow.
// Via npm the `--` separator is required: `npm run dry-run -- --day "+2"`.
const unexpected = findUnexpectedArgs(process.argv)
if (unexpected.length > 0) {
  console.error(`Unexpected arguments: ${unexpected.join(' ')}`)
  console.error(
    'If passing --day/--date via npm, add the "--" separator so npm forwards the flag:'
  )
  console.error('  npm run dry-run:prod -- --day "day after tomorrow"')
  process.exit(1)
}
let targetDay
let invokedAt: Date
try {
  invokedAt = new Date()
  targetDay = parseTargetDay(getTargetDayArg(process.argv), invokedAt)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  console.error('Usage: node dist/index.js [--dry-run] [--date <offset-or-date>]')
  process.exit(1)
}
console.log(
  `Invoked ${formatLongDateTime(invokedAt)} for target day ${formatLongDate(targetDay.midnight)} (offset +${targetDay.offset})`
)

// `npm run dry-run`: full pipeline, messages rendered to console + file,
// nothing sent.
if (process.argv.includes('--dry-run')) {
  const runnable = dryRunEffect(undefined, { targetDay, invokedAt }).pipe(
    Effect.provide(Live),
    Effect.catchAll((error: unknown) => {
      logFailure(error)
      return Effect.succeed({ report: '', file: '', outputs: [], clients: [] })
    }),
    Logger.withMinimumLogLevel(LogLevel.Info),
    Effect.provide(Logger.pretty)
  )

  const result = await Effect.runPromise(runnable)
  if (result.report.length > 0) {
    console.log(result.report)
    console.log(`dry-run written to ${result.file}`)
  }
} else {
  const runnable = mainEffectLayeredFor(targetDay).pipe(
    Effect.provide(Live),
    Effect.catchAll((error: unknown) => {
      logFailure(error)
      return Effect.succeed({ outputs: [], clients: [] })
    }),
    Logger.withMinimumLogLevel(LogLevel.Info),
    Effect.provide(Logger.pretty)
  )

  const result = await Effect.runPromise(runnable)
  console.log(`outputs: ${result.outputs.length}, clients: ${result.clients.length}`)
}
