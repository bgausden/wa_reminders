/**
 * HTTP adapter: serves the scheduled list, and generates and serves a day's
 * list on demand. Deliberately shallow wiring only — the query decides which
 * path, the `report/*` pure modules render, `runDayReportEffect` generates.
 *
 * - No `?day=`: this morning's stored list (or the empty/unavailable page).
 *   Storage reads only, never a pipeline run.
 * - `?day=<spec>`: the spec is resolved with the same parser as the CLI
 *   (`tomorrow`, `+2`, `2026-09-20`, …), served from the per-day cache when
 *   present, generated synchronously and cached otherwise. `&refresh=1`
 *   forces a fresh run; `&download=1` returns the same page as a file
 *   download instead of inline HTML.
 *
 * A store failure (or a missing connection setting) serves a 503 page rather
 * than an exception, and never logs page content — client names and phone
 * numbers stay out of the logs.
 */
import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { Effect, Layer } from 'effect'
import { AppConfigLive } from './effect/AppConfig.js'
import { MbHttpLive } from './effect/MbHttp.js'
import { CurrentUserLive } from './effect/CurrentUser.js'
import { MbHttp } from './effect/MbHttp.js'
import { CurrentUser } from './effect/CurrentUser.js'
import { ReportStore, type ReportStoreError } from './report/store.js'
import { ReportStoreBlobLive } from './report/blobStore.js'
import { renderScheduledPage } from './report/serveScheduled.js'
import { renderDayError, renderDayForm, renderDayPage } from './report/serveDay.js'
import { runDayReportEffect } from './effect/dayRun.js'
import { describeFailure } from './effect/scheduledRun.js'
import { resolveTargetDay, type TargetDay } from './targetDay.js'

const html = (status: number, page: string): HttpResponseInit => ({
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
  body: page,
})

const unavailablePage = (): string =>
  `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
  `<title>Reminder list unavailable</title>\n</head>\n<body>\n<h1>Reminder list unavailable</h1>\n` +
  `<p>The stored list could not be read. The morning run may have failed — try again later.</p>\n` +
  `</body>\n</html>\n`

/** Layers the handler runs on. The app provides the live ones; tests substitute doubles. */
export interface ReportHandlerLayers {
  store: Layer.Layer<ReportStore, ReportStoreError>
  network: Layer.Layer<MbHttp | CurrentUser, unknown, never>
}

const AppLayer = AppConfigLive
const HttpLayer = MbHttpLive.pipe(Layer.provide(AppLayer))
const UserLayer = CurrentUserLive.pipe(Layer.provide(Layer.mergeAll(AppLayer, HttpLayer)))

const liveLayers: ReportHandlerLayers = {
  store: ReportStoreBlobLive,
  network: Layer.mergeAll(AppLayer, HttpLayer, UserLayer),
}

/**
 * Serve the scheduled list, or generate and serve a chosen day.
 * Behind the password gate (`createGatedHandler`) at the edge.
 */
export function createReportHandler(layers: ReportHandlerLayers = liveLayers): HttpHandler {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const now = new Date()
    const spec = request.query.get('day')
    try {
      if (spec === null || spec.trim() === '') {
        // Storage reads only: the network layers stay unbuilt, so this
        // path serves with no Mindbody configuration at all.
        const page = await Effect.runPromise(
          Effect.gen(function* () {
            const store = yield* ReportStore
            const stored = yield* store.readScheduled()
            const runStatus = yield* store.readRunStatus()
            return renderScheduledPage(stored, runStatus, now, [renderDayForm(null)])
          }).pipe(Effect.provide(layers.store))
        )
        return html(200, page)
      }

      let targetDay: TargetDay
      try {
        targetDay = resolveTargetDay(spec, now)
      } catch (error) {
        return html(200, renderDayError(spec, error instanceof Error ? error.message : String(error)))
      }

      const { stored, runStatus } = await Effect.runPromise(
        Effect.gen(function* () {
          const report = yield* runDayReportEffect(targetDay, {
            now,
            refresh: request.query.get('refresh') === '1',
          })
          const store = yield* ReportStore
          return { stored: report, runStatus: yield* store.readRunStatus() }
        }).pipe(Effect.provide(Layer.mergeAll(layers.store, layers.network)))
      )
      const page = renderDayPage({ stored, targetDay, now, spec, runStatus })
      if (request.query.get('download') === '1') {
        return {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `attachment; filename="reminders-${stored.targetDayLabel}.html"`,
          },
          body: page,
        }
      }
      return html(200, page)
    } catch (cause) {
      const message = describeFailure(cause)
      context.error('report serve failed', message)
      if (spec === null || spec.trim() === '') return html(503, unavailablePage())
      return html(503, renderDayError(spec, message))
    }
  }
}
