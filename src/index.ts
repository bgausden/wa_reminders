import { Effect, Layer, Logger, LogLevel } from 'effect'
import { mainEffectLayered } from './effect/pipeline.js'
import { dryRunEffect } from './effect/dryRun.js'
import { AppConfigLive } from './effect/AppConfig.js'
import { MbHttpLive } from './effect/MbHttp.js'
import { CurrentUserLive } from './effect/CurrentUser.js'
import { DryRunError } from './effect/mbErrors.js'
import { MindbodyError, MissingTokenError, summarizeCause } from './effect/mbErrors.js'

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

// `npm run dry-run`: full pipeline, messages rendered to console + file,
// nothing sent.
if (process.argv.includes('--dry-run')) {
  const runnable = dryRunEffect().pipe(
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
  const runnable = mainEffectLayered.pipe(
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
