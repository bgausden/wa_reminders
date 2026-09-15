/**
 * Timer adapter: the 9am Hong Kong run. Deliberately shallow wiring only —
 * the schedule, the live layers and the log plumbing. Everything it does is
 * `runScheduledReportEffect` (`src/effect/scheduledRun.ts`), which owns the
 * per-invocation day resolution, the generation and the store writes.
 *
 * Schedule: `0 0 9 * * *` in NCRONTAB (second minute hour day month
 * weekday) — 9:00:00 every day. The deploy script sets `TZ=Asia/Hong_Kong`,
 * and Flex Consumption on Linux honors `TZ` for timer triggers, so 9:00
 * means 9am Hong Kong time rather than 9am UTC. (On Windows plans the
 * equivalent knob is `WEBSITE_TIME_ZONE`; this app is Linux, so `TZ` is the
 * one that applies.) Assumption to confirm on the first real runs: the
 * invocation timestamp in the platform logs should read ~09:00 HKT.
 *
 * Mindbody credentials and the storage connection come from app settings
 * (`API_KEY`, `SITE_ID`, `MB_USERNAME`, `MB_PASSWORD`, `AzureWebJobsStorage`);
 * nothing secret is logged — only the target day, counts and duration.
 */
import type { InvocationContext, Timer } from '@azure/functions'
import { Effect, Layer, Logger, LogLevel } from 'effect'
import { AppConfigLive } from './effect/AppConfig.js'
import { MbHttpLive } from './effect/MbHttp.js'
import { CurrentUserLive } from './effect/CurrentUser.js'
import { ReportStoreBlobLive } from './report/blobStore.js'
import { runScheduledReportEffect } from './effect/scheduledRun.js'

/** NCRONTAB for 9am daily; interpreted in `TZ` (Asia/Hong_Kong on the app). */
export const MORNING_TIMER_SCHEDULE = '0 0 9 * * *'

export async function morningTimerHandler(_timer: Timer, context: InvocationContext): Promise<void> {
  const AppLayer = AppConfigLive
  const HttpLayer = MbHttpLive.pipe(Layer.provide(AppLayer))
  const UserLayer = CurrentUserLive.pipe(Layer.provide(Layer.mergeAll(AppLayer, HttpLayer)))
  const Live = Layer.mergeAll(AppLayer, HttpLayer, UserLayer, ReportStoreBlobLive)

  const runnable = runScheduledReportEffect().pipe(
    Effect.provide(Live),
    Logger.withMinimumLogLevel(LogLevel.Info),
    Effect.provide(Logger.pretty)
  )

  try {
    await Effect.runPromise(runnable)
  } catch (cause) {
    // The failed run status is already stored by the effect; this only marks
    // the invocation itself as failed in the platform logs.
    context.error('morning timer run failed', cause instanceof Error ? cause.message : String(cause))
    throw cause
  }
}
