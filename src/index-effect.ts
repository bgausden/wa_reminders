import { Effect, Layer, Logger, LogLevel } from 'effect'
import { mainEffectLayered } from './effect/pipeline.js'
import { AppConfigLive } from './effect/AppConfig.js'
import { MbHttpLive } from './effect/MbHttp.js'
import { CurrentUserLive } from './effect/CurrentUser.js'
import { MindbodyError, MissingTokenError } from './effect/mbErrors.js'

// Effect edge: compose layers once here. Nothing inside the pipeline
// touches globals — AppConfig -> MbHttp -> CurrentUser.
const AppLayer = AppConfigLive
const HttpLayer = MbHttpLive.pipe(Layer.provide(AppLayer))
const UserLayer = CurrentUserLive.pipe(
  Layer.provide(Layer.mergeAll(AppLayer, HttpLayer))
)
const Live = Layer.mergeAll(AppLayer, HttpLayer, UserLayer)

const runnable = mainEffectLayered.pipe(
  Effect.provide(Live),
  Effect.catchAll((error: unknown) => {
    if (error instanceof MissingTokenError) {
      console.error(`[missing-token] ${error.op}: user token is undefined`)
    } else if (error instanceof MindbodyError) {
      console.error(`[mindbody] ${error.op} failed:`, error.cause)
    } else {
      console.error('[unknown]', error)
    }
    return Effect.succeed({ outputs: [], clients: [] })
  }),
  Logger.withMinimumLogLevel(LogLevel.Info),
  Effect.provide(Logger.pretty)
)

const result = await Effect.runPromise(runnable)
console.log(`outputs: ${result.outputs.length}, clients: ${result.clients.length}`)
