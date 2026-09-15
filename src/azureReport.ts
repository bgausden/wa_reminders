/**
 * HTTP adapter: serves the stored scheduled report. Deliberately shallow
 * wiring only — read the report plus the run status from the store, render
 * the page with `renderScheduledPage`, return it as HTML.
 *
 * No Mindbody calls on this path by construction: the only service this
 * module touches is the `ReportStore`, so opening the bookmark is a storage
 * read, never a pipeline run. A store failure (or a missing connection
 * setting) serves a 503 page rather than an exception, and never logs page
 * content — client names and phone numbers stay out of the logs.
 */
import type { HttpHandler, HttpResponseInit, InvocationContext } from '@azure/functions'
import { Effect } from 'effect'
import { ReportStore } from './report/store.js'
import { ReportStoreBlobLive } from './report/blobStore.js'
import { renderScheduledPage } from './report/serveScheduled.js'

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

/** Serve this morning's stored list (or the empty/unavailable page). */
export function createReportHandler(): HttpHandler {
  return async (_request, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const page = await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* ReportStore
          const stored = yield* store.readScheduled()
          const runStatus = yield* store.readRunStatus()
          return renderScheduledPage(stored, runStatus, new Date())
        }).pipe(Effect.provide(ReportStoreBlobLive))
      )
      return html(200, page)
    } catch (cause) {
      context.error(
        'report serve failed',
        cause instanceof Error ? cause.message : String(cause)
      )
      return html(503, unavailablePage())
    }
  }
}
